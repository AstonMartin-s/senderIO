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

export type Estado = "activo" | "alerta" | "pausado" | "inactivo";

export function estadoBm(bm: Bm): Estado {
  if (!bm.activo) return "inactivo";
  const pct = Number(bm.pctErrorMovil);
  if (bm.pausado || bm.erroresConsecutivos >= bm.umbralErroresConsecutivos)
    return "pausado";
  if (pct > 15 || (bm.pausadoHasta && new Date(bm.pausadoHasta) > new Date()))
    return "alerta";
  if (pct > 10) return "alerta";
  return "activo";
}

export const estadoMeta: Record<
  Estado,
  { label: string; dot: string; text: string; ring: string; soft: string }
> = {
  activo: {
    label: "Activo",
    dot: "bg-emerald-500",
    text: "text-emerald-700",
    ring: "ring-emerald-200",
    soft: "bg-emerald-50",
  },
  alerta: {
    label: "Alerta",
    dot: "bg-amber-500",
    text: "text-amber-700",
    ring: "ring-amber-200",
    soft: "bg-amber-50",
  },
  pausado: {
    label: "Pausado",
    dot: "bg-rose-500",
    text: "text-rose-700",
    ring: "ring-rose-200",
    soft: "bg-rose-50",
  },
  inactivo: {
    label: "Inactivo",
    dot: "bg-slate-400",
    text: "text-slate-600",
    ring: "ring-slate-200",
    soft: "bg-slate-50",
  },
};
