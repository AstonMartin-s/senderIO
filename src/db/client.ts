import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { config } from "../config.js";
import * as schema from "./schema.js";

const { Pool } = pg;

// Pool afinado para Railway: keepAlive evita re-handshakes caros contra el proxy,
// y los timeouts hacen que una consulta lenta falle rápido en vez de colgar el
// panel 30s. statement_timeout corta queries que se pasen de la raya.
export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 8,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  keepAlive: true,
  statement_timeout: 15_000,
  query_timeout: 15_000,
});

export const db = drizzle(pool, { schema });

export { schema };
