/**
 * Verifica el bot de ROTACIÓN: clona el molde con N plantillas y confirma que
 *   - el router (Condición) tiene una rama por plantilla + fallback,
 *   - cada rama envía su template_id y matchea sus botones,
 *   - no sobreviven IDs del molde (pipeline/etapas/chat source),
 *   - text y positions quedan consistentes (ramas usadas presentes en ambos).
 *
 *   npx tsx scripts/test-generar-bot.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { clonarBotRotacion, MOLDE_ROT } from "../src/kommo/salesbot-rotacion.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOLDE = join(__dirname, "../src/kommo/__fixtures__/bot-rotacion.json");

function run(n: number): boolean {
  const plantillas = Array.from({ length: n }, (_, i) => ({
    templateId: 90000 + i,
    valor: `tpl_${i + 1}`,
    botones: [{ text: `Quiero ${i + 1}` }, { text: `No ${i + 1}` }],
    texto: `cuerpo ${i + 1}`,
  }));

  const sub = {
    pipelineId: 700,
    stageSi: 701,
    stageNo: 702,
    stageError: 703,
    chatSourceId: 704,
    cfId: 1227432,
    plantillas,
  };

  const { bot, ramas, descartadas } = clonarBotRotacion(readFileSync(MOLDE, "utf8"), sub);
  const model = (bot as { model: { text: string; positions: string } }).model;
  const text = JSON.parse(model.text) as Record<string, { question?: unknown[] }>;
  const positions = JSON.parse(model.positions) as Array<{ id: number; step: number }>;

  let ok = true;
  const fail = (m: string) => {
    ok = false;
    console.log(`  ✗ ${m}`);
  };

  const usadas = Math.min(n, 4);
  if (ramas.length !== usadas) fail(`ramas=${ramas.length} esperado ${usadas}`);
  if (descartadas !== Math.max(0, n - 4)) fail(`descartadas=${descartadas}`);

  // Router: condiciones (n usadas) + 1 fallback.
  const router = text["0"].question as Array<{ handler: string; params?: { conditions?: { term2: string }[] } }>;
  const conds = router.filter((h) => h.handler === "conditions");
  const fallbacks = router.filter((h) => h.handler === "goto");
  if (conds.length !== usadas) fail(`router conditions=${conds.length} esperado ${usadas}`);
  if (fallbacks.length !== 1) fail(`router fallback=${fallbacks.length} esperado 1`);
  for (let i = 0; i < usadas; i++) {
    if (conds[i].params?.conditions?.[0].term2 !== `tpl_${i + 1}`)
      fail(`condición ${i} term2 incorrecto`);
  }

  // Cada rama: template_id + botones correctos + on_error.
  for (let i = 0; i < usadas; i++) {
    const slot = ["17", "14", "13", "16"][i];
    const block = text[slot] as {
      question: Array<{ handler: string; params?: Record<string, unknown> }>;
      answer?: Array<{ params?: Array<{ value?: string }> }>;
    };
    if (!block) {
      fail(`falta block ${slot}`);
      continue;
    }
    const send = block.question.find((h) => h.handler === "send_message");
    if ((send?.params?.template_id as number) !== 90000 + i)
      fail(`block ${slot} template_id`);
    if (!send?.params?.on_error) fail(`block ${slot} sin on_error`);
    const btns = block.answer?.[0].params;
    if (btns?.[0].value !== `Quiero ${i + 1}` || btns?.[1].value !== `No ${i + 1}`)
      fail(`block ${slot} botones`);
  }

  // Slots no usados: ausentes en text y positions.
  const slotNodes: Record<string, number> = { "17": 32, "14": 22, "13": 5, "16": 30 };
  ["17", "14", "13", "16"].forEach((slot, i) => {
    const presenteText = !!text[slot];
    const presentePos = positions.some((p) => p.id === slotNodes[slot]);
    const debe = i < usadas;
    if (presenteText !== debe) fail(`text block ${slot} presencia=${presenteText} esperado ${debe}`);
    if (presentePos !== debe) fail(`pos node ${slotNodes[slot]} presencia=${presentePos} esperado ${debe}`);
  });

  // No sobreviven IDs del molde.
  const serial = model.text + "\u0000" + model.positions;
  for (const id of [MOLDE_ROT.pipelineId, MOLDE_ROT.stageSi, MOLDE_ROT.stageNo, MOLDE_ROT.stageError, MOLDE_ROT.chatSourceId]) {
    if (new RegExp(`(?<![0-9])${id}(?![0-9])`).test(serial)) fail(`sobrevive id molde ${id}`);
  }

  console.log(`N=${n} (usadas ${usadas}): ${ok ? "OK" : "FALLÓ"}`);
  return ok;
}

const todo = [1, 2, 3, 4, 5].map(run).every(Boolean);
console.log(todo ? "\n✓ TODO OK" : "\n✗ HAY PROBLEMAS");
process.exit(todo ? 0 : 1);
