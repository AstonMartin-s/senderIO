/**
 * FASE 2 — Validación de createPipeline + findCustomFieldByName (API v4 oficial).
 *
 * Crea un pipeline de prueba "ZZ_TEST_BM" con las 5 etapas en el orden esperado
 * (BASE → ENVIO → SI → NO → ERROR) e imprime los IDs reales que asignó Kommo.
 * También confirma que PLANTILLA_ENVIADA se encuentra por nombre.
 *
 *   npx tsx scripts/test-create-pipeline.ts
 *
 * Usa el RealKommoClient directamente (independiente de KOMMO_MODE). El pipeline
 * queda creado en Kommo: BORRARLO A MANO desde la interfaz tras confirmar.
 * Idempotente: si "ZZ_TEST_BM" ya existe, lo devuelve en vez de duplicar.
 */
import { config } from "../src/config.js";
import { RealKommoClient } from "../src/kommo/real.js";
import type { NewStageInput } from "../src/kommo/types.js";

// Colores de la paleta VÁLIDA de Kommo para statuses (no cualquier hex sirve).
const STAGES: NewStageInput[] = [
  { name: "BASE DE DATOS", color: "#d6eaff" },
  { name: "ENVIO DE PLANTILLA", color: "#fffeb2" },
  { name: "SI", color: "#deff81" },
  { name: "NO", color: "#ffc8c8" },
  { name: "ERROR", color: "#f3beff" },
];

async function main() {
  if (!config.kommo.subdomain || !config.kommo.token) {
    console.error("Falta KOMMO_SUBDOMAIN o KOMMO_TOKEN en .env. Abortando.");
    process.exit(1);
  }
  const kommo = new RealKommoClient(config.kommo.subdomain, config.kommo.token);

  console.log("→ Buscando campo PLANTILLA_ENVIADA por nombre...");
  const cf = await kommo.findCustomFieldByName("PLANTILLA_ENVIADA");
  console.log(`  PLANTILLA_ENVIADA: ${cf ? `id ${cf.id}` : "NO encontrado"}`);

  console.log('\n→ Creando pipeline "ZZ_TEST_BM" con 5 etapas...');
  const pipeline = await kommo.createPipeline({
    name: "ZZ_TEST_BM",
    stages: STAGES,
  });

  console.log(`\n✓ Pipeline: "${pipeline.name}" (id ${pipeline.id})`);
  console.log("  Etapas (en el orden devuelto por Kommo):");
  for (const s of pipeline.stages) {
    console.log(`   - ${String(s.id).padEnd(10)} ${s.name}`);
  }

  // Resumen mapeable a bm_config (sólo las 5 que nos importan).
  const byName = (n: string) =>
    pipeline.stages.find((s) => s.name.toUpperCase() === n)?.id ?? null;
  console.log("\n  Mapeo esperado para bm_config:");
  console.log(
    JSON.stringify(
      {
        pipelineId: pipeline.id,
        stageOrigenId: byName("BASE DE DATOS"),
        stageDestinoId: byName("ENVIO DE PLANTILLA"),
        stageSiId: byName("SI"),
        stageNoId: byName("NO"),
        stageErrorId: byName("ERROR"),
      },
      null,
      2
    )
  );
  console.log(
    "\n⚠ Recordá BORRAR el pipeline ZZ_TEST_BM desde la interfaz de Kommo."
  );
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
