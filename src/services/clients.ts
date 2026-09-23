import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { clients, type Client } from "../db/schema.js";
import { config, isClientId, type ClientId } from "../config.js";

export async function getClients(): Promise<Client[]> {
  return db.select().from(clients);
}

/** Slug para id de cliente: minúsculas, solo [a-z0-9], máx 40. */
function slugId(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 40);
}

/**
 * Crea un cliente-etiqueta (id derivado del nombre si no se pasa). Las etiquetas
 * son prefijos de la etiqueta de Kommo, en minúsculas. Falla si el id ya existe.
 */
export async function createClienteEtiqueta(input: {
  id?: string;
  nombre: string;
  etiquetas: string[];
}): Promise<Client> {
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error("nombre requerido");
  const id = (input.id?.trim() || slugId(nombre)).trim();
  if (!id) throw new Error("no se pudo derivar un id válido del nombre");
  if (["mooney", "king"].includes(id)) {
    throw new Error(`id reservado: ${id}`);
  }
  const etiquetas = [
    ...new Set(
      (input.etiquetas ?? [])
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.length > 0)
    ),
  ];
  const existing = await getClient(id);
  if (existing) throw new Error(`el cliente "${id}" ya existe`);
  const [row] = await db
    .insert(clients)
    .values({ id, nombre, activo: true, etiquetas })
    .returning();
  return row;
}

export async function getClient(id: string): Promise<Client | undefined> {
  const rows = await db.select().from(clients).where(eq(clients.id, id));
  return rows[0];
}

export function resolveClientId(raw?: string | null): ClientId {
  if (raw && isClientId(raw)) return raw;
  return "mooney";
}

/** Estado de conexión Kommo por cliente (sin exponer secretos). */
export function clientKommoStatus(id: string) {
  const creds = isClientId(id) ? config.kommo.byClient[id] : null;
  return {
    configured: !!(creds?.subdomain && creds?.token),
    subdomain: creds?.subdomain || null,
    hasCfPlantilla: creds?.cfPlantillaId != null,
  };
}
