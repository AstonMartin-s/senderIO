import "dotenv/config";

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return v;
}

export const config = {
  databaseUrl: required("DATABASE_URL", "postgresql://localhost:5432/senderio"),
  kommo: {
    subdomain: process.env.KOMMO_SUBDOMAIN ?? "",
    token: process.env.KOMMO_TOKEN ?? "",
    webhookSecret: process.env.KOMMO_WEBHOOK_SECRET ?? "",
    mode: (process.env.KOMMO_MODE ?? "mock") as "real" | "mock",
    // ID del campo personalizado del lead donde el Salesbot escribe el nombre de
    // la plantilla enviada. Si no está seteado, la reconciliación queda apagada.
    cfPlantillaId: process.env.KOMMO_CF_PLANTILLA_ID
      ? Number(process.env.KOMMO_CF_PLANTILLA_ID)
      : null,
  },
  api: {
    // Railway (y la mayoría de PaaS) inyectan PORT; cae a API_PORT y luego 3000.
    port: Number(process.env.PORT ?? process.env.API_PORT ?? 3000),
    adminPassword: process.env.ADMIN_PASSWORD ?? "changeme",
  },
  tz: process.env.TZ ?? "America/Argentina/Cordoba",
  trazabilidad: {
    apiUrl: process.env.TRAZABILIDAD_API_URL ?? "",
    ingestApiKey: process.env.TRAZABILIDAD_INGEST_API_KEY ?? "",
    pushEnabled: process.env.TRAZABILIDAD_PUSH_ENABLED === "true",
  },
} as const;
