import cron from "node-cron";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { bmConfig } from "../db/schema.js";
import { config } from "../config.js";
import { todayLocal } from "../lib/time.js";
import { guardarSnapshot } from "../services/kpis.js";

/**
 * Archiva la foto del día y resetea los contadores.
 * Devuelve las filas del snapshot guardado.
 */
export async function resetDiario(archivar = true) {
  // El día que termina (a las 00:05 ya es el día nuevo, así que miramos 1h atrás).
  const fechaArchivada = todayLocal(config.tz, new Date(Date.now() - 3_600_000));
  let snapshot: Awaited<ReturnType<typeof guardarSnapshot>> = [];

  if (archivar) {
    console.log(`[reset] archivando snapshot del día ${fechaArchivada}...`);
    snapshot = await guardarSnapshot(fechaArchivada);
  }

  const hoy = todayLocal();
  // Reset general de contadores.
  await db.update(bmConfig).set({
    enviadosHoy: 0,
    erroresHoy: 0,
    erroresConsecutivos: 0,
    pausadoHasta: null,
    fecha: hoy,
    updatedAt: new Date(),
  });
  // Despausar solo los BMs activos (los inactivos quedan como estaban).
  await db
    .update(bmConfig)
    .set({ pausado: false, updatedAt: new Date() })
    .where(eq(bmConfig.activo, true));

  console.log(`[reset] contadores reseteados. Día en curso: ${hoy}`);
  return { fechaArchivada, snapshot };
}

/** Programa el reset automático a las 00:05 en la TZ de la operación. */
export function startResetCron() {
  cron.schedule(
    "5 0 * * *",
    () => {
      resetDiario(true).catch((err) =>
        console.error("[reset] error en cron:", err)
      );
    },
    { timezone: config.tz }
  );
  console.log(`[reset] cron programado 00:05 (${config.tz})`);
}
