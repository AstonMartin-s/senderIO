import {
  pgTable,
  text,
  bigint,
  bigserial,
  boolean,
  integer,
  numeric,
  time,
  date,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

/**
 * bm_config: un registro por BM. Es la fuente de verdad del estado de cada
 * "número/business manager" que orquestamos. Reemplaza la planilla estado_bm.
 */
export const bmConfig = pgTable("bm_config", {
  id: text("id").primaryKey(), // "BM1", "BM2"...
  nombre: text("nombre").notNull().default(""),

  pipelineId: bigint("pipeline_id", { mode: "number" }).notNull(),
  stageOrigenId: bigint("stage_origen_id", { mode: "number" }).notNull(),
  // Pipeline donde vive la etapa de origen. Permite una "base general" compartida
  // que físicamente pertenece a otro pipeline (p.ej. varios BMs toman de 106401855).
  // Si es null, se asume el mismo pipelineId del BM.
  stageOrigenPipelineId: bigint("stage_origen_pipeline_id", { mode: "number" }),
  stageDestinoId: bigint("stage_destino_id", { mode: "number" }).notNull(),
  stageErrorId: bigint("stage_error_id", { mode: "number" }).notNull(),
  stageSiId: bigint("stage_si_id", { mode: "number" }),
  stageNoId: bigint("stage_no_id", { mode: "number" }),

  activo: boolean("activo").notNull().default(false),
  pausado: boolean("pausado").notNull().default(false),

  limiteDiario: integer("limite_diario").notNull().default(30),
  enviadosHoy: integer("enviados_hoy").notNull().default(0),
  erroresHoy: integer("errores_hoy").notNull().default(0),
  erroresConsecutivos: integer("errores_consecutivos").notNull().default(0),
  umbralErroresConsecutivos: integer("umbral_errores_consecutivos")
    .notNull()
    .default(5),
  pctErrorMovil: numeric("pct_error_movil").notNull().default("0"),

  intervaloMinSeg: integer("intervalo_min_seg").notNull().default(120),
  intervaloMaxSeg: integer("intervalo_max_seg").notNull().default(180),
  ventanaInicio: time("ventana_inicio").notNull().default("17:30"),
  ventanaFin: time("ventana_fin").notNull().default("23:59"),
  pausaCortaMin: integer("pausa_corta_min").notNull().default(5),
  pausaCortaMax: integer("pausa_corta_max").notNull().default(10),

  ultimoEnvio: timestamp("ultimo_envio", { withTimezone: true }),
  proximoTickAt: timestamp("proximo_tick_at", { withTimezone: true }),
  pausadoHasta: timestamp("pausado_hasta", { withTimezone: true }),

  fecha: date("fecha"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * log_movimientos: bitácora de cada acción del orquestador y de cada resultado
 * recibido por webhook.
 */
export const logMovimientos = pgTable("log_movimientos", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  bmId: text("bm_id").notNull(),
  leadId: bigint("lead_id", { mode: "number" }),
  // movido_a_envio | resultado_si | resultado_no | resultado_error | pausa_bm
  accion: text("accion").notNull(),
  // ok | error_3132 | sin_leads
  resultado: text("resultado"),
  etapaDestino: bigint("etapa_destino", { mode: "number" }),
});

/**
 * eventos_kommo: webhooks crudos para auditoría e idempotencia.
 */
export const eventosKommo = pgTable("eventos_kommo", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  eventId: text("event_id").unique(),
  tipo: text("tipo").notNull(),
  payload: jsonb("payload").notNull(),
  procesado: boolean("procesado").notNull().default(false),
});

/**
 * kpi_snapshots: foto diaria archivada antes del reset.
 */
export const kpiSnapshots = pgTable("kpi_snapshots", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  fecha: date("fecha").notNull(),
  bmId: text("bm_id").notNull(), // id de BM o "TOTAL"
  enviados: integer("enviados").notNull().default(0),
  si: integer("si").notNull().default(0),
  no: integer("no").notNull().default(0),
  errores: integer("errores").notNull().default(0),
  pctError: numeric("pct_error").notNull().default("0"),
  pctSi: numeric("pct_si").notNull().default("0"),
});

export type BmConfig = typeof bmConfig.$inferSelect;
export type NewBmConfig = typeof bmConfig.$inferInsert;
export type LogMovimiento = typeof logMovimientos.$inferSelect;
export type EventoKommo = typeof eventosKommo.$inferSelect;
export type KpiSnapshot = typeof kpiSnapshots.$inferSelect;
