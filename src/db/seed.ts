import { db, pool } from "./client.js";
import { bmConfig, type NewBmConfig } from "./schema.js";

/**
 * Seed con los BM reales de la planilla `estado_bm`.
 * Nota: BM1/BM3/BM4/BM5 comparten stage_origen = 106401855 (base general única).
 * stage_si / stage_no de BM3 se derivaron del SalesBot SPNumero3 (pipeline 13790083):
 *   "Si quiero" -> 106401863, "No gracias" -> 106401915.
 * Los stage_si/stage_no de BM1, BM2, BM4 y BM5 se completaron desde GET /leads/pipelines.
 */
const seeds: NewBmConfig[] = [
  {
    id: "BM1",
    nombre: "BM1",
    pipelineId: 13334059,
    stageOrigenId: 106401855,
    stageOrigenPipelineId: 13790083, // base general vive en el pipeline de SP3
    stageDestinoId: 102835891,
    stageErrorId: 102836183,
    stageSiId: 102835895,
    stageNoId: 105635847,
    activo: false,
    limiteDiario: 99,
  },
  {
    id: "BM2",
    nombre: "BM2",
    pipelineId: 13757935,
    stageOrigenId: 106149911,
    stageDestinoId: 106149915,
    stageErrorId: 106149979,
    stageSiId: 106149919,
    stageNoId: 106149975,
    activo: false,
    limiteDiario: 30,
  },
  {
    id: "BM3",
    nombre: "BM3",
    pipelineId: 13790083,
    stageOrigenId: 106401855,
    stageDestinoId: 106401859,
    stageErrorId: 106401919,
    stageSiId: 106401863,
    stageNoId: 106401915,
    activo: true,
    limiteDiario: 65,
  },
  {
    id: "BM4",
    nombre: "BM4",
    pipelineId: 13837663,
    stageOrigenId: 106401855,
    stageOrigenPipelineId: 13790083,
    stageDestinoId: 106773755,
    stageErrorId: 106773767,
    stageSiId: 106773759,
    stageNoId: 106773763,
    activo: false,
    limiteDiario: 25,
  },
  {
    id: "BM5",
    nombre: "BM5",
    pipelineId: 13837691,
    stageOrigenId: 106401855,
    stageOrigenPipelineId: 13790083,
    stageDestinoId: 106773899,
    stageErrorId: 106773911,
    stageSiId: 106773903,
    stageNoId: 106773907,
    activo: false,
    limiteDiario: 25,
  },
];

async function main() {
  console.log("[seed] insertando BMs...");
  for (const s of seeds) {
    await db
      .insert(bmConfig)
      .values(s)
      .onConflictDoUpdate({
        target: bmConfig.id,
        set: {
          nombre: s.nombre,
          pipelineId: s.pipelineId,
          stageOrigenId: s.stageOrigenId,
          stageOrigenPipelineId: s.stageOrigenPipelineId ?? null,
          stageDestinoId: s.stageDestinoId,
          stageErrorId: s.stageErrorId,
          stageSiId: s.stageSiId ?? null,
          stageNoId: s.stageNoId ?? null,
          limiteDiario: s.limiteDiario,
          updatedAt: new Date(),
        },
      });
    console.log(`[seed]  - ${s.id} ok`);
  }
  console.log("[seed] listo.");
  await pool.end();
}

main().catch((err) => {
  console.error("[seed] error:", err);
  process.exit(1);
});
