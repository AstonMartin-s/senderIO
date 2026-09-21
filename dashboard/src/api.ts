import { useCallback, useEffect, useRef, useState } from "react";

export interface Bm {
  id: string;
  clientId?: string;
  nombre: string;
  pipelineId: number;
  stageOrigenId: number;
  stageOrigenPipelineId: number | null;
  stageDestinoId: number;
  stageErrorId: number;
  stageSiId: number | null;
  stageNoId: number | null;
  activo: boolean;
  pausado: boolean;
  sinLeads: boolean;
  sinLeadsDesde: string | null;
  limiteDiario: number;
  enviadosHoy: number;
  erroresHoy: number;
  erroresConsecutivos: number;
  umbralErroresConsecutivos: number;
  pctErrorMovil: string;
  intervaloMinSeg: number;
  intervaloMaxSeg: number;
  ventanaInicio: string;
  ventanaFin: string;
  pausaCortaMin: number;
  pausaCortaMax: number;
  ultimoEnvio: string | null;
  proximoTickAt: string | null;
  pausadoHasta: string | null;
  fecha: string | null;
  fuenteEnvio: string;
  plataforma: string | null;
  templateNombre: string | null;
  mensajeTexto: string | null;
  campaignId: string | null;
  campaignNombre: string | null;
  wabaId: string | null;
  chatSourceId: number | null;
  botListo: boolean;
  /** El set de plantillas en rotación (switch ON) cambió respecto al bot generado. */
  botDesactualizado?: boolean;
}

export interface GenerarBotResp {
  bot: unknown;
  kommoUrl: string;
  descartadas: number;
  plantillasUsadas: {
    nombre: string;
    kommoTemplateId: number;
    valorEstampado: string;
  }[];
}

export interface Boton {
  text: string;
  type?: string;
}

export interface Plantilla {
  id: number;
  bmId: string;
  nombre: string;
  kommoTemplateId: number | null;
  wabaId: string | null;
  categoria: string;
  idioma: string;
  contenido: string;
  botones: Boton[];
  header: string | null;
  footer: string | null;
  valorEstampado: string | null;
  activo: boolean;
  enBot: boolean;
  estado: string; // local | review | approved | rejected | borrador
  rejectReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Movimiento {
  id: number;
  ts: string;
  bmId: string;
  leadId: number | null;
  accion: string;
  resultado: string | null;
  etapaDestino: number | null;
  plantilla: string | null;
  telefono: string | null;
  segmento: string | null;
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

async function req<T>(url: string, options?: RequestInit): Promise<T> {
  // Solo mandamos Content-Type JSON si hay body; con DELETE/GET sin cuerpo,
  // Fastify rechaza ("Body cannot be empty when content-type is application/json").
  const hasBody = options?.body != null;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${body}`);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export interface ClientRow {
  id: string;
  nombre: string;
  activo: boolean;
  kommo: {
    configured: boolean;
    subdomain: string | null;
    hasCfPlantilla: boolean;
  };
}

function clientQS(client?: string, extra = ""): string {
  const parts: string[] = [];
  if (client) parts.push(`client=${encodeURIComponent(client)}`);
  const rest = extra.replace(/^[?&]/, "");
  if (rest) parts.push(rest);
  return parts.length ? `?${parts.join("&")}` : "";
}

export const api = {
  health: () =>
    req<{
      ok: boolean;
      kommo: string;
      ts: string;
      clients?: { id: string; configured: boolean }[];
    }>("/health"),
  clients: () => req<ClientRow[]>("/api/clients"),
  bms: async (client?: string) => {
    const list = await req<Bm[]>(`/api/bms${clientQS(client)}`);
    // Orden estable por id (BM1, BM2, …) para que las tarjetas no salten en cada poll.
    return list.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  },
  patchBm: (id: string, patch: Partial<Bm>) =>
    req<Bm>(`/api/bms/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  createBm: (data: Partial<Bm>) =>
    req<Bm>("/api/bms", { method: "POST", body: JSON.stringify(data) }),
  deleteBm: (id: string) =>
    req<{ ok: boolean }>(`/api/bms/${id}`, { method: "DELETE" }),
  pause: (id: string) =>
    req<Bm>(`/api/bms/${id}/pause`, { method: "POST" }),
  resume: (id: string) =>
    req<Bm>(`/api/bms/${id}/resume`, { method: "POST" }),
  resetContadores: (id: string) =>
    req<Bm>(`/api/bms/${id}/reset-contadores`, { method: "POST" }),
  resetDiario: () => req<unknown>("/api/reset-diario", { method: "POST" }),
  kpisHoy: (client?: string) =>
    req<KpiFila[]>(`/api/kpis/hoy${clientQS(client)}`),
  kpisRango: (f: LogFiltro = {}) =>
    req<KpiFila[]>(`/api/kpis/rango${clientQS(f.client, filtroQS(f))}`),
  kpisListas: (f: LogFiltro = {}) =>
    req<KpiLista[]>(`/api/kpis/listas${clientQS(f.client, filtroQS(f))}`),
  movimientos: (limit = 60, f: LogFiltro = {}) =>
    req<Movimiento[]>(
      `/api/movimientos${clientQS(f.client, `limit=${limit}${filtroQS(f)}`)}`
    ),
  /** URL de descarga directa del CSV (lo sirve el backend con Content-Disposition). */
  movimientosCsvUrl: (f: LogFiltro = {}) =>
    `/api/movimientos.csv${clientQS(f.client, filtroQS(f))}`,
  /** CSV en formato del contrato de trazabilidad (plantilla_envio). */
  trazabilidadCsvUrl: (f: LogFiltro = {}) =>
    `/api/trazabilidad.csv${clientQS(f.client, filtroQS(f))}`,

  plantillas: (bm?: string, client?: string) =>
    req<Plantilla[]>(
      `/api/plantillas${clientQS(client, bm ? `bm=${encodeURIComponent(bm)}` : "")}`
    ),
  createPlantilla: (data: Partial<Plantilla>) =>
    req<Plantilla>("/api/plantillas", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  patchPlantilla: (id: number, patch: Partial<Plantilla>) =>
    req<Plantilla>(`/api/plantillas/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deletePlantilla: (id: number) =>
    req<{ ok: boolean }>(`/api/plantillas/${id}`, { method: "DELETE" }),
  submitPlantilla: (id: number) =>
    req<Plantilla>(`/api/plantillas/${id}/submit`, { method: "POST" }),
  checkPlantilla: (id: number) =>
    req<Plantilla>(`/api/plantillas/${id}/check`, { method: "POST" }),
  generarBot: (id: string) =>
    req<GenerarBotResp>(`/api/bms/${id}/generar-bot`, { method: "POST" }),
  siguienteIdBm: (client?: string) =>
    req<{ id: string }>(`/api/bms/siguiente-id${clientQS(client)}`),
  altaBm: (
    data: {
      nombre: string;
      wabaId?: string | null;
      chatSourceId?: number | null;
      id?: string;
      clientId?: string;
    },
    client?: string
  ) =>
    req<Bm>(`/api/bms/alta${clientQS(client)}`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  importarPlantillas: (client?: string) =>
    req<{ importadas: number; salteadas: number; sinBm: number }>(
      `/api/plantillas/importar${clientQS(client)}`,
      { method: "POST" }
    ),
  syncPlantillasTrazabilidad: () =>
    req<{ ok: boolean; enviadas: number }>(
      "/api/plantillas/sync-trazabilidad",
      { method: "POST" }
    ),
};

// ── Panel-cliente (paquete vendido) ──────────────────────────────────────────

export interface ClientePanelConfig {
  clientId: string;
  ofertaTitulo: string;
  ofertaDetalle: string;
  ofertaMontoUsd: string | null;
  mensajeTexto: string;
  plantillaNombre: string;
  redirecciones: string[];
  notas: string;
  updatedAt: string;
}

export interface TrazaNumero {
  telefono: string;
  nombre: string | null;
  estado: "enviado" | "respondio_si" | "respondio_no" | "error" | "pendiente";
  enviadoAt: string | null;
  ultimaActividadAt: string | null;
  plantilla: string | null;
}

export interface ClientePanelResp {
  panel: ClientePanelConfig;
  bases: { baseCruda: number; listaFiltrada: number };
  resumen: {
    total: number;
    enviado: number;
    respondio_si: number;
    respondio_no: number;
    error: number;
    pendiente: number;
  };
}

export interface FilaBaseUpload {
  telefonoRaw?: string | null;
  telefono?: string | null;
  nombre?: string | null;
  extra?: Record<string, unknown> | null;
}

const CLIENTE_TOKEN_KEY = "senderio-cliente-token";

export function getClienteToken(): string {
  try {
    return localStorage.getItem(CLIENTE_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setClienteToken(token: string) {
  try {
    localStorage.setItem(CLIENTE_TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

function clienteAuth(): HeadersInit {
  const t = getClienteToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export const clienteApi = {
  panel: () =>
    req<ClientePanelResp>("/api/cliente/panel", { headers: clienteAuth() }),
  savePanel: (patch: Partial<ClientePanelConfig>) =>
    req<ClientePanelConfig>("/api/cliente/panel", {
      method: "PATCH",
      headers: clienteAuth(),
      body: JSON.stringify(patch),
    }),
  traza: () =>
    req<TrazaNumero[]>("/api/cliente/traza", { headers: clienteAuth() }),
  subirBaseCruda: (filas: FilaBaseUpload[], replace = true) =>
    req<{ ok: boolean; insertados: number }>("/api/cliente/base-cruda", {
      method: "POST",
      headers: clienteAuth(),
      body: JSON.stringify({ filas, replace }),
    }),
  subirListaFiltrada: (filas: FilaBaseUpload[], replace = true) =>
    req<{ ok: boolean; insertados: number; descartados: number }>(
      "/api/cliente/lista-filtrada",
      {
        method: "POST",
        headers: clienteAuth(),
        body: JSON.stringify({ filas, replace }),
      }
    ),
  trazaCsvUrl: () => "/api/cliente/traza.csv",
};

export interface LogFiltro {
  bm?: string;
  desde?: string; // ISO local, ej "2026-06-25T00:00:00"
  hasta?: string;
  client?: string;
}

function filtroQS(f: LogFiltro): string {
  const p: string[] = [];
  if (f.bm) p.push(`bm=${encodeURIComponent(f.bm)}`);
  if (f.desde) p.push(`desde=${encodeURIComponent(f.desde)}`);
  if (f.hasta) p.push(`hasta=${encodeURIComponent(f.hasta)}`);
  return p.length ? `&${p.join("&")}` : "";
}

/** Polling con refresco manual y soporte para updates optimistas (mutate). */
export function usePolling<T>(
  fn: () => Promise<T>,
  intervalMs = 4000
): {
  data: T | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
  mutate: (updater: (prev: T | null) => T | null) => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  // Generación: se incrementa con cada mutate optimista. Un poll en vuelo que
  // empezó antes de un mutate no debe pisar el estado más nuevo.
  const genRef = useRef(0);

  const refresh = useCallback(() => {
    const gen = genRef.current;
    fnRef
      .current()
      .then((d) => {
        if (genRef.current !== gen) return; // hubo un mutate más nuevo, descartamos
        setData(d);
        setError(null);
      })
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => setLoading(false));
  }, []);

  const mutate = useCallback((updater: (prev: T | null) => T | null) => {
    genRef.current += 1;
    setData((prev) => updater(prev));
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, intervalMs);
    return () => clearInterval(t);
  }, [refresh, intervalMs]);

  return { data, error, loading, refresh, mutate };
}
