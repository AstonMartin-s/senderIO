import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./client.js";

const MAX_INTENTOS = 8;
const ESPERA_MS = 3_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("[migrate] aplicando migraciones...");
  // Reintentos: en un cold start la base puede tardar en estar lista. Antes de
  // rendirnos probamos varias veces para no tumbar el arranque de la API.
  let ultimoError: unknown;
  for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
    try {
      await migrate(db, { migrationsFolder: "./drizzle" });
      console.log("[migrate] listo.");
      await pool.end();
      return;
    } catch (err) {
      ultimoError = err;
      console.error(
        `[migrate] intento ${intento}/${MAX_INTENTOS} falló:`,
        err instanceof Error ? err.message : err
      );
      if (intento < MAX_INTENTOS) await sleep(ESPERA_MS);
    }
  }
  throw ultimoError;
}

main().catch((err) => {
  console.error("[migrate] error:", err);
  process.exit(1);
});
