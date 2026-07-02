"use client";

import { useState } from "react";
import { formatPetyrInteger } from "@/lib/petyr/formatters";

type CompanyResult = {
  companyName: string;
  csmName: string;
  status: "processed" | "skipped" | "failed";
  reason: string | null;
  savedRows: number;
  skippedRows: number;
  deterministicCandidatesCount: number;
};

type PreflightDiagnostics = {
  missingForecastRelations: string[];
  warningForecastRelations: string[];
  missingRedashRelations: string[];
  emptyRedashRelations: string[];
  relationStatus: Array<{
    relationName: string;
    exists: boolean;
    rowCount: number | null;
    severity: "required" | "warning";
  }>;
  notes: string[];
};

type DailyRunResult = {
  ok: true;
  mode: "all_active";
  source: "petyr-admin-manual-run";
  skippedByLock: boolean;
  year: number;
  runDate: string;
  timezone: string;
  modelVersion: string;
  delayMs: number;
  selectedCompanies: number;
  processedCompanies: number;
  skippedCompanies: number;
  failedCompanies: number;
  savedRows: number;
  skippedRows: number;
  companies: CompanyResult[];
  diagnostics: string[];
  preflightDiagnostics?: PreflightDiagnostics;
};

type DailyRunError = {
  error?: string;
  detail?: string;
  missingForecastRelations?: string[];
  missingRedashRelations?: string[];
  emptyRedashRelations?: string[];
  warningForecastRelations?: string[];
  originalErrorClass?: string;
  safeOriginalMessage?: string;
  preflightDiagnostics?: PreflightDiagnostics | null;
};

const endpoint = "/api/petyr/admin/daily-ai-forecast/run";

async function parseDailyRunResponse(response: Response): Promise<DailyRunResult | DailyRunError> {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text) as DailyRunResult | DailyRunError;
    } catch (error) {
      return {
        error: "Unable to parse Daily AI Forecast response as JSON.",
        detail: error instanceof Error ? error.message : "Invalid JSON response."
      };
    }
  }

  return {
    error: "Daily AI Forecast endpoint returned a non-JSON response.",
    detail: text.trim().slice(0, 240) || `HTTP ${response.status}`
  };
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function InlineList({ items }: { items: string[] }) {
  if (items.length === 0) return <span className="text-slate-500">n/a</span>;
  return <span>{items.join(", ")}</span>;
}

function DiagnosticsPanel({ diagnostics }: { diagnostics: PreflightDiagnostics }) {
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700" open>
      <summary className="cursor-pointer font-semibold text-slate-900">Daily AI Forecast preflight diagnostics</summary>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Missing forecast relations</div>
          <div className="mt-1 text-sm"><InlineList items={diagnostics.missingForecastRelations} /></div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Forecast warnings</div>
          <div className="mt-1 text-sm"><InlineList items={diagnostics.warningForecastRelations} /></div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Missing Redash relations</div>
          <div className="mt-1 text-sm"><InlineList items={diagnostics.missingRedashRelations} /></div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Empty Redash relations</div>
          <div className="mt-1 text-sm"><InlineList items={diagnostics.emptyRedashRelations} /></div>
        </div>
      </div>

      {diagnostics.relationStatus.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="bg-slate-50 uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Relation</th>
                <th className="px-3 py-2 font-medium">Severity</th>
                <th className="px-3 py-2 font-medium">Exists</th>
                <th className="px-3 py-2 font-medium text-right">Rows</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {diagnostics.relationStatus.map((row) => (
                <tr key={row.relationName}>
                  <td className="px-3 py-2 font-medium text-slate-900">{row.relationName}</td>
                  <td className="px-3 py-2">{row.severity}</td>
                  <td className="px-3 py-2">{row.exists ? "yes" : "no"}</td>
                  <td className="px-3 py-2 text-right">{row.rowCount === null ? "n/a" : formatPetyrInteger(row.rowCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {diagnostics.notes.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-600">
          {diagnostics.notes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      ) : null}
    </details>
  );
}

export default function PetyrDailyAiForecastRunControl() {
  const [secret, setSecret] = useState("");
  const [result, setResult] = useState<DailyRunResult | null>(null);
  const [errorDetails, setErrorDetails] = useState<DailyRunError | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  async function runDailyForecast() {
    setMessage(null);
    setErrorDetails(null);

    if (!secret.trim()) {
      setMessage("Enter APP_INTERNAL_SECRET before running Daily AI Forecast.");
      return;
    }

    const confirmed = window.confirm(
      "Run Daily AI Forecast now for all active companies? This writes missing deterministic AI Forecast rows to ai_forecast_cache and skips rows already saved for today's model version."
    );

    if (!confirmed) return;

    setIsRunning(true);
    setMessage("Running Daily AI Forecast for all active companies.");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-app-secret": secret.trim()
        },
        body: JSON.stringify({
          mode: "all_active",
          confirmed: true
        })
      });
      const payload = await parseDailyRunResponse(response);

      if (!response.ok || !("ok" in payload)) {
        const errorPayload = payload as DailyRunError;
        setErrorDetails(errorPayload);
        setResult(null);
        setMessage(errorPayload.detail || errorPayload.error || "Unable to run Daily AI Forecast.");
        return;
      }

      setResult(payload);
      setMessage(
        payload.skippedByLock
          ? "Daily AI Forecast was skipped because another worker holds the PostgreSQL advisory lock."
          : `Daily AI Forecast completed. Saved ${formatPetyrInteger(payload.savedRows)} row(s), skipped ${formatPetyrInteger(payload.skippedRows)} row(s).`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to run Daily AI Forecast.");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="mt-5 space-y-6">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
        Manual recovery run for the same deterministic Daily AI Forecast worker used overnight. It processes all active companies, writes only missing ai_forecast_cache rows for the daily model version and skips duplicates.
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="daily-ai-forecast-secret">
            APP_INTERNAL_SECRET
          </label>
          <input
            className="mt-2 flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-slate-300"
            id="daily-ai-forecast-secret"
            onChange={(event) => setSecret(event.target.value)}
            placeholder="Protected admin secret"
            type="password"
            value={secret}
          />
        </div>
        <button
          className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:pointer-events-none disabled:opacity-50"
          disabled={isRunning}
          onClick={() => void runDailyForecast()}
          type="button"
        >
          {isRunning ? "Running Daily Forecast" : "Run Daily Forecast now"}
        </button>
      </div>

      {message ? <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</div> : null}

      {errorDetails ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-950">
            <div className="font-semibold">{errorDetails.error ?? "Daily AI Forecast error"}</div>
            {errorDetails.detail ? <div className="mt-1">{errorDetails.detail}</div> : null}
            {errorDetails.originalErrorClass || errorDetails.safeOriginalMessage ? (
              <div className="mt-2 text-xs text-red-900">
                {errorDetails.originalErrorClass ? <div>Error class: {errorDetails.originalErrorClass}</div> : null}
                {errorDetails.safeOriginalMessage ? <div>Original message: {errorDetails.safeOriginalMessage}</div> : null}
              </div>
            ) : null}
          </div>
          {errorDetails.preflightDiagnostics ? <DiagnosticsPanel diagnostics={errorDetails.preflightDiagnostics} /> : null}
        </div>
      ) : null}

      {result ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatBox label="Run date" value={result.runDate} />
            <StatBox label="Year" value={result.year} />
            <StatBox label="Selected companies" value={formatPetyrInteger(result.selectedCompanies)} />
            <StatBox label="Saved rows" value={formatPetyrInteger(result.savedRows)} />
            <StatBox label="Skipped rows" value={formatPetyrInteger(result.skippedRows)} />
            <StatBox label="Failed companies" value={formatPetyrInteger(result.failedCompanies)} />
            <StatBox label="Timezone" value={result.timezone} />
            <StatBox label="Model version" value={result.modelVersion} />
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Company</th>
                  <th className="px-3 py-2 font-medium">CSM</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium text-right">Candidates</th>
                  <th className="px-3 py-2 font-medium text-right">Saved</th>
                  <th className="px-3 py-2 font-medium text-right">Skipped</th>
                  <th className="px-3 py-2 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-700">
                {result.companies.map((company) => (
                  <tr key={company.companyName}>
                    <td className="px-3 py-2 font-medium text-slate-900">{company.companyName}</td>
                    <td className="px-3 py-2">{company.csmName}</td>
                    <td className="px-3 py-2">{company.status}</td>
                    <td className="px-3 py-2 text-right">{formatPetyrInteger(company.deterministicCandidatesCount)}</td>
                    <td className="px-3 py-2 text-right">{formatPetyrInteger(company.savedRows)}</td>
                    <td className="px-3 py-2 text-right">{formatPetyrInteger(company.skippedRows)}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{company.reason ?? "n/a"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.diagnostics.length > 0 ? (
            <details className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
              <summary className="cursor-pointer font-semibold text-slate-900">Diagnostics ({formatPetyrInteger(result.diagnostics.length)})</summary>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-600">
                {result.diagnostics.map((diagnostic, index) => <li key={`${diagnostic}-${index}`}>{diagnostic}</li>)}
              </ul>
            </details>
          ) : null}

          {result.preflightDiagnostics ? <DiagnosticsPanel diagnostics={result.preflightDiagnostics} /> : null}
        </div>
      ) : null}
    </div>
  );
}
