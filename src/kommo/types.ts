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

/** Etapa a crear dentro de un pipeline nuevo. */
export interface NewStageInput {
  name: string;
  sort?: number;
  color?: string;
  /** 0 = etapa normal (default), 1 = etapa de entrada. */
  type?: number;
}

/** Botón de una plantilla (inline/quick reply). */
export interface KommoTemplateButton {
  text: string;
  type?: string; // "inline" por defecto en WABA
}

/** Plantilla tal como la devuelve/normaliza el cliente. */
export interface KommoTemplate {
  id: number;
  name: string;
  type: string; // "waba" | "amocrm"
  content: string;
  category: string | null; // waba_category
  language: string | null; // waba_language
  wabaIds: string[]; // waba_selected_waba_ids
  buttons: KommoTemplateButton[];
  reviewStatus?: string | null; // approved | review | paused | rejected | null
}

/** Datos para crear una plantilla WABA. */
export interface WabaTemplateInput {
  name: string;
  content: string;
  wabaIds: string[]; // a qué número(s)/WABA aplica
  category?: string; // UTILITY | AUTHENTICATION | MARKETING (default MARKETING)
  language?: string; // default "es"
  buttons?: KommoTemplateButton[];
  header?: string | null;
  footer?: string | null;
  examples?: Record<string, string>; // waba_examples
}

/** Resultado de mandar una plantilla a moderación de Meta. */
export interface KommoTemplateReview {
  status: string; // "review" | "approved" | "rejected" | ...
  rejectReason?: string;
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

  /**
   * Lee de un lead el valor del campo personalizado `fieldId` (el que el Salesbot
   * usa para estampar la plantilla enviada). Devuelve null si no existe o falla.
   */
  getCampoLead(leadId: number, fieldId: number): Promise<string | null>;

  /**
   * Escribe un campo personalizado del lead (ej. PLANTILLA_ENVIADA). Lo usa el
   * worker para marcar, antes de mover el lead a Envío, qué plantilla le toca en
   * la rotación; el bot lee ese campo para rutear al envío correspondiente.
   */
  setCampoLead(leadId: number, fieldId: number, value: string): Promise<void>;

  /** Lista pipelines y etapas (para el alta de BMs en el panel). */
  listPipelines(): Promise<KommoPipeline[]>;

  /**
   * Crea un pipeline con sus etapas (API v4 oficial). Idempotente: si ya existe
   * un pipeline con ese nombre, lo devuelve en vez de duplicar. Devuelve el
   * pipeline con los IDs reales que asignó Kommo a cada etapa.
   */
  createPipeline(input: {
    name: string;
    stages: NewStageInput[];
  }): Promise<KommoPipeline>;

  /**
   * Busca un campo personalizado de leads por nombre (exacto, sin distinguir
   * mayúsculas). Sirve para reutilizar campos existentes (p.ej. PLANTILLA_ENVIADA)
   * de forma idempotente. Devuelve null si no existe.
   */
  findCustomFieldByName(name: string): Promise<{ id: number } | null>;

  /** Lista plantillas de chat. Si `onlyWaba`, filtra solo las WABA. */
  listTemplates(onlyWaba?: boolean): Promise<KommoTemplate[]>;

  /**
   * Crea una plantilla WABA (POST /chats/templates). Devuelve la plantilla
   * creada con su id de Kommo. NO la manda a moderación (eso es submitTemplateForReview).
   */
  createTemplate(input: WabaTemplateInput): Promise<KommoTemplate>;

  /**
   * Manda una plantilla a moderación de Meta (POST /chats/templates/{id}/review).
   * Devuelve el estado inicial (normalmente "review").
   */
  submitTemplateForReview(id: number): Promise<KommoTemplateReview>;

  /**
   * Relee el estado de moderación de una plantilla en Kommo/Meta
   * (GET /chats/templates/{id}?with=review_status). Devuelve el estado actual
   * (approved | review | paused | rejected | ...) y el motivo de rechazo si aplica.
   */
  getTemplateReview(id: number): Promise<KommoTemplateReview>;

  /** Borra una plantilla en Kommo (DELETE /chats/templates/{id}). */
  deleteTemplate(id: number): Promise<void>;
}
