import { getBm, getActiveBms, patchBm, setProximoTick } from "../services/bm.js";
import { registrarMovimiento } from "../services/movimientos.js";
import { getRotacion } from "../services/plantillas.js";
import {
  pushEnvioAsync,
  pushEnvioFromTick,
} from "../services/trazabilidad-push.js";
import { config } from "../config.js";
import { getKommoClient } from "../kommo/index.js";
import {
  dentroDeVentana,
  intervaloAleatorioSeg,
  todayLocal,
} from "../lib/time.js";
import type { BmConfig } from "../db/schema.js";

const timers = new Map<string, NodeJS.Timeout>();
/** Leads tomados por algún BM en este proceso (lock simple para origen compartido). */
const enVuelo = new Set<number>();

function programar(bmId: string, enSegundos: number) {
  const prev = timers.get(bmId);
  if (prev) clearTimeout(prev);
  const t = setTimeout(() => {
    tick(bmId).catch((err) => console.error(`[worker:${bmId}] error:`, err));
  }, Math.max(1, enSegundos) * 1000);
  timers.set(bmId, t);
}

async function programarProximoNormal(bm: BmConfig) {
  const seg = intervaloAleatorioSeg(bm.intervaloMinSeg, bm.intervaloMaxSeg);
  await setProximoTick(bm.id, new Date(Date.now() + seg * 1000));
  programar(bm.id, seg);
}

async function tick(bmId: string) {
  const bm = await getBm(bmId);
  if (!bm || !bm.activo) {
    timers.delete(bmId);
    console.log(`[worker:${bmId}] inactivo, reloj detenido`);
    return;
  }

  // Pausa dura (racha de errores): re-chequear en 60s por si lo reactivan.
  if (bm.pausado) {
    programar(bmId, 60);
    return;
  }

  // Pausa corta por error aislado.
  if (bm.pausadoHasta && bm.pausadoHasta.getTime() > Date.now()) {
    const seg = Math.ceil((bm.pausadoHasta.getTime() - Date.now()) / 1000);
    programar(bmId, seg);
    return;
  }

  // Fuera de ventana horaria: re-chequear en 60s.
  if (!dentroDeVentana(bm.ventanaInicio, bm.ventanaFin)) {
    programar(bmId, 60);
    return;
  }

  // Límite diario alcanzado: re-chequear en 5 min.
  if (bm.enviadosHoy >= bm.limiteDiario) {
    programar(bmId, 300);
    return;
  }

  const kommo = getKommoClient();
  // La etapa de origen puede vivir en otro pipeline (base general compartida).
  const origenPipeline = bm.stageOrigenPipelineId ?? bm.pipelineId;
  const lead = await kommo.getFirstLeadInStage(origenPipeline, bm.stageOrigenId);

  if (!lead) {
    // Sin leads: no consume límite, reintenta en el próximo ciclo.
    // Encendemos el flag (y lo logueamos) solo en la transición, para alertar
    // en el panel sin spamear la bitácora en cada tick vacío.
    if (!bm.sinLeads) {
      await patchBm(bm.id, { sinLeads: true, sinLeadsDesde: new Date() });
      await registrarMovimiento({
        bmId: bm.id,
        accion: "sin_leads",
        resultado: "sin_leads",
      });
      console.log(`[worker:${bm.id}] sin leads en la etapa de origen`);
    }
    await programarProximoNormal(bm);
    return;
  }

  // Había leads: si veníamos marcados como "sin leads", apagamos el flag.
  if (bm.sinLeads) {
    await patchBm(bm.id, { sinLeads: false, sinLeadsDesde: null });
    bm.sinLeads = false;
  }

  // Lock simple para origen compartido entre BMs.
  if (enVuelo.has(lead.id)) {
    programar(bmId, 5);
    return;
  }
  enVuelo.add(lead.id);

  try {
    // Capturamos teléfono + segmento (datos de trazabilidad) antes de mover.
    // Best-effort: si falla, seguimos el envío igual con null.
    const meta = await kommo
      .getLeadMeta(lead.id)
      .catch(() => ({ telefono: null, segmento: null }));

    // Rotación de plantillas (round-robin): elegimos qué plantilla le toca a este
    // lead y la estampamos en PLANTILLA_ENVIADA ANTES de mover, así el bot la lee
    // y rutea al envío correcto. Con 1 sola plantilla ON, siempre esa; con varias,
    // va de una en una. Si no hay campo configurado o plantillas en rotación, el
    // bot usa su comportamiento por defecto.
    let plantillaValor: string | null = null;
    let templateNombre: string | null = null;
    let mensajeEnviado: string | null = null;
    let avanzarRotacion = false;
    const cfId = config.kommo.cfPlantillaId;
    if (cfId) {
      const rotacion = await getRotacion(bm.id);
      if (rotacion.length > 0) {
        const elegida = rotacion[bm.rotacionIdx % rotacion.length];
        plantillaValor = elegida.valorEstampado;
        templateNombre = elegida.nombre;
        mensajeEnviado = elegida.contenido;
        avanzarRotacion = true;
        await kommo
          .setCampoLead(lead.id, cfId, plantillaValor!)
          .catch((err) =>
            console.error(`[worker:${bm.id}] no se pudo estampar plantilla:`, err)
          );
      }
    }

    await kommo.moveLead(lead.id, bm.pipelineId, bm.stageDestinoId);
    const tsEnviado = new Date();
    await registrarMovimiento({
      bmId: bm.id,
      leadId: lead.id,
      accion: "movido_a_envio",
      resultado: "ok",
      etapaDestino: bm.stageDestinoId,
      telefono: meta.telefono,
      segmento: meta.segmento,
      plantilla: plantillaValor,
      templateNombre,
      mensajeEnviado,
    });
    if (meta.telefono) {
      pushEnvioAsync(
        () =>
          pushEnvioFromTick(
            bm,
            lead.id,
            tsEnviado,
            meta.telefono!,
            meta.segmento,
            plantillaValor,
            templateNombre,
            mensajeEnviado
          ),
        `envío ${bm.id}:${lead.id}`
      );
    }
    await patchBm(bm.id, {
      enviadosHoy: bm.enviadosHoy + 1,
      ultimoEnvio: new Date(),
      fecha: todayLocal(),
      ...(avanzarRotacion ? { rotacionIdx: bm.rotacionIdx + 1 } : {}),
    });
    console.log(
      `[worker:${bm.id}] lead ${lead.id} -> envío (${bm.enviadosHoy + 1}/${bm.limiteDiario})`
    );
  } finally {
    enVuelo.delete(lead.id);
  }

  await programarProximoNormal(bm);
}

/** Arranca un reloj por cada BM activo, recuperando el estado tras reinicio. */
export async function startScheduler() {
  const bms = await getActiveBms();
  console.log(`[worker] arrancando ${bms.length} relojes...`);
  for (const bm of bms) {
    // Recuperación: si había un próximo tick futuro, respetarlo; si no, arrancar
    // con un pequeño retardo aleatorio para no disparar todos en ráfaga.
    let enSeg: number;
    if (bm.proximoTickAt && bm.proximoTickAt.getTime() > Date.now()) {
      enSeg = Math.ceil((bm.proximoTickAt.getTime() - Date.now()) / 1000);
    } else {
      enSeg = intervaloAleatorioSeg(2, 20);
    }
    programar(bm.id, enSeg);
    console.log(`[worker:${bm.id}] primer tick en ${enSeg}s`);
  }
}

/**
 * Reacción inmediata a un cambio hecho en el panel (vía LISTEN/NOTIFY).
 * Reprograma un tick casi instantáneo: tick() re-lee la config y decide
 * (enviar, pausar, detener si quedó inactivo, etc.).
 */
export function reevaluar(bmId: string) {
  console.log(`[worker:${bmId}] reevaluación inmediata (panel)`);
  programar(bmId, 1);
}

/** Reevalúa todos los BMs (activos + los que tengan reloj). Para reset diario. */
export async function reevaluarTodos() {
  const activos = await getActiveBms();
  const ids = new Set<string>([...timers.keys(), ...activos.map((b) => b.id)]);
  console.log(`[worker] reevaluación global de ${ids.size} BMs (panel)`);
  for (const id of ids) programar(id, 1);
}

/** Detiene todos los relojes (apagado limpio). */
export function stopScheduler() {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
}
