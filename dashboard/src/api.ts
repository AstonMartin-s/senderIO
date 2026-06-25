import { useCallback, useEffect, useRef, useState } from "react";

export interface Bm {
  id: string;
  nombre: string;
  pipelineId: number;
  stageOrigenId: number;
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
  bms: () => req<Bm[]>("/api/bms"),
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
  movimientos: (limit = 60) =>
    req<Movimiento[]>(`/api/movimientos?limit=${limit}`),
};

/** Polling con refresco manual. */
export function usePolling<T>(
  fn: () => Promise<T>,
  intervalMs = 4000
): { data: T | null; error: string | null; loading: boolean; refresh: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const refresh = useCallback(() => {
    fnRef
      .current()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, intervalMs);
    return () => clearInterval(t);
  }, [refresh, intervalMs]);

  return { data, error, loading, refresh };
}
