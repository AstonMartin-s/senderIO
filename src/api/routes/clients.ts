import type { FastifyInstance } from "fastify";
import { getClients, clientKommoStatus } from "../../services/clients.js";

export async function clientRoutes(app: FastifyInstance) {
  app.get("/api/clients", async () => {
    const rows = await getClients();
    return rows
      // clienteS1 (panel-cliente del paquete) no es un tenant de operación Kommo:
      // no debe aparecer en el selector del panel interno.
      .filter((c) => c.id !== "clienteS1")
      .map((c) => ({
      id: c.id,
      nombre: c.nombre,
      activo: c.activo,
      kommo: clientKommoStatus(c.id),
    }));
  });
}
