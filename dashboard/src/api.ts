import { useCallback, useEffect, useRef, useState } from "react";

export interface Bm {
  id: string;
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
  campaignId: string | null;
  campaignNombre: string | null;
}

export interface Movimiento {
  id: number;
  ts: string;
  bmId: string;
  leadId: number | null;
  accion: string;
  resultado: string | null;
  etapaDestino: number | null;
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

async function req<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => req<{ ok: boolean; kommo: string; ts: string }>("/health"),
  bms: async () => {
    const list = await req<Bm[]>("/api/bms");
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
  kpisHoy: () => req<KpiFila[]>("/api/kpis/hoy"),
  movimientos: (limit = 60, f: LogFiltro = {}) =>
    req<Movimiento[]>(`/api/movimientos?limit=${limit}${filtroQS(f)}`),
  /** URL de descarga directa del CSV (lo sirve el backend con Content-Disposition). */
  movimientosCsvUrl: (f: LogFiltro = {}) =>
    `/api/movimientos.csv?${filtroQS(f).replace(/^&/, "")}`,
  /** CSV en formato del contrato de trazabilidad (plantilla_envio). */
  trazabilidadCsvUrl: (f: LogFiltro = {}) =>
    `/api/trazabilidad.csv?${filtroQS(f).replace(/^&/, "")}`,
};

export interface LogFiltro {
  bm?: string;
  desde?: string; // ISO local, ej "2026-06-25T00:00:00"
  hasta?: string;
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
