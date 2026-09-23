import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { eventosKommo } from "../../db/schema.js";
import { getBm, getBmByPipeline, patchBm } from "../../services/bm.js";
import { aplicarResultado, type ResultadoTipo } from "../../services/firewall.js";
import { kommoFor } from "../../config.js";
import { resolveClientId } from "../../services/clients.js";
import { getKommoClient } from "../../kommo/index.js";
import { ultimoEnvioDeLead } from "../../services/movimientos.js";
import type { BmConfig } from "../../db/schema.js";
import type { KommoPipeline } from "../../kommo/types.js";

interface ParsedEvent {
  leadId: number | null;
  statusId: number | null;
  pipelineId: number | null;
  leadName?: string;
}

/**
 * Kommo manda el webhook como x-www-form-urlencoded con claves anidadas:
 *   leads[status][0][id], leads[status][0][status_id], leads[status][0][pipeline_id]
 * También aceptamos un JSON simple { lead_id, status_id, pipeline_id } para pruebas locales.
 */
function parseEvent(body: Record<string, unknown>): ParsedEvent {
  if (body["leads[status][0][id]"] !== undefined) {
    return {
      leadId: Number(body["leads[status][0][id]"]) || null,
      statusId: Number(body["leads[status][0][status_id]"]) || null,
      pipelineId: Number(body["leads[status][0][pipeline_id]"]) || null,
      leadName: body["leads[status][0][name]"] as string | undefined,
    };
  }
  return {
    leadId: Number(body.lead_id) || null,
    statusId: Number(body.status_id) || null,
    pipelineId: Number(body.pipeline_id) || null,
    leadName: body.name as string | undefined,
  };
}

function clasificar(
  statusId: number,
  bm: { stageErrorId: number; stageSiId: number | null; stageNoId: number | null }
): ResultadoTipo | null {
  const id = Number(statusId);
  if (Number(bm.stageErrorId) === id) return "error";
  if (bm.stageSiId != null && Number(bm.stageSiId) === id) return "si";
  if (bm.stageNoId != null && Number(bm.stageNoId) === id) return "no";
  return null;
}

function tipoPorNombre(name: string | null | undefined): ResultadoTipo | null {
  const n = (name ?? "").trim().toUpperCase();
  if (n === "ERROR") return "error";
  if (n === "SI") return "si";
  if (n === "NO") return "no";
  return null;
}

const pipelinesCache = new Map<string, { at: number; pipes: KommoPipeline[] }>();

async function pipelinesDe(clientId: string): Promise<KommoPipeline[]> {
  const hit = pipelinesCache.get(clientId);
  if (hit && Date.now() - hit.at < 60_000) return hit.pipes;
  const pipes = await getKommoClient(clientId).listPipelines();
  pipelinesCache.set(clientId, { at: Date.now(), pipes });
  return pipes;
}

async function nombreEtapa(
  clientId: string,
  pipelineId: number,
  statusId: number
): Promise<string | null> {
  const pipes = await pipelinesDe(clientId);
  const pipe = pipes.find((p) => Number(p.id) === Number(pipelineId));
  return (
    pipe?.stages.find((s) => Number(s.id) === Number(statusId))?.name ?? null
  );
}

/** Si el id guardado no es el de la etapa ERROR/SI/NO real, lo corrige. */
async function alinearEtapa(
  bm: BmConfig,
  tipo: ResultadoTipo,
  statusId: number
): Promise<void> {
  const id = Number(statusId);
  if (tipo === "error" && Number(bm.stageErrorId) !== id) {
    await patchBm(bm.id, { stageErrorId: id });
  } else if (tipo === "si" && Number(bm.stageSiId) !== id) {
    await patchBm(bm.id, { stageSiId: id });
  } else if (tipo === "no" && Number(bm.stageNoId) !== id) {
    await patchBm(bm.id, { stageNoId: id });
  }
}

async function handleWebhook(
  req: { query: unknown; headers: Record<string, unknown>; body: unknown },
  reply: { code: (n: number) => { send: (b: unknown) => unknown }; send: (b: unknown) => unknown },
  clientId: string
) {
  const creds = kommoFor(clientId);
  if (creds.webhookSecret) {
    const provided =
      (req.query as Record<string, string>)?.secret ??
      req.headers["x-webhook-secret"];
    if (provided !== creds.webhookSecret) {
      return reply.code(401).send({ error: "secreto inválido" });
    }
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const ev = parseEvent(body);

  const eventId =
    ev.leadId && ev.statusId ? `${clientId}:${ev.leadId}:${ev.statusId}` : null;

  if (eventId) {
    const dup = await db
      .select({ procesado: eventosKommo.procesado })
      .from(eventosKommo)
      .where(eq(eventosKommo.eventId, eventId));
    // Solo el evento ya aplicado se descarta. Uno guardado pero ignorado
    // (etapa no matcheaba) se vuelve a intentar.
    if (dup[0]?.procesado) {
      return reply.send({ ok: true, dedupe: true });
    }
    if (!dup.length) {
      await db.insert(eventosKommo).values({
        eventId,
        tipo: "lead_status_changed",
        payload: body,
        procesado: false,
      });
    }
  } else {
    await db.insert(eventosKommo).values({
      eventId,
      tipo: "lead_status_changed",
      payload: body,
      procesado: false,
    });
  }

  if (!ev.pipelineId || !ev.statusId) {
    return reply.send({ ok: true, ignored: "payload incompleto" });
  }

  let bm = await getBmByPipeline(ev.pipelineId);
  if (bm && bm.clientId !== clientId) {
    return reply.send({ ok: true, ignored: "pipeline de otro cliente" });
  }

  let tipo = bm ? clasificar(ev.statusId, bm) : null;

  // El bot a veces mueve a una etapa ERROR/SI/NO cuyo id no es el que
  // guardamos (bot viejo o pipeline reutilizado). Si el nombre es ese, cuenta.
  if (!tipo) {
    const nombre = await nombreEtapa(clientId, ev.pipelineId, ev.statusId);
    tipo = tipoPorNombre(nombre);
    if (tipo && !bm && ev.leadId) {
      const envio = await ultimoEnvioDeLead(ev.leadId);
      const reciente =
        envio && Date.now() - envio.ts.getTime() < 6 * 60 * 60 * 1000;
      if (reciente) {
        const dueno = await getBm(envio.bmId);
        if (dueno && dueno.clientId === clientId) bm = dueno;
      }
    }
  }

  if (!bm) {
    return reply.send({ ok: true, ignored: "pipeline sin BM" });
  }
  if (!tipo) {
    return reply.send({ ok: true, ignored: "etapa no relevante" });
  }

  await alinearEtapa(bm, tipo, ev.statusId);
  await aplicarResultado(bm, tipo, ev.leadId);

  if (eventId) {
    await db
      .update(eventosKommo)
      .set({ procesado: true })
      .where(eq(eventosKommo.eventId, eventId));
  }

  return reply.send({ ok: true, client: clientId, bm: bm.id, tipo });
}

export async function webhookRoutes(app: FastifyInstance) {
  // Compat: la URL histórica de Mooney sigue andando.
  app.post("/webhook/kommo", async (req, reply) => {
    return handleWebhook(req, reply, "mooney");
  });

  app.post("/webhook/kommo/:clientId", async (req, reply) => {
    const { clientId } = req.params as { clientId: string };
    return handleWebhook(req, reply, resolveClientId(clientId));
  });
}
