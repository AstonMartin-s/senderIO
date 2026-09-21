import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { logMovimientos } from "../db/schema.js";

export type Accion =
  | "movido_a_envio"
  | "resultado_si"
  | "resultado_no"
  | "resultado_error"
  | "pausa_bm"
  | "sin_leads";

export type Resultado = "ok" | "error_3132" | "sin_leads" | null;

export async function registrarMovimiento(params: {
  bmId: string;
  leadId?: number | null;
  accion: Accion;
  resultado?: Resultado;
  etapaDestino?: number | null;
  telefono?: string | null;
  segmento?: string | null;
  plantilla?: string | null;
  templateNombre?: string | null;
  // Aceptado por compatibilidad pero NO se persiste: el cuerpo de la plantilla es
  // el mismo para todos los envíos de un valorEstampado, así que se reconstruye en
  // el export desde la tabla `plantillas` (ver resolvePlantilla). Guardarlo por
  // fila inflaba log_movimientos sin aportar información nueva.
  mensajeEnviado?: string | null;
}): Promise<void> {
  await db.insert(logMovimientos).values({
    bmId: params.bmId,
    leadId: params.leadId ?? null,
    accion: params.accion,
    resultado: params.resultado ?? null,
    etapaDestino: params.etapaDestino ?? null,
    telefono: params.telefono ?? null,
    segmento: params.segmento ?? null,
    plantilla: params.plantilla ?? null,
    templateNombre: params.templateNombre ?? null,
  });
}

/** Etiqueta de Kommo guardada al enviar ese lead (para SI/NO/ERROR). */
export async function segmentoDeLead(
  bmId: string,
  leadId: number
): Promise<string | null> {
  const rows = await db
    .select({ segmento: logMovimientos.segmento })
    .from(logMovimientos)
    .where(
      and(
        eq(logMovimientos.bmId, bmId),
        eq(logMovimientos.leadId, leadId),
        eq(logMovimientos.accion, "movido_a_envio")
      )
    )
    .orderBy(desc(logMovimientos.ts))
    .limit(1);
  return rows[0]?.segmento ?? null;
}
