import { existsSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Fastify from "fastify";
import formbody from "@fastify/formbody";
import fastifyStatic from "@fastify/static";
import { config } from "../config.js";
import { pool } from "../db/client.js";
import { webhookRoutes } from "./routes/webhook.js";
import { bmRoutes } from "./routes/bms.js";
import { controlRoutes } from "./routes/control.js";
import { kpiRoutes } from "./routes/kpis.js";
import { plantillaRoutes } from "./routes/plantillas.js";
import { clientRoutes } from "./routes/clients.js";
import { clientePanelRoutes } from "./routes/cliente-panel.js";
import { adminClienteRoutes } from "./routes/admin-clientes.js";
import { trazaRoutes } from "./routes/traza.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dashboardDist = join(__dirname, "../../dashboard/dist");

/**
 * HTTP Basic Auth para el panel PRINCIPAL de operación (dashboard + /api/* de
 * operación). Se EXCLUYEN las superficies que tienen su propia credencial:
 *  - /health           (probe de Railway)
 *  - /webhook/*         (Kommo, valida su propio secreto)
 *  - /traza/*           (Control, Bearer TRAZA_FEED_TOKEN)
 *  - /api/cliente/*     (panel-cliente, Bearer CLIENTE_PANEL_TOKEN)
 * Credencial: ADMIN_USER / ADMIN_PASSWORD (default local admin/admin321).
 */
function eqSafe(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function basicAuthExento(url: string): boolean {
  return (
    url === "/health" ||
    url.startsWith("/webhook") ||
    url.startsWith("/traza") ||
    // Solo el panel-cliente (/api/cliente/…, Bearer propio) queda exento. Ojo:
    // exigimos la barra para no exentar rutas como /api/clientes-etiqueta, que
    // son del panel de operación y sí requieren Basic Auth.
    url === "/api/cliente" ||
    url.startsWith("/api/cliente/") ||
    url.startsWith("/api/cliente?") ||
    // El panel-cliente (/cliente) tiene su propio login por token; su HTML/estáticos
    // no deben pedir Basic Auth del panel de operación.
    url === "/cliente" ||
    url.startsWith("/cliente/")
  );
}

async function build() {
  const app = Fastify({ logger: { level: "info" } });
  await app.register(formbody); // parsea x-www-form-urlencoded (webhook de Kommo)

  // Guard global de Basic Auth para el panel de operación.
  app.addHook("onRequest", async (req, reply) => {
    if (basicAuthExento(req.url)) return;
    const header = req.headers.authorization ?? "";
    const m = /^Basic\s+(.+)$/i.exec(header.trim());
    if (m) {
      const [user, ...rest] = Buffer.from(m[1], "base64")
        .toString("utf8")
        .split(":");
      const pass = rest.join(":");
      if (
        eqSafe(user ?? "", config.api.adminUser) &&
        eqSafe(pass ?? "", config.api.adminPassword)
      ) {
        return; // autorizado
      }
    }
    reply
      .code(401)
      .header("WWW-Authenticate", 'Basic realm="SenderIO", charset="UTF-8"')
      .send({ ok: false, error: "unauthorized" });
  });

  app.get("/health", async () => ({
    ok: true,
    ts: new Date().toISOString(),
    kommo: config.kommo.mode,
    clients: (["mooney", "king"] as const).map((id) => ({
      id,
      configured: !!(
        config.kommo.byClient[id].subdomain && config.kommo.byClient[id].token
      ),
    })),
  }));

  await app.register(clientRoutes);
  await app.register(clientePanelRoutes);
  await app.register(adminClienteRoutes);
  await app.register(trazaRoutes);
  await app.register(webhookRoutes);
  await app.register(bmRoutes);
  await app.register(controlRoutes);
  await app.register(kpiRoutes);
  await app.register(plantillaRoutes);

  // Sirve el dashboard compilado (si existe el build). En dev se usa Vite.
  if (existsSync(dashboardDist)) {
    await app.register(fastifyStatic, { root: dashboardDist });
    app.setNotFoundHandler((req, reply) => {
      if (
        req.url.startsWith("/api") ||
        req.url.startsWith("/webhook") ||
        req.url.startsWith("/traza")
      ) {
        return reply.code(404).send({ error: "not found" });
      }
      return reply.sendFile("index.html"); // SPA fallback
    });
  }

  return app;
}

async function main() {
  const app = await build();
  try {
    await app.listen({ port: config.api.port, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const shutdown = async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
