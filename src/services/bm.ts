import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { bmConfig, type BmConfig, type NewBmConfig } from "../db/schema.js";
import { getKommoClient } from "../kommo/index.js";
import type { NewStageInput } from "../kommo/types.js";

// Etapas estándar de un BM, con colores de la paleta válida de Kommo.
const STAGES_BM: NewStageInput[] = [
  { name: "BASE DE DATOS", color: "#d6eaff" },
  { name: "ENVIO DE PLANTILLA", color: "#fffeb2" },
  { name: "SI", color: "#deff81" },
  { name: "NO", color: "#ffc8c8" },
  { name: "ERROR", color: "#f3beff" },
];

export async function getAllBms(clientId?: string): Promise<BmConfig[]> {
  if (!clientId) return db.select().from(bmConfig);
  return db.select().from(bmConfig).where(eq(bmConfig.clientId, clientId));
}

export async function getActiveBms(): Promise<BmConfig[]> {
  return db.select().from(bmConfig).where(eq(bmConfig.activo, true));
}

export async function getBm(id: string): Promise<BmConfig | undefined> {
  const rows = await db.select().from(bmConfig).where(eq(bmConfig.id, id));
  return rows[0];
}

export async function createBm(values: NewBmConfig): Promise<BmConfig> {
  const rows = await db.insert(bmConfig).values(values).returning();
  return rows[0];
}

export async function patchBm(
  id: string,
  patch: Partial<NewBmConfig>
): Promise<BmConfig | undefined> {
  const rows = await db
    .update(bmConfig)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(bmConfig.id, id))
    .returning();
  return rows[0];
}

export async function deleteBm(id: string): Promise<void> {
  await db.delete(bmConfig).where(eq(bmConfig.id, id));
}

/** Marca el próximo tick persistido (para recuperar estado tras reinicio). */
export async function setProximoTick(id: string, at: Date): Promise<void> {
  await db
    .update(bmConfig)
    .set({ proximoTickAt: at, updatedAt: new Date() })
    .where(eq(bmConfig.id, id));
}

/** Busca el BM por pipeline_id (para mapear webhooks entrantes). */
export async function getBmByPipeline(
  pipelineId: number
): Promise<BmConfig | undefined> {
  const rows = await db
    .select()
    .from(bmConfig)
    .where(eq(bmConfig.pipelineId, pipelineId));
  return rows[0];
}

/** Prefijo de id por cliente para no chocar PKs globales (logs/plantillas). */
function prefijoIdBm(clientId: string): { re: RegExp; prefix: string } {
  if (clientId === "king") return { re: /^KING-BM(\d+)$/i, prefix: "KING-BM" };
  return { re: /^BM(\d+)$/i, prefix: "BM" };
}

/** Genera el próximo id disponible dentro del cliente. */
export async function siguienteIdBm(clientId = "mooney"): Promise<string> {
  const { re, prefix } = prefijoIdBm(clientId);
  const rows = await db
    .select({ id: bmConfig.id })
    .from(bmConfig)
    .where(eq(bmConfig.clientId, clientId));
  let max = 0;
  for (const r of rows) {
    const m = re.exec(r.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${max + 1}`;
}

export interface AltaAutomaticaInput {
  nombre: string;
  wabaId?: string | null;
  chatSourceId?: number | null;
  /** Si se pasa, usa ese id; si no, se genera el próximo id del cliente. */
  id?: string;
  clientId?: string;
}

/**
 * Alta automática de BM: crea el pipeline + las 5 etapas en Kommo (API v4) y
 * arma el registro bm_config con los IDs reales. El origen de leads es la etapa
 * BASE del pipeline recién creado. El resto (ritmo/ventana/límite) queda con los
 * defaults del schema, editables después. Idempotente a nivel pipeline: si ya
 * existe uno con ese nombre, Kommo lo reutiliza.
 */
export async function altaAutomatica(
  input: AltaAutomaticaInput
): Promise<BmConfig> {
  const clientId = input.clientId?.trim() || "mooney";
  const id = input.id?.trim() || (await siguienteIdBm(clientId));
  const existente = await getBm(id);
  if (existente) throw new Error(`ya existe un BM con id ${id}`);

  const kommo = getKommoClient(clientId);
  const pipeline = await kommo.createPipeline({
    name: input.nombre,
    stages: STAGES_BM,
  });

  const byName = (n: string) =>
    pipeline.stages.find((s) => s.name.toUpperCase() === n)?.id ?? null;
  const base = byName("BASE DE DATOS");
  const envio = byName("ENVIO DE PLANTILLA");
  const error = byName("ERROR");
  if (!base || !envio || !error) {
    throw new Error("Kommo no devolvió las etapas esperadas del pipeline");
  }

  return createBm({
    id,
    clientId,
    nombre: input.nombre,
    pipelineId: pipeline.id,
    stageOrigenId: base, // base propia del pipeline nuevo
    stageOrigenPipelineId: null, // misma pipeline
    stageDestinoId: envio,
    stageErrorId: error,
    stageSiId: byName("SI"),
    stageNoId: byName("NO"),
    wabaId: input.wabaId || null,
    chatSourceId: input.chatSourceId ?? null,
  });
}

export { and };
