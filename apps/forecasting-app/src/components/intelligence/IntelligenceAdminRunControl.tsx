"use client";

import { useState } from "react";

export default function IntelligenceAdminRunControl({
  maxCompanies,
  maxResultsPerCompany,
  initialWorkerEnabled,
  workerEnabledSource,
  dailyBudgetRemaining,
  dailyBudgetLimit,
  scanDailyTime,
  scanTimezone
}: {
  maxCompanies: number;
  maxResultsPerCompany: number;
  initialWorkerEnabled: boolean;
  workerEnabledSource: string;
  dailyBudgetRemaining: number;
  dailyBudgetLimit: number;
  scanDailyTime: string;
  scanTimezone: string;
}) {
  const [appSecret, setAppSecret] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [workerEnabled, setWorkerEnabled] = useState(initialWorkerEnabled);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState(false);

  async function run() {
    setLoading(true);
    setStatus(null);

    try {
      const response = await fetch("/api/petyr/admin/intelligence/runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(dryRun ? {} : { "x-app-secret": appSecret })
        },
        body: JSON.stringify({
          dryRun,
          confirmed: !dryRun,
          companyName: companyName.trim() || undefined,
          maxCompanies,
          maxResultsPerCompany
        })
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "Unable to run Intelligence.");
      }

      setStatus(`Run ${payload.runId ?? ""} finished as ${payload.status ?? "submitted"}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to run Intelligence.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleWorker(enabled: boolean) {
    setToggling(true);
    setStatus(null);

    try {
      const response = await fetch("/api/petyr/admin/intelligence/worker", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-app-secret": appSecret
        },
        body: JSON.stringify({ enabled })
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "Unable to update worker.");
      }

      setWorkerEnabled(Boolean(payload.workerEnabled));
      setStatus(`Worker ${payload.workerEnabled ? "enabled" : "disabled"}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to update worker.");
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-3 text-sm md:grid-cols-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Worker</div>
          <div className="mt-1 font-semibold">{workerEnabled ? "enabled" : "disabled"}</div>
          <div className="text-xs text-slate-500">{workerEnabledSource}</div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Schedule</div>
          <div className="mt-1 font-semibold">{scanDailyTime}</div>
          <div className="text-xs text-slate-500">{scanTimezone}</div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Daily budget</div>
          <div className="mt-1 font-semibold">{dailyBudgetRemaining} / {dailyBudgetLimit}</div>
          <div className="text-xs text-slate-500">remaining requests</div>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Company name
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) => setCompanyName(event.target.value)}
            placeholder="Optional exact company"
            value={companyName}
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          APP_INTERNAL_SECRET
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) => setAppSecret(event.target.value)}
            placeholder="Required only for real run"
            type="password"
            value={appSecret}
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input checked={dryRun} onChange={(event) => setDryRun(event.target.checked)} type="checkbox" />
        Dry run only
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          disabled={loading}
          onClick={run}
          type="button"
        >
          {loading ? "Running..." : "Run Intelligence"}
        </button>
        <span className="text-xs text-slate-500">
          Cap: {maxCompanies} companies, {maxResultsPerCompany} results per company.
        </span>
        <button
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-60"
          disabled={toggling}
          onClick={() => toggleWorker(!workerEnabled)}
          type="button"
        >
          {toggling ? "Updating..." : workerEnabled ? "Disable worker" : "Enable worker"}
        </button>
      </div>
      {status ? <div className="rounded-md border border-slate-200 bg-white p-2 text-sm text-slate-700">{status}</div> : null}
    </div>
  );
}
