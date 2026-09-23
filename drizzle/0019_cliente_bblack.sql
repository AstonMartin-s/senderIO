-- Nuevo cliente-etiqueta: BBlack. Todo lo suyo sale con la etiqueta "bblack".
INSERT INTO "clients" ("id", "nombre", "activo", "etiquetas")
VALUES ('bblack', 'BBlack', true, '["bblack"]'::jsonb)
ON CONFLICT ("id") DO UPDATE SET "etiquetas" = '["bblack"]'::jsonb;
