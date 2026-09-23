import type { FastifyInstance } from "fastify";
import {
  getClients,
  clientKommoStatus,
  createClienteEtiqueta,
} from "../../services/clients.js";

export async function clientRoutes(app: FastifyInstance) {
  // Crea un cliente-etiqueta desde el panel (Basic Auth por hook global).
  app.post("/api/clientes-etiqueta", async (req, reply) => {
    const b = (req.body ?? {}) as {
      id?: string;
      nombre?: string;
      etiqueta?: string;
      etiquetas?: string[];
    };
    const etiquetas =
      b.etiquetas ?? (b.etiqueta ? [b.etiqueta] : []);
    try {
      const row = await createClienteEtiqueta({
        id: b.id,
        nombre: b.nombre ?? "",
        etiquetas,
      });
      return reply.code(201).send(row);
    } catch (err) {
      return reply
        .code(400)
        .send({ ok: false, error: String((err as Error).message ?? err) });
    }
  });

  app.get("/api/clients", async () => {
    const rows = await getClients();
    return rows
      // Los clientes-etiqueta (Piliking, ClienteS1, …) no son tenants de
      // operación Kommo: no van en el selector del panel interno. Se detectan
      // por tener etiquetas propias. Mooney/King quedan como tenants.
      .filter((c) => !(Array.isArray(c.etiquetas) && c.etiquetas.length > 0))
      .map((c) => ({
      id: c.id,
      nombre: c.nombre,
      activo: c.activo,
      kommo: clientKommoStatus(c.id),
    }));
  });
}
