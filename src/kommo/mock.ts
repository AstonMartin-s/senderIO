import type { KommoClient, KommoLead, KommoPipeline } from "./types.js";

/**
 * Cliente Kommo simulado en memoria. Permite probar el goteo, el movimiento de
 * leads y el funnel sin tocar la cuenta real.
 *
 * Sembramos leads en las dos etapas origen reales:
 *   - 106401855 (base general compartida por BM1/BM3/BM4/BM5)
 *   - 106149911 (origen de BM2)
 */
export class MockKommoClient implements KommoClient {
  private leads = new Map<number, KommoLead>();
  private nextId = 1000;

  constructor(seedPerOrigin = 50) {
    this.seedStage(106401855, 13790083, seedPerOrigin);
    this.seedStage(106149911, 13757935, seedPerOrigin);
  }

  private seedStage(statusId: number, pipelineId: number, n: number) {
    for (let i = 0; i < n; i++) {
      const id = this.nextId++;
      this.leads.set(id, {
        id,
        name: `Lead mock ${id}`,
        status_id: statusId,
        pipeline_id: pipelineId,
      });
    }
  }

  /** Agrega leads a una etapa en runtime (útil para tests/demos). */
  addLeads(statusId: number, pipelineId: number, n: number): void {
    this.seedStage(statusId, pipelineId, n);
  }

  async getFirstLeadInStage(
    _pipelineId: number,
    statusId: number
  ): Promise<KommoLead | null> {
    for (const lead of this.leads.values()) {
      if (lead.status_id === statusId) return lead;
    }
    return null;
  }

  async moveLead(
    leadId: number,
    pipelineId: number,
    statusId: number
  ): Promise<void> {
    const lead = this.leads.get(leadId);
    if (!lead) throw new Error(`Mock: lead ${leadId} no existe`);
    lead.status_id = statusId;
    lead.pipeline_id = pipelineId;
  }

  async countLeadsInStage(
    _pipelineId: number,
    statusId: number,
    limit = 50
  ): Promise<number> {
    let count = 0;
    for (const lead of this.leads.values()) {
      if (lead.status_id === statusId) {
        count++;
        if (count >= limit) break;
      }
    }
    return count;
  }

  async listPipelines(): Promise<KommoPipeline[]> {
    return [
      {
        id: 13790083,
        name: "SPAM NUMERO 3 (BM3)",
        stages: [
          { id: 106401855, name: "BASE DE DATOS", pipeline_id: 13790083 },
          { id: 106401859, name: "ENVIO DE PLANTILLA", pipeline_id: 13790083 },
          { id: 106401863, name: "SI", pipeline_id: 13790083 },
          { id: 106401915, name: "NO", pipeline_id: 13790083 },
          { id: 106401919, name: "ERROR", pipeline_id: 13790083 },
        ],
      },
    ];
  }
}
