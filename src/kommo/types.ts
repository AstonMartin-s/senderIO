export interface KommoLead {
  id: number;
  name?: string;
  status_id: number;
  pipeline_id: number;
}

export interface KommoStage {
  id: number;
  name: string;
  pipeline_id: number;
}

export interface KommoPipeline {
  id: number;
  name: string;
  stages: KommoStage[];
}

export interface KommoClient {
  /** Devuelve el primer lead disponible en una etapa, o null si no hay. */
  getFirstLeadInStage(
    pipelineId: number,
    statusId: number
  ): Promise<KommoLead | null>;

  /** Mueve un lead a otra etapa (PATCH status_id + pipeline_id). */
  moveLead(leadId: number, pipelineId: number, statusId: number): Promise<void>;

  /** Cuenta (hasta `limit`) leads en una etapa. Usado para % de error. */
  countLeadsInStage(
    pipelineId: number,
    statusId: number,
    limit?: number
  ): Promise<number>;

  /**
   * Devuelve metadatos del lead para trazabilidad: teléfono (E.164) del contacto
   * principal y segmento (primera etiqueta del lead). Best-effort: no debe
   * frenar el envío si falla (devuelve null en los campos que no resuelva).
   */
  getLeadMeta(
    leadId: number
  ): Promise<{ telefono: string | null; segmento: string | null }>;

  /** Lista pipelines y etapas (para el alta de BMs en el panel). */
  listPipelines(): Promise<KommoPipeline[]>;
}
