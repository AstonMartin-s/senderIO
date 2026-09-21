-- Cupo del paquete del panel-cliente (default 500). Informativo; no frena envío.
ALTER TABLE "cliente_panel" ADD COLUMN IF NOT EXISTS "paquete_total" integer DEFAULT 500 NOT NULL;
