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

/**
 * Lee una fecha del panel ("yyyy-MM-dd" o "yyyy-MM-ddTHH:mm:ss") como hora
 * de la operación, no como UTC. Si ya trae zona (Z u offset), se respeta.
 */
export function parseFechaPanel(raw: string, tz = config.tz): Date {
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) return new Date(raw);
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2}))?$/.exec(raw);
  if (!m) return new Date(raw);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4] ?? 0);
  const mi = Number(m[5] ?? 0);
  const s = Number(m[6] ?? 0);
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi, s);
  const off1 = offsetZona(tz, new Date(utcGuess));
  const off2 = offsetZona(tz, new Date(utcGuess - off1));
  return new Date(utcGuess - off2);
}

function offsetZona(tz: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(date).map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - date.getTime();
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
