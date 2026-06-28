import type {
  KommoClient,
  KommoLead,
  KommoPipeline,
  KommoTemplate,
  KommoTemplateReview,
  NewStageInput,
  WabaTemplateInput,
} from "./types.js";

/** Forma cruda de una plantilla de chat tal como la devuelve la API v4. */
interface RawTemplate {
  id: number;
  name: string;
  type?: string;
  content?: string;
  waba_category?: string | null;
  waba_language?: string | null;
  waba_selected_waba_ids?: string[] | null;
  buttons?: Array<{ text: string; type?: string }> | null;
  review_status?: string | null;
}

function mapTemplate(t: RawTemplate): KommoTemplate {
  return {
    id: t.id,
    name: t.name,
    type: t.type ?? "amocrm",
    content: t.content ?? "",
    category: t.waba_category ?? null,
    language: t.waba_language ?? null,
    wabaIds: t.waba_selected_waba_ids ?? [],
    buttons: (t.buttons ?? []).map((b) => ({ text: b.text, type: b.type })),
    reviewStatus: t.review_status ?? null,
  };
}

/** Forma cruda de un pipeline tal como lo devuelve la API v4. */
interface RawPipeline {
  id: number;
  name: string;
  _embedded?: {
    statuses?: Array<{ id: number; name: string; pipeline_id: number }>;
  };
}

function mapPipeline(p: RawPipeline): KommoPipeline {
  return {
    id: p.id,
    name: p.name,
    stages: (p._embedded?.statuses ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      pipeline_id: s.pipeline_id,
    })),
  };
}

/**
 * Normaliza un teléfono a E.164 (`+` + dígitos, sin espacios ni guiones).
 * Si no hay un `+` explícito y parece un número argentino, antepone `+`.
 * Devuelve null si no queda nada utilizable.
 */
function normalizarE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `+${digits}`;
}

export class RealKommoClient implements KommoClient {
  private base: string;
  private token: string;

  constructor(subdomain: string, token: string) {
    if (!subdomain) throw new Error("KOMMO_SUBDOMAIN vacío");
    if (!token) throw new Error("KOMMO_TOKEN vacío");
    this.base = `https://${subdomain}.kommo.com/api/v4`;
    this.token = token;
  }

  private async req(path: string, init?: RequestInit): Promise<Response> {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok && res.status !== 204) {
      const body = await res.text().catch(() => "");
      throw new Error(`Kommo ${init?.method ?? "GET"} ${path} -> ${res.status} ${body}`);
    }
    return res;
  }

  private async getLeads(
    pipelineId: number,
    statusId: number,
    limit: number
  ): Promise<KommoLead[]> {
    const params = new URLSearchParams();
    params.set("filter[statuses][0][pipeline_id]", String(pipelineId));
    params.set("filter[statuses][0][status_id]", String(statusId));
    params.set("limit", String(limit));
    const res = await this.req(`/leads?${params.toString()}`);
    if (res.status === 204) return [];
    const json = (await res.json()) as {
      _embedded?: { leads?: KommoLead[] };
    };
    return json._embedded?.leads ?? [];
  }

  async getFirstLeadInStage(
    pipelineId: number,
    statusId: number
  ): Promise<KommoLead | null> {
    const leads = await this.getLeads(pipelineId, statusId, 1);
    return leads[0] ?? null;
  }

  async moveLead(
    leadId: number,
    pipelineId: number,
    statusId: number
  ): Promise<void> {
    await this.req(`/leads/${leadId}`, {
      method: "PATCH",
      body: JSON.stringify({ status_id: statusId, pipeline_id: pipelineId }),
    });
  }

  async countLeadsInStage(
    pipelineId: number,
    statusId: number,
    limit = 50
  ): Promise<number> {
    const leads = await this.getLeads(pipelineId, statusId, limit);
    return leads.length;
  }

  async getLeadMeta(
    leadId: number
  ): Promise<{ telefono: string | null; segmento: string | null }> {
    try {
      const res = await this.req(`/leads/${leadId}?with=contacts`);
      if (res.status === 204) return { telefono: null, segmento: null };
      const lead = (await res.json()) as {
        _embedded?: {
          contacts?: Array<{ id: number; is_main?: boolean }>;
          tags?: Array<{ name?: string }>;
        };
      };
      // Segmento: primera etiqueta del lead (ej. "Lista12").
      const segmento = lead._embedded?.tags?.[0]?.name ?? null;

      const contacts = lead._embedded?.contacts ?? [];
      if (contacts.length === 0) return { telefono: null, segmento };
      const main = contacts.find((c) => c.is_main) ?? contacts[0];

      const cRes = await this.req(`/contacts/${main.id}`);
      if (cRes.status === 204) return { telefono: null, segmento };
      const contact = (await cRes.json()) as {
        custom_fields_values?: Array<{
          field_code?: string;
          values?: Array<{ value?: string }>;
        }> | null;
      };
      const phoneField = (contact.custom_fields_values ?? []).find(
        (f) => f.field_code === "PHONE"
      );
      const telefono = normalizarE164(phoneField?.values?.[0]?.value);
      return { telefono, segmento };
    } catch (err) {
      console.error(`[kommo] no se pudo resolver meta de ${leadId}:`, err);
      return { telefono: null, segmento: null };
    }
  }

  async getCampoLead(leadId: number, fieldId: number): Promise<string | null> {
    try {
      const res = await this.req(`/leads/${leadId}`);
      if (res.status === 204) return null;
      const lead = (await res.json()) as {
        custom_fields_values?: Array<{
          field_id?: number;
          values?: Array<{ value?: string | number }>;
        }> | null;
      };
      const field = (lead.custom_fields_values ?? []).find(
        (f) => f.field_id === fieldId
      );
      const raw = field?.values?.[0]?.value;
      const value = raw == null ? null : String(raw).trim();
      return value || null;
    } catch (err) {
      console.error(`[kommo] no se pudo leer campo ${fieldId} de ${leadId}:`, err);
      return null;
    }
  }

  async setCampoLead(
    leadId: number,
    fieldId: number,
    value: string
  ): Promise<void> {
    await this.req(`/leads/${leadId}`, {
      method: "PATCH",
      body: JSON.stringify({
        custom_fields_values: [
          { field_id: fieldId, values: [{ value }] },
        ],
      }),
    });
  }

  async listPipelines(): Promise<KommoPipeline[]> {
    const res = await this.req(`/leads/pipelines`);
    if (res.status === 204) return [];
    const json = (await res.json()) as {
      _embedded?: { pipelines?: RawPipeline[] };
    };
    return (json._embedded?.pipelines ?? []).map(mapPipeline);
  }

  async createPipeline(input: {
    name: string;
    stages: NewStageInput[];
  }): Promise<KommoPipeline> {
    // Idempotencia: si ya existe un pipeline con ese nombre, lo devolvemos.
    const existentes = await this.listPipelines();
    const yaExiste = existentes.find(
      (p) => p.name.trim().toLowerCase() === input.name.trim().toLowerCase()
    );
    if (yaExiste) return yaExiste;

    // La API acepta un array de pipelines a crear; mandamos uno.
    // Kommo exige is_main, is_unsorted_on y sort a nivel pipeline.
    const body = [
      {
        name: input.name,
        is_main: false,
        is_unsorted_on: false,
        sort: 1000,
        _embedded: {
          statuses: input.stages.map((s, i) => ({
            name: s.name,
            sort: s.sort ?? (i + 1) * 10,
            type: s.type ?? 0,
            ...(s.color ? { color: s.color } : {}),
          })),
        },
      },
    ];

    const res = await this.req(`/leads/pipelines`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as {
      _embedded?: { pipelines?: RawPipeline[] };
    };
    const creado = json._embedded?.pipelines?.[0];
    if (!creado) {
      throw new Error("Kommo no devolvió el pipeline creado");
    }
    return mapPipeline(creado);
  }

  async findCustomFieldByName(
    name: string
  ): Promise<{ id: number } | null> {
    const res = await this.req(`/leads/custom_fields?limit=250`);
    if (res.status === 204) return null;
    const json = (await res.json()) as {
      _embedded?: { custom_fields?: Array<{ id: number; name: string }> };
    };
    const target = name.trim().toLowerCase();
    const found = (json._embedded?.custom_fields ?? []).find(
      (f) => (f.name ?? "").trim().toLowerCase() === target
    );
    return found ? { id: found.id } : null;
  }

  async listTemplates(onlyWaba = false): Promise<KommoTemplate[]> {
    const res = await this.req(`/chats/templates?limit=250&with=review_status`);
    if (res.status === 204) return [];
    const json = (await res.json()) as {
      _embedded?: { chat_templates?: RawTemplate[] };
    };
    const all = (json._embedded?.chat_templates ?? []).map(mapTemplate);
    return onlyWaba ? all.filter((t) => t.type === "waba") : all;
  }

  async createTemplate(input: WabaTemplateInput): Promise<KommoTemplate> {
    // La API espera un array, aunque mandemos una sola.
    const body = [
      {
        name: input.name,
        type: "waba",
        content: input.content,
        waba_category: input.category ?? "MARKETING",
        waba_language: input.language ?? "es",
        waba_selected_waba_ids: input.wabaIds,
        ...(input.buttons?.length
          ? {
              buttons: input.buttons.map((b) => ({
                text: b.text,
                type: b.type ?? "inline",
              })),
            }
          : {}),
        ...(input.header != null ? { waba_header: input.header } : {}),
        ...(input.footer != null ? { waba_footer: input.footer } : {}),
        ...(input.examples ? { waba_examples: input.examples } : {}),
      },
    ];

    const res = await this.req(`/chats/templates`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as {
      _embedded?: { chat_templates?: RawTemplate[] };
    };
    const creada = json._embedded?.chat_templates?.[0];
    if (!creada) throw new Error("Kommo no devolvió la plantilla creada");
    return mapTemplate(creada);
  }

  async submitTemplateForReview(id: number): Promise<KommoTemplateReview> {
    const res = await this.req(`/chats/templates/${id}/review`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const json = (await res.json()) as {
      _embedded?: {
        reviews?: Array<{ status?: string; reject_reason?: string }>;
      };
    };
    const review = json._embedded?.reviews?.[0];
    return {
      status: review?.status ?? "unknown",
      rejectReason: review?.reject_reason || undefined,
    };
  }

  async getTemplateReview(id: number): Promise<KommoTemplateReview> {
    const res = await this.req(`/chats/templates/${id}?with=review_status`);
    if (res.status === 204) return { status: "unknown" };
    const json = (await res.json()) as {
      review_status?: string | null;
      _embedded?: {
        reviews?: Array<{ status?: string; reject_reason?: string }>;
      };
    };
    // El último review es el más reciente; review_status es el resumen del top-level.
    const reviews = json._embedded?.reviews ?? [];
    const last = reviews[reviews.length - 1];
    return {
      status: json.review_status ?? last?.status ?? "unknown",
      rejectReason: last?.reject_reason || undefined,
    };
  }
}
