import { config } from "../config.js";
import { syncEnviosRecientes } from "../services/trazabilidad-push.js";

const INTERVALO_MS = 5 * 60_000; // cada 5 minutos

let timer: NodeJS.Timeout | null = null;
let corriendo = false;

async function tick(): Promise<void> {
  if (corriendo) return;
  corriendo = true;
  try {
    const n = await syncEnviosRecientes(24);
    if (n > 0) {
      console.log(`[trazabilidad-sync] sincronizados ${n} envíos (últimas 24h)`);
    }
  } catch (err) {
    console.error("[trazabilidad-sync] error:", err);
  } finally {
    corriendo = false;
  }
}

export function startTrazabilidadSyncJob(): void {
  if (!config.trazabilidad.pushEnabled || !config.trazabilidad.apiUrl) {
    console.log("[trazabilidad-sync] push apagado (TRAZABILIDAD_PUSH_ENABLED)");
    return;
  }
  if (timer) return;
  timer = setInterval(() => {
    tick().catch((err) => console.error("[trazabilidad-sync] error:", err));
  }, INTERVALO_MS);
  // Primera pasada tras 30s (da tiempo a que arranque Trazabilidad en dev).
  setTimeout(() => {
    tick().catch((err) => console.error("[trazabilidad-sync] error:", err));
  }, 30_000);
  console.log(`[trazabilidad-sync] cada ${INTERVALO_MS / 60_000}min (últimas 24h)`);
}

export function stopTrazabilidadSyncJob(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
