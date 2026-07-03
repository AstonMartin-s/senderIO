/**
 * Backfill histórico (era n8n, 22-may a 25-jun 2026).
 *
 * Lee el export de Google Sheets (log_envios.csv), resuelve teléfono + segmento
 * de cada lead contra Kommo (lead -> contacto principal -> PHONE + tag ListaN)
 * y emite un CSV en el contrato v2 de Trazabilidad listo para importar.
 *
 * Uso:
 *   npx tsx scripts/_backfill_historico.ts <ruta_log_envios.csv> [salida.csv]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { config } from "../src/config.js";
import { normalizePhoneE164 } from "../src/lib/phone.js";
import {
  COSTO_POR_MENSAJE,
  MONEDA,
  TRAZABILIDAD_CSV_HEADER,
  buildMessageId,
  envioToCsvRow,
  type EnvioTrazabilidad,
} from "../src/services/trazabilidad.js";

const SRC =
  process.argv[2] ??
  `${process.env.HOME}/Downloads/orquestador-operacion - log_envios.csv`;
const OUT =
  process.argv[3] ??
  `${process.env.HOME}/Downloads/backfill_trazabilidad_2026-07-03.csv`;

const SUB = config.kommo?.subdomain ?? process.env.KOMMO_SUBDOMAIN ?? "";
const TOK = process.env.KOMMO_TOKEN ?? "";
if (!SUB || !TOK) throw new Error("Faltan KOMMO_SUBDOMAIN / KOMMO_TOKEN");
const BASE = `https://${SUB}.kommo.com/api/v4`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function kommoGet(path: string): Promise<any> {
  for (let intento = 0; intento < 5; intento++) {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${TOK}` },
    });
    if (res.status === 429 || res.status >= 500) {
      await sleep(1000 * (intento + 1));
      continue;
    }
    if (res.status === 204) return null;
    if (!res.ok) throw new Error(`Kommo ${res.status} en ${path}`);
    return res.json();
  }
  throw new Error(`Kommo agotó reintentos en ${path}`);
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.length);
  const head = lines[0].split(",");
  return lines.slice(1).map((line) => {
    // Split simple (el sheet no tiene comas embebidas en estas columnas).
    const cells = line.split(",");
    const row: Record<string, string> = {};
    head.forEach((h, i) => (row[h.trim()] = (cells[i] ?? "").trim()));
    return row;
  });
}

/** Normaliza "2026-06-25 1:28:28" (hora sin cero) -> "2026-06-25T01:28:28-03:00". */
function tsArIso(csvTs: string): string {
  const m = csvTs
    .trim()
    .match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2}):(\d{1,2})/);
  if (!m) throw new Error(`Timestamp inesperado: "${csvTs}"`);
  const [, Y, Mo, D, H, Mi, S] = m;
  const p = (v: string) => v.padStart(2, "0");
  return `${Y}-${p(Mo)}-${p(D)}T${p(H)}:${p(Mi)}:${p(S)}-03:00`;
}

async function main() {
  const rows = parseCsv(readFileSync(SRC, "utf8"));
  const envs = rows.filter(
    (r) => r.accion === "movido_a_envio" && r.lead_id
  );
  console.log(`movido_a_envio: ${envs.length}`);

  const leadIds = [...new Set(envs.map((r) => Number(r.lead_id)))];
  console.log(`lead_ids únicos: ${leadIds.length}`);

  // 1) lead -> contacto principal + segmento (tag ListaN)
  const leadContacto = new Map<number, number>();
  const leadSegmento = new Map<number, string>();
  const contactoIds = new Set<number>();
  let leadsBorrados = 0;

  for (const grupo of chunk(leadIds, 250)) {
    const q = grupo.map((id) => `filter[id][]=${id}`).join("&");
    const data = await kommoGet(`/leads?${q}&with=contacts&limit=250`);
    const leads: any[] = data?._embedded?.leads ?? [];
    const vistos = new Set<number>();
    for (const l of leads) {
      vistos.add(l.id);
      const main = (l._embedded?.contacts ?? []).find((c: any) => c.is_main)
        ?? l._embedded?.contacts?.[0];
      if (main) {
        leadContacto.set(l.id, main.id);
        contactoIds.add(main.id);
      }
      const tag = (l._embedded?.tags ?? []).find((t: any) =>
        /^lista\s*\d+/i.test(t.name)
      );
      if (tag) leadSegmento.set(l.id, tag.name);
    }
    for (const id of grupo) if (!vistos.has(id)) leadsBorrados++;
    await sleep(250);
  }
  console.log(
    `con contacto: ${leadContacto.size} | leads no hallados (borrados): ${leadsBorrados}`
  );

  // 2) contacto -> teléfono
  const contactoTel = new Map<number, string>();
  for (const grupo of chunk([...contactoIds], 250)) {
    const q = grupo.map((id) => `filter[id][]=${id}`).join("&");
    const data = await kommoGet(`/contacts?${q}&limit=250`);
    const contactos: any[] = data?._embedded?.contacts ?? [];
    for (const c of contactos) {
      const f = (c.custom_fields_values ?? []).find(
        (x: any) => x.field_code === "PHONE"
      );
      const raw = f?.values?.[0]?.value;
      const tel = normalizePhoneE164(raw);
      if (tel) contactoTel.set(c.id, tel);
    }
    await sleep(250);
  }
  console.log(`contactos con teléfono: ${contactoTel.size}`);

  // 3) Construir envíos
  const bmMap: Record<string, { plataforma: string; fuente: string; nombre: string }> = {
    BM1: { plataforma: "mooney", fuente: "crm", nombre: "DogzeePL" },
    BM2: { plataforma: "mooney", fuente: "crm", nombre: "BM2" },
    BM3: { plataforma: "mooney", fuente: "crm", nombre: "LosArmandoCereales" },
    BM4: { plataforma: "mooney", fuente: "crm", nombre: "BM4" },
    BM5: { plataforma: "mooney", fuente: "crm", nombre: "Fisioforma Bebedouro LTDA" },
  };

  const envios: EnvioTrazabilidad[] = [];
  const vistos = new Set<string>();
  let sinTel = 0;
  for (const r of envs) {
    const leadId = Number(r.lead_id);
    const bmId = r.bm;
    const cid = leadContacto.get(leadId);
    const tel = cid ? contactoTel.get(cid) : undefined;
    if (!tel) {
      sinTel++;
      continue;
    }
    const mid = buildMessageId(bmId, leadId);
    if (vistos.has(mid)) continue;
    vistos.add(mid);
    const bm = bmMap[bmId] ?? { plataforma: "mooney", fuente: "crm", nombre: bmId };
    const tsIso = tsArIso(r.timestamp);
    envios.push({
      fuente_envio: bm.fuente,
      plataforma: bm.plataforma,
      campaign_id_externo: bmId,
      campaign_nombre: bm.nombre,
      template_nombre: "",
      mensaje_enviado: "",
      telefono: tel,
      es_interno: bm.fuente === "crm",
      segmento: leadSegmento.get(leadId) ?? "",
      message_id: mid,
      ts_enviado: tsIso,
      ts_entregado: null,
      ts_leido: null,
      ts_primera_respuesta: null,
      estado_final: "sent",
      error_codigo: null,
      error_motivo: null,
      conversacion_id: String(leadId),
      costo: COSTO_POR_MENSAJE,
      moneda: MONEDA,
    });
  }

  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    TRAZABILIDAD_CSV_HEADER.join(","),
    ...envios.map((e) => envioToCsvRow(e, esc)),
  ].join("\n");
  writeFileSync(OUT, csv + "\n", "utf8");

  console.log("---");
  console.log(`envíos resueltos: ${envios.length}`);
  console.log(`sin teléfono (descartados): ${sinTel}`);
  console.log(`CSV escrito en: ${OUT}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
