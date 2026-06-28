/**
 * FASE 1 — Exploración descartable de la API de Kommo (NO entra al build prod).
 *
 * Corre contra la cuenta REAL usando el mismo patrón de auth que RealKommoClient
 * (Bearer token desde config). Para cada endpoint imprime: URL final, status y un
 * recorte de la respuesta (no vuelca todo). No construye nada productivo.
 *
 *   npx tsx scripts/explore-kommo.ts
 *
 * Requiere KOMMO_SUBDOMAIN y KOMMO_TOKEN en .env (independiente de KOMMO_MODE).
 */
import { config } from "../src/config.js";

const BASE = `https://${config.kommo.subdomain}.kommo.com`;
const V4 = `${BASE}/api/v4`;

function line(s = "") {
  console.log(s);
}

/** Acorta cualquier valor para no inundar la consola. */
function recorte(value: unknown, max = 1400): string {
  let s: string;
  try {
    s = JSON.stringify(value, null, 2);
  } catch {
    s = String(value);
  }
  if (s.length > max) s = `${s.slice(0, max)}\n… (recortado, ${s.length} chars)`;
  return s;
}

async function probe(label: string, path: string): Promise<unknown | null> {
  const url = path.startsWith("http") ? path : `${V4}${path}`;
  line("────────────────────────────────────────────────────────");
  line(`▶ ${label}`);
  line(`  GET ${url}`);
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.kommo.token}`,
        "Content-Type": "application/json",
      },
    });
    line(`  status: ${res.status} ${res.statusText}`);
    const text = await res.text();
    if (!text) {
      line("  body: <vacío>");
      return null;
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      line(`  body (no-JSON): ${text.slice(0, 400)}`);
      return null;
    }
    line("  body:");
    line(recorte(json));
    return json;
  } catch (err) {
    line(`  ERROR de red: ${(err as Error).message}`);
    return null;
  }
}

async function main() {
  line(`Cuenta: ${BASE}`);
  line(`Token presente: ${config.kommo.token ? "sí" : "NO"}`);
  if (!config.kommo.subdomain || !config.kommo.token) {
    line("Falta KOMMO_SUBDOMAIN o KOMMO_TOKEN en .env. Abortando.");
    process.exit(1);
  }

  // (1) Pipelines + statuses — ya sabemos que anda; confirmamos la forma de un status.
  const pipelines = (await probe(
    "(1) Pipelines (público v4)",
    "/leads/pipelines"
  )) as
    | { _embedded?: { pipelines?: Array<{ id: number; name: string }> } }
    | null;
  // Foco: forma de UN status del primer pipeline (id/name/type/sort/color).
  const firstPipe = pipelines?._embedded?.pipelines?.[0] as
    | { _embedded?: { statuses?: unknown[] } }
    | undefined;
  if (firstPipe?._embedded?.statuses?.[0]) {
    line("  ↳ forma de un status:");
    line(recorte(firstPipe._embedded.statuses[0], 500));
  }

  // (2) Custom fields de leads — confirmar PLANTILLA_ENVIADA (id 1227432).
  await probe(
    "(2) Custom field PLANTILLA_ENVIADA (id 1227432)",
    "/leads/custom_fields/1227432"
  );

  // (2b) Cuenta: amojo_id (necesario para la Chats API / canales de chat).
  await probe("(2b) Account (amojo_id)", "/account?with=amojo_id");

  // (3) Chat sources / canales de WhatsApp — buscar el id (BM3 = 59026).
  await probe("(3a) Sources (público v4)", "/sources");
  await probe("(3b) Chats sources (v4)", "/chats/sources");

  // (4) Salesbots — endpoint interno, lo más incierto. Probar variantes v4.
  await probe("(4a) Salesbot (v4)", "/salesbot");
  await probe("(4b) Salesbots (v4)", "/salesbots");

  line("────────────────────────────────────────────────────────");
  line("Fin de la exploración.");
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
