import "dotenv/config";

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return v;
}

function optionalNumber(name: string): number | null {
  const v = process.env[name];
  return v ? Number(v) : null;
}

export type ClientId = "mooney" | "king";

export interface ClientKommoConfig {
  subdomain: string;
  token: string;
  webhookSecret: string;
  cfPlantillaId: number | null;
}

function clientKommo(
  prefix: "KOMMO" | "KOMMO_KING",
  fallback?: ClientKommoConfig
): ClientKommoConfig {
  const subdomain = process.env[`${prefix}_SUBDOMAIN`] ?? fallback?.subdomain ?? "";
  const token = process.env[`${prefix}_TOKEN`] ?? fallback?.token ?? "";
  const webhookSecret =
    process.env[`${prefix}_WEBHOOK_SECRET`] ?? fallback?.webhookSecret ?? "";
  const cfPlantillaId =
    optionalNumber(`${prefix}_CF_PLANTILLA_ID`) ?? fallback?.cfPlantillaId ?? null;
  return { subdomain, token, webhookSecret, cfPlantillaId };
}

const mooneyKommo = clientKommo("KOMMO");

export const DEFAULT_CLIENT_ID: ClientId = "mooney";

export const config = {
  databaseUrl: required("DATABASE_URL", "postgresql://localhost:5432/senderio"),
  kommo: {
    mode: (process.env.KOMMO_MODE ?? "mock") as "real" | "mock",
    // Compat: el bloque plano sigue siendo Mooney (cuenta histórica).
    ...mooneyKommo,
    byClient: {
      mooney: mooneyKommo,
      king: clientKommo("KOMMO_KING"),
    } satisfies Record<ClientId, ClientKommoConfig>,
  },
  api: {
    port: Number(process.env.PORT ?? process.env.API_PORT ?? 3000),
    // Panel principal de operación (HTTP Basic). Default local admin/admin321;
    // en prod CRED carga ADMIN_USER/ADMIN_PASSWORD (R7, no van a git).
    adminUser: process.env.ADMIN_USER ?? "admin",
    adminPassword: process.env.ADMIN_PASSWORD ?? "admin321",
  },
  tz: process.env.TZ ?? "America/Argentina/Cordoba",
  // Panel-cliente (paquete vendido). Token de acceso opaco; lo carga CRED.
  // Vacío = panel-cliente deshabilitado (401). No va en git (R7).
  clientePanel: {
    id: process.env.CLIENTE_PANEL_ID ?? "clienteS1",
    token: process.env.CLIENTE_PANEL_TOKEN ?? "",
  },
  trazabilidad: {
    apiUrl: process.env.TRAZABILIDAD_API_URL ?? "",
    ingestApiKey: process.env.TRAZABILIDAD_INGEST_API_KEY ?? "",
    pushEnabled: process.env.TRAZABILIDAD_PUSH_ENABLED === "true",
  },
} as const;

export function isClientId(v: unknown): v is ClientId {
  return v === "mooney" || v === "king";
}

export function kommoFor(clientId: string): ClientKommoConfig {
  if (isClientId(clientId)) return config.kommo.byClient[clientId];
  return config.kommo.byClient.mooney;
}
