import type { FastifyInstance } from "fastify";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../../db/client.js";
import { bmConfig, logMovimientos, plantillas } from "../../db/schema.js";
import { getKpis, computeSnapshot, computeRange } from "../../services/kpis.js";
import { getKommoClient } from "../../kommo/index.js";
import { todayLocal } from "../../lib/time.js";
import {
  aggregateGrupos,
  buildEnvioFromGrupo,
  buildPlantillaMap,
  envioToCsvRow,
  resolvePlantilla,
  TRAZABILIDAD_CSV_HEADER,
} from "../../services/trazabilidad.js";

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

  // KPIs en vivo para un rango de fechas (desde el log). Sin rango = hoy.
  app.get("/api/kpis/rango", async (req) => {
    const q = req.query as { desde?: string; hasta?: string };
    if (!q.desde && !q.hasta) return computeSnapshot(todayLocal());
    return computeRange(q.desde, q.hasta);
  });

  // Log de movimientos en vivo (sin mensaje_enviado: textos largos que frenan el panel).
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
      .select({
        id: logMovimientos.id,
        ts: logMovimientos.ts,
        bmId: logMovimientos.bmId,
        leadId: logMovimientos.leadId,
        telefono: logMovimientos.telefono,
        segmento: logMovimientos.segmento,
        plantilla: logMovimientos.plantilla,
        templateNombre: logMovimientos.templateNombre,
        accion: logMovimientos.accion,
        resultado: logMovimientos.resultado,
        etapaDestino: logMovimientos.etapaDestino,
      })
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

    const [rows, bms, plts] = await Promise.all([
      db
        .select()
        .from(logMovimientos)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(asc(logMovimientos.ts)),
      db.select().from(bmConfig),
      db.select().from(plantillas),
    ]);
    const bmById = new Map(bms.map((b) => [b.id, b]));
    const plBy = buildPlantillaMap(plts);
    const grupos = aggregateGrupos(rows);

    const header = TRAZABILIDAD_CSV_HEADER.join(",");

    const body = [...grupos.values()]
      .filter((g) => g.tsEnviado)
      .sort((a, b) => a.tsEnviado!.getTime() - b.tsEnviado!.getTime())
      .map((g) => {
        const bm = bmById.get(g.bmId);
        if (!bm) return null;
        const pl = resolvePlantilla(g, plBy);
        return envioToCsvRow(buildEnvioFromGrupo(g, bm, pl), csvEsc);
      })
      .filter((row): row is string => row != null)
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
