import { and, eq, isNull, gte, isNotNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { bmConfig, logMovimientos } from "../db/schema.js";
import { getKommoClient } from "../kommo/index.js";
import { config, kommoFor } from "../config.js";

const INTERVALO_MS = 60_000; // cada minuto
const VENTANA_MIN = 60; // sólo envíos de la última hora
const MAX_POR_PASADA = 40; // tope de lecturas a Kommo por corrida

let timer: NodeJS.Timeout | null = null;
let corriendo = false;

/**
 * Completa, de forma diferida, la columna `plantilla` de cada envío
 * (`movido_a_envio`) leyendo del lead el campo que el Salesbot estampa.
 * Usa la cuenta Kommo del cliente dueño del BM.
 */
export async function reconciliarPlantillas(): Promise<void> {
  if (corriendo) return;
  corriendo = true;
  try {
    const desde = new Date(Date.now() - VENTANA_MIN * 60_000);
    const pendientes = await db
      .select({
        id: logMovimientos.id,
        leadId: logMovimientos.leadId,
        clientId: bmConfig.clientId,
      })
      .from(logMovimientos)
      .leftJoin(bmConfig, eq(logMovimientos.bmId, bmConfig.id))
      .where(
        and(
          eq(logMovimientos.accion, "movido_a_envio"),
          isNull(logMovimientos.plantilla),
          isNotNull(logMovimientos.leadId),
          gte(logMovimientos.ts, desde)
        )
      )
      .limit(MAX_POR_PASADA);

    if (pendientes.length === 0) return;
    let resueltos = 0;
    for (const row of pendientes) {
      if (row.leadId == null) continue;
      const clientId = row.clientId ?? "mooney";
      const fieldId = kommoFor(clientId).cfPlantillaId;
      if (!fieldId) continue;
      const plantilla = await getKommoClient(clientId).getCampoLead(
        row.leadId,
        fieldId
      );
      if (!plantilla) continue;
      await db
        .update(logMovimientos)
        .set({ plantilla })
        .where(eq(logMovimientos.id, row.id));
      resueltos++;
    }
    if (resueltos > 0) {
      console.log(
        `[plantillas] reconciliadas ${resueltos}/${pendientes.length} envíos`
      );
    }
  } catch (err) {
    console.error("[plantillas] error en reconciliación:", err);
  } finally {
    corriendo = false;
  }
}

export function startPlantillasJob(): void {
  const alguno = Object.values(config.kommo.byClient).some(
    (c) => c.cfPlantillaId != null
  );
  if (!alguno) {
    console.log("[plantillas] ningún CF_PLANTILLA_ID seteado: sweep apagado");
    return;
  }
  if (timer) return;
  timer = setInterval(() => {
    reconciliarPlantillas().catch((err) =>
      console.error("[plantillas] error:", err)
    );
  }, INTERVALO_MS);
  console.log(`[plantillas] sweep cada ${INTERVALO_MS / 1000}s`);
}

export function stopPlantillasJob(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
