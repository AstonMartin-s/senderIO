/**
 * Capta de Kommo (API v4 real) los datos para dar de alta los BMs conectados:
 *   - pipelines + etapas (pipeline_id, stage ids),
 *   - plantillas WABA con su WABA id, estado y botones.
 *
 * El chat_source id (canal de WhatsApp) NO se obtiene por v4 (vive en amoJo),
 * así que se marca como manual.
 *
 *   npx tsx scripts/captar-bms.ts
 */
import "dotenv/config";
import { RealKommoClient } from "../src/kommo/real.js";

const subdomain = process.env.KOMMO_SUBDOMAIN!;
const token = process.env.KOMMO_TOKEN!;
if (!subdomain || !token) {
  console.error("Faltan KOMMO_SUBDOMAIN / KOMMO_TOKEN en el .env");
  process.exit(1);
}

const kommo = new RealKommoClient(subdomain, token);

function tabla(rows: Record<string, string | number>[]): void {
  if (rows.length === 0) {
    console.log("  (vacío)");
    return;
  }
  // @ts-expect-error console.table existe en Node
  console.table(rows);
}

async function main() {
  console.log(`\n=== Cuenta: ${subdomain}.kommo.com ===\n`);

  // --- Pipelines + etapas ---
  console.log("### PIPELINES Y ETAPAS ###");
  const pipelines = await kommo.listPipelines();
  for (const p of pipelines) {
    console.log(`\nPipeline: ${p.name} (id ${p.id})`);
    tabla(p.stages.map((s) => ({ etapa: s.name, stage_id: s.id })));
  }

  // --- Plantillas WABA ---
  console.log("\n\n### PLANTILLAS WABA (por WABA id) ###");
  const templates = await kommo.listTemplates(true);
  const porWaba = new Map<string, typeof templates>();
  for (const t of templates) {
    const ids = t.wabaIds.length ? t.wabaIds : ["(sin waba id)"];
    for (const w of ids) {
      if (!porWaba.has(w)) porWaba.set(w, []);
      porWaba.get(w)!.push(t);
    }
  }
  for (const [waba, tpls] of porWaba) {
    console.log(`\nWABA id: ${waba}`);
    tabla(
      tpls.map((t) => ({
        plantilla: t.name,
        template_id: t.id,
        estado: t.reviewStatus ?? "-",
        categoria: t.category ?? "-",
        idioma: t.language ?? "-",
        botones: (t.buttons ?? []).map((b) => b.text).join(" | ") || "-",
      }))
    );
  }

  console.log(
    "\n\nNOTA: el chat_source id (canal de WhatsApp) se carga a mano por BM " +
      "(no es accesible vía API v4). Se copia una vez desde el número conectado en Kommo."
  );
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
