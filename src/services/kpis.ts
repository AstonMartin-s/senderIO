import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../db/client.js";
import { bmConfig, kpiSnapshots, logMovimientos } from "../db/schema.js";
import { config } from "../config.js";
import { parseFechaPanel } from "../lib/time.js";
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

/**
 * % error = errores / enviados con éxito.
 * Éxito = enviados − errores (incluye los que respondieron SÍ o NO).
 * Los que siguen sin resultado también son éxito: no se arma el % solo con SÍ+NO+ERROR.
 */
export function pctErrorSobreExito(enviados: number, errores: number): number {
  const exito = Math.max(0, enviados - errores);
  if (!exito) return errores > 0 ? 100 : 0;
  return Math.round((errores / exito) * 10000) / 100;
}

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

/** Dos movido_a_envio del mismo lead en esta ventana son el mismo disparo. */
const DEDUPE_ENVIO_MS = 60_000;

interface EventoKpi {
  bmId: string;
  accion: string;
  leadId: number | null;
  segmento: string | null;
  ts: Date;
}

interface EnvioContable {
  bmId: string;
  leadId: number | null;
  segmento: string | null;
  ts: Date;
  si: number;
  no: number;
  errores: number;
}

function aFecha(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

/**
 * Una fila por envío real. El resultado (el último SI, NO o ERROR del lead)
 * se anota solo en el último envío: así SI y NO quedan dentro de los sin
 * error, un resultado huérfano no suma, y enviados = sin error + errores.
 */
export function enviosContables(rows: EventoKpi[]): EnvioContable[] {
  const porLead = new Map<string, EventoKpi[]>();
  const sueltos: EnvioContable[] = [];
  for (const r of rows) {
    if (r.leadId == null) {
      if (r.accion === "movido_a_envio") {
        sueltos.push({
          bmId: r.bmId,
          leadId: null,
          segmento: r.segmento,
          ts: aFecha(r.ts),
          si: 0,
          no: 0,
          errores: 0,
        });
      }
      continue;
    }
    const k = `${r.bmId}:${r.leadId}`;
    const arr = porLead.get(k);
    if (arr) arr.push(r);
    else porLead.set(k, [r]);
  }

  const out = [...sueltos];
  for (const arr of porLead.values()) {
    const sends = arr
      .filter((r) => r.accion === "movido_a_envio")
      .sort((a, b) => aFecha(a.ts).getTime() - aFecha(b.ts).getTime());
    if (!sends.length) continue;
    const kept: EventoKpi[] = [];
    for (const s of sends) {
      const prev = kept[kept.length - 1];
      if (prev && aFecha(s.ts).getTime() - aFecha(prev.ts).getTime() < DEDUPE_ENVIO_MS) {
        continue;
      }
      kept.push(s);
    }
    const results = arr
      .filter(
        (r) =>
          r.accion === "resultado_si" ||
          r.accion === "resultado_no" ||
          r.accion === "resultado_error"
      )
      .sort((a, b) => aFecha(a.ts).getTime() - aFecha(b.ts).getTime());
    const last = results[results.length - 1];
    const outcome =
      last?.accion === "resultado_si"
        ? "si"
        : last?.accion === "resultado_no"
          ? "no"
          : last?.accion === "resultado_error"
            ? "error"
            : null;
    kept.forEach((s, i) => {
      const ultimo = i === kept.length - 1;
      out.push({
        bmId: s.bmId,
        leadId: s.leadId,
        segmento: s.segmento,
        ts: aFecha(s.ts),
        si: ultimo && outcome === "si" ? 1 : 0,
        no: ultimo && outcome === "no" ? 1 : 0,
        errores: ultimo && outcome === "error" ? 1 : 0,
      });
    });
  }
  return out;
}

function filaVacia(bmId: string): KpiFila {
  return { bmId, enviados: 0, si: 0, no: 0, errores: 0, pctError: 0, pctSi: 0 };
}

function cerrarKpi(f: { enviados: number; si: number; errores: number; pctError: number; pctSi: number }) {
  f.pctError = pctErrorSobreExito(f.enviados, f.errores);
  f.pctSi = f.enviados ? Math.round((f.si / f.enviados) * 10000) / 100 : 0;
}

function agregarEnvios(envios: EnvioContable[]): KpiFila[] {
  const porBm = new Map<string, KpiFila>();
  for (const e of envios) {
    let f = porBm.get(e.bmId);
    if (!f) {
      f = filaVacia(e.bmId);
      porBm.set(e.bmId, f);
    }
    f.enviados += 1;
    f.si += e.si;
    f.no += e.no;
    f.errores += e.errores;
  }
  const total = filaVacia("TOTAL");
  for (const f of porBm.values()) {
    cerrarKpi(f);
    total.enviados += f.enviados;
    total.si += f.si;
    total.no += f.no;
    total.errores += f.errores;
  }
  cerrarKpi(total);
  return [...porBm.values(), total];
}

async function leerEventos(clientId?: string): Promise<EventoKpi[]> {
  const ids = await bmIdsDeCliente(clientId);
  const rows = await db
    .select(colsKpi)
    .from(logMovimientos)
    .where(
      and(
        inArray(logMovimientos.accion, [...ACCIONES_KPI]),
        ...(ids ? [inArray(logMovimientos.bmId, ids.length ? ids : ["__none__"])] : [])
      )
    );
  return rows.map((r) => ({
    bmId: r.bmId,
    accion: r.accion,
    leadId: r.leadId,
    segmento: r.segmento,
    ts: aFecha(r.ts),
  }));
}

function filtrarEnvios(
  envios: EnvioContable[],
  desde?: string,
  hasta?: string,
  clientes?: ClienteEtiqueta[],
  etiquetaClienteId?: string
): EnvioContable[] {
  const desdeTs = desde ? parseFechaPanel(desde).getTime() : null;
  const hastaTs = hasta ? parseFechaPanel(hasta).getTime() : null;
  return envios.filter((e) => {
    const t = e.ts.getTime();
    if (desdeTs != null && t < desdeTs) return false;
    if (hastaTs != null && t > hastaTs) return false;
    if (etiquetaClienteId && clientes) {
      return clienteDeSegmento(e.segmento, clientes) === etiquetaClienteId;
    }
    return true;
  });
}

function localDate(d: Date, tz = config.tz): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Agrega los envíos de un día (local) en filas por BM + TOTAL. */
export async function computeSnapshot(
  fechaLocal: string,
  clientId?: string
): Promise<KpiFila[]> {
  const envios = enviosContables(await leerEventos(clientId)).filter(
    (e) => localDate(e.ts) === fechaLocal
  );
  return agregarEnvios(envios);
}

/** KPIs en vivo para un rango arbitrario (desde el log, incluye el día actual). */
export async function computeRange(
  desde?: string,
  hasta?: string,
  clientId?: string,
  etiquetaClienteId?: string
): Promise<KpiFila[]> {
  const envios = enviosContables(await leerEventos(clientId));
  const clientes = etiquetaClienteId ? await getClientesEtiqueta() : undefined;
  return agregarEnvios(
    filtrarEnvios(envios, desde, hasta, clientes, etiquetaClienteId)
  );
}

function cerrarFilaLista(f: KpiLista) {
  f.pctError = pctErrorSobreExito(f.enviados, f.errores);
  f.pctSi = f.enviados ? Math.round((f.si / f.enviados) * 10000) / 100 : 0;
}

/** KPIs por etiqueta de Kommo (lista). La etiqueta es la del envío. */
function agregarPorLista(envios: EnvioContable[]): KpiLista[] {
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

  for (const e of envios) {
    const lista = e.segmento || LISTA_SIN_ETIQUETA;
    const f = ensure(lista);
    f.bmSet.add(e.bmId);
    f.enviados += 1;
    f.si += e.si;
    f.no += e.no;
    f.errores += e.errores;
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
  const envios = enviosContables(await leerEventos(clientId));
  const clientes = etiquetaClienteId ? await getClientesEtiqueta() : undefined;
  return agregarPorLista(
    filtrarEnvios(envios, desde, hasta, clientes, etiquetaClienteId)
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
  const [envios, clientes] = await Promise.all([
    leerEventos().then(enviosContables),
    getClientesEtiqueta(),
  ]);
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
  for (const e of filtrarEnvios(envios, desde, hasta)) {
    const f = acc.get(clienteDeSegmento(e.segmento, clientes));
    if (!f) continue;
    f.enviados += 1;
    f.si += e.si;
    f.no += e.no;
    f.errores += e.errores;
  }
  const out = [...acc.values()];
  for (const f of out) cerrarKpi(f);
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
