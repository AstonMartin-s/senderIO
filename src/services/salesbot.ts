import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { plantillas } from "../db/schema.js";
import { config } from "../config.js";
import { clonarBotRotacion } from "../kommo/salesbot-rotacion.js";
import { getBm } from "./bm.js";
import { asegurarValorEstampado } from "./plantillas.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOLDE_PATH = join(__dirname, "../kommo/__fixtures__/bot-rotacion.json");

/** Máximo de plantillas que el molde puede rotar (slots disponibles). */
export const MAX_RAMAS = 4;

export interface GenerarBotResultado {
  bot: unknown;
  kommoUrl: string;
  /** Cuántas plantillas activas no entraron por exceder los slots del molde. */
  descartadas: number;
  /** Plantillas (activas + aprobadas) que entraron en la rotación del bot. */
  plantillasUsadas: {
    nombre: string;
    kommoTemplateId: number;
    valorEstampado: string;
  }[];
}

/**
 * Genera el JSON del Salesbot CON ROTACIÓN para un BM, a partir del molde de
 * rotación (que ya trae el nodo de Condición). Deja una rama por plantilla
 * ACTIVA + APROBADA (hasta MAX_RAMAS). El worker estampa en PLANTILLA_ENVIADA
 * qué plantilla le toca a cada lead (round-robin) y el bot la rutea. El JSON se
 * importa a mano en Kommo.
 */
export async function generarBot(bmId: string): Promise<GenerarBotResultado> {
  const bm = await getBm(bmId);
  if (!bm) throw new Error("BM no existe");
  if (!bm.chatSourceId) {
    throw new Error("falta el chat_source id del BM (canal del bot)");
  }
  if (bm.stageSiId == null || bm.stageNoId == null) {
    throw new Error("el BM no tiene mapeadas las etapas SI/NO");
  }

  const filas = await db
    .select()
    .from(plantillas)
    .where(
      and(
        eq(plantillas.bmId, bmId),
        eq(plantillas.activo, true),
        eq(plantillas.estado, "approved")
      )
    )
    .orderBy(asc(plantillas.id));

  const activas = filas.filter((p) => p.kommoTemplateId != null);
  if (activas.length === 0) {
    throw new Error(
      "necesitás al menos una plantilla activa y aprobada (en Kommo) para generar el bot"
    );
  }

  // Asegurar valor estampado único por plantilla.
  const valores = new Map<number, string>(); // plantilla.id -> valor
  for (const p of activas) {
    valores.set(p.id, await asegurarValorEstampado(p));
  }

  const { bot, descartadas } = clonarBotRotacion(readFileSync(MOLDE_PATH, "utf8"), {
    pipelineId: bm.pipelineId,
    stageSi: bm.stageSiId,
    stageNo: bm.stageNoId,
    stageError: bm.stageErrorId,
    chatSourceId: bm.chatSourceId,
    cfId: config.kommo.cfPlantillaId ?? undefined,
    plantillas: activas.map((p) => ({
      templateId: p.kommoTemplateId!,
      valor: valores.get(p.id)!,
      botones: (p.botones ?? []) as { text: string }[],
      texto: p.contenido,
    })),
  });

  const kommoUrl = `https://${config.kommo.subdomain}.kommo.com/settings/widgets/`;

  return {
    bot,
    kommoUrl,
    descartadas,
    plantillasUsadas: activas.slice(0, MAX_RAMAS).map((p) => ({
      nombre: p.nombre,
      kommoTemplateId: p.kommoTemplateId!,
      valorEstampado: valores.get(p.id)!,
    })),
  };
}
