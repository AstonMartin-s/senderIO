import type { Bm } from "../api";

export function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "ahora";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `hace ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

export function timeUntil(iso: string | null): string {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "ya";
  const s = Math.ceil(diff / 1000);
  if (s < 60) return `en ${s}s`;
  const m = Math.floor(s / 60);
  return `en ${m}min ${s % 60}s`;
}

export function clockHHmm(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Hora con segundos en formato 24h (HH:MM:SS), zona Argentina. */
export function clockHHmmss(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Cordoba",
  });
}

/** Fecha corta DD/MM, zona Argentina. */
export function dayDM(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Argentina/Cordoba",
  });
}

export type Estado = "activo" | "alerta" | "pausado" | "inactivo";

/**
 * Umbrales del % de error móvil (errores 3132 sobre los últimos N resultados).
 * En envíos masivos un baseline alto de errores (números inválidos) es normal:
 * la operación histórica ronda ~45%. Por eso solo se considera "alerta" cuando
 * el error es claramente superior a ese piso esperado.
 */
export const PCT_ERROR_WARN = 50; // elevado: empezar a mirar
export const PCT_ERROR_ALERT = 70; // considerable: alerta real

export type Tone = "ok" | "warn" | "bad";

export function pctErrorTone(pct: number): Tone {
  if (pct >= PCT_ERROR_ALERT) return "bad";
  if (pct >= PCT_ERROR_WARN) return "warn";
  return "ok";
}

export function estadoBm(bm: Bm): Estado {
  if (!bm.activo) return "inactivo";
  const pct = Number(bm.pctErrorMovil);
  if (bm.pausado || bm.erroresConsecutivos >= bm.umbralErroresConsecutivos)
    return "pausado";
  // Cortafuegos activo (pausa corta vigente) o error móvil considerable.
  if (
    pct >= PCT_ERROR_ALERT ||
    (bm.pausadoHasta && new Date(bm.pausadoHasta) > new Date())
  )
    return "alerta";
  return "activo";
}

export const estadoMeta: Record<
  Estado,
  { label: string; dot: string; text: string; ring: string; soft: string }
> = {
  activo: {
    label: "Activo",
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-300",
    ring: "ring-emerald-500/25",
    soft: "bg-emerald-500/10",
  },
  alerta: {
    label: "Alerta",
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-300",
    ring: "ring-amber-500/25",
    soft: "bg-amber-500/10",
  },
  pausado: {
    label: "Pausado",
    dot: "bg-rose-500",
    text: "text-rose-600 dark:text-rose-300",
    ring: "ring-rose-500/25",
    soft: "bg-rose-500/10",
  },
  inactivo: {
    label: "Inactivo",
    dot: "bg-faint",
    text: "text-muted",
    ring: "ring-line",
    soft: "bg-surface-2",
  },
};
