import { getOpenRouterDefaultModel } from "@/services/petyrAiModelSettingsService";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const OPENROUTER_REQUEST_TIMEOUT_MS = 8000;
const MISSING_KEY_VALUES = new Set(["", "replace_me"]);

export type OpenRouterModelOption = {
  id: string;
  name: string;
  provider: string | null;
  contextLength: number | null;
};

export type OpenRouterModelsResponse = {
  models: OpenRouterModelOption[];
  source: "openrouter" | "fallback";
  diagnosticMessage: string | null;
};

type OpenRouterModelPayload = {
  data?: unknown;
};

type RawOpenRouterModel = {
  id?: unknown;
  name?: unknown;
  provider?: unknown;
  context_length?: unknown;
  top_provider?: {
    context_length?: unknown;
    provider?: unknown;
  } | null;
};

function getOpenRouterApiKey() {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  return MISSING_KEY_VALUES.has(apiKey) ? null : apiKey;
}

function inferProvider(model: RawOpenRouterModel, id: string) {
  if (typeof model.provider === "string" && model.provider.trim()) {
    return model.provider.trim();
  }

  if (typeof model.top_provider?.provider === "string" && model.top_provider.provider.trim()) {
    return model.top_provider.provider.trim();
  }

  const providerFromId = id.split("/")[0]?.trim();
  return providerFromId || null;
}

function readContextLength(model: RawOpenRouterModel) {
  if (typeof model.context_length === "number" && Number.isFinite(model.context_length)) {
    return model.context_length;
  }

  if (
    typeof model.top_provider?.context_length === "number" &&
    Number.isFinite(model.top_provider.context_length)
  ) {
    return model.top_provider.context_length;
  }

  return null;
}

function toModelOption(model: RawOpenRouterModel): OpenRouterModelOption | null {
  if (typeof model.id !== "string" || !model.id.trim()) return null;

  const id = model.id.trim();
  const name = typeof model.name === "string" && model.name.trim() ? model.name.trim() : id;

  return {
    id,
    name,
    provider: inferProvider(model, id),
    contextLength: readContextLength(model)
  };
}

function dedupeAndSortModels(models: OpenRouterModelOption[]) {
  const byId = new Map<string, OpenRouterModelOption>();

  for (const model of models) {
    if (!byId.has(model.id)) {
      byId.set(model.id, model);
    }
  }

  return [...byId.values()].sort((first, second) => first.name.localeCompare(second.name));
}

function buildFallbackModels(): OpenRouterModelOption[] {
  const defaultModel = getOpenRouterDefaultModel();

  return dedupeAndSortModels([
    {
      id: defaultModel,
      name: defaultModel,
      provider: defaultModel.split("/")[0] || null,
      contextLength: null
    }
  ]);
}

function fallbackResponse(diagnosticMessage: string): OpenRouterModelsResponse {
  return {
    models: buildFallbackModels(),
    source: "fallback",
    diagnosticMessage
  };
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENROUTER_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function getOpenRouterModels(): Promise<OpenRouterModelsResponse> {
  const apiKey = getOpenRouterApiKey();

  if (!apiKey) {
    return fallbackResponse("OPENROUTER_API_KEY is not configured. Showing fallback model options.");
  }

  try {
    const response = await fetchWithTimeout(OPENROUTER_MODELS_URL, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      return fallbackResponse(`OpenRouter models API returned HTTP ${response.status}. Showing fallback model options.`);
    }

    const payload = (await response.json()) as OpenRouterModelPayload;

    if (!Array.isArray(payload.data)) {
      return fallbackResponse("OpenRouter models API returned an unexpected response. Showing fallback model options.");
    }

    const models = dedupeAndSortModels(
      payload.data
        .map((model) => toModelOption(model as RawOpenRouterModel))
        .filter((model): model is OpenRouterModelOption => model !== null)
    );

    if (!models.length) {
      return fallbackResponse("OpenRouter models API returned no usable models. Showing fallback model options.");
    }

    return {
      models,
      source: "openrouter",
      diagnosticMessage: null
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    return fallbackResponse(`Unable to load OpenRouter models: ${detail}. Showing fallback model options.`);
  }
}
