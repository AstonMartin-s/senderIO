import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/client.js";
import { kpiSnapshots, logMovimientos } from "../db/schema.js";
import { config } from "../config.js";

export interface KpiFila {
  bmId: string;
  enviados: number;
  si: number;
  no: number;
  errores: number;
  pctError: number;
  pctSi: number;
}

function localDate(d: Date, tz = config.tz): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Agrega los movimientos de un día (local) en filas por BM + TOTAL. */
export async function computeSnapshot(fechaLocal: string): Promise<KpiFila[]> {
  // Traemos una ventana amplia y filtramos por fecha local en JS (volumen bajo).
  const desde = new Date(`${fechaLocal}T00:00:00Z`);
  desde.setUTCDate(desde.getUTCDate() - 1);
  const hasta = new Date(`${fechaLocal}T00:00:00Z`);
  hasta.setUTCDate(hasta.getUTCDate() + 2);

  const rows = await db
    .select()
    .from(logMovimientos)
    .where(and(gte(logMovimientos.ts, desde), lte(logMovimientos.ts, hasta)));

  const porBm = new Map<string, KpiFila>();
  const ensure = (bmId: string) => {
    let f = porBm.get(bmId);
    if (!f) {
      f = { bmId, enviados: 0, si: 0, no: 0, errores: 0, pctError: 0, pctSi: 0 };
      porBm.set(bmId, f);
    }
    return f;
  };

  for (const r of rows) {
    if (localDate(r.ts) !== fechaLocal) continue;
    const f = ensure(r.bmId);
    switch (r.accion) {
      case "movido_a_envio":
        f.enviados++;
        break;
      case "resultado_si":
        f.si++;
        break;
      case "resultado_no":
        f.no++;
        break;
      case "resultado_error":
        f.errores++;
        break;
    }
  }

  const total: KpiFila = {
    bmId: "TOTAL",
    enviados: 0,
    si: 0,
    no: 0,
    errores: 0,
    pctError: 0,
    pctSi: 0,
  };
  for (const f of porBm.values()) {
    const base = f.si + f.no + f.errores;
    f.pctError = base ? Math.round((f.errores / base) * 10000) / 100 : 0;
    f.pctSi = f.enviados ? Math.round((f.si / f.enviados) * 10000) / 100 : 0;
    total.enviados += f.enviados;
    total.si += f.si;
    total.no += f.no;
    total.errores += f.errores;
  }
  const baseTotal = total.si + total.no + total.errores;
  total.pctError = baseTotal
    ? Math.round((total.errores / baseTotal) * 10000) / 100
    : 0;
  total.pctSi = total.enviados
    ? Math.round((total.si / total.enviados) * 10000) / 100
    : 0;

  return [...porBm.values(), total];
}

/** Persiste el snapshot del día en kpi_snapshots. */
export async function guardarSnapshot(fechaLocal: string): Promise<KpiFila[]> {
  const filas = await computeSnapshot(fechaLocal);
  for (const f of filas) {
    await db.insert(kpiSnapshots).values({
      fecha: fechaLocal,
      bmId: f.bmId,
      enviados: f.enviados,
      si: f.si,
      no: f.no,
      errores: f.errores,
      pctError: String(f.pctError),
      pctSi: String(f.pctSi),
    });
  }
  return filas;
}

/** KPIs históricos desde kpi_snapshots. */
export async function getKpis(filtros: {
  bm?: string;
  desde?: string;
  hasta?: string;
}) {
  const conds = [];
  if (filtros.bm) conds.push(eq(kpiSnapshots.bmId, filtros.bm));
  if (filtros.desde) conds.push(gte(kpiSnapshots.fecha, filtros.desde));
  if (filtros.hasta) conds.push(lte(kpiSnapshots.fecha, filtros.hasta));
  return db
    .select()
    .from(kpiSnapshots)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(kpiSnapshots.fecha));
}
