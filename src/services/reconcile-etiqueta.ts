import { getAllBms } from "./bm.js";
import { getKommoClient } from "../kommo/index.js";
import {
  clienteDeSegmento,
  getClientesEtiqueta,
} from "./clientes-etiqueta.js";
import { isClientId } from "../config.js";

/**
 * Reconciliación EN VIVO contra el tablero de Kommo. Solo lectura: NO toca
 * log_movimientos. Cuenta los leads que están hoy en las etapas de cada BM y
 * los reparte por cliente-etiqueta según la primera tag del lead. Sirve para
 * reflejar movimientos manuales (pruebas) que no pasan por el worker/webhook.
 *
 *  enviados = leads que llegaron a envío = ENVIO ∪ SI ∪ NO ∪ ERROR
 *  si/no/error = leads actualmente en esa etapa
 */
export interface ReconcileEtiqueta {
  id: string;
  nombre: string;
  enviados: number;
  si: number;
  no: number;
  error: number;
  pctError: number;
  pctSi: number;
  pipelines: number; // BMs consultados
}

export async function reconcileClienteEtiqueta(
  clienteId: string,
  { maxPorEtapa = 500 }: { maxPorEtapa?: number } = {}
): Promise<ReconcileEtiqueta> {
  const clientes = await getClientesEtiqueta();
  const cli = clientes.find((c) => c.id === clienteId);
  if (!cli) throw new Error(`cliente-etiqueta desconocido: ${clienteId}`);

  const bms = await getAllBms();
  let enviados = 0;
  let si = 0;
  let no = 0;
  let error = 0;
  let consultados = 0;

  for (const bm of bms) {
    // El cliente de Kommo depende del tenant dueño del BM.
    if (!isClientId(bm.clientId)) continue;
    const kommo = getKommoClient(bm.clientId);
    const pid = bm.pipelineId;
    const etapas: Array<{ statusId: number | null; tipo: "envio" | "si" | "no" | "error" }> = [
      { statusId: bm.stageDestinoId, tipo: "envio" },
      { statusId: bm.stageSiId ?? null, tipo: "si" },
      { statusId: bm.stageNoId ?? null, tipo: "no" },
      { statusId: bm.stageErrorId, tipo: "error" },
    ];
    let tocoBm = false;
    for (const e of etapas) {
      if (e.statusId == null) continue;
      let leads: Array<{ id: number; tag: string | null }> = [];
      try {
        leads = await kommo.listStageLeadsWithTag(pid, e.statusId, maxPorEtapa);
      } catch (err) {
        console.error(`[reconcile] ${bm.id} etapa ${e.tipo} falló:`, err);
        continue;
      }
      for (const l of leads) {
        if (clienteDeSegmento(l.tag, clientes) !== clienteId) continue;
        tocoBm = true;
        // Cualquier etapa desde envío cuenta como "enviado".
        enviados++;
        if (e.tipo === "si") si++;
        else if (e.tipo === "no") no++;
        else if (e.tipo === "error") error++;
      }
    }
    if (tocoBm) consultados++;
  }

  const base = si + no + error;
  return {
    id: cli.id,
    nombre: cli.nombre,
    enviados,
    si,
    no,
    error,
    pctError: base ? Math.round((error / base) * 10000) / 100 : 0,
    pctSi: enviados ? Math.round((si / enviados) * 10000) / 100 : 0,
    pipelines: consultados,
  };
}
