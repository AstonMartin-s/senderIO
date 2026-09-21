import pg from "pg";
import { config } from "../config.js";
import { pool } from "../db/client.js";
import { startScheduler, stopScheduler } from "./scheduler.js";
import { startControlListener, stopControlListener } from "./listener.js";
import { startResetCron } from "../jobs/reset.js";
import { startPlantillasJob, stopPlantillasJob } from "../jobs/plantillas.js";
import {
  startTrazabilidadSyncJob,
  stopTrazabilidadSyncJob,
} from "../jobs/trazabilidad-sync.js";

/**
 * Lock de sesión Postgres: un solo proceso worker puede gotear.
 * Cubre el caso de dos servicios Railway (o overlap de redeploy) contra la
 * misma base: el segundo espera y no arranca relojes.
 * Clave fija (int4) — no es secreto, solo namespace.
 */
const WORKER_LEADER_LOCK = 820260902;
const LEADER_RETRY_MS = 30_000;

let leaderClient: pg.Client | null = null;

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function becomeLeader(): Promise<void> {
  while (true) {
    const client = new pg.Client({ connectionString: config.databaseUrl });
    try {
      await client.connect();
      const r = await client.query<{ ok: boolean }>(
        "SELECT pg_try_advisory_lock($1) AS ok",
        [WORKER_LEADER_LOCK]
      );
      if (r.rows[0]?.ok) {
        leaderClient = client;
        client.on("error", (err) => {
          console.error("[worker] se perdió la conexión del líder:", err.message);
          process.exit(1);
        });
        console.log("[worker] líder adquirido (advisory lock)");
        return;
      }
      await client.end();
    } catch (err) {
      try {
        await client.end();
      } catch {
        /* ignore */
      }
      console.error("[worker] no pude pedir el lock de líder:", err);
    }
    console.log("[worker] otro proceso ya gotea; reintento en 30s");
    await sleep(LEADER_RETRY_MS);
  }
}

async function releaseLeader(): Promise<void> {
  if (!leaderClient) return;
  try {
    await leaderClient.query("SELECT pg_advisory_unlock($1)", [WORKER_LEADER_LOCK]);
  } catch {
    /* ignore */
  }
  try {
    await leaderClient.end();
  } catch {
    /* ignore */
  }
  leaderClient = null;
}

async function main() {
  console.log(`[worker] iniciando (TZ=${config.tz}, kommo=${config.kommo.mode})`);
  await becomeLeader();
  await startScheduler();
  await startControlListener();
  startResetCron();
  startPlantillasJob();
  startTrazabilidadSyncJob();
}

function shutdown() {
  console.log("[worker] apagando...");
  stopScheduler();
  stopPlantillasJob();
  stopTrazabilidadSyncJob();
  stopControlListener()
    .finally(() => releaseLeader())
    .finally(() => pool.end().finally(() => process.exit(0)));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
