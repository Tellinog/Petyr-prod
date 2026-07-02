"use client";

import { useMemo, useState } from "react";
import { formatPetyrCurrency, formatPetyrInteger, formatPetyrNumber, formatPetyrPercent } from "@/lib/petyr/formatters";

type SelectedCompany = {
  rank: number;
  companyName: string;
  closedRevenueThroughAsOf: number;
};

type BacktestRow = {
  companyName: string;
  businessUnit: string;
  year: number;
  month: number;
  predictedValue: number;
  actualClosedRevenue: number;
  absoluteError: number;
  percentageError: number | null;
};

type BacktestAggregate = {
  scope: string;
  month: number | null;
  rows: number;
  predictedValue: number;
  actualClosedRevenue: number;
  absoluteError: number;
  percentageError: number | null;
};

type BacktestResult = {
  ok: true;
  source: "postgresql";
  mode: "read-only";
  selection: "top_revenue";
  asOf: string;
  year: number;
  months: number[];
  limit: number;
  durationMs: number;
  selectedCompanies: SelectedCompany[];
  rows: BacktestRow[];
  monthlyAggregates: BacktestAggregate[];
  totalAggregate: BacktestAggregate;
  diagnostics: string[];
};

const endpoint = "/api/petyr/admin/ai-preview-backtest";
const defaultAsOf = "2026-03-15";
const defaultYear = 2026;
const defaultMonths = [5, 6];
const defaultLimit = 10;

function formatDuration(durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs < 0) return "n/a";
  if (durationMs < 1000) return `${formatPetyrInteger(durationMs)} ms`;
  return `${formatPetyrNumber(durationMs / 1000)} s`;
}

function monthLabel(month: number | null) {
  if (month === 5) return "May";
  if (month === 6) return "June";
  return month === null ? "All months" : `Month ${month}`;
}

function percentValue(value: number | null) {
  return value === null ? "n/a" : formatPetyrPercent(value * 100);
}

function StatBox({ label, value, helper }: { label: string; value: string | number; helper?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 font-semibold text-slate-900">{value}</div>
      {helper ? <div className="mt-1 text-xs text-slate-500">{helper}</div> : null}
    </div>
  );
}

function AggregateCard({ aggregate }: { aggregate: BacktestAggregate }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
      <div className="flex items-center justify-between gap-3">
        <div className="font-semibold text-slate-950">{monthLabel(aggregate.month)}</div>
        <div className="text-xs text-slate-500">{formatPetyrInteger(aggregate.rows)} rows</div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <StatBox label="AI preview" value={formatPetyrCurrency(aggregate.predictedValue)} />
        <StatBox label="Closed revenue" value={formatPetyrCurrency(aggregate.actualClosedRevenue)} />
        <StatBox label="Abs error" value={formatPetyrCurrency(aggregate.absoluteError)} />
        <StatBox label="% error" value={percentValue(aggregate.percentageError)} />
      </div>
    </div>
  );
}

function SelectedCompaniesTable({ companies }: { companies: SelectedCompany[] }) {
  if (!companies.length) return <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">No companies selected.</div>;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900">Selected companies</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Rank</th>
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium text-right">Closed revenue through as-of</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-700">
            {companies.map((company) => (
              <tr key={company.companyName}>
                <td className="px-3 py-2">{company.rank}</td>
                <td className="px-3 py-2 font-medium text-slate-900">{company.companyName}</td>
                <td className="px-3 py-2 text-right">{formatPetyrCurrency(company.closedRevenueThroughAsOf)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RowsTable({ rows }: { rows: BacktestRow[] }) {
  if (!rows.length) return <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">No backtest rows available.</div>;

  return (
    <details className="rounded-xl border border-slate-200 bg-white text-sm text-slate-700">
      <summary className="cursor-pointer border-b border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-900">
        Row-level comparison ({formatPetyrInteger(rows.length)})
      </summary>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">BU</th>
              <th className="px-3 py-2 font-medium">Month</th>
              <th className="px-3 py-2 font-medium text-right">AI preview</th>
              <th className="px-3 py-2 font-medium text-right">Closed revenue</th>
              <th className="px-3 py-2 font-medium text-right">Abs error</th>
              <th className="px-3 py-2 font-medium text-right">% error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-700">
            {rows.map((row, index) => (
              <tr key={`${row.companyName}-${row.businessUnit}-${row.month}-${index}`}>
                <td className="px-3 py-2 font-medium text-slate-900">{row.companyName}</td>
                <td className="px-3 py-2">{row.businessUnit}</td>
                <td className="px-3 py-2">{monthLabel(row.month)}</td>
                <td className="px-3 py-2 text-right">{formatPetyrCurrency(row.predictedValue)}</td>
                <td className="px-3 py-2 text-right">{formatPetyrCurrency(row.actualClosedRevenue)}</td>
                <td className="px-3 py-2 text-right">{formatPetyrCurrency(row.absoluteError)}</td>
                <td className="px-3 py-2 text-right">{percentValue(row.percentageError)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default function PetyrAiPreviewBacktestControl() {
  const [secret, setSecret] = useState("");
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const aggregateCards = useMemo(() => result ? [...result.monthlyAggregates, result.totalAggregate] : [], [result]);

  async function runBacktest() {
    setMessage(null);

    if (!secret.trim()) {
      setMessage("Enter APP_INTERNAL_SECRET before running this admin backtest.");
      return;
    }

    setIsRunning(true);
    setMessage("Running read-only AI preview backtest.");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-app-secret": secret.trim()
        },
        body: JSON.stringify({
          asOf: defaultAsOf,
          year: defaultYear,
          months: defaultMonths,
          selection: "top_revenue",
          limit: defaultLimit
        })
      });
      const payload = (await response.json()) as BacktestResult | { error?: string; detail?: string };

      if (!response.ok || !("ok" in payload)) {
        const errorPayload = payload as { error?: string; detail?: string };
        setMessage(errorPayload.detail || errorPayload.error || "Unable to run AI preview backtest.");
        return;
      }

      const successfulPayload = payload as BacktestResult;
      setResult(successfulPayload);
      setMessage(`Backtest completed in ${formatDuration(successfulPayload.durationMs)}. No database rows were written.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to run AI preview backtest.");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="mt-5 space-y-6">
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
        Read-only calibration run. It uses top 10 companies by closed revenue through 2026-03-15, forecasts May and June 2026 with Petyr deterministic preview logic, compares against current closed revenue and writes nothing.
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="ai-preview-backtest-secret">
            APP_INTERNAL_SECRET
          </label>
          <input
            className="mt-2 flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-slate-300"
            id="ai-preview-backtest-secret"
            onChange={(event) => setSecret(event.target.value)}
            placeholder="Protected admin secret"
            type="password"
            value={secret}
          />
        </div>
        <button
          className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:pointer-events-none disabled:opacity-50"
          disabled={isRunning}
          onClick={() => void runBacktest()}
          type="button"
        >
          {isRunning ? "Running backtest" : "Run default backtest"}
        </button>
      </div>

      {message ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</div>
      ) : null}

      {result ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatBox label="As of" value={result.asOf} />
            <StatBox label="Target year" value={result.year} />
            <StatBox label="Months" value={result.months.map(monthLabel).join(", ")} />
            <StatBox label="Duration" value={formatDuration(result.durationMs)} />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            {aggregateCards.map((aggregate) => <AggregateCard key={aggregate.scope} aggregate={aggregate} />)}
          </div>

          <SelectedCompaniesTable companies={result.selectedCompanies} />
          <RowsTable rows={result.rows} />

          {result.diagnostics.length > 0 ? (
            <details className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              <summary className="cursor-pointer font-medium">Diagnostics ({formatPetyrInteger(result.diagnostics.length)})</summary>
              <ul className="mt-3 list-disc space-y-1 pl-5">
                {result.diagnostics.map((diagnostic) => <li key={diagnostic}>{diagnostic}</li>)}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
