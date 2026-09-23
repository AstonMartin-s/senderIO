import type { FastifyInstance } from "fastify";
import { getClients, clientKommoStatus } from "../../services/clients.js";

export async function clientRoutes(app: FastifyInstance) {
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
