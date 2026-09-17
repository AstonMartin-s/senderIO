/**
 * Feed de servicio para Control / Trazabilidad nueva
 * (MSG-TRZ-20260917-SND-1 · contrato Traza v1, igual que CRM).
 *
 * GET /traza/v1/feed — no es el ingest viejo /api/v1/spam/*.
 * El push a programa-trazabilidad sigue prendido (dual-run) hasta que Control cruce.
 */
import { pool } from "../db/client.js";
import { normalizePhoneE164 } from "../lib/phone.js";
import { COSTO_POR_MENSAJE, MONEDA, buildMessageId } from "../services/trazabilidad.js";

export const FEED_TYPES = ["senderio.envio", "senderio.plantilla"] as const;
export type FeedType = (typeof FEED_TYPES)[number];

const TYPE_RANK: Record<FeedType, number> = Object.fromEntries(
  FEED_TYPES.map((t, i) => [t, i])
) as Record<FeedType, number>;

export const FEED_LIMIT_MAX = 500;
export const FEED_LIMIT_DEFAULT = 100;

export type FeedItem = {
  type: FeedType;
  id: string;
  ts: string;
  telefono: string | null;
  payload: Record<string, unknown>;
};

export type FeedEnvelope = {
  program: "senderio";
  generatedAt: string;
  store: null;
  cursor: string | null;
  hasMore: boolean;
  items: FeedItem[];
};

export type FeedQuery = {
  since?: string | null;
  cursor?: string | null;
  types?: FeedType[] | null;
  limit?: number | null;
};

type DecodedCursor = { ts: string; type: FeedType; id: string };

function encodeCursor(item: FeedItem): string {
  return Buffer.from(`${item.ts}|${item.type}|${item.id}`, "utf8").toString(
    "base64url"
  );
}

function decodeCursor(cursor: string): DecodedCursor | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const sep1 = raw.indexOf("|");
    const sep2 = raw.lastIndexOf("|");
    if (sep1 < 0 || sep2 <= sep1) return null;
    const ts = raw.slice(0, sep1);
    const type = raw.slice(sep1 + 1, sep2) as FeedType;
    const id = raw.slice(sep2 + 1);
    if (!FEED_TYPES.includes(type) || !ts || !id) return null;
    return { ts, type, id };
  } catch {
    return null;
  }
}

function afterCursor(
  type: FeedType,
  cur: DecodedCursor,
  requested: FeedType[]
): { sql: string; params: unknown[] } {
  const singleOrMissing =
    requested.length === 1 || !requested.includes(cur.type);
  if (singleOrMissing) {
    if (requested.length === 1 && requested[0] !== type) {
      return { sql: "1=0", params: [] };
    }
    return {
      sql: `(__ts > $TS::timestamptz OR (__ts = $TS::timestamptz AND __id > $ID))`,
      params: [cur.ts, cur.id],
    };
  }
  const rT = TYPE_RANK[type];
  const rC = TYPE_RANK[cur.type];
  if (rT > rC) return { sql: `__ts >= $TS::timestamptz`, params: [cur.ts] };
  if (rT < rC) return { sql: `__ts > $TS::timestamptz`, params: [cur.ts] };
  return {
    sql: `(__ts > $TS::timestamptz OR (__ts = $TS::timestamptz AND __id > $ID))`,
    params: [cur.ts, cur.id],
  };
}

function toIso(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function toIsoOrNull(d: Date | string | null | undefined): string | null {
  const s = toIso(d);
  return s || null;
}

function s(v: unknown): string | null {
  if (v == null || v === "") return null;
  return String(v);
}

function bind(sql: string, named: Record<string, unknown>): { text: string; values: unknown[] } {
  const values: unknown[] = [];
  const text = sql.replace(/\$([A-Z_]+)/g, (_, key: string) => {
    values.push(named[key]);
    return `$${values.length}`;
  });
  return { text, values };
}

type EnvioRow = {
  bm_id: string;
  lead_id: string | number;
  ts_enviado: Date;
  telefono: string | null;
  segmento: string | null;
  plantilla: string | null;
  template_nombre: string | null;
  fuente_envio: string | null;
  plataforma: string | null;
  campaign_id: string | null;
  campaign_nombre: string | null;
  bm_nombre: string | null;
  resultado_accion: string | null;
  ts_resultado: Date | null;
};

async function fetchEnvios(
  since: Date | null,
  cur: DecodedCursor | null,
  limit: number,
  requested: FeedType[]
): Promise<FeedItem[]> {
  const where: string[] = [];
  const named: Record<string, unknown> = { LIMIT: limit };

  if (since) {
    where.push(`e.ts_enviado >= $SINCE::timestamptz`);
    named.SINCE = since.toISOString();
  }
  if (cur) {
    const c = afterCursor("senderio.envio", cur, requested);
    where.push(
      c.sql
        .replaceAll("__ts", "date_trunc('milliseconds', e.ts_enviado)")
        .replaceAll("__id", `('senderio:' || e.bm_id || ':' || e.lead_id)`)
    );
    if (c.params[0] != null) named.TS = c.params[0];
    if (c.params[1] != null) named.ID = c.params[1];
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { text, values } = bind(
    `
    WITH envios AS (
      SELECT DISTINCT ON (m.bm_id, m.lead_id)
        m.bm_id,
        m.lead_id,
        m.ts AS ts_enviado,
        m.telefono,
        m.segmento,
        m.plantilla,
        m.template_nombre,
        b.fuente_envio,
        b.plataforma,
        b.campaign_id,
        b.campaign_nombre,
        b.nombre AS bm_nombre
      FROM log_movimientos m
      LEFT JOIN bm_config b ON b.id = m.bm_id
      WHERE m.accion = 'movido_a_envio'
        AND m.lead_id IS NOT NULL
      ORDER BY m.bm_id, m.lead_id, m.ts ASC
    ),
    resultados AS (
      SELECT DISTINCT ON (bm_id, lead_id)
        bm_id, lead_id, accion, ts
      FROM log_movimientos
      WHERE accion IN (
          'resultado_si',
          'resultado_no',
          'resultado_error',
          'resultado_respuesta'
        )
        AND lead_id IS NOT NULL
      ORDER BY bm_id, lead_id, ts DESC
    )
    SELECT
      e.bm_id,
      e.lead_id,
      e.ts_enviado,
      e.telefono,
      e.segmento,
      e.plantilla,
      e.template_nombre,
      e.fuente_envio,
      e.plataforma,
      e.campaign_id,
      e.campaign_nombre,
      e.bm_nombre,
      r.accion AS resultado_accion,
      r.ts AS ts_resultado
    FROM envios e
    LEFT JOIN resultados r ON r.bm_id = e.bm_id AND r.lead_id = e.lead_id
    ${whereSql}
    ORDER BY e.ts_enviado ASC, ('senderio:' || e.bm_id || ':' || e.lead_id) ASC
    LIMIT $LIMIT
    `,
    named
  );

  const res = await pool.query<EnvioRow>(text, values);
  return res.rows.map((r) => {
    const leadId = Number(r.lead_id);
    const messageId = buildMessageId(r.bm_id, leadId);
    const fuente = r.fuente_envio || "crm";
    const fallo = r.resultado_accion === "resultado_error";
    const interactuo =
      r.resultado_accion === "resultado_si" ||
      r.resultado_accion === "resultado_no" ||
      r.resultado_accion === "resultado_respuesta";
    const telefono = normalizePhoneE164(r.telefono);
    return {
      type: "senderio.envio" as const,
      id: messageId,
      ts: toIso(r.ts_enviado),
      telefono,
      payload: {
        fuenteEnvio: fuente,
        plataforma: s(r.plataforma) ?? "mooney",
        campaignIdExterno: s(r.campaign_id) ?? r.bm_id,
        campaignNombre: s(r.campaign_nombre) ?? s(r.bm_nombre) ?? r.bm_id,
        templateNombre: s(r.template_nombre) ?? s(r.plantilla),
        telefono,
        esInterno: fuente === "crm",
        segmento: s(r.segmento),
        messageId,
        tsEnviado: toIsoOrNull(r.ts_enviado),
        tsEntregado: null,
        tsLeido: null,
        tsPrimeraRespuesta: interactuo ? toIsoOrNull(r.ts_resultado) : null,
        estadoFinal: fallo ? "failed" : "sent",
        errorCodigo: fallo ? "3132" : null,
        errorMotivo: fallo ? "Error de envío (3132)" : null,
        conversacionId: String(leadId),
        costo: fallo ? null : COSTO_POR_MENSAJE,
        moneda: fallo ? null : MONEDA,
      },
    };
  });
}

type PlantillaRow = {
  nombre: string;
  contenido: string | null;
  bm_id: string;
  idioma: string | null;
  categoria: string | null;
  estado: string | null;
  updated_at: Date;
  plataforma: string | null;
  campaign_id: string | null;
};

async function fetchPlantillas(
  since: Date | null,
  cur: DecodedCursor | null,
  limit: number,
  requested: FeedType[]
): Promise<FeedItem[]> {
  const where: string[] = [];
  const named: Record<string, unknown> = { LIMIT: limit };

  if (since) {
    where.push(`p.updated_at >= $SINCE::timestamptz`);
    named.SINCE = since.toISOString();
  }
  if (cur) {
    const c = afterCursor("senderio.plantilla", cur, requested);
    where.push(
      c.sql
        .replaceAll("__ts", "date_trunc('milliseconds', p.updated_at)")
        .replaceAll("__id", "p.nombre")
    );
    if (c.params[0] != null) named.TS = c.params[0];
    if (c.params[1] != null) named.ID = c.params[1];
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { text, values } = bind(
    `
    SELECT
      p.nombre,
      p.contenido,
      p.bm_id,
      p.idioma,
      p.categoria,
      p.estado,
      p.updated_at,
      b.plataforma,
      b.campaign_id
    FROM (
      SELECT DISTINCT ON (nombre)
        nombre, contenido, bm_id, idioma, categoria, estado, updated_at
      FROM plantillas
      ORDER BY nombre, updated_at DESC
    ) p
    LEFT JOIN bm_config b ON b.id = p.bm_id
    ${whereSql}
    ORDER BY p.updated_at ASC, p.nombre ASC
    LIMIT $LIMIT
    `,
    named
  );

  const res = await pool.query<PlantillaRow>(text, values);
  return res.rows.map((r) => ({
    type: "senderio.plantilla" as const,
    id: r.nombre,
    ts: toIso(r.updated_at),
    telefono: null,
    payload: {
      templateNombre: s(r.nombre),
      contenido: s(r.contenido),
      bmId: s(r.bm_id),
      idioma: s(r.idioma),
      categoria: s(r.categoria),
      estado: s(r.estado),
      plataforma: s(r.plataforma) ?? "mooney",
      campaignIdExterno: s(r.campaign_id) ?? s(r.bm_id),
    },
  }));
}

function compareItems(a: FeedItem, b: FeedItem): number {
  if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1;
  const ra = TYPE_RANK[a.type];
  const rb = TYPE_RANK[b.type];
  if (ra !== rb) return ra - rb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function parseSince(raw: string | null | undefined): Date | null {
  if (!raw || !raw.trim()) return null;
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function getFeed(q: FeedQuery): Promise<FeedEnvelope> {
  const limit = Math.min(
    Math.max(1, Math.floor(q.limit ?? FEED_LIMIT_DEFAULT)),
    FEED_LIMIT_MAX
  );
  const cur = q.cursor ? decodeCursor(q.cursor) : null;
  const since = parseSince(q.since);
  const types = q.types && q.types.length ? q.types : [...FEED_TYPES];

  const collected: FeedItem[] = [];
  let anyOverflow = false;
  for (const t of types) {
    const rows =
      t === "senderio.envio"
        ? await fetchEnvios(since, cur, limit + 1, types)
        : await fetchPlantillas(since, cur, limit + 1, types);
    if (rows.length > limit) anyOverflow = true;
    collected.push(...rows.slice(0, limit));
  }

  collected.sort(compareItems);
  const items = collected.slice(0, limit);
  const hasMore = collected.length > limit || anyOverflow;
  const last = items[items.length - 1];

  return {
    program: "senderio",
    generatedAt: new Date().toISOString(),
    store: null,
    cursor: last ? encodeCursor(last) : (q.cursor ?? null),
    hasMore,
    items,
  };
}

export function parseTypes(
  raw: string | undefined | null
): FeedType[] | null | "invalid" {
  if (!raw || !raw.trim()) return null;
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const out: FeedType[] = [];
  for (const p of parts) {
    if (!FEED_TYPES.includes(p as FeedType)) return "invalid";
    if (!out.includes(p as FeedType)) out.push(p as FeedType);
  }
  return out.length ? out : null;
}
