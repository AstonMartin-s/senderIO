import { pool } from "./client.js";

/** Canal de Postgres por el que la API avisa cambios de control al worker. */
export const BM_CONTROL_CHANNEL = "bm_control";

/** Valor especial para pedir reevaluación de todos los BMs. */
export const ALL = "__all__";

/**
 * Emite un NOTIFY para que el worker reaccione al instante a un cambio hecho
 * desde el panel (pausar, reanudar, activar/desactivar, editar config, alta/baja).
 * Falla en silencio: si Postgres no está disponible, no debe romper la respuesta
 * HTTP (el worker igual reconcilia en su próximo tick).
 */
export async function notifyBmChanged(id: string): Promise<void> {
  try {
    await pool.query("SELECT pg_notify($1, $2)", [BM_CONTROL_CHANNEL, id]);
  } catch (err) {
    console.error("[notify] no se pudo emitir pg_notify:", err);
  }
}

export async function notifyAll(): Promise<void> {
  return notifyBmChanged(ALL);
}
