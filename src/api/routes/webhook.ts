import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { eventosKommo } from "../../db/schema.js";
import { getBmByPipeline } from "../../services/bm.js";
import { aplicarResultado, type ResultadoTipo } from "../../services/firewall.js";
import { config } from "../../config.js";

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
  if (statusId === bm.stageErrorId) return "error";
  if (bm.stageSiId && statusId === bm.stageSiId) return "si";
  if (bm.stageNoId && statusId === bm.stageNoId) return "no";
  return null;
}

export async function webhookRoutes(app: FastifyInstance) {
  app.post("/webhook/kommo", async (req, reply) => {
    // Validación opcional de secreto (querystring ?secret= o header).
    if (config.kommo.webhookSecret) {
      const provided =
        (req.query as Record<string, string>)?.secret ??
        req.headers["x-webhook-secret"];
      if (provided !== config.kommo.webhookSecret) {
        return reply.code(401).send({ error: "secreto inválido" });
      }
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const ev = parseEvent(body);

    // Idempotencia: armamos un event_id estable.
    const eventId =
      ev.leadId && ev.statusId ? `${ev.leadId}:${ev.statusId}` : null;

    if (eventId) {
      const dup = await db
        .select({ id: eventosKommo.id })
        .from(eventosKommo)
        .where(eq(eventosKommo.eventId, eventId));
      if (dup.length > 0) {
        return reply.send({ ok: true, dedupe: true });
      }
    }

    await db.insert(eventosKommo).values({
      eventId,
      tipo: "lead_status_changed",
      payload: body,
      procesado: false,
    });

    if (!ev.pipelineId || !ev.statusId) {
      return reply.send({ ok: true, ignored: "payload incompleto" });
    }

    const bm = await getBmByPipeline(ev.pipelineId);
    if (!bm) {
      return reply.send({ ok: true, ignored: "pipeline sin BM" });
    }

    const tipo = clasificar(ev.statusId, bm);
    if (!tipo) {
      return reply.send({ ok: true, ignored: "etapa no relevante" });
    }

    await aplicarResultado(bm, tipo, ev.leadId);

    if (eventId) {
      await db
        .update(eventosKommo)
        .set({ procesado: true })
        .where(eq(eventosKommo.eventId, eventId));
    }

    return reply.send({ ok: true, bm: bm.id, tipo });
  });
}
