import { config, kommoFor } from "../config.js";
import type { KommoClient } from "./types.js";
import { RealKommoClient } from "./real.js";
import { MockKommoClient } from "./mock.js";

const clients = new Map<string, KommoClient>();

export function getKommoClient(clientId = "mooney"): KommoClient {
  const cached = clients.get(clientId);
  if (cached) return cached;

  let client: KommoClient;
  if (config.kommo.mode === "real") {
    const creds = kommoFor(clientId);
    client = new RealKommoClient(creds.subdomain, creds.token);
    console.log(`[kommo] modo REAL (${clientId}) ->`, creds.subdomain);
  } else {
    client = new MockKommoClient();
    console.log(`[kommo] modo MOCK (${clientId}, en memoria)`);
  }
  clients.set(clientId, client);
  return client;
}

export type { KommoClient } from "./types.js";
