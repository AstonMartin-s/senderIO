import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { cruceErrores } from "../../services/errores-cruce.js";

const MAX = 20000;

/**
 * POST /api/errores/cruce — wa-checker.
 * Authorization: Bearer <ERRORES_CRUCE_TOKEN>
 * Body: { telefonos: string[] }
 * Respuesta: los mismos valores que ya tuvieron error. No lista el log entero.
 */
function bearerOk(header: string | undefined): boolean {
  const expected = process.env.ERRORES_CRUCE_TOKEN ?? "";
  if (!expected || !header) return false;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = m?.[1]?.trim() ?? "";
  if (!token) return false;
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function erroresCruceRoutes(app: FastifyInstance) {
  app.post("/api/errores/cruce", async (req, reply) => {
    if (!process.env.ERRORES_CRUCE_TOKEN) {
      return reply.code(503).send({ ok: false, error: "cruce_disabled" });
    }
    if (!bearerOk(req.headers.authorization)) {
      return reply.code(401).send({ ok: false, error: "unauthorized" });
    }
    const body = (req.body ?? {}) as { telefonos?: unknown };
    const telefonos = Array.isArray(body.telefonos) ? body.telefonos : null;
    if (!telefonos || telefonos.some((t) => typeof t !== "string")) {
      return reply.code(400).send({ ok: false, error: "telefonos" });
    }
    if (telefonos.length > MAX) {
      return reply.code(400).send({ ok: false, error: "demasiados" });
    }
    const anulados = await cruceErrores(telefonos);
    return { ok: true, recibidos: telefonos.length, anulados };
  });
}
