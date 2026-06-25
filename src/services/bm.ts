import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { bmConfig, type BmConfig, type NewBmConfig } from "../db/schema.js";

export async function getAllBms(): Promise<BmConfig[]> {
  return db.select().from(bmConfig);
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

export { and };
