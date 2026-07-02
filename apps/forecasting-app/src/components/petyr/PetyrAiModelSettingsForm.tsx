"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { formatPetyrInteger } from "@/lib/petyr/formatters";
import type { OpenRouterModelOption, OpenRouterModelsResponse } from "@/services/openRouterModelsService";
import type { PetyrAiModelSetting } from "@/services/petyrAiModelSettingsService";

const aiModelSettingsEndpoint = "/api/petyr/admin/ai-model-settings";
const openRouterModelsEndpoint = "/api/petyr/admin/openrouter-models";

type PetyrAiModelSettingsFormProps = {
  initialSetting: PetyrAiModelSetting;
  initialError?: string | null;
};

type ErrorPayload = {
  error?: string;
  detail?: string;
};

function formatUpdatedAt(updatedAt: string | null) {
  if (!updatedAt) return "Not saved yet";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(updatedAt));
}

function isPetyrAiModelSetting(payload: PetyrAiModelSetting | ErrorPayload): payload is PetyrAiModelSetting {
  return "selectedModel" in payload;
}

function modelOptionFromId(id: string): OpenRouterModelOption | null {
  const normalizedId = id.trim();
  if (!normalizedId) return null;

  return {
    id: normalizedId,
    name: normalizedId,
    provider: normalizedId.split("/")[0] || null,
    contextLength: null
  };
}

function fallbackModelOptions(setting: PetyrAiModelSetting) {
  return [modelOptionFromId(setting.selectedModel), modelOptionFromId(setting.defaultModel)].filter(
    (option): option is OpenRouterModelOption => option !== null
  );
}

function mergeModelOptions(models: OpenRouterModelOption[], ids: string[]) {
  const byId = new Map<string, OpenRouterModelOption>();

  for (const model of models) {
    byId.set(model.id, model);
  }

  for (const id of ids) {
    const fallbackOption = modelOptionFromId(id);
    if (fallbackOption && !byId.has(fallbackOption.id)) {
      byId.set(fallbackOption.id, fallbackOption);
    }
  }

  return [...byId.values()].sort((first, second) => first.name.localeCompare(second.name));
}

function formatModelLabel(option: OpenRouterModelOption) {
  const details = [
    option.provider ? `Provider: ${option.provider}` : null,
    option.contextLength ? `Context: ${formatPetyrInteger(option.contextLength)} tokens` : null
  ].filter(Boolean);

  return details.length ? `${option.name} (${option.id}) - ${details.join(" - ")}` : `${option.name} (${option.id})`;
}

export default function PetyrAiModelSettingsForm({ initialSetting, initialError = null }: PetyrAiModelSettingsFormProps) {
  const [setting, setSetting] = useState(initialSetting);
  const [model, setModel] = useState(initialSetting.selectedModel);
  const [availableModels, setAvailableModels] = useState<OpenRouterModelOption[]>(() => fallbackModelOptions(initialSetting));
  const [modelsDiagnostic, setModelsDiagnostic] = useState<string | null>(null);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [message, setMessage] = useState(initialError);
  const [isSaving, setIsSaving] = useState(false);

  const modelOptions = useMemo(
    () => mergeModelOptions(availableModels, [setting.selectedModel, setting.defaultModel, model]),
    [availableModels, model, setting.defaultModel, setting.selectedModel]
  );

  useEffect(() => {
    let isMounted = true;

    async function loadOpenRouterModels() {
      setIsLoadingModels(true);

      try {
        const response = await fetch(openRouterModelsEndpoint, { cache: "no-store" });
        const payload = (await response.json()) as OpenRouterModelsResponse;

        if (!isMounted) return;

        if (!response.ok || !Array.isArray(payload.models)) {
          setModelsDiagnostic("Unable to load OpenRouter models. Showing fallback model options.");
          return;
        }

        setAvailableModels(payload.models);
        setModelsDiagnostic(payload.diagnosticMessage);
      } catch (error) {
        if (!isMounted) return;
        setModelsDiagnostic(
          error instanceof Error
            ? `Unable to load OpenRouter models: ${error.message}. Showing fallback model options.`
            : "Unable to load OpenRouter models. Showing fallback model options."
        );
      } finally {
        if (isMounted) {
          setIsLoadingModels(false);
        }
      }
    }

    loadOpenRouterModels();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsSaving(true);

    try {
      const response = await fetch(aiModelSettingsEndpoint, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ model })
      });
      const payload = (await response.json()) as PetyrAiModelSetting | ErrorPayload;

      if (!response.ok) {
        const errorPayload = isPetyrAiModelSetting(payload) ? null : payload;
        setMessage(errorPayload?.detail || errorPayload?.error || "Unable to save AI model setting.");
        return;
      }

      if (!isPetyrAiModelSetting(payload)) {
        setMessage("Unable to save AI model setting.");
        return;
      }

      setSetting(payload);
      setModel(payload.selectedModel);
      setMessage("AI model setting saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save AI model setting.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
      <div>
        <label className="block text-sm font-medium text-slate-700" htmlFor="openrouter-model">
          Selected OpenRouter model
        </label>
        <select
          className="mt-2 flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isLoadingModels && modelOptions.length === 0}
          id="openrouter-model"
          name="model"
          onChange={(event) => {
            setModel(event.target.value);
            setMessage(null);
          }}
          value={model}
        >
          {modelOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {formatModelLabel(option)}
            </option>
          ))}
        </select>
        <div className="mt-2 text-xs text-slate-500">
          {isLoadingModels ? "Loading OpenRouter models..." : `${modelOptions.length} model options available.`}
        </div>
      </div>

      <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Current model</div>
          <div className="mt-1 break-all font-semibold text-slate-900">{setting.selectedModel}</div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Env default</div>
          <div className="mt-1 break-all font-semibold text-slate-900">{setting.defaultModel}</div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Updated</div>
          <div className="mt-1 font-semibold text-slate-900">{formatUpdatedAt(setting.updatedAt)}</div>
        </div>
      </div>

      <button
        className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:pointer-events-none disabled:opacity-50"
        disabled={isSaving}
        type="submit"
      >
        {isSaving ? "Saving model" : "Save selected model"}
      </button>

      {modelsDiagnostic ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {modelsDiagnostic}
        </div>
      ) : null}

      {message ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</div>
      ) : null}
    </form>
  );
}
