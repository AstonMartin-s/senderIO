import type { FastifyInstance } from "fastify";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../../db/client.js";
import { bmConfig, logMovimientos } from "../../db/schema.js";
import { getKpis, computeSnapshot } from "../../services/kpis.js";
import { getKommoClient } from "../../kommo/index.js";
import { todayLocal } from "../../lib/time.js";

/** Timestamp en ISO 8601 con huso fijo de Argentina (-03:00). */
function toIsoAr(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  const shifted = new Date(date.getTime() - 3 * 3_600_000);
  return `${shifted.toISOString().slice(0, 19)}-03:00`;
}

const csvEsc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function kpiRoutes(app: FastifyInstance) {
  // KPIs históricos archivados.
  app.get("/api/kpis", async (req) => {
    const q = req.query as { bm?: string; desde?: string; hasta?: string };
    return getKpis(q);
  });

  // KPIs del día en curso (calculados en vivo desde el log).
  app.get("/api/kpis/hoy", async () => {
    return computeSnapshot(todayLocal());
  });

  // Log de movimientos en vivo.
  app.get("/api/movimientos", async (req) => {
    const q = req.query as {
      bm?: string;
      limit?: string;
      desde?: string;
      hasta?: string;
    };
    const limit = Math.min(Number(q.limit ?? 50), 1000);
    const conds = [];
    if (q.bm) conds.push(eq(logMovimientos.bmId, q.bm));
    if (q.desde) conds.push(gte(logMovimientos.ts, new Date(q.desde)));
    if (q.hasta) conds.push(lte(logMovimientos.ts, new Date(q.hasta)));
    return db
      .select()
      .from(logMovimientos)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(logMovimientos.ts))
      .limit(limit);
  });

  // Export CSV del historial de movimientos (estilo planilla del n8n).
  app.get("/api/movimientos.csv", async (req, reply) => {
    const q = req.query as {
      bm?: string;
      desde?: string;
      hasta?: string;
      limit?: string;
    };
    const limit = Math.min(Number(q.limit ?? 50000), 100000);

    const conds = [];
    if (q.bm) conds.push(eq(logMovimientos.bmId, q.bm));
    if (q.desde) conds.push(gte(logMovimientos.ts, new Date(q.desde)));
    if (q.hasta) conds.push(lte(logMovimientos.ts, new Date(q.hasta)));

    const rows = await db
      .select()
      .from(logMovimientos)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(logMovimientos.ts))
      .limit(limit);

    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = "timestamp,bm,lead_id,accion,resultado,etapa_destino";
    const body = rows
      .map((r) =>
        [
          r.ts instanceof Date ? r.ts.toISOString() : r.ts,
          r.bmId,
          r.leadId ?? "",
          r.accion,
          r.resultado ?? "",
          r.etapaDestino ?? "",
        ]
          .map(esc)
          .join(",")
      )
      .join("\n");
    const csv = `${header}\n${body}\n`;

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const fname = `senderio-movimientos${q.bm ? `-${q.bm}` : ""}-${stamp}.csv`;
    reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${fname}"`);
    return csv;
  });

  // Export CSV de TRAZABILIDAD (contrato plantilla_envio.csv).
  // Una fila por envío (par bm+lead), enriquecida con el resultado del webhook.
  app.get("/api/trazabilidad.csv", async (req, reply) => {
    const q = req.query as { bm?: string; desde?: string; hasta?: string };

    const conds = [];
    if (q.bm) conds.push(eq(logMovimientos.bmId, q.bm));
    if (q.desde) conds.push(gte(logMovimientos.ts, new Date(q.desde)));
    if (q.hasta) conds.push(lte(logMovimientos.ts, new Date(q.hasta)));

    const [rows, bms] = await Promise.all([
      db
        .select()
        .from(logMovimientos)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(asc(logMovimientos.ts)),
      db.select().from(bmConfig),
    ]);
    const bmById = new Map(bms.map((b) => [b.id, b]));

    // Agrupar por (bm, lead): el envío + su resultado posterior.
    type Agg = {
      bmId: string;
      leadId: number;
      tsEnviado: Date | null;
      telefono: string | null;
      resultado: "si" | "no" | "error" | null;
      tsResultado: Date | null;
    };
    const grupos = new Map<string, Agg>();
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
          resultado: null,
          tsResultado: null,
        };
        grupos.set(key, g);
      }
      const ts = r.ts instanceof Date ? r.ts : new Date(r.ts);
      if (r.accion === "movido_a_envio") {
        if (!g.tsEnviado) g.tsEnviado = ts;
        if (r.telefono) g.telefono = r.telefono;
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

    const header = [
      "fuente_envio",
      "plataforma",
      "campaign_id_externo",
      "campaign_nombre",
      "template_nombre",
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
    ].join(",");

    const body = [...grupos.values()]
      // Sólo filas con envío real (movido_a_envio).
      .filter((g) => g.tsEnviado)
      .sort((a, b) => (a.tsEnviado!.getTime() - b.tsEnviado!.getTime()))
      .map((g) => {
        const bm = bmById.get(g.bmId);
        const respondio = g.resultado === "si" || g.resultado === "no";
        const fallo = g.resultado === "error";
        const estadoFinal = fallo ? "failed" : respondio ? "read" : "sent";
        const tsResp = respondio ? toIsoAr(g.tsResultado) : "";
        const fuente = bm?.fuenteEnvio ?? "crm";
        return [
          fuente, // fuente_envio (crm interna | spam externa)
          bm?.plataforma ?? "mooney", // plataforma
          bm?.campaignId ?? g.bmId, // campaign_id_externo
          bm?.campaignNombre ?? bm?.nombre ?? g.bmId, // campaign_nombre
          bm?.templateNombre ?? "", // template_nombre
          g.telefono ?? "", // telefono (clave de cruce)
          fuente === "crm" ? "true" : "false", // es_interno (derivado del origen)
          "", // segmento
          `senderio:${g.bmId}:${g.leadId}`, // message_id (surrogate estable)
          toIsoAr(g.tsEnviado), // ts_enviado
          "", // ts_entregado (no disponible)
          respondio ? toIsoAr(g.tsResultado) : "", // ts_leido
          tsResp, // ts_primera_respuesta
          estadoFinal, // estado_final
          fallo ? "3132" : "", // error_codigo
          fallo ? "Error de envío (3132)" : "", // error_motivo
          "", // conversacion_id
          "", // costo
          "", // moneda
        ]
          .map(csvEsc)
          .join(",");
      })
      .join("\n");

    const csv = `${header}\n${body}\n`;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const fname = `trazabilidad-envios${q.bm ? `-${q.bm}` : ""}-${stamp}.csv`;
    reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${fname}"`);
    return csv;
  });

  // Admin: pipelines y etapas de Kommo (para el alta de BMs).
  app.get("/api/kommo/pipelines", async () => {
    return getKommoClient().listPipelines();
  });
}
