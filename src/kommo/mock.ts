import type {
  KommoClient,
  KommoLead,
  KommoPipeline,
  KommoTemplate,
  KommoTemplateReview,
  NewStageInput,
  WabaTemplateInput,
} from "./types.js";

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

  async getLeadMeta(
    leadId: number
  ): Promise<{ telefono: string | null; segmento: string | null }> {
    // Datos determinísticos y ficticios para pruebas.
    return {
      telefono: `+54911${String(40000000 + (leadId % 60000000)).slice(0, 8)}`,
      segmento: `Lista${(leadId % 12) + 1}`,
    };
  }

  async getCampoLead(leadId: number, _fieldId: number): Promise<string | null> {
    // Simula la plantilla estampada por el Salesbot, rotando entre algunas.
    const plantillas = ["bienvenida_curso", "promo_junio", "reactivacion_v2"];
    return plantillas[leadId % plantillas.length];
  }

  async setCampoLead(
    leadId: number,
    fieldId: number,
    value: string
  ): Promise<void> {
    console.log(`[mock] setCampoLead lead=${leadId} field=${fieldId} -> ${value}`);
  }

  async createPipeline(input: {
    name: string;
    stages: NewStageInput[];
  }): Promise<KommoPipeline> {
    // Asigna IDs ficticios determinísticos para pruebas.
    const baseId = 90000000 + Math.floor(Math.random() * 1000) * 100;
    return {
      id: baseId,
      name: input.name,
      stages: input.stages.map((s, i) => ({
        id: baseId + (i + 1),
        name: s.name,
        pipeline_id: baseId,
      })),
    };
  }

  async findCustomFieldByName(
    name: string
  ): Promise<{ id: number } | null> {
    // El campo PLANTILLA_ENVIADA existe en la cuenta real; lo simulamos.
    if (name.trim().toLowerCase() === "plantilla_enviada") {
      return { id: 1227432 };
    }
    return null;
  }

  async listTemplates(_onlyWaba = false): Promise<KommoTemplate[]> {
    return [];
  }

  async createTemplate(input: WabaTemplateInput): Promise<KommoTemplate> {
    return {
      id: 80000000 + Math.floor(Math.random() * 100000),
      name: input.name,
      type: "waba",
      content: input.content,
      category: input.category ?? "MARKETING",
      language: input.language ?? "es",
      wabaIds: input.wabaIds,
      buttons: input.buttons ?? [],
    };
  }

  async deleteTemplate(_id: number): Promise<void> {
    return;
  }

  async submitTemplateForReview(_id: number): Promise<KommoTemplateReview> {
    return { status: "review" };
  }

  async getTemplateReview(_id: number): Promise<KommoTemplateReview> {
    // En mock simulamos que sigue en revisión.
    return { status: "review" };
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
