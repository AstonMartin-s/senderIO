/**
 * Empuja un CSV en contrato v2 a la API de ingest de Trazabilidad.
 * Uso: TRAZABILIDAD_API_URL=... TRAZABILIDAD_INGEST_API_KEY=... npx tsx scripts/_push_csv.ts <csv>
 */
import { readFileSync } from "node:fs";
import { TRAZABILIDAD_CSV_HEADER } from "../src/services/trazabilidad.js";

const CSV = process.argv[2];
if (!CSV) throw new Error("Falta ruta al CSV");
const BASE = (process.env.TRAZABILIDAD_API_URL ?? "").replace(/\/$/, "");
const KEY = process.env.TRAZABILIDAD_INGEST_API_KEY ?? "";
if (!BASE) throw new Error("Falta TRAZABILIDAD_API_URL");

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function parseNum(v: string): number | null {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

async function main() {
  const text = readFileSync(CSV, "utf8").replace(/\r/g, "");
  const lines = text.split("\n").filter((l) => l.length);
  const head = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map((l) => {
    const cells = splitCsvLine(l);
    const o: Record<string, string> = {};
    head.forEach((h, i) => (o[h] = cells[i] ?? ""));
    return o;
  });
  console.log(`Filas a empujar: ${rows.length}`);

  const envios = rows.map((r) => ({
    fuente_envio: r.fuente_envio,
    plataforma: r.plataforma,
    campaign_id_externo: r.campaign_id_externo,
    campaign_nombre: r.campaign_nombre || null,
    template_nombre: r.template_nombre || null,
    telefono: r.telefono,
    es_interno: r.es_interno === "true",
    segmento: r.segmento || null,
    message_id: r.message_id,
    ts_enviado: r.ts_enviado || null,
    ts_entregado: r.ts_entregado || null,
    ts_leido: r.ts_leido || null,
    ts_primera_respuesta: r.ts_primera_respuesta || null,
    estado_final: r.estado_final || null,
    error_codigo: r.error_codigo || null,
    error_motivo: r.error_motivo || null,
    conversacion_id: r.conversacion_id || null,
    costo: parseNum(r.costo),
    moneda: r.moneda || null,
  }));

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (KEY) headers.Authorization = `Bearer ${KEY}`;

  const BATCH = 100;
  let ok = 0;
  for (let i = 0; i < envios.length; i += BATCH) {
    const lote = envios.slice(i, i + BATCH);
    const res = await fetch(`${BASE}/api/v1/spam/envios`, {
      method: "POST",
      headers,
      body: JSON.stringify({ origen: "senderio", envios: lote }),
    });
    if (!res.ok) {
      console.error(`Lote ${i / BATCH + 1} FALLÓ`, res.status, await res.text());
      process.exit(1);
    }
    ok += lote.length;
    console.log(`  lote ${i / BATCH + 1} ok (${ok}/${envios.length})`);
    await new Promise((r) => setTimeout(r, 150));
  }
  console.log(`Listo. Empujados: ${ok}`);
  void TRAZABILIDAD_CSV_HEADER;
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
