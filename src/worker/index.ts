import { config } from "../config.js";
import { pool } from "../db/client.js";
import { startScheduler, stopScheduler } from "./scheduler.js";
import { startControlListener, stopControlListener } from "./listener.js";
import { startResetCron } from "../jobs/reset.js";

async function main() {
  console.log(`[worker] iniciando (TZ=${config.tz}, kommo=${config.kommo.mode})`);
  await startScheduler();
  await startControlListener();
  startResetCron();
}

function shutdown() {
  console.log("[worker] apagando...");
  stopScheduler();
  stopControlListener().finally(() => pool.end().finally(() => process.exit(0)));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
