-- Atribución de un BM a un cliente de paquete (panel-cliente). Solo atribución
-- para el consumo; no cambia la lógica de envío.
ALTER TABLE "bm_config" ADD COLUMN IF NOT EXISTS "paquete_cliente_id" text;
