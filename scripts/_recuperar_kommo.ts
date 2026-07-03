/**
 * Recuperación del histórico de envíos desde Kommo (independiente del CSV).
 *
 * Barre los eventos `lead_status_changed` en un rango de fechas y detecta cada
 * vez que un lead entró a una etapa de ENVÍO de los embudos spam (BM1-BM4 +
 * Fisioforma). Dedup por lead (primer envío). Luego resuelve teléfono + segmento
 * (tag ListaN) y emite un CSV en el contrato v2 de Trazabilidad.
 *
 * Uso:
 *   npx tsx scripts/_recuperar_kommo.ts [YYYY-MM-DD_desde] [YYYY-MM-DD_hasta] [salida.csv]
 */
import { writeFileSync } from "node:fs";
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

const DESDE = process.argv[2] ?? "2026-05-15";
const HASTA = process.argv[3] ?? "2026-06-27";
const OUT =
  process.argv[4] ??
  `${process.env.HOME}/Downloads/recuperado_kommo_2026-07-03.csv`;

const FROM = Math.floor(new Date(DESDE + "T00:00:00-03:00").getTime() / 1000);
const TO = Math.floor(new Date(HASTA + "T23:59:59-03:00").getTime() / 1000);

const SUB = config.kommo.subdomain || process.env.KOMMO_SUBDOMAIN || "";
const TOK = process.env.KOMMO_TOKEN ?? config.kommo.token ?? "";
if (!SUB || !TOK) throw new Error("Faltan KOMMO_SUBDOMAIN / KOMMO_TOKEN");
const BASE = `https://${SUB}.kommo.com/api/v4`;

// Etapa de ENVÍO por embudo -> BM.
const SEND_STAGE_TO_BM: Record<number, string> = {
  // SPAM NUMERO #1 (13334059)
  102835891: "BM1", // Ejecucion PlanTilla 1
  105698987: "BM1", // Ejecucion PlanTilla 2
  // SPAM NUMERO #2 (13757935)
  106149915: "BM2", // Ejecucion Plantilla 1
  // Spam Numero 3 (13790083)
  106401859: "BM3", // Envio de plantilla SPnumero3
  106521459: "BM3", // Spnumero2
  // Spam Numero 4 (13837663)
  106773755: "BM4", // Ejecucion Plantilla 1
  // Fisioforma Bebedouro LTDA (14024727)
  108248935: "BM5", // ENVIO DE PLANTILLA
};

// Etapa de RESULTADO por embudo -> tipo de respuesta.
const RESULT_STAGE: Record<number, "si" | "no" | "error"> = {
  // SPAM NUMERO #1 (13334059)
  102835895: "si", // Si
  105635847: "no", // No
  105635851: "no", // Solicita BAJA (respondió → opt-out)
  102836183: "error", // error
  // SPAM NUMERO #2 (13757935)
  106149919: "si",
  106149975: "no",
  106149979: "error",
  // Spam Numero 3 (13790083)
  106401863: "si",
  106401915: "no",
  106401919: "error",
  // Spam Numero 4 (13837663)
  106773759: "si",
  106773763: "no",
  106773767: "error",
  // Fisioforma (14024727)
  108248939: "si",
  108248943: "no",
  108248947: "error",
};

const BM_META: Record<string, { plataforma: string; fuente: string; nombre: string }> = {
  BM1: { plataforma: "mooney", fuente: "crm", nombre: "SPAM NUMERO #1" },
  BM2: { plataforma: "mooney", fuente: "crm", nombre: "SPAM NUMERO #2" },
  BM3: { plataforma: "mooney", fuente: "crm", nombre: "Spam Numero 3" },
  BM4: { plataforma: "mooney", fuente: "crm", nombre: "Spam Numero 4" },
  BM5: { plataforma: "mooney", fuente: "crm", nombre: "Fisioforma Bebedouro LTDA" },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function kommoGet(path: string): Promise<any> {
  for (let i = 0; i < 8; i++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        headers: { Authorization: `Bearer ${TOK}` },
      });
      if (res.status === 429 || res.status >= 500) {
        await sleep(1500 * (i + 1));
        continue;
      }
      if (res.status === 204) return null;
      if (!res.ok) throw new Error(`Kommo ${res.status} en ${path}`);
      return res.json();
    } catch (err: any) {
      // Errores de red transitorios (socket cerrado, etc.): reintentar.
      if (err?.message?.includes("Kommo ")) throw err;
      console.warn(`  red falló (${err?.cause?.code ?? err?.message}), reintento ${i + 1}`);
      await sleep(1500 * (i + 1));
    }
  }
  throw new Error(`Kommo agotó reintentos en ${path}`);
}

function chunk<T>(a: T[], n: number): T[][] {
  const o: T[][] = [];
  for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n));
  return o;
}

function tsArIso(unixSec: number): string {
  const shifted = new Date((unixSec - 3 * 3600) * 1000);
  return `${shifted.toISOString().slice(0, 19)}-03:00`;
}

async function main() {
  console.log(`Barriendo eventos ${DESDE} -> ${HASTA} ...`);

  // 1) Recolectar envíos (lead -> {bm, tsEnviado más temprano}).
  const envioLead = new Map<
    number,
    { bm: string; ts: number }
  >();
  // Resultado por lead (primera respuesta si/no/error).
  const resLead = new Map<
    number,
    { res: "si" | "no" | "error"; ts: number }
  >();
  let page = 1;
  let totalEventos = 0;
  for (;;) {
    const path =
      `/events?filter%5Btype%5D=lead_status_changed` +
      `&filter%5Bcreated_at%5D%5Bfrom%5D=${FROM}&filter%5Bcreated_at%5D%5Bto%5D=${TO}` +
      `&order%5Bcreated_at%5D=asc&limit=100&page=${page}`;
    const data = await kommoGet(path);
    const ev: any[] = data?._embedded?.events ?? [];
    if (ev.length === 0) break;
    totalEventos += ev.length;
    for (const e of ev) {
      const after = e.value_after?.[0]?.lead_status;
      const stage = after?.id;
      if (!stage) continue;
      const leadId = Number(e.entity_id);
      const ts = Number(e.created_at);
      const bm = SEND_STAGE_TO_BM[stage];
      if (bm) {
        const prev = envioLead.get(leadId);
        if (!prev || ts < prev.ts) envioLead.set(leadId, { bm, ts });
        continue;
      }
      const res = RESULT_STAGE[stage];
      if (res) {
        const prev = resLead.get(leadId);
        if (!prev || ts < prev.ts) resLead.set(leadId, { res, ts });
      }
    }
    if (page % 20 === 0)
      console.log(`  pág ${page} | eventos ${totalEventos} | envíos ${envioLead.size}`);
    if (!data?._links?.next) break;
    page++;
    await sleep(120);
  }
  const resStats: Record<string, number> = {};
  for (const { res } of resLead.values()) resStats[res] = (resStats[res] ?? 0) + 1;
  console.log(
    `Eventos escaneados: ${totalEventos} | envíos: ${envioLead.size} | resultados:`,
    resStats
  );

  const porBm: Record<string, number> = {};
  for (const { bm } of envioLead.values()) porBm[bm] = (porBm[bm] ?? 0) + 1;
  console.log("Por BM:", porBm);

  // 2) lead -> contacto + segmento
  const leadIds = [...envioLead.keys()];
  const leadContacto = new Map<number, number>();
  const leadSegmento = new Map<number, string>();
  const contactoIds = new Set<number>();
  let borrados = 0;
  for (const g of chunk(leadIds, 250)) {
    const q = g.map((id) => `filter[id][]=${id}`).join("&");
    const data = await kommoGet(`/leads?${q}&with=contacts&limit=250`);
    const leads: any[] = data?._embedded?.leads ?? [];
    const vistos = new Set<number>();
    for (const l of leads) {
      vistos.add(l.id);
      const main =
        (l._embedded?.contacts ?? []).find((c: any) => c.is_main) ??
        l._embedded?.contacts?.[0];
      if (main) {
        leadContacto.set(l.id, main.id);
        contactoIds.add(main.id);
      }
      const tag = (l._embedded?.tags ?? []).find((t: any) =>
        /^lista\s*\d+/i.test(t.name)
      );
      if (tag) leadSegmento.set(l.id, tag.name);
    }
    for (const id of g) if (!vistos.has(id)) borrados++;
    await sleep(200);
  }
  console.log(`Con contacto: ${leadContacto.size} | borrados: ${borrados}`);

  // 3) contacto -> teléfono
  const contactoTel = new Map<number, string>();
  for (const g of chunk([...contactoIds], 250)) {
    const q = g.map((id) => `filter[id][]=${id}`).join("&");
    const data = await kommoGet(`/contacts?${q}&limit=250`);
    for (const c of data?._embedded?.contacts ?? []) {
      const f = (c.custom_fields_values ?? []).find(
        (x: any) => x.field_code === "PHONE"
      );
      const tel = normalizePhoneE164(f?.values?.[0]?.value);
      if (tel) contactoTel.set(c.id, tel);
    }
    await sleep(200);
  }
  console.log(`Con teléfono: ${contactoTel.size}`);

  // 4) Construir CSV v2
  const envios: EnvioTrazabilidad[] = [];
  let sinTel = 0;
  for (const [leadId, { bm, ts }] of envioLead) {
    const cid = leadContacto.get(leadId);
    const tel = cid ? contactoTel.get(cid) : undefined;
    if (!tel) {
      sinTel++;
      continue;
    }
    const meta = BM_META[bm];
    const r = resLead.get(leadId);
    const fallo = r?.res === "error";
    const interactuo = r?.res === "si" || r?.res === "no";
    envios.push({
      fuente_envio: meta.fuente,
      plataforma: meta.plataforma,
      campaign_id_externo: bm,
      campaign_nombre: meta.nombre,
      template_nombre: "",
      mensaje_enviado: "",
      telefono: tel,
      es_interno: meta.fuente === "crm",
      segmento: leadSegmento.get(leadId) ?? "",
      message_id: buildMessageId(bm, leadId),
      ts_enviado: tsArIso(ts),
      ts_entregado: null,
      ts_leido: interactuo && r ? tsArIso(r.ts) : null,
      ts_primera_respuesta: interactuo && r ? tsArIso(r.ts) : null,
      estado_final: fallo ? "failed" : "sent",
      error_codigo: fallo ? "3132" : null,
      error_motivo: fallo ? "Error de envío (3132)" : null,
      conversacion_id: String(leadId),
      costo: fallo ? null : COSTO_POR_MENSAJE,
      moneda: fallo ? null : MONEDA,
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
  console.log(`Envíos con teléfono (CSV): ${envios.length} | sin teléfono: ${sinTel}`);
  console.log(`CSV: ${OUT}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
