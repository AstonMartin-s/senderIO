import { config } from "../config.js";
import type { KommoClient } from "./types.js";
import { RealKommoClient } from "./real.js";
import { MockKommoClient } from "./mock.js";

let client: KommoClient | null = null;

export function getKommoClient(): KommoClient {
  if (client) return client;
  if (config.kommo.mode === "real") {
    client = new RealKommoClient(config.kommo.subdomain, config.kommo.token);
    console.log("[kommo] modo REAL ->", config.kommo.subdomain);
  } else {
    client = new MockKommoClient();
    console.log("[kommo] modo MOCK (en memoria)");
  }
  return client;
}

export type { KommoClient } from "./types.js";
