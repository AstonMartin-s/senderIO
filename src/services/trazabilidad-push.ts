import { and, asc, eq, gte } from "drizzle-orm";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { bmConfig, logMovimientos, plantillas, type BmConfig } from "../db/schema.js";
import { getBm } from "./bm.js";
import {
  aggregateGrupos,
  buildEnvioFromGrupo,
  buildPlantillaMap,
  resolvePlantilla,
  type EnvioTrazabilidad,
} from "./trazabilidad.js";

export type { EnvioTrazabilidad } from "./trazabilidad.js";
export { buildMessageId, buildEnvioFromGrupo } from "./trazabilidad.js";

async function postEnvios(envios: EnvioTrazabilidad[]): Promise<void> {
  const base = config.trazabilidad.apiUrl;
  if (!base || !config.trazabilidad.pushEnabled) return;

  const validos = envios.filter((e) => e.telefono && e.message_id);
  if (validos.length === 0) return;

  // No mandamos el cuerpo del mensaje: viaja solo `template_nombre` y el receptor
  // reconstruye el texto desde su catálogo de plantillas. Evita duplicar el
  // contenido en cada envío.
  const payload = validos.map(({ mensaje_enviado: _omit, ...resto }) => resto);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const key = config.trazabilidad.ingestApiKey;
  if (key) headers.Authorization = `Bearer ${key}`;

  const res = await fetch(`${base.replace(/\/$/, "")}/api/v1/spam/envios`, {
    method: "POST",
    headers,
    body: JSON.stringify({ origen: "senderio", envios: payload }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[trazabilidad-push] error", res.status, text);
    throw new Error(`Trazabilidad push failed: ${res.status}`);
  }
}

/** Push inmediato tras movido_a_envio (sin re-leer DB). */
export async function pushEnvioFromTick(
  bm: BmConfig,
  leadId: number,
  tsEnviado: Date,
  telefono: string,
  segmento: string | null,
  plantilla: string | null,
  templateNombre: string | null,
  mensajeEnviado: string | null
): Promise<void> {
  const g = {
    bmId: bm.id,
    leadId,
    tsEnviado,
    telefono,
    segmento,
    plantilla,
    templateNombre,
    mensajeEnviado,
    resultado: null as "si" | "no" | "error" | null,
    tsResultado: null,
  };
  const pl =
    templateNombre && mensajeEnviado
      ? { nombre: templateNombre, contenido: mensajeEnviado }
      : null;
  await pushEnvio(buildEnvioFromGrupo(g, bm, pl));
}

/** Push de un envío (fire-and-forget desde worker/webhook). */
export async function pushEnvio(envio: EnvioTrazabilidad): Promise<void> {
  await postEnvios([envio]);
}

// --- Catálogo de plantillas (template_nombre -> contenido) ---------------------
// El programa de trazabilidad reconstruye el texto de cada envío buscando por
// (template_nombre, plataforma) en su catálogo. Le mandamos ese catálogo cuando
// una plantilla se crea/edita/aprueba, y en un sync inicial.

export type PlantillaCatalogo = {
  template_nombre: string;
  plataforma: string;
  contenido: string;
};

async function postPlantillas(items: PlantillaCatalogo[]): Promise<void> {
  const base = config.trazabilidad.apiUrl;
  if (!base || !config.trazabilidad.pushEnabled) return;

  const validos = items.filter((p) => p.template_nombre && p.contenido);
  if (validos.length === 0) return;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = config.trazabilidad.ingestApiKey;
  if (key) headers.Authorization = `Bearer ${key}`;

  const url = `${base.replace(/\/$/, "")}/api/v1/spam/plantillas`;
  for (const item of validos) {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(item),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("[trazabilidad-push] plantilla error", res.status, text);
      throw new Error(`Trazabilidad plantilla push failed: ${res.status}`);
    }
  }
}

function buildPlantillaCatalogo(
  p: { nombre: string; contenido: string | null },
  bm: BmConfig | undefined
): PlantillaCatalogo {
  return {
    template_nombre: p.nombre,
    plataforma: bm?.plataforma ?? "mooney",
    contenido: p.contenido ?? "",
  };
}

/** Push del catálogo de una sola plantilla (resuelve plataforma desde su BM). */
export async function pushPlantillaCatalogo(p: {
  bmId: string;
  nombre: string;
  contenido: string | null;
}): Promise<void> {
  if (!config.trazabilidad.pushEnabled || !config.trazabilidad.apiUrl) return;
  const bm = await getBm(p.bmId);
  await postPlantillas([buildPlantillaCatalogo(p, bm)]);
}

/** Sincroniza TODO el catálogo de plantillas con contenido. Devuelve cuántas mandó. */
export async function syncPlantillasCatalogo(): Promise<number> {
  if (!config.trazabilidad.pushEnabled || !config.trazabilidad.apiUrl) return 0;

  const [plts, bms] = await Promise.all([
    db.select().from(plantillas),
    db.select().from(bmConfig),
  ]);
  const bmById = new Map(bms.map((b) => [b.id, b]));

  const items = plts
    .filter((p) => p.contenido)
    .map((p) => buildPlantillaCatalogo(p, bmById.get(p.bmId)));

  if (items.length === 0) return 0;

  const BATCH = 50;
  for (let i = 0; i < items.length; i += BATCH) {
    await postPlantillas(items.slice(i, i + BATCH));
  }
  return items.length;
}

/** Wrapper no bloqueante para el hot path del panel. */
export function pushPlantillaAsync(p: {
  bmId: string;
  nombre: string;
  contenido: string | null;
}): void {
  if (!config.trazabilidad.pushEnabled || !config.trazabilidad.apiUrl) return;
  pushPlantillaCatalogo(p).catch((e) =>
    console.error(`[trazabilidad-push] plantilla ${p.bmId}/${p.nombre}:`, e)
  );
}

/** Reconstruye el envío desde el log y lo pushea (tras SI/NO/ERROR). */
export async function pushEnvioForBmLead(
  bmId: string,
  leadId: number
): Promise<void> {
  if (!config.trazabilidad.pushEnabled || !config.trazabilidad.apiUrl) return;

  const [bm, rows, plts] = await Promise.all([
    getBm(bmId),
    db
      .select()
      .from(logMovimientos)
      .where(
        and(
          eq(logMovimientos.bmId, bmId),
          eq(logMovimientos.leadId, leadId)
        )
      )
      .orderBy(asc(logMovimientos.ts)),
    db.select().from(plantillas).where(eq(plantillas.bmId, bmId)),
  ]);
  if (!bm) return;

  const g = aggregateGrupos(rows).get(`${bmId}::${leadId}`);
  if (!g?.tsEnviado || !g.telefono) return;

  const plBy = buildPlantillaMap(plts);
  const pl = resolvePlantilla(g, plBy);
  await pushEnvio(buildEnvioFromGrupo(g, bm, pl));
}

/** Sincroniza envíos recientes (recuperación si falló el push en caliente). */
export async function syncEnviosRecientes(horas = 24): Promise<number> {
  if (!config.trazabilidad.pushEnabled || !config.trazabilidad.apiUrl) return 0;

  const desde = new Date(Date.now() - horas * 3_600_000);
  const [rows, bms, plts] = await Promise.all([
    db
      .select()
      .from(logMovimientos)
      .where(gte(logMovimientos.ts, desde))
      .orderBy(asc(logMovimientos.ts)),
    db.select().from(bmConfig),
    db.select().from(plantillas),
  ]);

  const bmById = new Map(bms.map((b) => [b.id, b]));
  const plBy = buildPlantillaMap(plts);
  const grupos = aggregateGrupos(rows);

  const envios: EnvioTrazabilidad[] = [];
  for (const g of grupos.values()) {
    if (!g.tsEnviado || !g.telefono) continue;
    const bm = bmById.get(g.bmId);
    if (!bm) continue;
    const pl = resolvePlantilla(g, plBy);
    envios.push(buildEnvioFromGrupo(g, bm, pl));
  }

  if (envios.length === 0) return 0;

  // Lotes de 50 para no saturar el receptor.
  const BATCH = 50;
  for (let i = 0; i < envios.length; i += BATCH) {
    await postEnvios(envios.slice(i, i + BATCH));
  }
  return envios.length;
}

/** Wrapper no bloqueante para llamadas desde el hot path. */
export function pushEnvioAsync(
  fn: () => Promise<void>,
  ctx: string
): void {
  if (!config.trazabilidad.pushEnabled || !config.trazabilidad.apiUrl) return;
  fn().catch((e) => console.error(`[trazabilidad-push] ${ctx}:`, e));
}
