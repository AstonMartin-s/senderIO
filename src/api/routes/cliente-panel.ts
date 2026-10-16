import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config } from "../../config.js";
import {
  clientIdDeAcceso,
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

function tokenDe(header: string | undefined): string {
  const m = /^Bearer\s+(.+)$/i.exec((header ?? "").trim());
  return m?.[1]?.trim() ?? "";
}

function tokenIgual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** El token de entorno sigue siendo ClienteS1. Otro token válido es el de su cliente. */
async function clienteDeRequest(req: FastifyRequest): Promise<string | null> {
  const token = tokenDe(req.headers.authorization);
  if (!token) return null;
  const envToken = config.clientePanel.token;
  if (envToken && tokenIgual(token, envToken)) return config.clientePanel.id;
  return clientIdDeAcceso(token);
}

async function guard(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<string | null> {
  const id = await clienteDeRequest(req);
  if (id) return id;
  if (!config.clientePanel.token && !tokenDe(req.headers.authorization)) {
    reply.code(503).send({ ok: false, error: "panel_disabled" });
    return null;
  }
  reply.code(401).send({ ok: false, error: "unauthorized" });
  return null;
}

export async function clientePanelRoutes(app: FastifyInstance) {
  // Config + oferta + mensaje/plantilla + redirecciones + conteos de bases.
  app.get("/api/cliente/panel", async (req, reply) => {
    const panelId = await guard(req, reply);
    if (!panelId) return;
    const [panel, bases, resumen, paquete] = await Promise.all([
      getPanel(panelId),
      contarBases(panelId),
      resumenTraza(panelId),
      consumoPaquete(panelId),
    ]);
    const { accesoToken: _oculto, ...panelPublico } = panel;
    return { panel: panelPublico, bases, resumen, paquete };
  });

  app.patch("/api/cliente/panel", async (req, reply) => {
    const panelId = await guard(req, reply);
    if (!panelId) return;
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
    const guardado = await savePanel(panelId, patch);
    const { accesoToken: _oculto, ...panelPublico } = guardado;
    return panelPublico;
  });

  // Carga de base cruda (la que entrega el cliente). Body: { filas, replace? }.
  app.post("/api/cliente/base-cruda", async (req, reply) => {
    const panelId = await guard(req, reply);
    if (!panelId) return;
    const b = (req.body ?? {}) as { filas?: FilaBase[]; replace?: boolean };
    const res = await setBaseCruda(panelId, b.filas ?? [], {
      replace: b.replace ?? true,
    });
    return { ok: true, ...res };
  });

  // Carga de lista filtrada (wa-checker final). Body: { filas, replace? }.
  app.post("/api/cliente/lista-filtrada", async (req, reply) => {
    const panelId = await guard(req, reply);
    if (!panelId) return;
    const b = (req.body ?? {}) as { filas?: FilaBase[]; replace?: boolean };
    const res = await setListaFiltrada(panelId, b.filas ?? [], {
      replace: b.replace ?? true,
    });
    return { ok: true, ...res };
  });

  // Traza por número (oculta BM). Estado de cada número de la lista filtrada.
  app.get("/api/cliente/traza", async (req, reply) => {
    const panelId = await guard(req, reply);
    if (!panelId) return;
    return trazaPorNumero(panelId);
  });

  // Export CSV de la traza por número (sin BM).
  app.get("/api/cliente/traza.csv", async (req, reply) => {
    const panelId = await guard(req, reply);
    if (!panelId) return;
    const filas = await trazaPorNumero(panelId);
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
