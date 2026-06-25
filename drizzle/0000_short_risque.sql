CREATE TABLE "bm_config" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text DEFAULT '' NOT NULL,
	"pipeline_id" bigint NOT NULL,
	"stage_origen_id" bigint NOT NULL,
	"stage_destino_id" bigint NOT NULL,
	"stage_error_id" bigint NOT NULL,
	"stage_si_id" bigint,
	"stage_no_id" bigint,
	"activo" boolean DEFAULT false NOT NULL,
	"pausado" boolean DEFAULT false NOT NULL,
	"limite_diario" integer DEFAULT 30 NOT NULL,
	"enviados_hoy" integer DEFAULT 0 NOT NULL,
	"errores_hoy" integer DEFAULT 0 NOT NULL,
	"errores_consecutivos" integer DEFAULT 0 NOT NULL,
	"umbral_errores_consecutivos" integer DEFAULT 5 NOT NULL,
	"pct_error_movil" numeric DEFAULT '0' NOT NULL,
	"intervalo_min_seg" integer DEFAULT 120 NOT NULL,
	"intervalo_max_seg" integer DEFAULT 180 NOT NULL,
	"ventana_inicio" time DEFAULT '17:30' NOT NULL,
	"ventana_fin" time DEFAULT '23:59' NOT NULL,
	"pausa_corta_min" integer DEFAULT 5 NOT NULL,
	"pausa_corta_max" integer DEFAULT 10 NOT NULL,
	"ultimo_envio" timestamp with time zone,
	"proximo_tick_at" timestamp with time zone,
	"pausado_hasta" timestamp with time zone,
	"fecha" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eventos_kommo" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"event_id" text,
	"tipo" text NOT NULL,
	"payload" jsonb NOT NULL,
	"procesado" boolean DEFAULT false NOT NULL,
	CONSTRAINT "eventos_kommo_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "kpi_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fecha" date NOT NULL,
	"bm_id" text NOT NULL,
	"enviados" integer DEFAULT 0 NOT NULL,
	"si" integer DEFAULT 0 NOT NULL,
	"no" integer DEFAULT 0 NOT NULL,
	"errores" integer DEFAULT 0 NOT NULL,
	"pct_error" numeric DEFAULT '0' NOT NULL,
	"pct_si" numeric DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "log_movimientos" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"bm_id" text NOT NULL,
	"lead_id" bigint,
	"accion" text NOT NULL,
	"resultado" text,
	"etapa_destino" bigint
);
