import { PETYR_BUSINESS_UNITS } from "../../lib/petyr/constants";
import {
  INTELLIGENCE_INSIGHT_TYPES,
  INTELLIGENCE_URGENCIES,
  type IntelligenceCompanyContext,
  type IntelligenceInsightInput,
  type PersistedSignalItem
} from "./types";

export const INTELLIGENCE_INSIGHT_PROMPT_VERSION = "petyr_intelligence_external_signals_v1";

type OpenRouterOptions = {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
};

type GenerateInput = {
  company: IntelligenceCompanyContext;
  signals: PersistedSignalItem[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function parseInsight(value: unknown, sourceIds: Set<string>): IntelligenceInsightInput | null {
  if (!isObject(value)) return null;
  const companyId = typeof value.company_id === "string" ? value.company_id.trim() : "";
  const businessUnit = typeof value.business_unit === "string" ? value.business_unit.trim() : "";
  const insightType = typeof value.insight_type === "string" ? value.insight_type.trim() : "";
  const urgency = typeof value.urgency === "string" ? value.urgency.trim() : "";
  const confidence = typeof value.confidence === "number" && Number.isFinite(value.confidence) ? value.confidence : null;
  const selectedSourceIds = toStringArray(value.source_ids).filter((sourceId) => sourceIds.has(sourceId));

  if (!companyId) return null;
  if (!PETYR_BUSINESS_UNITS.includes(businessUnit as never)) return null;
  if (!INTELLIGENCE_INSIGHT_TYPES.includes(insightType as never)) return null;
  if (!INTELLIGENCE_URGENCIES.includes(urgency as never)) return null;
  if (confidence === null || confidence < 0 || confidence > 1) return null;
  if (selectedSourceIds.length === 0) return null;

  const title = typeof value.title === "string" ? value.title.trim() : "";
  const summary = typeof value.summary === "string" ? value.summary.trim() : "";
  const rationale = typeof value.rationale === "string" ? value.rationale.trim() : "";
  const suggestedAction = typeof value.suggested_action === "string" ? value.suggested_action.trim() : "";

  if (!title || !summary || !rationale || !suggestedAction) return null;

  return {
    companyId,
    businessUnit: businessUnit as IntelligenceInsightInput["businessUnit"],
    insightType: insightType as IntelligenceInsightInput["insightType"],
    title,
    summary,
    rationale,
    suggestedAction,
    urgency: urgency as IntelligenceInsightInput["urgency"],
    confidence,
    assumptionsOrLimits: toStringArray(value.assumptions_or_limits),
    sourceIds: selectedSourceIds
  };
}

export function parseOpenRouterInsightJson(raw: unknown, sourceIds: string[]) {
  const payload = typeof raw === "string" ? JSON.parse(raw) : raw;
  const sourceSet = new Set(sourceIds);
  const rawInsights = isObject(payload) && Array.isArray(payload.insights) ? payload.insights : [];
  return rawInsights.map((item) => parseInsight(item, sourceSet)).filter((item): item is IntelligenceInsightInput => item !== null);
}

export class OpenRouterInsightGenerator {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenRouterOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generate(input: GenerateInput): Promise<IntelligenceInsightInput[]> {
    const sources = input.signals.map((signal) => ({
      source_id: signal.id,
      title: signal.title,
      url: signal.canonicalUrl,
      source_domain: signal.sourceDomain,
      published_at: signal.publishedAt?.toISOString() ?? null,
      snippet: signal.snippet
    }));
    const response = await this.fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: "system",
            content: [
              "You generate Petyr Intelligence insights from external public company signals.",
              "Do not analyze revenue, margin, forecast values, campaign counts, or mathematical trends.",
              "Return JSON only. Use only the provided source_ids. Business Unit must be one official Petyr Business Unit."
            ].join(" ")
          },
          {
            role: "user",
            content: JSON.stringify({
              company_id: input.company.companyId,
              company_name: input.company.companyName,
              csm_name: input.company.csmName,
              official_business_units: PETYR_BUSINESS_UNITS,
              allowed_insight_types: INTELLIGENCE_INSIGHT_TYPES,
              allowed_urgencies: INTELLIGENCE_URGENCIES,
              sources,
              output_shape: {
                insights: [{
                  company_id: "string",
                  business_unit: "official Petyr Business Unit",
                  insight_type: "opportunity | reactivation | caution | risk | monitor | no_action",
                  title: "string",
                  summary: "string",
                  rationale: "string",
                  suggested_action: "string",
                  urgency: "high | medium | low",
                  confidence: 0.75,
                  assumptions_or_limits: ["string"],
                  source_ids: ["source id"]
                }]
              }
            })
          }
        ],
        response_format: {
          type: "json_object"
        },
        temperature: 0.2
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter insight generation failed with status ${response.status}.`);
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenRouter returned no JSON content.");
    }

    return parseOpenRouterInsightJson(content, input.signals.map((signal) => signal.id));
  }
}
