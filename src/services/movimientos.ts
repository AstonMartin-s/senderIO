import { db } from "../db/client.js";
import { logMovimientos } from "../db/schema.js";

export type Accion =
  | "movido_a_envio"
  | "resultado_si"
  | "resultado_no"
  | "resultado_error"
  | "pausa_bm";

export type Resultado = "ok" | "error_3132" | "sin_leads" | null;

export async function registrarMovimiento(params: {
  bmId: string;
  leadId?: number | null;
  accion: Accion;
  resultado?: Resultado;
  etapaDestino?: number | null;
}): Promise<void> {
  await db.insert(logMovimientos).values({
    bmId: params.bmId,
    leadId: params.leadId ?? null,
    accion: params.accion,
    resultado: params.resultado ?? null,
    etapaDestino: params.etapaDestino ?? null,
  });
}
