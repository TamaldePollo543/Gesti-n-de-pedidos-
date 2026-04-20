# Phoenix guide para customizaciones de pedidos

## 1) Validacion de payload sin romper compatibilidad
En update/create de pedidos, aceptar estas variantes por item:
- estructurado: extras, exclusions, allergyNotes, kitchenNotes
- compat: notes

Recomendacion de normalizacion en contexto:
1. Si viene notes y no vienen campos estructurados, parsear notes
2. Si vienen estructurados, reconstruir notes para compatibilidad
3. Persistir campos estructurados en order_items

## 2) Parseo recomendado de notes
Formato esperado en frontend:
- Extras: valor1, valor2
- Sin: valor1, valor2
- Alergia: texto
- Nota: texto

Separador: |
Ejemplo:
Extras: queso | Sin: cebolla | Alergia: lactosa | Nota: sin picante

## 3) Changeset sugerido (Ecto)
Campos permitidos en order_items:
- name
- qty
- unit_price
- notes
- extras
- exclusions
- allergy_notes
- kitchen_notes

Validaciones minimas:
- name requerido
- qty requerido y mayor a 0
- extras/exclusions default []

## 4) Regla de negocio para edicion
Permitir update de items solo en estados:
- pendiente
- en_preparacion

Rechazar con 409 (no 422) cuando estado no editable.
422 reservarlo para payload invalido real.

## 5) Endpoint recomendado
- PATCH /orders/:id
Debe aceptar body parcial con items.

Flujo:
1. Buscar orden por id
2. Validar permisos por rol
3. Validar estado editable
4. Reemplazar items de la orden en transaccion
5. Retornar orden con items normalizados
6. Emitir evento realtime order_updated

## 6) SQL
Ejecutar migracion base:
- [kitchen/sql/20260419_order_item_customizations.sql](kitchen/sql/20260419_order_item_customizations.sql)

## 7) Activacion en frontend
Una vez desplegado backend:
- en .env.local usar VITE_ENABLE_ORDER_EDIT_API=true
