import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  FEED_LIMIT_DEFAULT,
  FEED_LIMIT_MAX,
  getFeed,
  parseTypes,
} from "../../traza/feed.js";

/**
 * GET /traza/v1/feed  — Control (Trazabilidad nueva).
 * Authorization: Bearer <TRAZA_FEED_TOKEN>  (scope traza:feed · lo carga CRED)
 * Sin token configurado → 503 feed_disabled. Bearer malo → 401.
 */
function bearerOk(header: string | undefined): boolean {
  const expected = process.env.TRAZA_FEED_TOKEN ?? "";
  if (!expected) return false;
  if (!header) return false;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = m?.[1]?.trim() ?? "";
  if (!token) return false;
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function trazaRoutes(app: FastifyInstance) {
  app.get("/traza/v1/feed", async (req, reply) => {
    if (!process.env.TRAZA_FEED_TOKEN) {
      return reply.code(503).send({ ok: false, error: "feed_disabled" });
    }
    if (!bearerOk(req.headers.authorization)) {
      return reply.code(401).send({ ok: false, error: "unauthorized" });
    }

    const q = req.query as Record<string, string | undefined>;
    const types = parseTypes(q.types);
    if (types === "invalid") {
      return reply.code(400).send({ ok: false, error: "invalid_types" });
    }

    let limit = FEED_LIMIT_DEFAULT;
    if (q.limit?.trim()) {
      const parsed = Number(q.limit);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return reply.code(400).send({ ok: false, error: "invalid_limit" });
      }
      limit = Math.min(Math.floor(parsed), FEED_LIMIT_MAX);
    }

    try {
      const envelope = await getFeed({
        since: q.since ?? null,
        cursor: q.cursor ?? null,
        types,
        limit,
      });
      return reply.send(envelope);
    } catch (err) {
      req.log.error({ err }, "traza feed falló");
      return reply.code(500).send({ ok: false, error: "feed_error" });
    }
  });
}
