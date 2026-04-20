# Integracion completa: customizaciones de pedidos (carrito, pedidos y cocina)

## Objetivo
Alinear backend + base de datos con los cambios ya hechos en frontend para soportar:
- extras por item
- exclusiones de ingredientes
- notas de alergias
- nota adicional de cocina
- edicion de pedido en estados `pendiente` y `en_preparacion`

## Estado actual del frontend
El frontend ya envia y consume customizaciones en dos niveles:
1. Estructurado por item (`extras`, `exclusions`, `allergyNotes`, `kitchenNotes`)
2. Texto consolidado en `notes` para compatibilidad

Si backend todavia no persiste estos campos, la informacion puede perderse o disparar `422` al editar.

## Cambios requeridos en base de datos (PostgreSQL/Supabase)
Ejecutar migracion SQL: [kitchen/sql/20260419_order_item_customizations.sql](kitchen/sql/20260419_order_item_customizations.sql)

Resumen de esquema recomendado:
- Tabla `orders`: mantener encabezado (status, waiter_id, table_id, customer_name, timestamps)
- Tabla `order_items` (normalizada):
  - `order_id uuid not null`
  - `menu_item_id bigint null`
  - `name text not null`
  - `qty integer not null check (qty > 0)`
  - `unit_price numeric(10,2) null`
  - `extras jsonb not null default '[]'::jsonb`
  - `exclusions jsonb not null default '[]'::jsonb`
  - `allergy_notes text null`
  - `kitchen_notes text null`
  - `notes text null` (legacy/compat)

## Contrato API recomendado

### POST /orders
Request (ejemplo):
```json
{
  "table_id": "Mesa 3",
  "customer_name": "Juan",
  "items": [
    {
      "id": 101,
      "name": "Pizza",
      "qty": 2,
      "price": 230,
      "notes": "Extras: queso | Sin: cebolla | Alergia: lactosa"
    }
  ]
}
```

Backend debe:
1. Aceptar `items[].notes` por compatibilidad
2. Parsear opcionalmente `notes` -> `extras/exclusions/allergy_notes/kitchen_notes`
3. Persistir campos estructurados en `order_items`
4. Responder `items` completos (estructurados)

### PATCH /orders/:id (edicion de items)
Habilitar solo para roles permitidos y estados editables:
- Permitidos: `pendiente`, `en_preparacion`
- Bloquear: `listo`, `servido`, `cancelado`

Request sugerido:
```json
{
  "items": [
    {
      "id": 101,
      "name": "Pizza",
      "qty": 1,
      "price": 230,
      "notes": "Extras: queso | Sin: jitomate | Alergia: nuez | Nota: sin picante"
    }
  ]
}
```

Validaciones recomendadas para evitar `422` innecesario:
- `items` array no vacio
- cada item con `name` y `qty >= 1`
- tolerar campos extra desconocidos (no strict fail)
- normalizar tipos (`qty` numerico)

### GET /orders y GET /orders?active=true
Respuesta debe incluir customizaciones por item. Idealmente:
```json
{
  "id": "...",
  "status": "en_preparacion",
  "items": [
    {
      "id": 101,
      "name": "Pizza",
      "qty": 1,
      "price": 230,
      "extras": ["queso"],
      "exclusions": ["jitomate"],
      "allergy_notes": "nuez",
      "kitchen_notes": "sin picante",
      "notes": "Extras: queso | Sin: jitomate | Alergia: nuez | Nota: sin picante"
    }
  ]
}
```

## Reglas de negocio para edicion
- Mesero: editar solo sus pedidos en `pendiente/en_preparacion`
- Cocina: editar pedidos activos
- Guardar traza de auditoria (`updated_by`, `updated_at`)

## Eventos realtime recomendados
Emitir al editar pedido:
- `order_updated` con payload minimo:
  - `order_id`
  - `status`
  - `items` (normalizados)
  - `updated_at`

Esto evita esperar polling para reflejar cambios en cocina y meseros.

## Plan de despliegue seguro
1. Aplicar migracion SQL
2. Desplegar backend aceptando `notes` + estructurado
3. Activar en frontend: `VITE_ENABLE_ORDER_EDIT_API=true`
4. Verificar flujo:
   - editar en carrito -> crear pedido -> ver notas en cocina
   - editar en cocina -> guardar sin 422
   - editar en pedidos -> persistir y reflejar en cocina

## Checklist de verificacion
- [ ] POST /orders persiste notes/customizaciones
- [ ] GET /orders devuelve customizaciones
- [ ] PATCH /orders/:id habilitado sin 422 para payload valido
- [ ] Realtime emite `order_updated`
- [ ] Cocina muestra extras/exclusiones/alergias/notas
