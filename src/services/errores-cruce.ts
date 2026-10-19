import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { normalizePhoneE164 } from "../lib/phone.js";

/** Teléfonos que ya tuvieron un error de envío, en E.164. */
export async function telefonosConError(): Promise<Set<string>> {
  const q = await db.execute(sql`
    select distinct telefono
    from (
      select telefono
      from log_movimientos
      where accion = 'resultado_error'
        and telefono is not null
        and telefono <> ''
      union
      select e.telefono
      from log_movimientos err
      join lateral (
        select telefono
        from log_movimientos m
        where m.bm_id = err.bm_id
          and m.lead_id = err.lead_id
          and m.accion = 'movido_a_envio'
          and m.telefono is not null
          and m.telefono <> ''
        order by m.ts desc
        limit 1
      ) e on true
      where err.accion = 'resultado_error'
        and err.lead_id is not null
    ) t
  `);
  const set = new Set<string>();
  const rows = (q as unknown as { rows: Array<{ telefono: string | null }> }).rows;
  for (const row of rows) {
    const n = normalizePhoneE164(row.telefono);
    if (n) set.add(n);
  }
  return set;
}

/**
 * Devuelve los valores de entrada cuyo teléfono ya está en el log de errores.
 * El valor se devuelve tal cual llegó, para que el verificador lo pueda tachar.
 */
export async function cruceErrores(raws: string[]): Promise<string[]> {
  const conocidos = await telefonosConError();
  const anulados: string[] = [];
  const vistos = new Set<string>();
  for (const raw of raws) {
    const key = String(raw ?? "").trim();
    if (!key || vistos.has(key)) continue;
    vistos.add(key);
    const n = normalizePhoneE164(key);
    if (n && conocidos.has(n)) anulados.push(key);
  }
  return anulados;
}
