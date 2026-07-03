import { pool } from "../src/db/client.js";

async function main() {
  // Envíos sin teléfono (candidatos a backfill)
  const sin = await pool.query(
    `select bm_id, count(*)::int n, min(ts) primero, max(ts) ultimo,
            count(lead_id)::int con_lead
     from log_movimientos
     where accion='movido_a_envio' and telefono is null
     group by bm_id order by bm_id`
  );
  console.log("=== movido_a_envio SIN telefono (candidatos) ===");
  for (const r of sin.rows) {
    console.log(`  ${r.bm_id}: ${r.n} filas (${r.con_lead} con lead) ${r.primero?.toISOString?.().slice(0,10)} -> ${r.ultimo?.toISOString?.().slice(0,10)}`);
  }
  // Total con y sin telefono
  const tot = await pool.query(
    `select
       count(*) filter (where telefono is not null)::int con_tel,
       count(*) filter (where telefono is null)::int sin_tel,
       count(*) filter (where telefono is null and lead_id is null)::int sin_tel_sin_lead
     from log_movimientos where accion='movido_a_envio'`
  );
  console.log("=== totales ===", tot.rows[0]);
  // Rango histórico total
  const rango = await pool.query(
    `select min(ts) primero, max(ts) ultimo, count(*)::int n
     from log_movimientos where accion='movido_a_envio'`
  );
  console.log("=== rango histórico movido_a_envio ===", rango.rows[0]);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
