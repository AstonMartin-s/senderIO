import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../db/client.js";
import { bmConfig, kpiSnapshots, logMovimientos } from "../db/schema.js";
import { config } from "../config.js";
import {
  clienteDeSegmento,
  getClientesEtiqueta,
  type ClienteEtiqueta,
} from "./clientes-etiqueta.js";

async function bmIdsDeCliente(clientId?: string): Promise<string[] | null> {
  if (!clientId) return null;
  const rows = await db
    .select({ id: bmConfig.id })
    .from(bmConfig)
    .where(eq(bmConfig.clientId, clientId));
  return rows.map((r) => r.id);
}

export interface KpiFila {
  bmId: string;
  enviados: number;
  si: number;
  no: number;
  errores: number;
  pctError: number;
  pctSi: number;
}

export interface KpiLista {
  lista: string;
  bms: string;
  enviados: number;
  si: number;
  no: number;
  errores: number;
  pctError: number;
  pctSi: number;
}

export const LISTA_SIN_ETIQUETA = "Sin etiqueta";

const ACCIONES_KPI = [
  "movido_a_envio",
  "resultado_si",
  "resultado_no",
  "resultado_error",
] as const;

/** Columnas mínimas para agregar KPIs (sin mensaje_enviado ni otros textos largos). */
const colsKpi = {
  bmId: logMovimientos.bmId,
  accion: logMovimientos.accion,
  ts: logMovimientos.ts,
  leadId: logMovimientos.leadId,
  segmento: logMovimientos.segmento,
};

interface RowEtq {
  bmId: string;
  accion: string;
  leadId: number | null;
  segmento: string | null;
}

/**
 * Filtra movimientos por cliente-etiqueta. La etiqueta (segmento) se captura al
 * enviar; SI/NO/ERROR la heredan del envío del mismo lead. Sin clienteId, no
 * filtra (todas las etiquetas). El resto no reclamado cae en el catch-all (CRM).
 */
function filtrarPorClienteEtiqueta<T extends RowEtq>(
  rows: T[],
  clientes: ClienteEtiqueta[],
  clienteId?: string
): T[] {
  if (!clienteId) return rows;
  const porLead = new Map<string, string>();
  for (const r of rows) {
    if (r.accion === "movido_a_envio" && r.leadId != null && r.segmento) {
      const k = `${r.bmId}:${r.leadId}`;
      if (!porLead.has(k)) porLead.set(k, r.segmento);
    }
  }
  return rows.filter((r) => {
    const heredada =
      r.leadId != null ? porLead.get(`${r.bmId}:${r.leadId}`) : undefined;
    const seg = r.segmento || heredada || null;
    return clienteDeSegmento(seg, clientes) === clienteId;
  });
}

const colsKpiLista = {
  bmId: logMovimientos.bmId,
  accion: logMovimientos.accion,
  ts: logMovimientos.ts,
  leadId: logMovimientos.leadId,
  segmento: logMovimientos.segmento,
};

function localDate(d: Date, tz = config.tz): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Agrega los movimientos de un día (local) en filas por BM + TOTAL. */
export async function computeSnapshot(
  fechaLocal: string,
  clientId?: string
): Promise<KpiFila[]> {
  // Traemos una ventana amplia y filtramos por fecha local en JS (volumen bajo).
  const desde = new Date(`${fechaLocal}T00:00:00Z`);
  desde.setUTCDate(desde.getUTCDate() - 1);
  const hasta = new Date(`${fechaLocal}T00:00:00Z`);
  hasta.setUTCDate(hasta.getUTCDate() + 2);

  const ids = await bmIdsDeCliente(clientId);
  const rows = await db
    .select(colsKpi)
    .from(logMovimientos)
    .where(
      and(
        gte(logMovimientos.ts, desde),
        lte(logMovimientos.ts, hasta),
        inArray(logMovimientos.accion, [...ACCIONES_KPI]),
        ...(ids ? [inArray(logMovimientos.bmId, ids.length ? ids : ["__none__"])] : [])
      )
    );

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

/** Agrega filas KpiFila a partir de movimientos ya traídos. */
function agregar(rows: { bmId: string; accion: string }[]): KpiFila[] {
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

/** KPIs en vivo para un rango arbitrario (desde el log, incluye el día actual). */
export async function computeRange(
  desde?: string,
  hasta?: string,
  clientId?: string,
  etiquetaClienteId?: string
): Promise<KpiFila[]> {
  const conds = [];
  if (desde) conds.push(gte(logMovimientos.ts, new Date(desde)));
  if (hasta) conds.push(lte(logMovimientos.ts, new Date(hasta)));
  const ids = await bmIdsDeCliente(clientId);
  if (ids) conds.push(inArray(logMovimientos.bmId, ids.length ? ids : ["__none__"]));
  const rows = await db
    .select(colsKpi)
    .from(logMovimientos)
    .where(
      and(
        ...(conds.length ? conds : []),
        inArray(logMovimientos.accion, [...ACCIONES_KPI])
      )
    );
  if (!etiquetaClienteId) return agregar(rows);
  const clientes = await getClientesEtiqueta();
  return agregar(filtrarPorClienteEtiqueta(rows, clientes, etiquetaClienteId));
}

function cerrarFilaLista(f: KpiLista) {
  const base = f.si + f.no + f.errores;
  f.pctError = base ? Math.round((f.errores / base) * 10000) / 100 : 0;
  f.pctSi = f.enviados ? Math.round((f.si / f.enviados) * 10000) / 100 : 0;
}

/** KPIs por etiqueta de Kommo (lista). SI/NO/ERROR heredan la del envío del lead. */
function agregarPorLista(
  rows: {
    bmId: string;
    accion: string;
    leadId: number | null;
    segmento: string | null;
  }[]
): KpiLista[] {
  const porLead = new Map<string, string>();
  for (const r of rows) {
    if (r.accion === "movido_a_envio" && r.leadId != null && r.segmento) {
      const k = `${r.bmId}:${r.leadId}`;
      if (!porLead.has(k)) porLead.set(k, r.segmento);
    }
  }

  const porLista = new Map<string, KpiLista & { bmSet: Set<string> }>();
  const ensure = (lista: string) => {
    let f = porLista.get(lista);
    if (!f) {
      f = {
        lista,
        bms: "",
        enviados: 0,
        si: 0,
        no: 0,
        errores: 0,
        pctError: 0,
        pctSi: 0,
        bmSet: new Set(),
      };
      porLista.set(lista, f);
    }
    return f;
  };

  for (const r of rows) {
    const heredada =
      r.leadId != null ? porLead.get(`${r.bmId}:${r.leadId}`) : undefined;
    const lista = r.segmento || heredada || LISTA_SIN_ETIQUETA;
    const f = ensure(lista);
    f.bmSet.add(r.bmId);
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

  const total: KpiLista = {
    lista: "TOTAL",
    bms: "",
    enviados: 0,
    si: 0,
    no: 0,
    errores: 0,
    pctError: 0,
    pctSi: 0,
  };
  const filas: KpiLista[] = [];
  for (const f of porLista.values()) {
    f.bms = [...f.bmSet].sort().join(", ");
    cerrarFilaLista(f);
    const { bmSet: _omit, ...row } = f;
    filas.push(row);
    total.enviados += row.enviados;
    total.si += row.si;
    total.no += row.no;
    total.errores += row.errores;
  }
  cerrarFilaLista(total);
  filas.sort((a, b) => b.enviados - a.enviados);
  return [...filas, total];
}

export async function computeListas(
  desde?: string,
  hasta?: string,
  clientId?: string,
  etiquetaClienteId?: string
): Promise<KpiLista[]> {
  const conds = [];
  if (desde) conds.push(gte(logMovimientos.ts, new Date(desde)));
  if (hasta) conds.push(lte(logMovimientos.ts, new Date(hasta)));
  const ids = await bmIdsDeCliente(clientId);
  if (ids) conds.push(inArray(logMovimientos.bmId, ids.length ? ids : ["__none__"]));
  const rows = await db
    .select(colsKpiLista)
    .from(logMovimientos)
    .where(
      and(
        ...(conds.length ? conds : []),
        inArray(logMovimientos.accion, [...ACCIONES_KPI])
      )
    );
  if (!etiquetaClienteId) return agregarPorLista(rows);
  const clientes = await getClientesEtiqueta();
  return agregarPorLista(
    filtrarPorClienteEtiqueta(rows, clientes, etiquetaClienteId)
  );
}

export interface ResumenClienteEtiqueta {
  id: string;
  nombre: string;
  etiquetas: string[];
  enviados: number;
  si: number;
  no: number;
  errores: number;
  pctError: number;
  pctSi: number;
}

/**
 * Resumen por cliente-etiqueta para la sección Clientes. Reparte todos los
 * movimientos del rango (o del día) entre los clientes según su etiqueta, con
 * herencia por lead. El catch-all (CRM) se queda con el resto.
 */
export async function computeResumenClientesEtiqueta(
  desde?: string,
  hasta?: string
): Promise<ResumenClienteEtiqueta[]> {
  const conds = [];
  if (desde) conds.push(gte(logMovimientos.ts, new Date(desde)));
  if (hasta) conds.push(lte(logMovimientos.ts, new Date(hasta)));
  const [rows, clientes] = await Promise.all([
    db
      .select(colsKpiLista)
      .from(logMovimientos)
      .where(
        and(
          ...(conds.length ? conds : []),
          inArray(logMovimientos.accion, [...ACCIONES_KPI])
        )
      ),
    getClientesEtiqueta(),
  ]);

  const porLead = new Map<string, string>();
  for (const r of rows) {
    if (r.accion === "movido_a_envio" && r.leadId != null && r.segmento) {
      const k = `${r.bmId}:${r.leadId}`;
      if (!porLead.has(k)) porLead.set(k, r.segmento);
    }
  }

  const acc = new Map<string, ResumenClienteEtiqueta>();
  for (const c of clientes) {
    acc.set(c.id, {
      id: c.id,
      nombre: c.nombre,
      etiquetas: c.etiquetas,
      enviados: 0,
      si: 0,
      no: 0,
      errores: 0,
      pctError: 0,
      pctSi: 0,
    });
  }

  for (const r of rows) {
    const heredada =
      r.leadId != null ? porLead.get(`${r.bmId}:${r.leadId}`) : undefined;
    const seg = r.segmento || heredada || null;
    const cid = clienteDeSegmento(seg, clientes);
    const f = acc.get(cid);
    if (!f) continue;
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

  const out = [...acc.values()];
  for (const f of out) {
    const base = f.si + f.no + f.errores;
    f.pctError = base ? Math.round((f.errores / base) * 10000) / 100 : 0;
    f.pctSi = f.enviados ? Math.round((f.si / f.enviados) * 10000) / 100 : 0;
  }
  return out;
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
  client?: string;
}) {
  const conds = [];
  if (filtros.bm) conds.push(eq(kpiSnapshots.bmId, filtros.bm));
  if (filtros.desde) conds.push(gte(kpiSnapshots.fecha, filtros.desde));
  if (filtros.hasta) conds.push(lte(kpiSnapshots.fecha, filtros.hasta));
  const ids = await bmIdsDeCliente(filtros.client);
  if (ids && !filtros.bm) {
    conds.push(inArray(kpiSnapshots.bmId, ids.length ? ids : ["__none__"]));
  }
  return db
    .select()
    .from(kpiSnapshots)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(kpiSnapshots.fecha));
}
