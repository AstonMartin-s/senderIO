-- Cliente por etiqueta: cada cliente puede reclamar prefijos de etiqueta de
-- Kommo (segmento). "mooney" es el catch-all (todo lo no reclamado) y se
-- muestra como "CRM". Piliking y ClienteS1 agrupan sus derivados por prefijo.
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "etiquetas" jsonb NOT NULL DEFAULT '[]'::jsonb;

-- El tenant general pasa a mostrarse como CRM (sigue siendo id "mooney").
UPDATE "clients" SET "nombre" = 'CRM' WHERE "id" = 'mooney';

-- Cliente Piliking (etiqueta-based). Se crea si no existe.
INSERT INTO "clients" ("id", "nombre", "activo", "etiquetas")
VALUES ('piliking', 'Piliking', true, '["piliking"]'::jsonb)
ON CONFLICT ("id") DO UPDATE SET "etiquetas" = '["piliking"]'::jsonb;

-- ClienteS1 agrupa su etiqueta (y derivados). Se crea si no existe.
INSERT INTO "clients" ("id", "nombre", "activo", "etiquetas")
VALUES ('clienteS1', 'ClienteS1', true, '["clientes1"]'::jsonb)
ON CONFLICT ("id") DO UPDATE SET "etiquetas" = '["clientes1"]'::jsonb;
