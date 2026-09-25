import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config } from "../../config.js";
import {
  getPanel,
  savePanel,
  setBaseCruda,
  setListaFiltrada,
  contarBases,
  trazaPorNumero,
  resumenTraza,
  consumoPaquete,
  type FilaBase,
  type PanelPatch,
} from "../../services/cliente-panel.js";

/**
 * Rutas del PANEL-CLIENTE (paquete vendido). Recipientes de información
 * compartida: config (oferta/mensaje/plantilla/redirecciones), bases (base
 * cruda + lista filtrada wa-checker) y traza por número (cruza log_movimientos,
 * NUNCA expone bmId). No configura nada del envío.
 *
 * Auth: Bearer <CLIENTE_PANEL_TOKEN> (lo carga CRED). Sin token → 503. Malo → 401.
 */

const PANEL_ID = config.clientePanel.id;

function bearerOk(header: string | undefined): boolean {
  const expected = config.clientePanel.token;
  if (!expected) return false;
  if (!header) return false;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = m?.[1]?.trim() ?? "";
  if (!token) return false;
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function guard(req: FastifyRequest, reply: FastifyReply): boolean {
  if (!config.clientePanel.token) {
    reply.code(503).send({ ok: false, error: "panel_disabled" });
    return false;
  }
  if (!bearerOk(req.headers.authorization)) {
    reply.code(401).send({ ok: false, error: "unauthorized" });
    return false;
  }
  return true;
}

export async function clientePanelRoutes(app: FastifyInstance) {
  // Config + oferta + mensaje/plantilla + redirecciones + conteos de bases.
  app.get("/api/cliente/panel", async (req, reply) => {
    if (!guard(req, reply)) return;
    const [panel, bases, resumen, paquete] = await Promise.all([
      getPanel(PANEL_ID),
      contarBases(PANEL_ID),
      resumenTraza(PANEL_ID),
      consumoPaquete(PANEL_ID),
    ]);
    return { panel, bases, resumen, paquete };
  });

  app.patch("/api/cliente/panel", async (req, reply) => {
    if (!guard(req, reply)) return;
    const b = (req.body ?? {}) as Record<string, unknown>;
    const patch: PanelPatch = {};
    if (typeof b.ofertaTitulo === "string") patch.ofertaTitulo = b.ofertaTitulo;
    if (typeof b.ofertaDetalle === "string")
      patch.ofertaDetalle = b.ofertaDetalle;
    if (b.ofertaMontoUsd === null || typeof b.ofertaMontoUsd === "string")
      patch.ofertaMontoUsd = (b.ofertaMontoUsd as string | null) ?? null;
    else if (typeof b.ofertaMontoUsd === "number")
      patch.ofertaMontoUsd = String(b.ofertaMontoUsd);
    if (typeof b.paqueteTotal === "number")
      patch.paqueteTotal = b.paqueteTotal;
    else if (typeof b.paqueteTotal === "string" && b.paqueteTotal.trim())
      patch.paqueteTotal = Number(b.paqueteTotal);
    if (typeof b.mensajeTexto === "string") patch.mensajeTexto = b.mensajeTexto;
    if (typeof b.plantillaNombre === "string")
      patch.plantillaNombre = b.plantillaNombre;
    if (Array.isArray(b.redirecciones))
      patch.redirecciones = b.redirecciones
        .map((x) => String(x).trim())
        .filter(Boolean);
    if (typeof b.notas === "string") patch.notas = b.notas;
    return savePanel(PANEL_ID, patch);
  });

  // Carga de base cruda (la que entrega el cliente). Body: { filas, replace? }.
  app.post("/api/cliente/base-cruda", async (req, reply) => {
    if (!guard(req, reply)) return;
    const b = (req.body ?? {}) as { filas?: FilaBase[]; replace?: boolean };
    const res = await setBaseCruda(PANEL_ID, b.filas ?? [], {
      replace: b.replace ?? true,
    });
    return { ok: true, ...res };
  });

  // Carga de lista filtrada (wa-checker final). Body: { filas, replace? }.
  app.post("/api/cliente/lista-filtrada", async (req, reply) => {
    if (!guard(req, reply)) return;
    const b = (req.body ?? {}) as { filas?: FilaBase[]; replace?: boolean };
    const res = await setListaFiltrada(PANEL_ID, b.filas ?? [], {
      replace: b.replace ?? true,
    });
    return { ok: true, ...res };
  });

  // Traza por número (oculta BM). Estado de cada número de la lista filtrada.
  app.get("/api/cliente/traza", async (req, reply) => {
    if (!guard(req, reply)) return;
    return trazaPorNumero(PANEL_ID);
  });

  // Export CSV de la traza por número (sin BM).
  app.get("/api/cliente/traza.csv", async (req, reply) => {
    if (!guard(req, reply)) return;
    const filas = await trazaPorNumero(PANEL_ID);
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header =
      "telefono,nombre,envios,enviados_sin_error,si,no,errores,estado,enviado_at,ultima_actividad,plantilla";
    const body = filas
      .map((f) =>
        [
          f.telefono,
          f.nombre ?? "",
          f.envios,
          f.enviadosSinError,
          f.si,
          f.no,
          f.errores,
          f.estado,
          f.enviadoAt ?? "",
          f.ultimaActividadAt ?? "",
          f.plantilla ?? "",
        ]
          .map(esc)
          .join(",")
      )
      .join("\n");
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header(
        "Content-Disposition",
        `attachment; filename="cliente-traza-${stamp}.csv"`
      );
    return `${header}\n${body}\n`;
  });
}
