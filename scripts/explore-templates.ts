/**
 * Exploración descartable: plantillas de chat / WABA en la cuenta real.
 * Objetivo: confirmar el endpoint, la forma de una plantilla existente (las que
 * usa el bot de BM3: 52524 / 52528 / 53712), su estado de moderación y si trae
 * el source_id (canal) asociado.
 *
 *   npx tsx scripts/explore-templates.ts
 */
import { config } from "../src/config.js";

const V4 = `https://${config.kommo.subdomain}.kommo.com/api/v4`;
const h = {
  Authorization: `Bearer ${config.kommo.token}`,
  "Content-Type": "application/json",
};

function recorte(v: unknown, max = 3000): string {
  let s = JSON.stringify(v, null, 2);
  if (s.length > max) s = `${s.slice(0, max)}\n… (recortado, ${s.length} chars)`;
  return s;
}

async function probe(label: string, path: string) {
  const url = `${V4}${path}`;
  console.log("────────────────────────────────────────────────────────");
  console.log(`▶ ${label}\n  GET ${url}`);
  const res = await fetch(url, { headers: h });
  console.log(`  status: ${res.status} ${res.statusText}`);
  const text = await res.text();
  if (!text) {
    console.log("  body: <vacío>");
    return;
  }
  try {
    console.log(recorte(JSON.parse(text)));
  } catch {
    console.log(`  body (no-JSON): ${text.slice(0, 400)}`);
  }
}

async function main() {
  await probe("Chat templates (lista)", "/chats/templates");
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
