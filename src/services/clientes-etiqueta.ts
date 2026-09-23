import { db } from "../db/client.js";
import { clients } from "../db/schema.js";

/**
 * Cliente por etiqueta. Cada cliente reclama prefijos de etiqueta de Kommo
 * (el `segmento` capturado al enviar = primera tag del lead). El match es por
 * prefijo case-insensitive, así "Piliking" agrupa "Piliking 2" y derivados.
 * "mooney" (mostrado como CRM) es el catch-all: se queda con todo lo que no
 * reclame otro cliente. Este mapeo NO afecta el envío: solo agrupa métricas.
 */

export const CATCH_ALL_ID = "mooney";

export interface ClienteEtiqueta {
  id: string;
  nombre: string;
  etiquetas: string[];
  catchAll: boolean;
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Lista de clientes que participan del agrupado por etiqueta: el catch-all
 * (CRM) + los que tienen al menos una etiqueta propia. Excluye tenants sin
 * etiquetas que no sean el catch-all (ej. "king" si no tiene etiquetas).
 */
export async function getClientesEtiqueta(): Promise<ClienteEtiqueta[]> {
  const rows = await db
    .select({
      id: clients.id,
      nombre: clients.nombre,
      etiquetas: clients.etiquetas,
    })
    .from(clients);
  return rows
    .map((r) => ({
      id: r.id,
      nombre: r.nombre,
      etiquetas: Array.isArray(r.etiquetas) ? r.etiquetas : [],
      catchAll: r.id === CATCH_ALL_ID,
    }))
    .filter((c) => c.catchAll || c.etiquetas.length > 0)
    // CRM primero, luego alfabético.
    .sort((a, b) =>
      a.catchAll ? -1 : b.catchAll ? 1 : a.nombre.localeCompare(b.nombre)
    );
}

/** Devuelve el id de cliente al que pertenece un segmento/etiqueta. */
export function clienteDeSegmento(
  segmento: string | null | undefined,
  clientes: ClienteEtiqueta[]
): string {
  const s = norm(segmento ?? "");
  for (const c of clientes) {
    if (c.catchAll) continue;
    if (c.etiquetas.some((p) => p && s.startsWith(norm(p)))) return c.id;
  }
  const ca = clientes.find((c) => c.catchAll);
  return ca?.id ?? CATCH_ALL_ID;
}
