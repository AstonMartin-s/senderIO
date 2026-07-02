import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { config } from "../config.js";
import * as schema from "./schema.js";

const { Pool } = pg;

// Pool simple y robusto. keepAlive evita re-handshakes caros contra el proxy de
// Railway. NO seteamos statement_timeout/query_timeout ni connectionTimeout
// agresivos: en un cold start la base puede tardar en aceptar conexiones y esos
// cortes tumbaban el arranque (db:migrate) provocando crash loop.
export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  keepAlive: true,
});

export const db = drizzle(pool, { schema });

export { schema };
