import { db, pool } from "./client.js";
import { bmConfig, eventosKommo, kpiSnapshots, logMovimientos } from "./schema.js";

/**
 * Limpia datos operativos (logs, eventos, snapshots) y resetea los contadores
 * de cada BM. NO borra la configuración de los BMs.
 */
async function main() {
  console.log("[clean] borrando logs, eventos y snapshots...");
  await db.delete(logMovimientos);
  await db.delete(eventosKommo);
  await db.delete(kpiSnapshots);

  console.log("[clean] reseteando contadores de los BMs...");
  await db.update(bmConfig).set({
    enviadosHoy: 0,
    erroresHoy: 0,
    erroresConsecutivos: 0,
    pctErrorMovil: "0",
    pausado: false,
    pausadoHasta: null,
    ultimoEnvio: null,
    proximoTickAt: null,
    updatedAt: new Date(),
  });

  console.log("[clean] listo.");
  await pool.end();
}

main().catch((err) => {
  console.error("[clean] error:", err);
  process.exit(1);
});
