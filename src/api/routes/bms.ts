import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getAllBms,
  getBm,
  createBm,
  patchBm,
  deleteBm,
} from "../../services/bm.js";
import { notifyBmChanged } from "../../db/notify.js";

const createSchema = z.object({
  id: z.string().min(1),
  nombre: z.string().optional(),
  pipelineId: z.number().int(),
  stageOrigenId: z.number().int(),
  stageDestinoId: z.number().int(),
  stageErrorId: z.number().int(),
  stageSiId: z.number().int().nullable().optional(),
  stageNoId: z.number().int().nullable().optional(),
  activo: z.boolean().optional(),
  limiteDiario: z.number().int().optional(),
  intervaloMinSeg: z.number().int().optional(),
  intervaloMaxSeg: z.number().int().optional(),
  ventanaInicio: z.string().optional(),
  ventanaFin: z.string().optional(),
  pausaCortaMin: z.number().int().optional(),
  pausaCortaMax: z.number().int().optional(),
  umbralErroresConsecutivos: z.number().int().optional(),
});

const patchSchema = createSchema.partial().omit({ id: true });

export async function bmRoutes(app: FastifyInstance) {
  app.get("/api/bms", async () => getAllBms());

  app.get("/api/bms/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const bm = await getBm(id);
    if (!bm) return reply.code(404).send({ error: "no existe" });
    return bm;
  });

  app.post("/api/bms", async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const bm = await createBm(parsed.data);
    await notifyBmChanged(bm.id);
    return reply.code(201).send(bm);
  });

  app.patch("/api/bms/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const bm = await patchBm(id, parsed.data);
    if (!bm) return reply.code(404).send({ error: "no existe" });
    await notifyBmChanged(id);
    return bm;
  });

  app.delete("/api/bms/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await deleteBm(id);
    await notifyBmChanged(id);
    return reply.send({ ok: true });
  });
}
