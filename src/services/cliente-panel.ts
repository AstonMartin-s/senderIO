import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  clients,
  bmConfig,
  clientePanel,
  clienteBaseCruda,
  clienteListaFiltrada,
  logMovimientos,
  type ClientePanel,
} from "../db/schema.js";
import { normalizePhoneE164 } from "../lib/phone.js";
import {
  clienteDeSegmento,
  getClientesEtiqueta,
} from "./clientes-etiqueta.js";

/**
 * Servicio del panel-cliente. SOLO recipientes de información compartida:
 * config (oferta / mensaje / plantilla / redirecciones), base cruda recibida,
 * lista filtrada por wa-checker, y una traza por número que se cruza contra
 * log_movimientos SIN exponer el BM. No configura nada del envío.
 */

const DEFAULT_PANEL = (clientId: string): ClientePanel => ({
  clientId,
  ofertaTitulo: "",
  ofertaDetalle: "",
  ofertaMontoUsd: null,
  paqueteTotal: 500,
  paqueteConTope: false,
  mensajeTexto: "",
  plantillaNombre: "",
  redirecciones: [],
  accesoToken: null,
  notas: "",
  updatedAt: new Date(),
});

export async function getPanel(clientId: string): Promise<ClientePanel> {
  const rows = await db
    .select()
    .from(clientePanel)
    .where(eq(clientePanel.clientId, clientId));
  return rows[0] ?? DEFAULT_PANEL(clientId);
}

export type PanelPatch = Partial<
  Pick<
    ClientePanel,
    | "ofertaTitulo"
    | "ofertaDetalle"
    | "ofertaMontoUsd"
    | "paqueteTotal"
    | "mensajeTexto"
    | "plantillaNombre"
    | "redirecciones"
    | "notas"
  >
>;

/** Upsert de la config del panel (nunca toca acceso_token: lo carga CRED). */
export async function savePanel(
  clientId: string,
  patch: PanelPatch
): Promise<ClientePanel> {
  const clean: PanelPatch = {};
  if (patch.ofertaTitulo !== undefined) clean.ofertaTitulo = patch.ofertaTitulo;
  if (patch.ofertaDetalle !== undefined)
    clean.ofertaDetalle = patch.ofertaDetalle;
  if (patch.ofertaMontoUsd !== undefined)
    clean.ofertaMontoUsd = patch.ofertaMontoUsd;
  if (patch.paqueteTotal !== undefined)
    clean.paqueteTotal = Math.max(0, Math.floor(patch.paqueteTotal));
  if (patch.mensajeTexto !== undefined) clean.mensajeTexto = patch.mensajeTexto;
  if (patch.plantillaNombre !== undefined)
    clean.plantillaNombre = patch.plantillaNombre;
  if (patch.redirecciones !== undefined)
    clean.redirecciones = patch.redirecciones;
  if (patch.notas !== undefined) clean.notas = patch.notas;

  await db
    .insert(clientePanel)
    .values({ clientId, ...clean, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: clientePanel.clientId,
      set: { ...clean, updatedAt: new Date() },
    });
  return getPanel(clientId);
}

// ── Bases (recipientes) ──────────────────────────────────────────────────────

export interface FilaBase {
  telefonoRaw?: string | null;
  telefono?: string | null;
  nombre?: string | null;
  extra?: Record<string, unknown> | null;
}

/** Reemplaza (o agrega) la base cruda del cliente. */
export async function setBaseCruda(
  clientId: string,
  filas: FilaBase[],
  { replace = true }: { replace?: boolean } = {}
): Promise<{ insertados: number }> {
  return db.transaction(async (tx) => {
    if (replace) {
      await tx
        .delete(clienteBaseCruda)
        .where(eq(clienteBaseCruda.clientId, clientId));
    }
    const rows = filas
      .map((f) => {
        const raw = f.telefonoRaw ?? f.telefono ?? null;
        return {
          clientId,
          telefono: normalizePhoneE164(raw),
          telefonoRaw: raw,
          nombre: f.nombre ?? null,
          extra: f.extra ?? null,
        };
      })
      .filter((r) => r.telefonoRaw || r.nombre);
    if (rows.length) {
      // Inserta por lotes para bases grandes.
      const CHUNK = 1000;
      for (let i = 0; i < rows.length; i += CHUNK) {
        await tx.insert(clienteBaseCruda).values(rows.slice(i, i + CHUNK));
      }
    }
    return { insertados: rows.length };
  });
}

/** Reemplaza (o agrega) la lista ya filtrada por wa-checker. Solo con teléfono válido. */
export async function setListaFiltrada(
  clientId: string,
  filas: FilaBase[],
  { replace = true }: { replace?: boolean } = {}
): Promise<{ insertados: number; descartados: number }> {
  return db.transaction(async (tx) => {
    if (replace) {
      await tx
        .delete(clienteListaFiltrada)
        .where(eq(clienteListaFiltrada.clientId, clientId));
    }
    let descartados = 0;
    const rows = filas
      .map((f) => {
        const raw = f.telefonoRaw ?? f.telefono ?? null;
        const tel = normalizePhoneE164(raw);
        if (!tel) {
          descartados += 1;
          return null;
        }
        return {
          clientId,
          telefono: tel,
          telefonoRaw: raw,
          nombre: f.nombre ?? null,
          extra: f.extra ?? null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r != null);
    if (rows.length) {
      const CHUNK = 1000;
      for (let i = 0; i < rows.length; i += CHUNK) {
        await tx.insert(clienteListaFiltrada).values(rows.slice(i, i + CHUNK));
      }
    }
    return { insertados: rows.length, descartados };
  });
}

const OPERATIVOS = ["mooney", "king"];

/** Clientes de paquete (no los tenants de operación Mooney/King). */
export async function listClientesPaquete() {
  const rows = await db
    .select()
    .from(clients)
    .where(sql`${clients.id} not in ('mooney', 'king')`);
  const out = [];
  for (const c of rows) {
    const [bases, paquete, panel] = await Promise.all([
      contarBases(c.id),
      consumoPaquete(c.id),
      getPanel(c.id),
    ]);
    out.push({
      id: c.id,
      nombre: c.nombre,
      activo: c.activo,
      ofertaTitulo: panel.ofertaTitulo,
      plantillaNombre: panel.plantillaNombre,
      bases,
      paquete,
    });
  }
  return out;
}

export function esClientePaquete(id: string): boolean {
  return /^[a-zA-Z0-9_-]{1,40}$/.test(id) && !OPERATIVOS.includes(id);
}

export async function filasBase(clientId: string, tipo: "cruda" | "filtrada") {
  const table = tipo === "cruda" ? clienteBaseCruda : clienteListaFiltrada;
  return db
    .select({
      telefono: table.telefono,
      telefonoRaw: table.telefonoRaw,
      nombre: table.nombre,
      extra: table.extra,
    })
    .from(table)
    .where(eq(table.clientId, clientId));
}

export async function contarBases(clientId: string) {
  const [cruda] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(clienteBaseCruda)
    .where(eq(clienteBaseCruda.clientId, clientId));
  const [filtrada] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(clienteListaFiltrada)
    .where(eq(clienteListaFiltrada.clientId, clientId));
  return { baseCruda: cruda?.n ?? 0, listaFiltrada: filtrada?.n ?? 0 };
}

// ── Traza por número (oculta BM) ─────────────────────────────────────────────

export interface TrazaNumero {
  telefono: string;
  nombre: string | null;
  estado: "enviado" | "respondio_si" | "respondio_no" | "error" | "pendiente";
  enviadoAt: string | null;
  ultimaActividadAt: string | null;
  plantilla: string | null;
}

const PRIORIDAD: Record<string, number> = {
  resultado_si: 4,
  resultado_no: 3,
  resultado_error: 2,
  movido_a_envio: 1,
};

function accionToEstado(accion: string | null): TrazaNumero["estado"] {
  switch (accion) {
    case "resultado_si":
      return "respondio_si";
    case "resultado_no":
      return "respondio_no";
    case "resultado_error":
      return "error";
    case "movido_a_envio":
      return "enviado";
    default:
      return "pendiente";
  }
}

/** BMs atribuidos a este cliente de paquete (operación aislada). */
export async function bmsDeCliente(clientId: string): Promise<string[]> {
  const rows = await db
    .select({ id: bmConfig.id })
    .from(bmConfig)
    .where(eq(bmConfig.paqueteClienteId, clientId));
  return rows.map((r) => r.id);
}

/**
 * Traza de la lista filtrada del cliente. Un envío se atribuye a ESTE cliente
 * si el BM está asignado a él (`paquete_cliente_id`) O si el lead lleva su
 * etiqueta de Kommo (segmento, con herencia SI/NO/ERROR por lead). Se cruza con
 * su lista por teléfono E.164, así que nunca cuenta números de otra lista. No
 * expone bmId ni ninguna referencia de línea.
 */
export async function trazaPorNumero(
  clientId: string
): Promise<TrazaNumero[]> {
  const [lista, bmIds, clientes] = await Promise.all([
    db
      .select({
        telefono: clienteListaFiltrada.telefono,
        nombre: clienteListaFiltrada.nombre,
      })
      .from(clienteListaFiltrada)
      .where(eq(clienteListaFiltrada.clientId, clientId)),
    bmsDeCliente(clientId),
    getClientesEtiqueta(),
  ]);

  if (!lista.length) return [];

  const telefonos = [...new Set(lista.map((l) => l.telefono))];
  const bmSet = new Set(bmIds);
  // Traemos los movimientos de ESTOS teléfonos (cualquier BM) y atribuimos por
  // BM asignado o por etiqueta del lead. El cruce por teléfono mantiene aislada
  // la lista del cliente.
  const rawMovs = await db
    .select({
      telefono: logMovimientos.telefono,
      bmId: logMovimientos.bmId,
      leadId: logMovimientos.leadId,
      segmento: logMovimientos.segmento,
      accion: logMovimientos.accion,
      templateNombre: logMovimientos.templateNombre,
      plantilla: logMovimientos.plantilla,
      ts: logMovimientos.ts,
    })
    .from(logMovimientos)
    .where(inArray(logMovimientos.telefono, telefonos))
    .orderBy(desc(logMovimientos.ts));

  // Herencia de etiqueta por lead (SI/NO/ERROR heredan la del envío).
  const segPorLead = new Map<string, string>();
  for (const m of rawMovs) {
    if (m.accion === "movido_a_envio" && m.leadId != null && m.segmento) {
      const k = `${m.bmId}:${m.leadId}`;
      if (!segPorLead.has(k)) segPorLead.set(k, m.segmento);
    }
  }
  // La ETIQUETA manda por encima de la asignación de BM: si el lead lleva la
  // etiqueta de un cliente concreto, cuenta para ESE cliente aunque el BM esté
  // asignado a otro. Solo si la etiqueta cae en el catch-all (CRM) vale la
  // asignación de BM (`paquete_cliente_id`).
  const perteneceAlCliente = (m: (typeof rawMovs)[number]): boolean => {
    const heredada =
      m.leadId != null ? segPorLead.get(`${m.bmId}:${m.leadId}`) : undefined;
    const seg = m.segmento || heredada || null;
    const etqId = clienteDeSegmento(seg, clientes);
    const etqCliente = clientes.find((c) => c.id === etqId);
    if (etqCliente && !etqCliente.catchAll) {
      // Etiqueta de un cliente concreto → manda la etiqueta.
      return etqId === clientId;
    }
    // Etiqueta genérica (catch-all) → vale la asignación de BM.
    return bmSet.has(m.bmId);
  };
  const movs = rawMovs.filter(perteneceAlCliente);

  // Agrega por teléfono: mejor estado (por prioridad) + tiempos.
  const porTel = new Map<
    string,
    {
      mejorAccion: string | null;
      enviadoAt: Date | null;
      ultima: Date | null;
      plantilla: string | null;
    }
  >();
  for (const m of movs) {
    if (!m.telefono) continue;
    const cur =
      porTel.get(m.telefono) ??
      { mejorAccion: null, enviadoAt: null, ultima: null, plantilla: null };
    const ts = m.ts instanceof Date ? m.ts : new Date(m.ts as unknown as string);
    if (!cur.ultima || ts > cur.ultima) cur.ultima = ts;
    if (m.accion === "movido_a_envio") {
      if (!cur.enviadoAt || ts < cur.enviadoAt) cur.enviadoAt = ts;
      cur.plantilla = cur.plantilla ?? m.templateNombre ?? m.plantilla ?? null;
    }
    const p = PRIORIDAD[m.accion ?? ""] ?? 0;
    const pCur = PRIORIDAD[cur.mejorAccion ?? ""] ?? 0;
    if (p > pCur) cur.mejorAccion = m.accion;
    porTel.set(m.telefono, cur);
  }

  return lista.map((l) => {
    const agg = porTel.get(l.telefono);
    return {
      telefono: l.telefono,
      nombre: l.nombre,
      estado: accionToEstado(agg?.mejorAccion ?? null),
      enviadoAt: agg?.enviadoAt ? agg.enviadoAt.toISOString() : null,
      ultimaActividadAt: agg?.ultima ? agg.ultima.toISOString() : null,
      plantilla: agg?.plantilla ?? null,
    };
  });
}

export async function resumenTraza(clientId: string) {
  const filas = await trazaPorNumero(clientId);
  const acc = {
    total: filas.length,
    enviado: 0,
    respondio_si: 0,
    respondio_no: 0,
    error: 0,
    pendiente: 0,
  };
  for (const f of filas) acc[f.estado] += 1;
  return acc;
}

/**
 * Consumo del paquete. Regla (definida con Aston, 2026-09-21):
 *  - Universo: solo la lista filtrada del cliente (cruce por teléfono E.164).
 *  - Consumido = mensajes que se enviaron y NO terminaron en error
 *    (enviado + respondió SÍ + respondió NO). Los ERROR no descuentan.
 *  - Informativo: NO frena el goteo (el envío lo maneja el worker por BM).
 */
export async function consumoPaquete(clientId: string) {
  const [panel, r] = await Promise.all([
    getPanel(clientId),
    resumenTraza(clientId),
  ]);
  const conTope = panel.paqueteConTope;
  const total = panel.paqueteTotal;
  // Consumido = envíos OK (los ERROR no descuentan): enviado + SÍ + NO.
  const consumidos = r.enviado + r.respondio_si + r.respondio_no;
  const restantes = conTope ? Math.max(0, total - consumidos) : null;
  const pct =
    conTope && total > 0
      ? Math.min(100, Math.round((consumidos / total) * 100))
      : 0;
  return {
    conTope,
    total: conTope ? total : null,
    consumidos,
    restantes,
    errores: r.error, // no descuentan, se muestran aparte
    pct,
    activado: conTope ? total > 0 : true,
  };
}
