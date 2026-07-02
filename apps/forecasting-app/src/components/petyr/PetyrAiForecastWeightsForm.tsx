"use client";

import { useMemo, useState } from "react";

type WeightsSetting = {
  schemaVersion: "petyr_ai_forecast_baseline_weights_v1";
  enabled: boolean;
  historicalWeightedBaseline: number;
  monthlySeasonality: number;
  runRate: number;
  updatedBy: string;
  updatedAt: string | null;
};

const endpoint = "/api/petyr/admin/ai-forecast-weights";
const recommendedDraft = {
  historicalWeightedBaseline: 40,
  monthlySeasonality: 30,
  runRate: 30
};

function formatDateTime(value: string | null) {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function Field({
  id,
  label,
  value,
  onChange
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700" htmlFor={id}>{label}</label>
      <input
        className="mt-2 flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-slate-300"
        id={id}
        max={100}
        min={0}
        onChange={(event) => onChange(Number(event.target.value))}
        step={1}
        type="number"
        value={value}
      />
    </div>
  );
}

export default function PetyrAiForecastWeightsForm({ initialSetting }: { initialSetting: WeightsSetting }) {
  const [enabled, setEnabled] = useState(initialSetting.enabled);
  const [historicalWeightedBaseline, setHistoricalWeightedBaseline] = useState(
    initialSetting.enabled ? initialSetting.historicalWeightedBaseline : recommendedDraft.historicalWeightedBaseline
  );
  const [monthlySeasonality, setMonthlySeasonality] = useState(
    initialSetting.enabled ? initialSetting.monthlySeasonality : recommendedDraft.monthlySeasonality
  );
  const [runRate, setRunRate] = useState(initialSetting.enabled ? initialSetting.runRate : recommendedDraft.runRate);
  const [setting, setSetting] = useState(initialSetting);
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const total = useMemo(
    () => historicalWeightedBaseline + monthlySeasonality + runRate,
    [historicalWeightedBaseline, monthlySeasonality, runRate]
  );

  async function saveWeights() {
    setMessage(null);

    if (total !== 100) {
      setMessage("Weights must sum to 100 before saving.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          historicalWeightedBaseline,
          monthlySeasonality,
          runRate
        })
      });
      const payload = (await response.json()) as WeightsSetting | { error?: string; detail?: string };

      if (!response.ok || !("schemaVersion" in payload)) {
        const errorPayload = payload as { error?: string; detail?: string };
        setMessage(errorPayload.detail || errorPayload.error || "Unable to save AI Forecast weights.");
        return;
      }

      setSetting(payload);
      setEnabled(payload.enabled);
      setHistoricalWeightedBaseline(payload.historicalWeightedBaseline);
      setMonthlySeasonality(payload.monthlySeasonality);
      setRunRate(payload.runRate);
      setMessage("AI Forecast baseline weights saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save AI Forecast weights.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mt-5 space-y-5">
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
        Configure the global Management/Finance weights for the deterministic baseline. Weights apply only to historical weighted baseline, monthly seasonality and run-rate. Planned campaigns remain a floor, and agreement residual remains a cap/allocation signal.
      </div>

      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <input checked={enabled} onChange={(event) => setEnabled(event.target.checked)} type="checkbox" />
        Enable configured baseline weights
      </label>

      <div className="grid gap-4 md:grid-cols-3">
        <Field id="ai-forecast-weight-history" label="Historical weighted baseline" onChange={setHistoricalWeightedBaseline} value={historicalWeightedBaseline} />
        <Field id="ai-forecast-weight-seasonality" label="Monthly seasonality" onChange={setMonthlySeasonality} value={monthlySeasonality} />
        <Field id="ai-forecast-weight-run-rate" label="Run-rate" onChange={setRunRate} value={runRate} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Total</div>
          <div className={`mt-1 font-semibold ${total === 100 ? "text-emerald-800" : "text-rose-800"}`}>{total}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Current status</div>
          <div className="mt-1 font-semibold text-slate-900">{setting.enabled ? "Configured" : "Compatible fallback"}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Updated</div>
          <div className="mt-1 font-semibold text-slate-900">{formatDateTime(setting.updatedAt)}</div>
        </div>
      </div>

      <button
        className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:pointer-events-none disabled:opacity-50"
        disabled={isSaving || total !== 100}
        onClick={() => void saveWeights()}
        type="button"
      >
        {isSaving ? "Saving weights" : "Save weights"}
      </button>

      {message ? <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</div> : null}
    </div>
  );
}
