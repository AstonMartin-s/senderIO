import { pool } from "../src/db/client.js";
import { getKommoClient } from "../src/kommo/index.js";
import { normalizePhoneE164 } from "../src/lib/phone.js";
import { syncEnviosRecientes } from "../src/services/trazabilidad-push.js";

async function main() {
  const kommo = getKommoClient();
  const pend = await pool.query(
    `select id, bm_id, lead_id from log_movimientos
     where accion='movido_a_envio' and telefono is null and lead_id is not null
     order by ts asc`
  );
  console.log(`Backfill: ${pend.rows.length} filas sin teléfono`);

  let ok = 0;
  let sinTel = 0;
  for (const row of pend.rows) {
    const leadId = Number(row.lead_id);
    try {
      const meta = await kommo.getLeadMeta(leadId);
      const tel = normalizePhoneE164(meta.telefono);
      if (!tel) {
        sinTel++;
        console.log(`  lead ${leadId} (${row.bm_id}): sin teléfono en Kommo`);
        continue;
      }
      await pool.query(
        `update log_movimientos set telefono=$1, segmento=coalesce(segmento,$2) where id=$3`,
        [tel, meta.segmento ?? null, row.id]
      );
      ok++;
      console.log(`  lead ${leadId} (${row.bm_id}): ${tel}`);
    } catch (e) {
      console.log(`  lead ${leadId} (${row.bm_id}): ERROR ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 300)); // rate limit suave
  }
  console.log(`Resueltos: ${ok}, sin teléfono: ${sinTel}`);

  console.log("Re-sync completo del histórico a Trazabilidad prod...");
  const n = await syncEnviosRecientes(24 * 12); // ~12 días cubre desde 26/06
  console.log(`Envíos pusheados (idempotente): ${n}`);

  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
