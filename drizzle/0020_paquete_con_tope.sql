-- Tope opcional del paquete. Por ahora solo ClienteS1 tiene tope (500);
-- el resto cuenta el consumo sin límite.
ALTER TABLE "cliente_panel" ADD COLUMN IF NOT EXISTS "paquete_con_tope" boolean NOT NULL DEFAULT false;

-- ClienteS1: paquete con tope. Se asegura la fila del panel.
INSERT INTO "cliente_panel" ("client_id", "paquete_total", "paquete_con_tope")
VALUES ('clienteS1', 500, true)
ON CONFLICT ("client_id") DO UPDATE SET "paquete_con_tope" = true;
