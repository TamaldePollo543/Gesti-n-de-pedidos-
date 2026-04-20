# Siguientes pasos de integracion

0. Levantar frontend en puerto libre
- El puerto 5176 está ocupado en este entorno.
- Usar: `npx vite --port 5177 --strictPort`

1. BD
- Ejecutar [kitchen/sql/20260419_order_item_customizations.sql](kitchen/sql/20260419_order_item_customizations.sql)

2. Backend
- Implementar contrato de [kitchen/contracts/order-update.request.schema.json](kitchen/contracts/order-update.request.schema.json)
- Revisar flujo Phoenix en [kitchen/phoenix/orders_customizations_guide.md](kitchen/phoenix/orders_customizations_guide.md)
- Referencia de codigo lista para copiar:
	- [kitchen/phoenix/orders_update_item_schema.ex](kitchen/phoenix/orders_update_item_schema.ex)
	- [kitchen/phoenix/orders_patch_service_example.ex](kitchen/phoenix/orders_patch_service_example.ex)

3. Frontend
- Ya preparado y activado para update remoto en .env.local

4. Smoke test recomendado
- Editar item en carrito con extras/exclusiones/alergia
- Enviar pedido
- Verificar en cocina que se muestran notas
- Editar en cocina y confirmar persistencia
- Verificar en Mis pedidos
- Puedes ejecutar la suite HTTP manual en [kitchen/contracts/smoke_test.http](kitchen/contracts/smoke_test.http)

5. Realtime recomendado
- Emitir order_updated para reflejo inmediato sin polling
