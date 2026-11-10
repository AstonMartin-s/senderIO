-- Tenant Damico: cuenta Kommo propia. Sin etiquetas, no entra al panel de paquetes.
INSERT INTO "clients" ("id", "nombre", "activo", "etiquetas")
VALUES ('damico', 'Damico', true, '[]'::jsonb)
ON CONFLICT ("id") DO NOTHING;
