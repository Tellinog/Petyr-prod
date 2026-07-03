"use client";

import { FormEvent, useState } from "react";
import { formatPetyrNumber } from "@/lib/petyr/formatters";

type ImportIssue = {
  row?: number;
  field?: string;
  message: string;
};

type ImportResult = {
  ok: boolean;
  dryRun: boolean;
  source: string;
  fileName?: string;
  year: number;
  totalRows: number;
  importableRows: number;
  changedRows: number;
  unchangedRows: number;
  importedRows: number;
  skippedRows: number;
  forecastUpserts: number;
  activeStatusUpdates: number;
  missingCustomerInactiveUpdates: number;
  changeLogRows: number;
  saveSessionIds: string[];
  durationMs: number;
  message?: string;
  errors: ImportIssue[];
  warnings: ImportIssue[];
  duplicateCustomers: Array<{ customerName: string; rows: number[] }>;
  preview: Array<{
    companyName: string;
    csmName: string;
    ongoingTotal: number;
    forecastChanges: number;
    activeStatusChange: boolean;
    missingFromImport: boolean;
    sourceRows: number[];
  }>;
};

const importEndpoint = "/api/petyr/admin/import-annual-forecast-xlsx";

function isValidYear(value: string) {
  const year = Number(value);
  return Number.isInteger(year) && year >= 2026 && year <= 2100;
}

function issueLabel(issue: ImportIssue) {
  const location = issue.row ? `Row ${issue.row}` : "Workbook";
  const field = issue.field ? `, ${issue.field}` : "";

  return `${location}${field}: ${issue.message}`;
}

function formatDuration(durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs < 0) return "n/a";
  if (durationMs < 1000) return `${formatPetyrNumber(durationMs)} ms`;

  return `${formatPetyrNumber(durationMs / 1000)} s`;
}

function formatMoney(value: number) {
  return `${formatPetyrNumber(value)} EUR`;
}

export default function PetyrAnnualForecastExcelImportWorkflow() {
  const [year, setYear] = useState("2026");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [markMissingCustomersInactive, setMarkMissingCustomersInactive] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isYearValid = isValidYear(year);
  const canApply = Boolean(file && result?.ok && result.dryRun && result.changedRows > 0);

  async function submitImport(dryRun: boolean) {
    setMessage(null);

    if (!file) {
      setMessage("Choose an .xlsx annual workbook before importing.");
      return;
    }

    if (!isYearValid) {
      setMessage("Enter a year between 2026 and 2100.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("year", year);
    formData.append("dryRun", dryRun ? "true" : "false");
    formData.append("markMissingCustomersInactive", markMissingCustomersInactive ? "true" : "false");
    setIsSubmitting(true);
    setMessage(dryRun ? "Validating annual forecast workbook." : "Applying annual forecast import.");

    try {
      const response = await fetch(importEndpoint, {
        method: "POST",
        body: formData
      });
      const payload = (await response.json()) as ImportResult | { error?: string; detail?: string };

      if ("totalRows" in payload) {
        setResult(payload);
        setMessage(payload.message || (payload.ok ? "Annual forecast import completed." : "Annual forecast import failed validation."));
      } else {
        setMessage(payload.detail || payload.error || "Annual forecast import failed.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Annual forecast import failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleValidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitImport(true);
  }

  return (
    <div className="mt-5 space-y-6">
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
        Use this workflow to update annual Forecast Ongoing by Business Unit from the 2026 annual workbook. Forecast Initial,
        confidence, monthly forecast, Closed revenue and AI forecast are not imported.
      </div>

      <form className="space-y-4" onSubmit={handleValidate}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="annual-forecast-xlsx-year">
              Year
            </label>
            <input
              className="mt-2 flex h-10 w-full max-w-xs rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-slate-300"
              id="annual-forecast-xlsx-year"
              inputMode="numeric"
              max={2100}
              min={2026}
              onChange={(event) => {
                setYear(event.target.value);
                setResult(null);
                setMessage(null);
              }}
              type="number"
              value={year}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="annual-forecast-xlsx">
              Annual forecast workbook
            </label>
            <input
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
              id="annual-forecast-xlsx"
              name="file"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setResult(null);
                setMessage(null);
              }}
              type="file"
            />
          </div>
        </div>

        {!isYearValid ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Enter a year between 2026 and 2100.
          </div>
        ) : null}

        <label className="flex max-w-3xl items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <input
            checked={markMissingCustomersInactive}
            className="mt-1 h-4 w-4 rounded border-amber-300 text-slate-900 focus:ring-slate-300"
            onChange={(event) => {
              setMarkMissingCustomersInactive(event.target.checked);
              setResult(null);
              setMessage(null);
            }}
            type="checkbox"
          />
          <span>
            Mark Customers missing from this workbook as inactive during apply.
          </span>
        </label>

        <div className="flex flex-wrap gap-3">
          <button
            className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:pointer-events-none disabled:opacity-50"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Working" : "Validate annual workbook"}
          </button>
          <button
            className="inline-flex h-10 items-center justify-center rounded-xl bg-emerald-700 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:pointer-events-none disabled:opacity-50"
            disabled={isSubmitting || !canApply}
            onClick={() => void submitImport(false)}
            type="button"
          >
            Apply annual import
          </button>
        </div>
      </form>

      {message ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</div>
      ) : null}

      {result ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${result.ok ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
              {result.ok ? "ok" : "failed"}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
              {result.dryRun ? "dry run" : "applied"}
            </span>
          </div>

          <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Rows read</div>
              <div className="mt-1 font-semibold text-slate-900">{result.totalRows}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Customers</div>
              <div className="mt-1 font-semibold text-slate-900">{result.importableRows}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Changed Customers</div>
              <div className="mt-1 font-semibold text-slate-900">{result.changedRows}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Unchanged Customers</div>
              <div className="mt-1 font-semibold text-slate-900">{result.unchangedRows}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Forecast upserts</div>
              <div className="mt-1 font-semibold text-slate-900">{result.forecastUpserts}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Inactive updates</div>
              <div className="mt-1 font-semibold text-slate-900">{result.activeStatusUpdates}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Missing Customers inactive</div>
              <div className="mt-1 font-semibold text-slate-900">{result.missingCustomerInactiveUpdates}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Change logs</div>
              <div className="mt-1 font-semibold text-slate-900">{result.changeLogRows}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Duration</div>
              <div className="mt-1 font-semibold text-slate-900">{formatDuration(result.durationMs)}</div>
            </div>
          </div>

          {result.saveSessionIds.length > 0 ? (
            <div className="mt-3 text-xs text-slate-500">Save sessions: {result.saveSessionIds.slice(0, 5).join(", ")}</div>
          ) : null}

          {result.errors.length > 0 ? (
            <div className="mt-4 max-h-64 overflow-auto rounded-xl border border-rose-200 bg-rose-50 p-3">
              <div className="text-sm font-semibold text-rose-900">Invalid rows</div>
              <ul className="mt-2 space-y-2 text-sm text-rose-800">
                {result.errors.map((error, index) => (
                  <li key={`${error.row}-${error.field}-${index}`}>{issueLabel(error)}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {result.warnings.length > 0 || result.duplicateCustomers.length > 0 ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="text-sm font-semibold text-amber-950">Warnings</div>
              <ul className="mt-2 space-y-2 text-sm text-amber-900">
                {result.warnings.map((warning, index) => (
                  <li key={`${warning.row}-${warning.field}-${index}`}>{issueLabel(warning)}</li>
                ))}
                {result.duplicateCustomers.slice(0, 20).map((duplicate) => (
                  <li key={duplicate.customerName}>
                    Duplicate Customer aggregated: {duplicate.customerName} (rows {duplicate.rows.join(", ")})
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {result.preview.length > 0 ? (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Customer</th>
                    <th className="px-3 py-2 font-medium">CSM</th>
                    <th className="px-3 py-2 font-medium">Ongoing total</th>
                    <th className="px-3 py-2 font-medium">BU changes</th>
                    <th className="px-3 py-2 font-medium">Inactive</th>
                    <th className="px-3 py-2 font-medium">Source rows</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
                  {result.preview.map((row) => (
                    <tr key={`${row.companyName}-${row.sourceRows.join("-")}`}>
                      <td className="px-3 py-2 font-medium text-slate-900">{row.companyName}</td>
                      <td className="px-3 py-2">{row.csmName}</td>
                      <td className="px-3 py-2">{formatMoney(row.ongoingTotal)}</td>
                      <td className="px-3 py-2">{row.forecastChanges}</td>
                      <td className="px-3 py-2">{row.activeStatusChange ? "yes" : "no"}</td>
                      <td className="px-3 py-2">{row.missingFromImport ? "missing from workbook" : row.sourceRows.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
