-- Migration: order item customizations support
-- Date: 2026-04-19

begin;

-- 1) Create order_items table if it does not exist
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  menu_item_id bigint null,
  name text not null,
  qty integer not null check (qty > 0),
  unit_price numeric(10,2) null,
  extras jsonb not null default '[]'::jsonb,
  exclusions jsonb not null default '[]'::jsonb,
  allergy_notes text null,
  kitchen_notes text null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_order_items_order_id on public.order_items(order_id);

-- 1.1) Add FK only when orders table exists (supports app.orders or public.orders)
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'app' and table_name = 'orders'
  ) then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'fk_order_items_order_id_app_orders'
    ) then
      alter table public.order_items
        add constraint fk_order_items_order_id_app_orders
        foreign key (order_id)
        references app.orders(id)
        on delete cascade;
    end if;
  elsif exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'orders'
  ) then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'fk_order_items_order_id_public_orders'
    ) then
      alter table public.order_items
        add constraint fk_order_items_order_id_public_orders
        foreign key (order_id)
        references public.orders(id)
        on delete cascade;
    end if;
  else
    raise notice 'orders table not found in app/public schema. FK not added in this run.';
  end if;
end
$$;

-- 2) Add compatibility columns if table already existed without customizations
alter table public.order_items
  add column if not exists extras jsonb not null default '[]'::jsonb,
  add column if not exists exclusions jsonb not null default '[]'::jsonb,
  add column if not exists allergy_notes text null,
  add column if not exists kitchen_notes text null,
  add column if not exists notes text null;

-- 3) Ensure updated_at auto-update trigger exists
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_order_items_updated_at on public.order_items;
create trigger trg_order_items_updated_at
before update on public.order_items
for each row
execute function public.set_updated_at();

-- 4) Backfill from legacy notes if needed (best effort)
-- This keeps existing records consistent if custom fields were empty.
update public.order_items
set kitchen_notes = coalesce(kitchen_notes, notes)
where kitchen_notes is null
  and notes is not null
  and length(trim(notes)) > 0;

commit;
