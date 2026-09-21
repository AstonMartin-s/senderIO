-- Panel-cliente (paquete vendido). Recipientes de información compartida.
-- NO configura el envío: la lógica de goteo vive en bm_config/scheduler.

-- Cliente del paquete.
INSERT INTO "clients" ("id", "nombre", "activo")
VALUES ('clienteS1', 'ClienteS1', true)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cliente_panel" (
	"client_id" text PRIMARY KEY NOT NULL,
	"oferta_titulo" text DEFAULT '' NOT NULL,
	"oferta_detalle" text DEFAULT '' NOT NULL,
	"oferta_monto_usd" numeric,
	"mensaje_texto" text DEFAULT '' NOT NULL,
	"plantilla_nombre" text DEFAULT '' NOT NULL,
	"redirecciones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"acceso_token" text,
	"notas" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cliente_panel" ADD CONSTRAINT "cliente_panel_client_id_clients_id_fk"
 FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cliente_base_cruda" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"telefono" text,
	"telefono_raw" text,
	"nombre" text,
	"extra" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cliente_base_cruda" ADD CONSTRAINT "cliente_base_cruda_client_id_clients_id_fk"
 FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cliente_base_cruda_client_idx" ON "cliente_base_cruda" USING btree ("client_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cliente_lista_filtrada" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"telefono" text NOT NULL,
	"telefono_raw" text,
	"nombre" text,
	"extra" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cliente_lista_filtrada" ADD CONSTRAINT "cliente_lista_filtrada_client_id_clients_id_fk"
 FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cliente_lista_filtrada_client_idx" ON "cliente_lista_filtrada" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cliente_lista_filtrada_tel_idx" ON "cliente_lista_filtrada" USING btree ("telefono");
