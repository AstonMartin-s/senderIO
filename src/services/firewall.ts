import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { bmConfig, logMovimientos, type BmConfig } from "../db/schema.js";
import { minutosAleatorios } from "../lib/time.js";
import { registrarMovimiento } from "./movimientos.js";
import { pushEnvioAsync, pushEnvioForBmLead } from "./trazabilidad-push.js";

const VENTANA_MOVIL = 20;

export type ResultadoTipo = "si" | "no" | "error";

/** % de ERROR sobre los últimos N resultados (si/no/error) del BM. */
export async function computePctErrorMovil(
  bmId: string,
  n = VENTANA_MOVIL
): Promise<number> {
  const rows = await db
    .select({ accion: logMovimientos.accion })
    .from(logMovimientos)
    .where(
      and(
        eq(logMovimientos.bmId, bmId),
        inArray(logMovimientos.accion, [
          "resultado_si",
          "resultado_no",
          "resultado_error",
        ])
      )
    )
    .orderBy(desc(logMovimientos.ts))
    .limit(n);

  if (rows.length === 0) return 0;
  const errores = rows.filter((r) => r.accion === "resultado_error").length;
  return Math.round((errores / rows.length) * 10000) / 100; // % con 2 decimales
}

/**
 * Aplica el resultado recibido por webhook al estado del BM y dispara el
 * cortafuegos. Devuelve el BM actualizado.
 */
export async function aplicarResultado(
  bm: BmConfig,
  tipo: ResultadoTipo,
  leadId?: number | null
): Promise<BmConfig> {
  if (tipo === "error") {
    await registrarMovimiento({
      bmId: bm.id,
      leadId,
      accion: "resultado_error",
      resultado: "error_3132",
      etapaDestino: bm.stageErrorId,
    });
    if (leadId != null) {
      pushEnvioAsync(
        () => pushEnvioForBmLead(bm.id, leadId),
        `error ${bm.id}:${leadId}`
      );
    }

    const erroresConsecutivos = bm.erroresConsecutivos + 1;
    const erroresHoy = bm.erroresHoy + 1;
    const pct = await computePctErrorMovil(bm.id);

    if (erroresConsecutivos >= bm.umbralErroresConsecutivos) {
      // Pausa dura por racha: el BM queda pausado hasta el reset o reactivación.
      await registrarMovimiento({ bmId: bm.id, accion: "pausa_bm", resultado: null });
      const rows = await db
        .update(bmConfig)
        .set({
          erroresHoy,
          erroresConsecutivos,
          pctErrorMovil: String(pct),
          pausado: true,
          pausadoHasta: null,
          updatedAt: new Date(),
        })
        .where(eq(bmConfig.id, bm.id))
        .returning();
      console.log(
        `[firewall] ${bm.id} PAUSA DURA por ${erroresConsecutivos} errores consecutivos`
      );
      return rows[0];
    }

    // Pausa corta por error aislado.
    const pausaMin = minutosAleatorios(bm.pausaCortaMin, bm.pausaCortaMax);
    const pausadoHasta = new Date(Date.now() + pausaMin * 60_000);
    const rows = await db
      .update(bmConfig)
      .set({
        erroresHoy,
        erroresConsecutivos,
        pctErrorMovil: String(pct),
        pausadoHasta,
        updatedAt: new Date(),
      })
      .where(eq(bmConfig.id, bm.id))
      .returning();
    console.log(
      `[firewall] ${bm.id} pausa corta ${pausaMin}min (err consecutivos: ${erroresConsecutivos})`
    );
    return rows[0];
  }

  // SI / NO: hubo interacción => resetea la racha de errores.
  await registrarMovimiento({
    bmId: bm.id,
    leadId,
    accion: tipo === "si" ? "resultado_si" : "resultado_no",
    resultado: "ok",
    etapaDestino: tipo === "si" ? bm.stageSiId : bm.stageNoId,
  });
  if (leadId != null) {
    pushEnvioAsync(
      () => pushEnvioForBmLead(bm.id, leadId),
      `resultado ${tipo} ${bm.id}:${leadId}`
    );
  }
  const pct = await computePctErrorMovil(bm.id);
  const rows = await db
    .update(bmConfig)
    .set({
      erroresConsecutivos: 0,
      pctErrorMovil: String(pct),
      updatedAt: new Date(),
    })
    .where(eq(bmConfig.id, bm.id))
    .returning();
  return rows[0];
}
