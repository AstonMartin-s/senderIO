import type { FastifyInstance, FastifyReply } from "fastify";
import {
  consumoPaquete,
  contarBases,
  esClientePaquete,
  filasBase,
  getPanel,
  listClientesPaquete,
  resumenTraza,
  setBaseCruda,
  setListaFiltrada,
  trazaPorNumero,
  type FilaBase,
} from "../../services/cliente-panel.js";

/**
 * Vista admin del panel-cliente. Misma data que ve el cliente (sin BM),
 * más bajar/subir bases. Auth = Basic del panel de operación (hook global).
 * No usa CLIENTE_PANEL_TOKEN.
 */

function csvEsc(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function sendCsv(reply: FastifyReply, fname: string, csv: string) {
  reply
    .header("Content-Type", "text/csv; charset=utf-8")
    .header("Content-Disposition", `attachment; filename="${fname}"`);
  return csv;
}

export async function adminClienteRoutes(app: FastifyInstance) {
  app.get("/api/admin/clientes", async () => listClientesPaquete());

  app.get("/api/admin/clientes/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!esClientePaquete(id)) {
      return reply.code(404).send({ ok: false, error: "not_found" });
    }
    const [panel, bases, resumen, paquete] = await Promise.all([
      getPanel(id),
      contarBases(id),
      resumenTraza(id),
      consumoPaquete(id),
    ]);
    return { panel, bases, resumen, paquete };
  });

  app.get("/api/admin/clientes/:id/traza", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!esClientePaquete(id)) {
      return reply.code(404).send({ ok: false, error: "not_found" });
    }
    return trazaPorNumero(id);
  });

  app.post("/api/admin/clientes/:id/base-cruda", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!esClientePaquete(id)) {
      return reply.code(404).send({ ok: false, error: "not_found" });
    }
    const b = (req.body ?? {}) as { filas?: FilaBase[]; replace?: boolean };
    const res = await setBaseCruda(id, b.filas ?? [], { replace: b.replace ?? true });
    return { ok: true, ...res };
  });

  app.post("/api/admin/clientes/:id/lista-filtrada", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!esClientePaquete(id)) {
      return reply.code(404).send({ ok: false, error: "not_found" });
    }
    const b = (req.body ?? {}) as { filas?: FilaBase[]; replace?: boolean };
    const res = await setListaFiltrada(id, b.filas ?? [], {
      replace: b.replace ?? true,
    });
    return { ok: true, ...res };
  });

  app.get("/api/admin/clientes/:id/base-cruda.csv", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!esClientePaquete(id)) {
      return reply.code(404).send({ ok: false, error: "not_found" });
    }
    const filas = await filasBase(id, "cruda");
    const header = "telefono,telefono_raw,nombre,extra";
    const body = filas
      .map((f) =>
        [f.telefono, f.telefonoRaw, f.nombre, f.extra ? JSON.stringify(f.extra) : ""]
          .map(csvEsc)
          .join(",")
      )
      .join("\n");
    return sendCsv(reply, `${id}-base-cruda.csv`, `${header}\n${body}\n`);
  });

  app.get("/api/admin/clientes/:id/lista-filtrada.csv", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!esClientePaquete(id)) {
      return reply.code(404).send({ ok: false, error: "not_found" });
    }
    const filas = await filasBase(id, "filtrada");
    const header = "telefono,telefono_raw,nombre,extra";
    const body = filas
      .map((f) =>
        [f.telefono, f.telefonoRaw, f.nombre, f.extra ? JSON.stringify(f.extra) : ""]
          .map(csvEsc)
          .join(",")
      )
      .join("\n");
    return sendCsv(reply, `${id}-lista-filtrada.csv`, `${header}\n${body}\n`);
  });

  app.get("/api/admin/clientes/:id/traza.csv", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!esClientePaquete(id)) {
      return reply.code(404).send({ ok: false, error: "not_found" });
    }
    const filas = await trazaPorNumero(id);
    const header =
      "telefono,nombre,envios,enviados_sin_error,si,no,errores,estado,enviado_at,ultima_actividad,plantilla";
    const body = filas
      .map((f) =>
        [
          f.telefono,
          f.nombre,
          f.envios,
          f.enviadosSinError,
          f.si,
          f.no,
          f.errores,
          f.estado,
          f.enviadoAt,
          f.ultimaActividadAt,
          f.plantilla,
        ]
          .map(csvEsc)
          .join(",")
      )
      .join("\n");
    return sendCsv(reply, `${id}-traza.csv`, `${header}\n${body}\n`);
  });
}
