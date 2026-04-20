defmodule MesaPlus.Orders.PatchService do
  @moduledoc """
  Ejemplo de servicio para PATCH /orders/:id con validacion de estado editable.
  """

  import Ecto.Query
  alias MesaPlus.Repo
  alias MesaPlus.Orders
  alias MesaPlus.Orders.{Order, OrderItem, UpdateItem}

  @editable_statuses ["pendiente", "en_preparacion"]

  def patch_order_items(order_id, params, actor_id) do
    with %Order{} = order <- Repo.get(Order, order_id),
         :ok <- ensure_editable(order.status),
         {:ok, items} <- validate_items(params["items"] || params[:items]) do
      Repo.transaction(fn ->
        from(i in OrderItem, where: i.order_id == ^order.id) |> Repo.delete_all()

        Enum.each(items, fn item ->
          parsed = normalize_item(item)

          %OrderItem{}
          |> OrderItem.changeset(%{
            order_id: order.id,
            menu_item_id: maybe_to_int(parsed.id),
            name: parsed.name,
            qty: parsed.qty,
            unit_price: parsed.price,
            notes: parsed.notes,
            extras: parsed.extras,
            exclusions: parsed.exclusions,
            allergy_notes: parsed.allergy_notes,
            kitchen_notes: parsed.kitchen_notes
          })
          |> Repo.insert!()
        end)

        order
        |> Ecto.Changeset.change(%{updated_by: actor_id})
        |> Repo.update!()

        Repo.preload(order, [:items])
      end)
      |> case do
        {:ok, updated_order} -> {:ok, updated_order}
        {:error, reason} -> {:error, reason}
      end
    end
  end

  defp ensure_editable(status) when status in @editable_statuses, do: :ok
  defp ensure_editable(_), do: {:error, :order_not_editable}

  defp validate_items(items) when is_list(items) and length(items) > 0 do
    changesets = Enum.map(items, &UpdateItem.changeset(%UpdateItem{}, &1))

    case Enum.find(changesets, &(not &1.valid?)) do
      nil -> {:ok, Enum.map(changesets, &Ecto.Changeset.apply_changes/1)}
      invalid -> {:error, invalid}
    end
  end

  defp validate_items(_), do: {:error, :invalid_items}

  defp normalize_item(item) do
    notes = item.notes || ""

    extras =
      if is_list(item.extras) and item.extras != [] do
        item.extras
      else
        parse_csv_segment(notes, "Extras")
      end

    exclusions =
      if is_list(item.exclusions) and item.exclusions != [] do
        item.exclusions
      else
        parse_csv_segment(notes, "Sin")
      end

    allergy =
      (item.allergyNotes || parse_text_segment(notes, "Alergia") || "")
      |> String.trim()

    kitchen_note =
      (item.kitchenNotes || parse_text_segment(notes, "Nota") || notes || "")
      |> String.trim()

    final_notes = build_notes(extras, exclusions, allergy, kitchen_note)

    %{
      id: item.id,
      name: String.trim(item.name || ""),
      qty: max(item.qty || 1, 1),
      price: item.price,
      extras: extras,
      exclusions: exclusions,
      allergy_notes: allergy,
      kitchen_notes: kitchen_note,
      notes: final_notes
    }
  end

  defp build_notes(extras, exclusions, allergy, note) do
    []
    |> maybe_add("Extras", extras)
    |> maybe_add("Sin", exclusions)
    |> maybe_add("Alergia", allergy)
    |> maybe_add("Nota", note)
    |> Enum.join(" | ")
  end

  defp maybe_add(parts, _label, value) when value in [nil, "", []], do: parts
  defp maybe_add(parts, label, value) when is_list(value), do: parts ++ ["#{label}: #{Enum.join(value, ", ")}"]
  defp maybe_add(parts, label, value), do: parts ++ ["#{label}: #{value}"]

  defp parse_text_segment(notes, label) when is_binary(notes) do
    regex = Regex.compile!("#{Regex.escape(label)}:\\s*([^|]+)", "i")
    case Regex.run(regex, notes) do
      [_, value] -> String.trim(value)
      _ -> nil
    end
  end

  defp parse_text_segment(_, _), do: nil

  defp parse_csv_segment(notes, label) do
    notes
    |> parse_text_segment(label)
    |> case do
      nil -> []
      value ->
        value
        |> String.split(",")
        |> Enum.map(&String.trim/1)
        |> Enum.reject(&(&1 == ""))
    end
  end

  defp maybe_to_int(nil), do: nil
  defp maybe_to_int(v) when is_integer(v), do: v
  defp maybe_to_int(v) when is_binary(v) do
    case Integer.parse(v) do
      {n, _} -> n
      _ -> nil
    end
  end
end
