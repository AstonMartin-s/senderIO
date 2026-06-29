import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  plantillas,
  bmConfig,
  type Plantilla,
  type NewPlantilla,
} from "../db/schema.js";
import { getKommoClient } from "../kommo/index.js";

export async function getPlantillas(bmId?: string): Promise<Plantilla[]> {
  const q = db.select().from(plantillas);
  const rows = bmId
    ? await q.where(eq(plantillas.bmId, bmId)).orderBy(asc(plantillas.id))
    : await q.orderBy(asc(plantillas.id));
  return rows;
}

export async function getPlantilla(id: number): Promise<Plantilla | undefined> {
  const rows = await db.select().from(plantillas).where(eq(plantillas.id, id));
  return rows[0];
}

/** Slug estable para el valor que el bot estampa (PLANTILLA_ENVIADA). */
export function slugPlantilla(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 32) || "pl"
  );
}

export async function createPlantilla(
  values: NewPlantilla
): Promise<Plantilla> {
  const rows = await db.insert(plantillas).values(values).returning();
  const row = rows[0];
  // Cada plantilla necesita un valor estampado ÚNICO para poder identificar en el
  // CSV cuál se envió (rotación). Si no vino, lo derivamos del nombre + id.
  if (!row.valorEstampado) {
    const valor = `${slugPlantilla(row.nombre)}_${row.id}`;
    const upd = await patchPlantilla(row.id, { valorEstampado: valor });
    return upd ?? { ...row, valorEstampado: valor };
  }
  return row;
}

/** Asegura que la plantilla tenga valorEstampado; lo genera y persiste si falta. */
export async function asegurarValorEstampado(
  p: Plantilla
): Promise<string> {
  if (p.valorEstampado) return p.valorEstampado;
  const valor = `${slugPlantilla(p.nombre)}_${p.id}`;
  await patchPlantilla(p.id, { valorEstampado: valor });
  return valor;
}

export async function patchPlantilla(
  id: number,
  patch: Partial<NewPlantilla>
): Promise<Plantilla | undefined> {
  const rows = await db
    .update(plantillas)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(plantillas.id, id))
    .returning();
  return rows[0];
}

export async function deletePlantilla(id: number): Promise<void> {
  await db.delete(plantillas).where(eq(plantillas.id, id));
}

/** Cuenta cuántas plantillas activas tiene un BM (para la rotación). */
/**
 * Plantillas que participan de la rotación de un BM: ON (activo) + aprobadas +
 * con valorEstampado, ordenadas por id (orden estable de rotación). El worker
 * recorre esta lista en round-robin y el bot rutea según el valor estampado.
 */
export async function getRotacion(bmId: string): Promise<Plantilla[]> {
  const rows = await db
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
  return rows.filter((p) => !!p.valorEstampado);
}

export async function contarActivas(bmId: string): Promise<number> {
  const rows = await db
    .select({ id: plantillas.id })
    .from(plantillas)
    .where(and(eq(plantillas.bmId, bmId), eq(plantillas.activo, true)));
  return rows.length;
}

/**
 * Crea la plantilla en Kommo y la manda a moderación de Meta. Actualiza el
 * registro local con el kommoTemplateId y el estado devuelto. El wabaId se toma
 * de la plantilla o, si falta, del BM.
 */
export async function crearEnKommo(id: number): Promise<Plantilla> {
  const p = await getPlantilla(id);
  if (!p) throw new Error("plantilla no existe");
  if (p.kommoTemplateId) {
    throw new Error("la plantilla ya fue creada en Kommo");
  }

  let wabaId = p.wabaId;
  if (!wabaId) {
    const bm = (
      await db.select().from(bmConfig).where(eq(bmConfig.id, p.bmId))
    )[0];
    wabaId = bm?.wabaId ?? null;
  }
  if (!wabaId) {
    throw new Error(
      "falta wabaId (en la plantilla o en el BM) para crear en Kommo"
    );
  }

  const kommo = getKommoClient();
  const creada = await kommo.createTemplate({
    name: p.nombre,
    content: p.contenido,
    wabaIds: [wabaId],
    category: p.categoria,
    language: p.idioma,
    buttons: p.botones,
    header: p.header,
    footer: p.footer,
  });

  // Kommo, ante un WABA id que no reconoce para este número, crea igual la
  // plantilla pero la deja con waba_selected_waba_ids vacío: queda en "Borrador"
  // y NUNCA llega a Meta. Detectamos eso y cortamos con un error claro en vez de
  // reportar un falso "En revisión".
  if (!creada.wabaIds || creada.wabaIds.length === 0) {
    // La API pública de Kommo NO permite asignar el WABA al crear plantillas
    // (ignora waba_selected_waba_ids y la deja no editable), así que nunca llega
    // a Meta. El camino soportado es crearla en la UI de Kommo (eligiendo la
    // cuenta) y después importarla a SenderIO.
    const msg =
      "Kommo no permite asignar el WABA al crear plantillas por API: queda en Borrador y no llega a Meta. " +
      "Creá la plantilla en Kommo (seleccionando la cuenta de WhatsApp) y después usá “Importar de Kommo”.";
    // Intentamos borrar el borrador huérfano que dejó Kommo para no ensuciar.
    try {
      await kommo.deleteTemplate?.(creada.id);
    } catch {
      /* best-effort */
    }
    throw new Error(msg);
  }

  const review = await kommo.submitTemplateForReview(creada.id);

  const actualizada = await patchPlantilla(id, {
    kommoTemplateId: creada.id,
    wabaId,
    estado: normalizarEstado(review.status),
    rejectReason: review.rejectReason ?? null,
  });
  return actualizada!;
}

/**
 * Relee el estado de moderación desde Kommo/Meta y lo persiste. Útil para el
 * botón manual "chequear estado" del panel. Requiere que la plantilla ya exista
 * en Kommo (kommoTemplateId no nulo).
 */
export async function chequearEstado(id: number): Promise<Plantilla> {
  const p = await getPlantilla(id);
  if (!p) throw new Error("plantilla no existe");
  if (!p.kommoTemplateId) {
    throw new Error("la plantilla todavía no fue creada en Kommo");
  }
  const kommo = getKommoClient();
  const review = await kommo.getTemplateReview(p.kommoTemplateId);
  let estado = normalizarEstado(review.status);
  // Kommo no siempre expone el estado de moderación por API (llega "unknown" →
  // "borrador"). En ese caso NO degradamos una plantilla que ya estaba aprobada
  // o en revisión: mantenemos el estado previo para no perder la info.
  if (estado === "borrador" && (p.estado === "approved" || p.estado === "review")) {
    estado = p.estado;
  }
  const actualizada = await patchPlantilla(id, {
    estado,
    rejectReason: review.rejectReason ?? (estado === "rejected" ? p.rejectReason : null),
  });
  return actualizada!;
}

export interface ImportResultado {
  importadas: number;
  salteadas: number; // ya estaban (mismo kommoTemplateId)
  sinBm: number; // plantilla cuyo WABA no matchea ningún BM conectado
}

/**
 * Precarga: trae las plantillas WABA existentes en Kommo y las alinea a los BM
 * por WABA id (cada BM tiene su `wabaId`). Idempotente: saltea las que ya están
 * importadas (mismo kommoTemplateId). Las que no matchean ningún BM se cuentan
 * aparte (hay que cargar el WABA id en el BM primero).
 */
export async function importarDesdeKommo(): Promise<ImportResultado> {
  const kommo = getKommoClient();
  const [tmpls, bms, existentes] = await Promise.all([
    kommo.listTemplates(true),
    db.select().from(bmConfig),
    db.select({ kommoTemplateId: plantillas.kommoTemplateId }).from(plantillas),
  ]);

  const yaImportadas = new Set(
    existentes.map((e) => e.kommoTemplateId).filter((x): x is number => x != null)
  );
  const bmByWaba = new Map<string, string>();
  for (const b of bms) if (b.wabaId) bmByWaba.set(String(b.wabaId), b.id);

  let importadas = 0;
  let salteadas = 0;
  let sinBm = 0;

  for (const t of tmpls) {
    if (t.id && yaImportadas.has(t.id)) {
      salteadas++;
      continue;
    }
    const bmId = t.wabaIds
      .map((w) => bmByWaba.get(String(w)))
      .find((x): x is string => !!x);
    if (!bmId) {
      sinBm++;
      continue;
    }
    await createPlantilla({
      bmId,
      nombre: t.name,
      kommoTemplateId: t.id,
      wabaId: t.wabaIds[0] ?? null,
      categoria: t.category ?? "MARKETING",
      idioma: t.language ?? "es",
      contenido: t.content ?? "",
      botones: t.buttons.map((b) => ({ text: b.text, type: b.type })),
      // Entran OFF: el usuario decide cuáles activar (importante porque BM ya
      // operativos no deben cambiar de comportamiento solo por importar).
      activo: false,
      estado: normalizarEstado(t.reviewStatus ?? "approved"),
    });
    importadas++;
  }

  return { importadas, salteadas, sinBm };
}

/** Mapea el status crudo de Kommo a nuestros estados internos. */
function normalizarEstado(status: string): string {
  const s = (status || "").toLowerCase();
  if (s === "approved") return "approved";
  if (s === "rejected") return "rejected";
  if (s === "paused") return "paused";
  if (s === "review" || s === "pending" || s === "on_review") return "review";
  // Kommo no expone review_status por API en algunos planes: ahí llega "unknown".
  // No lo tratamos como "en revisión" (era un falso positivo); lo dejamos como
  // borrador para no engañar al panel ni habilitar el envío.
  if (s === "draft" || s === "unknown" || s === "") return "borrador";
  return s;
}
