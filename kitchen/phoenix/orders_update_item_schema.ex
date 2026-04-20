defmodule MesaPlus.Orders.UpdateItem do
  @moduledoc """
  Embedded schema para validar payload de items en PATCH /orders/:id.
  Compatible con campos estructurados y notas legacy.
  """

  use Ecto.Schema
  import Ecto.Changeset

  @primary_key false
  embedded_schema do
    field :id, :string
    field :name, :string
    field :qty, :integer
    field :price, :decimal
    field :notes, :string
    field :extras, {:array, :string}, default: []
    field :exclusions, {:array, :string}, default: []
    field :allergyNotes, :string
    field :kitchenNotes, :string
  end

  def changeset(item, attrs) do
    item
    |> cast(attrs, [
      :id,
      :name,
      :qty,
      :price,
      :notes,
      :extras,
      :exclusions,
      :allergyNotes,
      :kitchenNotes
    ])
    |> validate_required([:name, :qty])
    |> validate_number(:qty, greater_than: 0)
    |> put_default_arrays()
  end

  defp put_default_arrays(changeset) do
    changeset
    |> update_change(:extras, &(&1 || []))
    |> update_change(:exclusions, &(&1 || []))
  end
end
