"use client";

import { useMemo, useState } from "react";
import { formatPetyrCurrency, formatPetyrInteger, formatPetyrNumber } from "@/lib/petyr/formatters";

type BackfillPreviewRow = {
  companyName: string;
  csmName: string;
  businessUnit: string;
  year: number;
  month: number;
  fieldName: string;
  previousValue: number | null;
  nextValue: number;
  campaignRows: number;
};

type BackfillWriteResult = {
  saveSessionIds: string[];
  forecastUpserts: number;
  changeLogRows: number;
};

type BackfillResult = {
  ok: true;
  mode: "dry-run" | "apply";
  year: number;
  asOf: string;
  source: string;
  durationMs: number;
  campaignRowsRead: number;
  includedCampaignRows: number;
  monthlyClosedRevenueAggregates: number;
  annualClosedRevenueAggregates: number;
  changedMonthlyPreviousMonthRows: number;
  changedMonthlyOngoingRows: number;
  changedAnnualOngoingRows: number;
  skipped: {
    missingDate: number;
    futureOrOtherYear: number;
    invalidStatus: number;
    planningOnlyStatus: number;
    negativeMonthlyAggregates: number;
    negativeAnnualAggregates: number;
  };
  warnings: string[];
  preview: {
    monthly: BackfillPreviewRow[];
    annual: BackfillPreviewRow[];
  };
  write: {
    monthly: BackfillWriteResult;
    annual: BackfillWriteResult;
  };
};

const endpoint = "/api/petyr/admin/backfill-2026-ongoing-from-closed";
const defaultAsOf = new Date().toISOString().slice(0, 10);

function formatDuration(durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs < 0) return "n/a";
  if (durationMs < 1000) return `${formatPetyrInteger(durationMs)} ms`;

  return `${formatPetyrNumber(durationMs / 1000)} s`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toISOString().slice(0, 10);
}

function totalChangedRows(result: BackfillResult | null) {
  if (!result) return 0;

  return result.changedMonthlyPreviousMonthRows + result.changedMonthlyOngoingRows + result.changedAnnualOngoingRows;
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function PreviewTable({ rows, title }: { rows: BackfillPreviewRow[]; title: string }) {
  if (!rows.length) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
        {title}: no changed rows in preview.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900">{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">CSM</th>
              <th className="px-3 py-2 font-medium">BU</th>
              <th className="px-3 py-2 font-medium">Month</th>
              <th className="px-3 py-2 font-medium">Field</th>
              <th className="px-3 py-2 font-medium text-right">Previous</th>
              <th className="px-3 py-2 font-medium text-right">Next</th>
              <th className="px-3 py-2 font-medium text-right">Campaign rows</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-700">
            {rows.map((row, index) => (
              <tr key={`${row.companyName}-${row.businessUnit}-${row.month}-${index}`}>
                <td className="px-3 py-2 font-medium text-slate-900">{row.companyName}</td>
                <td className="px-3 py-2">{row.csmName}</td>
                <td className="px-3 py-2">{row.businessUnit}</td>
                <td className="px-3 py-2">{row.month}</td>
                <td className="px-3 py-2">{row.fieldName}</td>
                <td className="px-3 py-2 text-right">{formatPetyrCurrency(row.previousValue)}</td>
                <td className="px-3 py-2 text-right font-semibold text-slate-900">{formatPetyrCurrency(row.nextValue)}</td>
                <td className="px-3 py-2 text-right">{formatPetyrInteger(row.campaignRows)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PetyrClosedRevenueOngoingBackfillControl() {
  const [secret, setSecret] = useState("");
  const [asOf, setAsOf] = useState(defaultAsOf);
  const [result, setResult] = useState<BackfillResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState<"dry-run" | "apply" | null>(null);
  const canApply = result?.mode === "dry-run";
  const dryRunChangeCount = totalChangedRows(result);
  const changedRowsLabel = useMemo(() => formatPetyrInteger(dryRunChangeCount), [dryRunChangeCount]);

  async function run(mode: "dry-run" | "apply") {
    setMessage(null);

    if (!secret.trim()) {
      setMessage("Enter APP_INTERNAL_SECRET before running this admin operation.");
      return;
    }

    if (mode === "apply" && !canApply) {
      setMessage("Run and review the dry-run preview before applying.");
      return;
    }

    if (mode === "apply") {
      const confirmed = window.confirm(
        `Apply the one-time 2026 backfill now? This can overwrite ${changedRowsLabel} matching Previous Month, Ongoing and annual Ongoing Forecast row(s).`
      );

      if (!confirmed) return;
    }

    setIsRunning(mode);
    setMessage(mode === "apply" ? "Applying reviewed 2026 backfill." : "Running dry-run preview.");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-app-secret": secret.trim()
        },
        body: JSON.stringify({
          mode,
          asOf: asOf || undefined,
          confirmed: mode === "apply",
          requestedBy: "petyr-admin-2026-backfill"
        })
      });
      const payload = (await response.json()) as BackfillResult | { error?: string; detail?: string };

      if (!response.ok) {
        setMessage("ok" in payload ? "Unable to run 2026 backfill." : payload.detail || payload.error || "Unable to run 2026 backfill.");
        return;
      }

      if (!("ok" in payload)) {
        setMessage(payload.detail || payload.error || "Unable to run 2026 backfill.");
        return;
      }

      setResult(payload);
      setMessage(
        payload.mode === "apply"
          ? "2026 backfill applied. Audit save/change rows were written for changed values."
          : "Dry-run completed. Review the preview and warnings before applying."
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to run 2026 backfill.");
    } finally {
      setIsRunning(null);
    }
  }

  return (
    <div className="mt-5 space-y-6">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
        One-time 2026 DB alignment. Run dry-run first; apply only after reviewing counts, warnings and preview rows. Monthly closed revenue is copied to both Previous Month Forecast and Ongoing Forecast through the selected date.
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="closed-revenue-backfill-secret">
            APP_INTERNAL_SECRET
          </label>
          <input
            className="mt-2 flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-slate-300"
            id="closed-revenue-backfill-secret"
            onChange={(event) => setSecret(event.target.value)}
            placeholder="Protected admin secret"
            type="password"
            value={secret}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="closed-revenue-backfill-as-of">
            Closed revenue through
          </label>
          <input
            className="mt-2 flex h-10 w-full max-w-xs rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-slate-300"
            id="closed-revenue-backfill-as-of"
            onChange={(event) => setAsOf(event.target.value)}
            type="date"
            value={asOf}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-5">
        <button
          className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:pointer-events-none disabled:opacity-50"
          disabled={isRunning !== null}
          onClick={() => void run("dry-run")}
          type="button"
        >
          {isRunning === "dry-run" ? "Running dry-run" : "Run dry-run"}
        </button>
        <button
          className="inline-flex h-10 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-medium text-rose-900 transition-colors hover:bg-rose-100 disabled:pointer-events-none disabled:opacity-50"
          disabled={isRunning !== null || !canApply}
          onClick={() => void run("apply")}
          type="button"
        >
          {isRunning === "apply" ? "Applying backfill" : "Apply reviewed backfill"}
        </button>
      </div>

      {message ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</div>
      ) : null}

      {result ? (
        <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
              {result.mode}
            </span>
            <span className="text-sm text-slate-600">as of {formatDate(result.asOf)}</span>
            <span className="text-sm text-slate-600">duration {formatDuration(result.durationMs)}</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatBox label="Campaign rows read" value={formatPetyrInteger(result.campaignRowsRead)} />
            <StatBox label="Included rows" value={formatPetyrInteger(result.includedCampaignRows)} />
            <StatBox label="Previous month changes" value={formatPetyrInteger(result.changedMonthlyPreviousMonthRows)} />
            <StatBox label="Ongoing changes" value={formatPetyrInteger(result.changedMonthlyOngoingRows)} />
            <StatBox label="Annual changes" value={formatPetyrInteger(result.changedAnnualOngoingRows)} />
            <StatBox label="Monthly aggregates" value={formatPetyrInteger(result.monthlyClosedRevenueAggregates)} />
            <StatBox label="Annual aggregates" value={formatPetyrInteger(result.annualClosedRevenueAggregates)} />
            <StatBox label="Monthly upserts" value={formatPetyrInteger(result.write.monthly.forecastUpserts)} />
            <StatBox label="Annual upserts" value={formatPetyrInteger(result.write.annual.forecastUpserts)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatBox label="Missing date skipped" value={formatPetyrInteger(result.skipped.missingDate)} />
            <StatBox label="Future/other year skipped" value={formatPetyrInteger(result.skipped.futureOrOtherYear)} />
            <StatBox label="Invalid status skipped" value={formatPetyrInteger(result.skipped.invalidStatus)} />
            <StatBox label="Planning status skipped" value={formatPetyrInteger(result.skipped.planningOnlyStatus)} />
            <StatBox label="Monthly logs" value={formatPetyrInteger(result.write.monthly.changeLogRows)} />
            <StatBox label="Annual logs" value={formatPetyrInteger(result.write.annual.changeLogRows)} />
          </div>

          {result.warnings.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="text-sm font-semibold text-amber-950">Warnings</div>
              <ul className="mt-2 space-y-2 text-sm text-amber-900">
                {result.warnings.map((warning, index) => (
                  <li key={`${warning}-${index}`}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="grid gap-4">
            <PreviewTable rows={result.preview.monthly} title="Monthly Previous Month + Ongoing Forecast preview" />
            <PreviewTable rows={result.preview.annual} title="Annual Ongoing Forecast preview" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
