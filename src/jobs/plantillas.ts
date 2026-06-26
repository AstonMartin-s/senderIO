import { and, eq, isNull, gte, isNotNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { logMovimientos } from "../db/schema.js";
import { getKommoClient } from "../kommo/index.js";
import { config } from "../config.js";

const INTERVALO_MS = 60_000; // cada minuto
const VENTANA_MIN = 60; // sólo envíos de la última hora
const MAX_POR_PASADA = 40; // tope de lecturas a Kommo por corrida

let timer: NodeJS.Timeout | null = null;
let corriendo = false;

/**
 * Completa, de forma diferida, la columna `plantilla` de cada envío
 * (`movido_a_envio`) leyendo del lead el campo que el Salesbot estampa con la
 * plantilla efectivamente enviada. Esto permite rotar plantillas en Kommo sin
 * hardcodear nada: el CSV refleja lo que realmente salió, fila por fila.
 *
 * Diferido porque el Salesbot escribe el campo DESPUÉS de que el worker mueve el
 * lead a "envío". Acotado por ventana temporal y un tope por pasada para no
 * generar volumen sobre Kommo (nunca toca Meta).
 */
export async function reconciliarPlantillas(): Promise<void> {
  const fieldId = config.kommo.cfPlantillaId;
  if (!fieldId) return; // sin campo configurado, no hacemos nada
  if (corriendo) return;
  corriendo = true;
  try {
    const desde = new Date(Date.now() - VENTANA_MIN * 60_000);
    const pendientes = await db
      .select({ id: logMovimientos.id, leadId: logMovimientos.leadId })
      .from(logMovimientos)
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
    const kommo = getKommoClient();
    let resueltos = 0;
    for (const row of pendientes) {
      if (row.leadId == null) continue;
      const plantilla = await kommo.getCampoLead(row.leadId, fieldId);
      if (!plantilla) continue; // todavía no estampado: reintenta en la próxima pasada
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
  if (!config.kommo.cfPlantillaId) {
    console.log("[plantillas] KOMMO_CF_PLANTILLA_ID no seteado: sweep apagado");
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
