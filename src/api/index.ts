import { existsSync } from "node:fs";
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const dashboardDist = join(__dirname, "../../dashboard/dist");

async function build() {
  const app = Fastify({ logger: { level: "info" } });
  await app.register(formbody); // parsea x-www-form-urlencoded (webhook de Kommo)

  app.get("/health", async () => ({
    ok: true,
    ts: new Date().toISOString(),
    kommo: config.kommo.mode,
  }));

  await app.register(webhookRoutes);
  await app.register(bmRoutes);
  await app.register(controlRoutes);
  await app.register(kpiRoutes);
  await app.register(plantillaRoutes);

  // Sirve el dashboard compilado (si existe el build). En dev se usa Vite.
  if (existsSync(dashboardDist)) {
    await app.register(fastifyStatic, { root: dashboardDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api") || req.url.startsWith("/webhook")) {
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
