/**
 * Clonación de Salesbots (Fase 3) — FUNCIÓN PURA, sin red.
 *
 * Toma el JSON exportado del bot molde (BM3) y sustituye TODOS los IDs que varían
 * por BM, devolviendo un JSON nuevo listo para IMPORTAR A MANO en Kommo
 * (Decisión 2: no se crea el bot por API interna).
 *
 * Aislado a propósito en este módulo: si Kommo cambia el formato del export, se
 * toca solo acá.
 *
 * Garantía central: tras clonar, NINGÚN ID viejo del molde sobrevive. Si alguno
 * queda, `clonarBot` lanza error (no devuelve un bot a medio sustituir).
 *
 * Estructura del export (dos blobs JSON stringificados dentro de `model`):
 *   - model.text      → grafo lógico (steps/handlers)
 *   - model.positions → layout visual (duplica params, incluye los mismos IDs)
 * Los IDs aparecen en AMBOS, así que sustituimos en los dos.
 */

/** IDs del molde de BM3 (lo que hay que reemplazar). */
export const MOLDE_BM3 = {
  pipelineId: 13790083,
  stageSi: 106401863,
  stageNo: 106401915,
  stageError: 106401919,
  chatSourceId: 59026,
  templateIds: [52524, 52528, 53712] as number[],
  valorEstampado: "spnumero3c",
  /** Campo personalizado PLANTILLA_ENVIADA: NO cambia entre BMs. */
  customField: "{{lead.cf.1227432}}",
} as const;

export interface BotSustituciones {
  pipelineId: number;
  stageSi: number;
  stageNo: number;
  stageError: number;
  chatSourceId: number;
  /**
   * Mapeo template viejo → nuevo. Debe cubrir TODOS los template_id del molde
   * (52524, 52528, 53712); si falta alguno, ese ID viejo sobrevive y clonarBot
   * falla. Para un BM con una sola plantilla, mapear los tres al mismo id nuevo.
   */
  templates: Record<number, number>;
  valorEstampado: string;
}

export interface ClonarReporte {
  reemplazos: {
    pipeline: number;
    etapas: number;
    chatSource: number;
    template: number;
    valorEstampado: number;
  };
  idsSobrantes: number[];
}

export interface ClonarResultado {
  /** Bot clonado, mismo formato que el export (listo para importar). */
  bot: unknown;
  reporte: ClonarReporte;
}

type Json = unknown;

function parseQuizas(v: Json): Json {
  return typeof v === "string" ? JSON.parse(v) : v;
}

/**
 * Sustituye en profundidad los IDs conocidos. Trabaja por clave + contexto para
 * no pisar números ajenos (coordenadas, steps, etc.).
 */
function sustituir(
  node: Json,
  numMap: Map<number, number>,
  valorEstampado: { from: string; to: string },
  counts: ClonarReporte["reemplazos"]
): void {
  if (Array.isArray(node)) {
    for (const item of node) sustituir(item, numMap, valorEstampado, counts);
    return;
  }
  if (!node || typeof node !== "object") return;

  const obj = node as Record<string, Json>;
  for (const [key, value] of Object.entries(obj)) {
    if (key === "pipeline_id" && typeof value === "number" && numMap.has(value)) {
      obj[key] = numMap.get(value)!;
      counts.pipeline++;
    } else if (
      key === "template_id" &&
      typeof value === "number" &&
      numMap.has(value)
    ) {
      obj[key] = numMap.get(value)!;
      counts.template++;
    } else if (
      key === "value" &&
      typeof value === "number" &&
      numMap.has(value)
    ) {
      // value numérico aparece en change_status (id de etapa).
      obj[key] = numMap.get(value)!;
      counts.etapas++;
    } else if (
      key === "value" &&
      typeof value === "string" &&
      value === valorEstampado.from
    ) {
      // value string aparece en set_custom_fields (valor estampado).
      obj[key] = valorEstampado.to;
      counts.valorEstampado++;
    } else if (key === "chat_sources" && Array.isArray(value)) {
      for (const cs of value) {
        if (
          cs &&
          typeof cs === "object" &&
          typeof (cs as { id?: unknown }).id === "number" &&
          numMap.has((cs as { id: number }).id)
        ) {
          const c = cs as { id: number };
          c.id = numMap.get(c.id)!;
          counts.chatSource++;
        }
      }
    } else {
      sustituir(value, numMap, valorEstampado, counts);
    }
  }
}

/** Busca un id numérico como token aislado dentro de un string JSON. */
function tokenPresente(serializado: string, id: number): boolean {
  return new RegExp(`(?<![0-9])${id}(?![0-9])`).test(serializado);
}

export function clonarBot(
  moldeRaw: Json,
  s: BotSustituciones
): ClonarResultado {
  const molde = parseQuizas(moldeRaw) as { model?: Record<string, Json> };
  if (!molde?.model) {
    throw new Error("Molde inválido: falta 'model'");
  }

  // Deep-clone para no mutar el original.
  const bot = JSON.parse(JSON.stringify(molde)) as {
    model: Record<string, Json>;
  };
  const model = bot.model;

  // Mapa numérico viejo → nuevo.
  const numMap = new Map<number, number>([
    [MOLDE_BM3.pipelineId, s.pipelineId],
    [MOLDE_BM3.stageSi, s.stageSi],
    [MOLDE_BM3.stageNo, s.stageNo],
    [MOLDE_BM3.stageError, s.stageError],
    [MOLDE_BM3.chatSourceId, s.chatSourceId],
  ]);
  for (const oldId of MOLDE_BM3.templateIds) {
    const nuevo = s.templates[oldId];
    if (nuevo != null) numMap.set(oldId, nuevo);
  }

  const counts: ClonarReporte["reemplazos"] = {
    pipeline: 0,
    etapas: 0,
    chatSource: 0,
    template: 0,
    valorEstampado: 0,
  };
  const valor = { from: MOLDE_BM3.valorEstampado, to: s.valorEstampado };

  // Sustituir en los dos blobs internos (text y positions).
  const textObj = parseQuizas(model.text);
  const posObj = parseQuizas(model.positions);
  sustituir(textObj, numMap, valor, counts);
  sustituir(posObj, numMap, valor, counts);
  model.text = JSON.stringify(textObj);
  model.positions = JSON.stringify(posObj);

  // Pasada de seguridad: ningún ID viejo (numérico) debe sobrevivir.
  const serializado = `${model.text}\u0000${model.positions}`;
  const viejos = [
    MOLDE_BM3.pipelineId,
    MOLDE_BM3.stageSi,
    MOLDE_BM3.stageNo,
    MOLDE_BM3.stageError,
    MOLDE_BM3.chatSourceId,
    ...MOLDE_BM3.templateIds,
  ];
  const idsSobrantes = viejos.filter((id) => {
    if (numMap.get(id) === id) return false; // mapeado a sí mismo a propósito
    return tokenPresente(serializado, id); // sigue presente → no se reemplazó
  });

  const reporte: ClonarReporte = { reemplazos: counts, idsSobrantes };

  if (idsSobrantes.length > 0) {
    throw new Error(
      `clonarBot: sobrevivieron IDs viejos del molde: ${idsSobrantes.join(
        ", "
      )}. Revisá el mapeo (¿faltó algún template_id?).`
    );
  }
  // El valor estampado viejo tampoco debe sobrevivir.
  if (tokenPresente(serializado, 1227432)) {
    // El custom_field 1227432 SÍ debe seguir (es fijo): no lo tocamos. OK.
  }
  if (serializado.includes(MOLDE_BM3.valorEstampado) && s.valorEstampado !== MOLDE_BM3.valorEstampado) {
    throw new Error(
      `clonarBot: sobrevivió el valor estampado viejo "${MOLDE_BM3.valorEstampado}".`
    );
  }

  return { bot, reporte };
}
