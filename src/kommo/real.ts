import type {
  KommoClient,
  KommoLead,
  KommoPipeline,
} from "./types.js";

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

  async listPipelines(): Promise<KommoPipeline[]> {
    const res = await this.req(`/leads/pipelines`);
    if (res.status === 204) return [];
    const json = (await res.json()) as {
      _embedded?: {
        pipelines?: Array<{
          id: number;
          name: string;
          _embedded?: {
            statuses?: Array<{ id: number; name: string; pipeline_id: number }>;
          };
        }>;
      };
    };
    const pipelines = json._embedded?.pipelines ?? [];
    return pipelines.map((p) => ({
      id: p.id,
      name: p.name,
      stages: (p._embedded?.statuses ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        pipeline_id: s.pipeline_id,
      })),
    }));
  }
}
