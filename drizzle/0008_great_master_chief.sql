CREATE TABLE "plantillas" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"bm_id" text NOT NULL,
	"nombre" text NOT NULL,
	"kommo_template_id" bigint,
	"waba_id" text,
	"categoria" text DEFAULT 'MARKETING' NOT NULL,
	"idioma" text DEFAULT 'es' NOT NULL,
	"contenido" text DEFAULT '' NOT NULL,
	"botones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"header" text,
	"footer" text,
	"valor_estampado" text,
	"activo" boolean DEFAULT true NOT NULL,
	"estado" text DEFAULT 'local' NOT NULL,
	"reject_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bm_config" ADD COLUMN "waba_id" text;--> statement-breakpoint
ALTER TABLE "bm_config" ADD COLUMN "chat_source_id" bigint;