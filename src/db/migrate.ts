import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./client.js";

async function main() {
  console.log("[migrate] aplicando migraciones...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[migrate] listo.");
  await pool.end();
}

main().catch((err) => {
  console.error("[migrate] error:", err);
  process.exit(1);
});
