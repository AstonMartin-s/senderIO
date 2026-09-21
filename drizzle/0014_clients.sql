CREATE TABLE IF NOT EXISTS "clients" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "clients" ("id", "nombre", "activo")
VALUES
	('mooney', 'Mooney', true),
	('king', 'King', true)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "bm_config" ADD COLUMN IF NOT EXISTS "client_id" text DEFAULT 'mooney' NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bm_config" ADD CONSTRAINT "bm_config_client_id_clients_id_fk"
 FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bm_config_client_id_idx" ON "bm_config" USING btree ("client_id");
