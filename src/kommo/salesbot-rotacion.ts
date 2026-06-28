/**
 * Clonación del Salesbot CON ROTACIÓN de plantillas — FUNCIÓN PURA, sin red.
 *
 * Parte del molde `bot-rotacion.json` (exportado de Kommo, ya trae un nodo de
 * Condición que rutea por el campo PLANTILLA_ENVIADA) y lo adapta a un BM:
 *   - sustituye pipeline, etapas SI/NO/ERROR y chat source,
 *   - deja UNA rama de envío por plantilla activa+aprobada (hasta 4),
 *   - arma el router (Condición) para que, según el valor estampado por el
 *     worker en PLANTILLA_ENVIADA, cada lead reciba la plantilla que le toca.
 *
 * El export guarda DOS grafos en paralelo dentro de `model`:
 *   - model.text      → lógica (steps con keys numéricas tipo "0","17"…)
 *   - model.positions → editor visual (nodos con `id` propio, distinto del step)
 * Hay que mantener AMBOS consistentes. Tras la rotación de la cuenta, el campo
 * personalizado PLANTILLA_ENVIADA es fijo (no cambia por BM).
 */

/** IDs fijos del molde de rotación (lo que se reemplaza por BM). */
export const MOLDE_ROT = {
  pipelineId: 13790083,
  stageSi: 106401863,
  stageNo: 106401915,
  stageError: 106401919,
  chatSourceId: 59026,
  cfId: 1227432,
} as const;

/**
 * Slots de envío disponibles en el molde. Orden = prioridad de asignación.
 * `block` = key en model.text; `node` = id en model.positions.
 */
const SLOTS: { block: string; node: number }[] = [
  { block: "17", node: 32 },
  { block: "14", node: 22 },
  { block: "13", node: 5 },
  { block: "16", node: 30 },
];

/** Targets fijos del flujo de respuesta (text step / positions node id). */
const TARGET = {
  si: { step: 1, node: 8 }, // rama "Sí" (reclama regalo)
  no: { step: 2, node: 9 }, // rama "No"
  error: { step: 7, node: 17 }, // cambio de etapa por error de envío
};

export interface PlantillaRama {
  templateId: number;
  valor: string;
  /** Botones del template (texto exacto para matchear la respuesta). */
  botones: { text: string }[];
  /** Cuerpo a mostrar en el editor (opcional, no afecta el envío real). */
  texto?: string | null;
}

export interface RotacionSustituciones {
  pipelineId: number;
  stageSi: number;
  stageNo: number;
  stageError: number;
  chatSourceId: number;
  cfId?: number;
  plantillas: PlantillaRama[];
}

export interface RotacionResultado {
  bot: unknown;
  ramas: { templateId: number; valor: string; slot: string }[];
  /** Plantillas que no entraron por exceder los slots del molde. */
  descartadas: number;
}

type Json = unknown;

function parseQuizas(v: Json): Json {
  return typeof v === "string" ? JSON.parse(v as string) : v;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/** Sustituye IDs fijos (pipeline / etapas / chat source) en profundidad. */
function sustituirFijos(node: Json, numMap: Map<number, number>): void {
  if (Array.isArray(node)) {
    for (const it of node) sustituirFijos(it, numMap);
    return;
  }
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, Json>;
  for (const [key, value] of Object.entries(obj)) {
    if (key === "pipeline_id" && typeof value === "number" && numMap.has(value)) {
      obj[key] = numMap.get(value)!;
    } else if (key === "value" && typeof value === "number" && numMap.has(value)) {
      // change_status: value numérico = id de etapa.
      obj[key] = numMap.get(value)!;
    } else if (key === "chat_sources" && Array.isArray(value)) {
      for (const cs of value) {
        const c = cs as { id?: number };
        if (c && typeof c.id === "number" && numMap.has(c.id)) {
          c.id = numMap.get(c.id)!;
        }
      }
      sustituirFijos(value, numMap);
    } else {
      sustituirFijos(value, numMap);
    }
  }
}

export function clonarBotRotacion(
  moldeRaw: Json,
  s: RotacionSustituciones
): RotacionResultado {
  const molde = parseQuizas(moldeRaw) as { model?: Record<string, Json> };
  if (!molde?.model) throw new Error("Molde inválido: falta 'model'");

  const bot = JSON.parse(JSON.stringify(molde)) as {
    model: Record<string, Json>;
  };
  const model = bot.model;
  const cfId = s.cfId ?? MOLDE_ROT.cfId;
  const customField = `{{lead.cf.${cfId}}}`;

  const usadas = s.plantillas.slice(0, SLOTS.length);
  const descartadas = Math.max(0, s.plantillas.length - usadas.length);
  if (usadas.length === 0) throw new Error("no hay plantillas para rotar");

  // --- Sustitución de IDs fijos en ambos grafos ---
  const numMap = new Map<number, number>([
    [MOLDE_ROT.pipelineId, s.pipelineId],
    [MOLDE_ROT.stageSi, s.stageSi],
    [MOLDE_ROT.stageNo, s.stageNo],
    [MOLDE_ROT.stageError, s.stageError],
    [MOLDE_ROT.chatSourceId, s.chatSourceId],
  ]);

  const text = parseQuizas(model.text) as Record<string, Json>;
  const positions = parseQuizas(model.positions) as Array<Record<string, Json>>;
  sustituirFijos(text, numMap);
  sustituirFijos(positions, numMap);

  const nodeById = new Map<number, Record<string, Json>>();
  for (const n of positions) nodeById.set(n.id as number, n);

  // --- Configurar cada slot usado como rama de envío de una plantilla ---
  usadas.forEach((p, i) => {
    const slot = SLOTS[i];
    const pos = botonPos(p);
    const neg = botonNeg(p);

    // model.text
    const block = text[slot.block] as {
      question: Array<Record<string, Json>>;
      answer?: Array<Record<string, Json>>;
    };
    const send = block.question.find(
      (h) => (h as { handler?: string }).handler === "send_message"
    ) as { params: Record<string, Json> };
    send.params.template_id = p.templateId;
    send.params.templateType = "waba";
    send.params.type = "external";
    send.params.recipient = { type: "all_contacts", way_of_communication: "over_all" };
    send.params.chat_sources = [{ id: s.chatSourceId }];
    send.params.is_in_starting_block = true;
    send.params.create_chat_if_not_exists = true;
    delete send.params.send_to_all_chat_sources;
    send.params.on_error = {
      handler: "goto",
      params: { step: TARGET.error.step, type: "question" },
    };
    block.answer = [
      {
        handler: "buttons",
        params: [
          { value: pos, params: [goto(TARGET.si.step)] },
          { value: neg, params: [goto(TARGET.no.step)] },
          { type: "else", params: [goto(TARGET.si.step)] },
        ],
      },
    ];

    // model.positions
    const node = nodeById.get(slot.node)!;
    const action = (node.actions as Array<Record<string, Json>>)[0];
    const aparams = (action.params as { params: Record<string, Json> }).params;
    aparams.template_id = p.templateId;
    aparams.templateType = "waba";
    aparams.type = "external";
    aparams.buttons = [
      { type: "inline", text: pos },
      { type: "inline", text: neg },
    ];
    aparams.chat_sources = [{ id: s.chatSourceId }];
    aparams.is_in_starting_block = true;
    aparams.create_chat_if_not_exists = true;
    delete aparams.send_to_all_chat_sources;
    if (p.texto) aparams.text = p.texto;
    action.links = [
      { data: { regex: `/${escapeRegex(pos)}/iu` }, block: TARGET.si.node },
      { data: { regex: `/${escapeRegex(neg)}/iu` }, block: TARGET.no.node },
    ];
    node.goto = { block: TARGET.si.node };
    node.on_error = { block: TARGET.error.node };
  });

  // --- Eliminar slots no usados (text + positions) ---
  const usadosNodes = new Set(usadas.map((_, i) => SLOTS[i].node));
  for (let i = usadas.length; i < SLOTS.length; i++) {
    delete text[SLOTS[i].block];
  }
  for (let j = positions.length - 1; j >= 0; j--) {
    const id = positions[j].id as number;
    const esSlot = SLOTS.some((sl) => sl.node === id);
    if (esSlot && !usadosNodes.has(id)) positions.splice(j, 1);
  }

  // --- Router (Condición) en ambos grafos ---
  // text: una condición por plantilla + goto fallback a la primera.
  const routerText = text["0"] as { question: Array<Json> };
  routerText.question = [
    ...usadas.map((p, i) => ({
      handler: "conditions",
      params: {
        logic: "and",
        conditions: [
          {
            term1: customField,
            term2: p.valor,
            operation: "=",
            value_type: "custom_value",
          },
        ],
        result: [goto(Number(SLOTS[i].block))],
      },
    })),
    goto(Number(SLOTS[0].block)), // fallback: primera plantilla
  ];

  // positions: nodo Condición (step 0) con un action por plantilla; el link
  // apunta al NODE del slot. El fallback lo resuelve el grafo `text`.
  const routerNode = positions.find((n) => n.step === 0)!;
  routerNode.actions = usadas.map((p, i) => ({
    id: 900000 + i,
    sort: 0,
    params: {
      handler: "conditions",
      params: {
        logic: "and",
        conditions: [
          {
            term1: customField,
            term2: p.valor,
            operation: "=",
            value_type: "custom_value",
          },
        ],
        result: [],
      },
    },
    links: [{ block: SLOTS[i].node }],
  }));

  model.text = JSON.stringify(text);
  model.positions = JSON.stringify(positions);

  return {
    bot,
    ramas: usadas.map((p, i) => ({
      templateId: p.templateId,
      valor: p.valor,
      slot: SLOTS[i].block,
    })),
    descartadas,
  };
}

function goto(step: number) {
  return { handler: "goto", params: { type: "question", step } };
}

function botonPos(p: PlantillaRama): string {
  return p.botones?.[0]?.text?.trim() || "Si quiero";
}

function botonNeg(p: PlantillaRama): string {
  return p.botones?.[1]?.text?.trim() || "No gracias";
}
