import type { FastifyInstance } from "fastify";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { logMovimientos } from "../../db/schema.js";
import { getKpis, computeSnapshot } from "../../services/kpis.js";
import { getKommoClient } from "../../kommo/index.js";
import { todayLocal } from "../../lib/time.js";

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
    const q = req.query as { bm?: string; limit?: string };
    const limit = Math.min(Number(q.limit ?? 50), 500);
    const base = db.select().from(logMovimientos);
    const rows = q.bm
      ? await base
          .where(eq(logMovimientos.bmId, q.bm))
          .orderBy(desc(logMovimientos.ts))
          .limit(limit)
      : await base.orderBy(desc(logMovimientos.ts)).limit(limit);
    return rows;
  });

  // Admin: pipelines y etapas de Kommo (para el alta de BMs).
  app.get("/api/kommo/pipelines", async () => {
    return getKommoClient().listPipelines();
  });
}
