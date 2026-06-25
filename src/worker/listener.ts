import pg from "pg";
import { config } from "../config.js";
import { BM_CONTROL_CHANNEL, ALL } from "../db/notify.js";
import { reevaluar, reevaluarTodos } from "./scheduler.js";

const { Client } = pg;

let client: pg.Client | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;

/**
 * Mantiene una conexión dedicada con LISTEN al canal de control.
 * Cuando la API emite un NOTIFY (pausar/reanudar/editar/alta/baja), el worker
 * reacciona al instante en vez de esperar al próximo tick.
 */
export async function startControlListener() {
  await connect();
}

async function connect() {
  try {
    client = new Client({ connectionString: config.databaseUrl });
    client.on("notification", (msg) => {
      const payload = msg.payload ?? "";
      if (payload === ALL) {
        reevaluarTodos().catch((e) =>
          console.error("[listener] reevaluarTodos:", e)
        );
      } else if (payload) {
        reevaluar(payload);
      }
    });
    client.on("error", (err) => {
      console.error("[listener] error de conexión:", err.message);
      scheduleReconnect();
    });
    await client.connect();
    await client.query(`LISTEN ${BM_CONTROL_CHANNEL}`);
    console.log(`[listener] escuchando canal "${BM_CONTROL_CHANNEL}"`);
  } catch (err) {
    console.error("[listener] no se pudo conectar:", err);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      await client?.end();
    } catch {
      /* ignore */
    }
    console.log("[listener] reintentando conexión...");
    connect();
  }, 3000);
}

export async function stopControlListener() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  try {
    await client?.end();
  } catch {
    /* ignore */
  }
  client = null;
}
