import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { clients, type Client } from "../db/schema.js";
import { config, isClientId, type ClientId } from "../config.js";

export async function getClients(): Promise<Client[]> {
  return db.select().from(clients);
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
