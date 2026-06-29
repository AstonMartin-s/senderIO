import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getPlantillas,
  getPlantilla,
  createPlantilla,
  patchPlantilla,
  deletePlantilla,
  crearEnKommo,
  chequearEstado,
  importarDesdeKommo,
} from "../../services/plantillas.js";

const botonSchema = z.object({
  text: z.string(),
  type: z.string().optional(),
});

const createSchema = z.object({
  bmId: z.string().min(1),
  nombre: z.string().min(1),
  wabaId: z.string().nullable().optional(),
  categoria: z.string().optional(),
  idioma: z.string().optional(),
  contenido: z.string().optional(),
  botones: z.array(botonSchema).optional(),
  header: z.string().nullable().optional(),
  footer: z.string().nullable().optional(),
  valorEstampado: z.string().nullable().optional(),
  activo: z.boolean().optional(),
  // Estado de moderación editable a mano: Kommo no lo expone por API, así que
  // el usuario lo marca según lo que ve en Kommo/Meta.
  estado: z.enum(["borrador", "review", "approved", "rejected", "paused"]).optional(),
});

const patchSchema = createSchema.partial().omit({ bmId: true });

export async function plantillaRoutes(app: FastifyInstance) {
  app.get("/api/plantillas", async (req) => {
    const q = req.query as { bm?: string };
    return getPlantillas(q.bm);
  });

  // Precarga: importa de Kommo las plantillas existentes, alineadas por WABA id.
  app.post("/api/plantillas/importar", async (_req, reply) => {
    try {
      return await importarDesdeKommo();
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  app.get("/api/plantillas/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = await getPlantilla(Number(id));
    if (!p) return reply.code(404).send({ error: "no existe" });
    return p;
  });

  app.post("/api/plantillas", async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const p = await createPlantilla(parsed.data);
    return reply.code(201).send(p);
  });

  app.patch("/api/plantillas/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const p = await patchPlantilla(Number(id), parsed.data);
    if (!p) return reply.code(404).send({ error: "no existe" });
    return p;
  });

  app.delete("/api/plantillas/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await deletePlantilla(Number(id));
    return reply.send({ ok: true });
  });

  // Crea la plantilla en Kommo y la manda a moderación de Meta.
  app.post("/api/plantillas/:id/submit", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const p = await crearEnKommo(Number(id));
      return p;
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  // Relee el estado de moderación desde Kommo/Meta (botón manual del panel).
  app.post("/api/plantillas/:id/check", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const p = await chequearEstado(Number(id));
      return p;
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });
}
