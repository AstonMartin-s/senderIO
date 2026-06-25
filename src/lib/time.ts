import { config } from "../config.js";

/** "HH:mm" actual en la zona horaria de la operación. */
export function nowHHmm(tz = config.tz): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

/** "yyyy-MM-dd" en la zona horaria de la operación (por defecto, ahora). */
export function todayLocal(tz = config.tz, when: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(when);
}

/** Convierte "HH:mm" o "HH:mm:ss" a minutos desde medianoche. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

/**
 * ¿Estamos dentro de la ventana [inicio, fin]? Soporta ventanas que cruzan
 * medianoche (ej. 22:00 -> 02:00).
 */
export function dentroDeVentana(
  inicio: string,
  fin: string,
  ahora = nowHHmm()
): boolean {
  const a = toMinutes(ahora);
  const i = toMinutes(inicio);
  const f = toMinutes(fin);
  if (i <= f) return a >= i && a <= f;
  // ventana que cruza medianoche
  return a >= i || a <= f;
}

/**
 * Intervalo real entre disparos: uniforme(min, max) + jitter ±10%.
 * Devuelve segundos.
 */
export function intervaloAleatorioSeg(minSeg: number, maxSeg: number): number {
  const base = minSeg + Math.random() * Math.max(0, maxSeg - minSeg);
  const jitter = base * (Math.random() * 0.2 - 0.1); // ±10%
  return Math.max(1, Math.round(base + jitter));
}

/** Minutos aleatorios (entero) en [min, max], para la pausa corta. */
export function minutosAleatorios(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}
