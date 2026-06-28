/**
 * FASE 3 — Validación de clonarBot (pura, sin red).
 *
 * Carga el molde real (fixture de BM3), aplica sustituciones de prueba y verifica:
 *  - que clonarBot no lance (ningún ID viejo sobrevive),
 *  - que los IDs NUEVOS estén presentes en el output,
 *  - que los IDs VIEJOS ya no aparezcan.
 *
 *   npx tsx scripts/test-clonar-bot.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { clonarBot, MOLDE_BM3, type BotSustituciones } from "../src/kommo/salesbot.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const moldePath = join(__dirname, "../src/kommo/__fixtures__/bot-molde-bm3.json");
const molde = JSON.parse(readFileSync(moldePath, "utf8"));

// Sustituciones de prueba (pipeline ZZ_TEST_BM de la Fase 2 + valores ficticios).
const sub: BotSustituciones = {
  pipelineId: 14018839,
  stageSi: 108203991,
  stageNo: 108203995,
  stageError: 108203999,
  chatSourceId: 99999,
  templates: { 52524: 70001, 52528: 70002, 53712: 70003 },
  valorEstampado: "spnumero1a",
};

const { bot, reporte } = clonarBot(molde, sub);

console.log("Reporte de reemplazos:", JSON.stringify(reporte, null, 2));

const serial = JSON.stringify(bot);

const nuevos = [
  sub.pipelineId,
  sub.stageSi,
  sub.stageNo,
  sub.stageError,
  sub.chatSourceId,
  70001,
  70002,
  70003,
];
const viejos = [
  MOLDE_BM3.pipelineId,
  MOLDE_BM3.stageSi,
  MOLDE_BM3.stageNo,
  MOLDE_BM3.stageError,
  MOLDE_BM3.chatSourceId,
  ...MOLDE_BM3.templateIds,
];

const faltanNuevos = nuevos.filter((id) => !serial.includes(String(id)));
const quedanViejos = viejos.filter((id) =>
  new RegExp(`(?<![0-9])${id}(?![0-9])`).test(serial)
);

console.log("\nNuevos presentes:", faltanNuevos.length === 0 ? "OK ✓" : `FALTAN: ${faltanNuevos}`);
console.log("Viejos eliminados:", quedanViejos.length === 0 ? "OK ✓" : `SOBREVIVEN: ${quedanViejos}`);

console.log(
  "\ncustom_field 1227432 intacto:",
  serial.includes("1227432") ? "OK ✓ (debe seguir)" : "ERROR: se borró"
);
console.log(
  'valor estampado nuevo "spnumero1a":',
  serial.includes("spnumero1a") ? "OK ✓" : "ERROR"
);
console.log(
  'valor estampado viejo "spnumero3c":',
  serial.includes("spnumero3c") ? "ERROR: sobrevivió" : "OK ✓ (eliminado)"
);

if (faltanNuevos.length || quedanViejos.length) {
  console.error("\n✗ Validación FALLÓ");
  process.exit(1);
}
console.log("\n✓ clonarBot validado contra el molde real.");
