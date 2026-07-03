import { config } from "../config.js";
import {
  syncEnviosRecientes,
  syncPlantillasCatalogo,
} from "../services/trazabilidad-push.js";

const ENVIOS_INTERVALO_MS = 5 * 60_000;
const CATALOGO_INTERVALO_MS = 60 * 60_000; // cada hora

let enviosTimer: NodeJS.Timeout | null = null;
let catalogoTimer: NodeJS.Timeout | null = null;
let corriendo = false;

async function syncEnvios(): Promise<void> {
  if (corriendo) return;
  corriendo = true;
  try {
    const n = await syncEnviosRecientes(24);
    if (n > 0) {
      console.log(`[trazabilidad-sync] sincronizados ${n} envíos (últimas 24h)`);
    }
  } catch (err) {
    console.error("[trazabilidad-sync] error envíos:", err);
  } finally {
    corriendo = false;
  }
}

async function syncCatalogo(): Promise<void> {
  try {
    const n = await syncPlantillasCatalogo();
    if (n > 0) {
      console.log(`[trazabilidad-sync] catálogo: ${n} plantillas`);
    }
  } catch (err) {
    console.error("[trazabilidad-sync] error catálogo:", err);
  }
}

export function startTrazabilidadSyncJob(): void {
  if (!config.trazabilidad.pushEnabled || !config.trazabilidad.apiUrl) {
    console.log("[trazabilidad-sync] push apagado (TRAZABILIDAD_PUSH_ENABLED)");
    return;
  }
  if (enviosTimer) return;

  enviosTimer = setInterval(() => {
    syncEnvios().catch((err) => console.error("[trazabilidad-sync] error:", err));
  }, ENVIOS_INTERVALO_MS);

  catalogoTimer = setInterval(() => {
    syncCatalogo().catch((err) =>
      console.error("[trazabilidad-sync] error catálogo:", err)
    );
  }, CATALOGO_INTERVALO_MS);

  // Arranque: catálogo primero, envíos después (da tiempo a Trazabilidad en dev).
  setTimeout(() => {
    syncCatalogo()
      .then(() => syncEnvios())
      .catch((err) => console.error("[trazabilidad-sync] error inicio:", err));
  }, 15_000);

  console.log(
    `[trazabilidad-sync] envíos cada ${ENVIOS_INTERVALO_MS / 60_000}min, catálogo cada ${CATALOGO_INTERVALO_MS / 3_600_000}h`
  );
}

export function stopTrazabilidadSyncJob(): void {
  if (enviosTimer) clearInterval(enviosTimer);
  if (catalogoTimer) clearInterval(catalogoTimer);
  enviosTimer = null;
  catalogoTimer = null;
}
