"use client";

import { FormEvent, useMemo, useState } from "react";
import { formatPetyrNumber } from "@/lib/petyr/formatters";

type ImportIssue = {
  row?: number;
  field?: string;
  message: string;
};

type ProblemRow = {
  row: number;
  values: Record<string, string | undefined>;
  messages: string[];
};

type ImportResult = {
  ok: boolean;
  source: string;
  fileName?: string;
  totalRows: number;
  importableRows: number;
  changedRows: number;
  unchangedRows: number;
  importedRows: number;
  skippedRows: number;
  forecastUpserts: number;
  companyStatusUpserts: number;
  changeLogRows: number;
  csmCorrections: number;
  saveSessionId: string | null;
  saveSessionIds?: string[];
  durationMs: number;
  message?: string;
  errors: ImportIssue[];
  warnings?: ImportIssue[];
  problemRows?: ProblemRow[];
};

const exportEndpoint = "/api/petyr/admin/export-monthly-forecast-xlsx";
const importEndpoint = "/api/petyr/admin/import-monthly-forecast-xlsx";
const minYear = 2000;
const maxYear = 2100;

function isValidYear(value: string) {
  const year = Number(value);

  return Number.isInteger(year) && year >= minYear && year <= maxYear;
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

export default function PetyrMonthlyForecastExcelWorkflow({ preferredCsmName = null }: { preferredCsmName?: string | null }) {
  const [year, setYear] = useState("2026");
  const [csmName, setCsmName] = useState(preferredCsmName ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const isYearValid = isValidYear(year);
  const downloadHref = useMemo(() => {
    const params = new URLSearchParams({ year });
    const normalizedCsmName = csmName.trim();

    if (normalizedCsmName) params.set("csmName", normalizedCsmName);

    return `${exportEndpoint}?${params.toString()}`;
  }, [csmName, year]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setResult(null);

    if (!file) {
      setMessage("Choose an .xlsx workbook before importing.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    setIsUploading(true);
    setMessage("Importing Excel workbook. Petyr is checking only editable values and skipping unchanged rows.");

    try {
      const response = await fetch(importEndpoint, {
        method: "POST",
        body: formData
      });
      const payload = (await response.json()) as ImportResult | { error?: string; detail?: string };

      if ("totalRows" in payload) {
        setResult(payload);
        setMessage(payload.message || (payload.ok ? "Excel import completed." : "Excel import failed validation."));
      } else {
        setMessage(payload.detail || payload.error || "Excel import failed.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Excel import failed.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="mt-5 space-y-6">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
        Use this Excel workflow for bulk 2026 historical forecast input and CSM-friendly forecast updates.
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="monthly-forecast-xlsx-year">
            Year
          </label>
          <input
            className="mt-2 flex h-10 w-full max-w-xs rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-slate-300"
            id="monthly-forecast-xlsx-year"
            inputMode="numeric"
            max={maxYear}
            min={minYear}
            onChange={(event) => setYear(event.target.value)}
            type="number"
            value={year}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="monthly-forecast-xlsx-csm">
            CSM filter
          </label>
          <input
            className="mt-2 flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-slate-300"
            id="monthly-forecast-xlsx-csm"
            onChange={(event) => setCsmName(event.target.value)}
            placeholder="Optional exact CSM name"
            type="text"
            value={csmName}
          />
        </div>
      </div>

      {isYearValid ? (
        <a
          className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          href={downloadHref}
        >
          Download Excel template
        </a>
      ) : (
        <div className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-400">
          Download Excel template
        </div>
      )}

      {!isYearValid ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Enter a year between {minYear} and {maxYear}.
        </div>
      ) : null}

      <form className="space-y-4 border-t border-slate-200 pt-5" onSubmit={handleSubmit}>
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="monthly-forecast-xlsx">
            Completed Excel workbook
          </label>
          <input
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
            id="monthly-forecast-xlsx"
            name="file"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setResult(null);
              setMessage(null);
            }}
            type="file"
          />
        </div>

        <button
          className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:pointer-events-none disabled:opacity-50"
          disabled={isUploading}
          type="submit"
        >
          {isUploading ? "Importing Excel" : "Import Excel workbook"}
        </button>
      </form>

      {message ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</div>
      ) : null}

      {result ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Rows read</div>
              <div className="mt-1 font-semibold text-slate-900">{result.totalRows}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Importable rows</div>
              <div className="mt-1 font-semibold text-slate-900">{result.importableRows}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Changed rows</div>
              <div className="mt-1 font-semibold text-slate-900">{result.changedRows}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Unchanged rows</div>
              <div className="mt-1 font-semibold text-slate-900">{result.unchangedRows}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Imported rows</div>
              <div className="mt-1 font-semibold text-slate-900">{result.importedRows}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Forecast upserts</div>
              <div className="mt-1 font-semibold text-slate-900">{result.forecastUpserts}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Status upserts</div>
              <div className="mt-1 font-semibold text-slate-900">{result.companyStatusUpserts}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Change logs</div>
              <div className="mt-1 font-semibold text-slate-900">{result.changeLogRows}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Skipped rows</div>
              <div className="mt-1 font-semibold text-slate-900">{result.skippedRows}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">CSM corrections</div>
              <div className="mt-1 font-semibold text-slate-900">{result.csmCorrections}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Duration</div>
              <div className="mt-1 font-semibold text-slate-900">{formatDuration(result.durationMs)}</div>
            </div>
          </div>

          {result.ok && result.changedRows === 0 ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
              No changes detected. Nothing was imported.
            </div>
          ) : null}

          {result.saveSessionId ? (
            <div className="mt-3 text-xs text-slate-500">Save session: {result.saveSessionId}</div>
          ) : null}

          {result.warnings && result.warnings.length > 0 ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="text-sm font-semibold text-amber-950">Warnings</div>
              <ul className="mt-2 space-y-2 text-sm text-amber-900">
                {result.warnings.map((warning, index) => (
                  <li key={`${warning.row}-${warning.field}-${index}`}>{issueLabel(warning)}</li>
                ))}
              </ul>
            </div>
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

          {result.problemRows && result.problemRows.length > 0 ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-sm font-semibold text-slate-900">Problem row preview</div>
              <div className="mt-2 space-y-3 text-xs text-slate-700">
                {result.problemRows.map((row) => (
                  <div className="rounded-lg border border-slate-200 bg-white p-3" key={row.row}>
                    <div className="font-semibold text-slate-900">Row {row.row}</div>
                    <div className="mt-1">{row.messages.join(" ")}</div>
                    <div className="mt-2 break-words text-slate-500">
                      {[row.values.csmName, row.values.companyName, row.values.businessUnit, row.values.year, row.values.month]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
