import type { FastifyInstance } from "fastify";
import { patchBm, getBm } from "../../services/bm.js";
import { registrarMovimiento } from "../../services/movimientos.js";
import { resetDiario } from "../../jobs/reset.js";
import { notifyBmChanged, notifyAll } from "../../db/notify.js";

export async function controlRoutes(app: FastifyInstance) {
  app.post("/api/bms/:id/pause", async (req, reply) => {
    const { id } = req.params as { id: string };
    const bm = await patchBm(id, { pausado: true });
    if (!bm) return reply.code(404).send({ error: "no existe" });
    await registrarMovimiento({ bmId: id, accion: "pausa_bm" });
    await notifyBmChanged(id);
    return bm;
  });

  app.post("/api/bms/:id/resume", async (req, reply) => {
    const { id } = req.params as { id: string };
    const bm = await patchBm(id, {
      pausado: false,
      pausadoHasta: null,
      erroresConsecutivos: 0,
    });
    if (!bm) return reply.code(404).send({ error: "no existe" });
    await notifyBmChanged(id);
    return bm;
  });

  app.post("/api/bms/:id/reset-contadores", async (req, reply) => {
    const { id } = req.params as { id: string };
    const bm = await patchBm(id, {
      enviadosHoy: 0,
      erroresHoy: 0,
      erroresConsecutivos: 0,
    });
    if (!bm) return reply.code(404).send({ error: "no existe" });
    await notifyBmChanged(id);
    return bm;
  });

  app.post("/api/reset-diario", async () => {
    const res = await resetDiario(true);
    await notifyAll();
    return { ok: true, ...res };
  });
}
