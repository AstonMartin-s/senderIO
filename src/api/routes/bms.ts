import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getAllBms,
  getBm,
  createBm,
  patchBm,
  deleteBm,
  altaAutomatica,
  siguienteIdBm,
} from "../../services/bm.js";
import { generarBot } from "../../services/salesbot.js";
import { notifyBmChanged } from "../../db/notify.js";

const altaSchema = z.object({
  nombre: z.string().min(1),
  wabaId: z.string().nullable().optional(),
  chatSourceId: z.number().int().nullable().optional(),
  id: z.string().optional(),
});

const createSchema = z.object({
  id: z.string().min(1),
  nombre: z.string().optional(),
  pipelineId: z.number().int(),
  stageOrigenId: z.number().int(),
  stageOrigenPipelineId: z.number().int().nullable().optional(),
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
  fuenteEnvio: z.enum(["crm", "spam"]).optional(),
  plataforma: z.enum(["pam", "mooney"]).nullable().optional(),
  templateNombre: z.string().nullable().optional(),
  mensajeTexto: z.string().nullable().optional(),
  campaignId: z.string().nullable().optional(),
  campaignNombre: z.string().nullable().optional(),
  wabaId: z.string().nullable().optional(),
  chatSourceId: z.number().int().nullable().optional(),
  botListo: z.boolean().optional(),
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

  // Próximo id sugerido (BMn) para el alta.
  app.get("/api/bms/siguiente-id", async () => ({ id: await siguienteIdBm() }));

  // Alta automática: crea pipeline+etapas en Kommo y arma el bm_config.
  app.post("/api/bms/alta", async (req, reply) => {
    const parsed = altaSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    try {
      const bm = await altaAutomatica(parsed.data);
      await notifyBmChanged(bm.id);
      return reply.code(201).send(bm);
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
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
    const data = { ...parsed.data };
    // Sella la marca temporal cuando se confirma el bot.
    if (data.botListo === true) {
      (data as Record<string, unknown>).botListoAt = new Date();
    }
    const bm = await patchBm(id, data);
    if (!bm) return reply.code(404).send({ error: "no existe" });
    await notifyBmChanged(id);
    return bm;
  });

  // Genera el JSON del Salesbot del BM (clonando el molde con sus IDs).
  app.post("/api/bms/:id/generar-bot", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      return await generarBot(id);
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  app.delete("/api/bms/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await deleteBm(id);
    await notifyBmChanged(id);
    return reply.send({ ok: true });
  });
}
