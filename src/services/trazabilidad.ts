import type { BmConfig, LogMovimiento, Plantilla } from "../db/schema.js";

/** Timestamp en ISO 8601 con huso fijo de Argentina (-03:00). */
export function toIsoAr(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  const shifted = new Date(date.getTime() - 3 * 3_600_000);
  return `${shifted.toISOString().slice(0, 19)}-03:00`;
}

export function toIsoArOrNull(
  d: Date | string | null | undefined
): string | null {
  const s = toIsoAr(d);
  return s || null;
}

export const COSTO_POR_MENSAJE = 0.0618;
export const MONEDA = "USD";

export type EnvioTrazabilidad = {
  fuente_envio: string;
  plataforma: string;
  campaign_id_externo: string;
  campaign_nombre?: string | null;
  template_nombre?: string | null;
  mensaje_enviado?: string | null;
  telefono: string;
  es_interno?: boolean | null;
  segmento?: string | null;
  message_id: string;
  ts_enviado?: string | null;
  ts_entregado?: string | null;
  ts_leido?: string | null;
  ts_primera_respuesta?: string | null;
  estado_final?: string | null;
  error_codigo?: string | null;
  error_motivo?: string | null;
  conversacion_id?: string | null;
  costo?: number | null;
  moneda?: string | null;
};

export type EnvioGrupo = {
  bmId: string;
  leadId: number;
  tsEnviado: Date | null;
  telefono: string | null;
  segmento: string | null;
  plantilla: string | null;
  templateNombre: string | null;
  mensajeEnviado: string | null;
  resultado: "si" | "no" | "error" | null;
  tsResultado: Date | null;
};

export function buildMessageId(bmId: string, leadId: number): string {
  return `senderio:${bmId}:${leadId}`;
}

/** Mapa (bmId::valorEstampado|nombre) → plantilla. */
export function buildPlantillaMap(
  plts: Plantilla[]
): Map<string, { nombre: string; contenido: string }> {
  const plBy = new Map<string, { nombre: string; contenido: string }>();
  for (const p of plts) {
    const v = { nombre: p.nombre, contenido: p.contenido };
    if (p.valorEstampado) plBy.set(`${p.bmId}::${p.valorEstampado}`, v);
    plBy.set(`${p.bmId}::${p.nombre}`, v);
  }
  return plBy;
}

export function resolvePlantilla(
  g: EnvioGrupo,
  plBy: Map<string, { nombre: string; contenido: string }>
): { nombre: string; contenido: string } | undefined {
  if (g.templateNombre && g.mensajeEnviado) {
    return { nombre: g.templateNombre, contenido: g.mensajeEnviado };
  }
  if (g.plantilla) return plBy.get(`${g.bmId}::${g.plantilla}`);
  return undefined;
}

/** Agrupa filas del log por (bm, lead): envío + resultado posterior. */
export function aggregateGrupos(rows: LogMovimiento[]): Map<string, EnvioGrupo> {
  const grupos = new Map<string, EnvioGrupo>();
  for (const r of rows) {
    if (r.leadId == null) continue;
    const key = `${r.bmId}::${r.leadId}`;
    let g = grupos.get(key);
    if (!g) {
      g = {
        bmId: r.bmId,
        leadId: r.leadId,
        tsEnviado: null,
        telefono: null,
        segmento: null,
        plantilla: null,
        templateNombre: null,
        mensajeEnviado: null,
        resultado: null,
        tsResultado: null,
      };
      grupos.set(key, g);
    }
    const ts = r.ts instanceof Date ? r.ts : new Date(r.ts);
    if (r.accion === "movido_a_envio") {
      if (!g.tsEnviado) g.tsEnviado = ts;
      if (r.telefono) g.telefono = r.telefono;
      if (r.segmento) g.segmento = r.segmento;
      if (r.plantilla) g.plantilla = r.plantilla;
      if (r.templateNombre) g.templateNombre = r.templateNombre;
      if (r.mensajeEnviado) g.mensajeEnviado = r.mensajeEnviado;
    } else if (r.accion === "resultado_si") {
      g.resultado = "si";
      g.tsResultado = ts;
    } else if (r.accion === "resultado_no") {
      g.resultado = "no";
      g.tsResultado = ts;
    } else if (r.accion === "resultado_error") {
      g.resultado = "error";
      g.tsResultado = ts;
    }
  }
  return grupos;
}

export function buildEnvioFromGrupo(
  g: EnvioGrupo,
  bm: BmConfig,
  pl?: { nombre: string; contenido: string } | null
): EnvioTrazabilidad {
  const fuente = bm.fuenteEnvio ?? "crm";
  const fallo = g.resultado === "error";
  const interactuo = g.resultado === "si" || g.resultado === "no";

  return {
    fuente_envio: fuente,
    plataforma: bm.plataforma ?? "mooney",
    campaign_id_externo: bm.campaignId ?? g.bmId,
    campaign_nombre: bm.campaignNombre ?? bm.nombre ?? g.bmId,
    template_nombre: g.templateNombre ?? pl?.nombre ?? g.plantilla ?? "",
    mensaje_enviado: g.mensajeEnviado ?? pl?.contenido ?? "",
    telefono: g.telefono ?? "",
    es_interno: fuente === "crm",
    segmento: g.segmento ?? "",
    message_id: buildMessageId(g.bmId, g.leadId),
    ts_enviado: toIsoArOrNull(g.tsEnviado),
    ts_entregado: null,
    ts_leido: null,
    ts_primera_respuesta: interactuo ? toIsoArOrNull(g.tsResultado) : null,
    estado_final: fallo ? "failed" : "sent",
    error_codigo: fallo ? "3132" : null,
    error_motivo: fallo ? "Error de envío (3132)" : null,
    conversacion_id: String(g.leadId),
    costo: fallo ? null : COSTO_POR_MENSAJE,
    moneda: fallo ? null : MONEDA,
  };
}

export const TRAZABILIDAD_CSV_HEADER = [
  "fuente_envio",
  "plataforma",
  "campaign_id_externo",
  "campaign_nombre",
  "template_nombre",
  "mensaje_enviado",
  "telefono",
  "es_interno",
  "segmento",
  "message_id",
  "ts_enviado",
  "ts_entregado",
  "ts_leido",
  "ts_primera_respuesta",
  "estado_final",
  "error_codigo",
  "error_motivo",
  "conversacion_id",
  "costo",
  "moneda",
] as const;

export function envioToCsvRow(
  envio: EnvioTrazabilidad,
  esc: (v: unknown) => string
): string {
  return [
    envio.fuente_envio,
    envio.plataforma,
    envio.campaign_id_externo,
    envio.campaign_nombre ?? "",
    envio.template_nombre ?? "",
    envio.mensaje_enviado ?? "",
    envio.telefono,
    envio.es_interno ? "true" : "false",
    envio.segmento ?? "",
    envio.message_id,
    envio.ts_enviado ?? "",
    envio.ts_entregado ?? "",
    envio.ts_leido ?? "",
    envio.ts_primera_respuesta ?? "",
    envio.estado_final ?? "",
    envio.error_codigo ?? "",
    envio.error_motivo ?? "",
    envio.conversacion_id ?? "",
    envio.costo ?? "",
    envio.moneda ?? "",
  ]
    .map(esc)
    .join(",");
}
