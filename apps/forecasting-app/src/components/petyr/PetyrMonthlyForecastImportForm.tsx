"use client";

import { FormEvent, useState } from "react";

type ImportError = {
  row: number;
  field: string;
  message: string;
};

type ImportResult = {
  ok: boolean;
  source: string;
  fileName?: string;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  forecastUpserts: number;
  companyStatusUpserts: number;
  changeLogRows: number;
  csmCorrections: number;
  saveSessionId: string | null;
  errors: ImportError[];
};

const importEndpoint = "/api/petyr/admin/import-monthly-forecast";

export default function PetyrMonthlyForecastImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setResult(null);

    if (!file) {
      setMessage("Choose a CSV file before importing.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    setIsUploading(true);

    try {
      const response = await fetch(importEndpoint, {
        method: "POST",
        body: formData
      });
      const payload = (await response.json()) as ImportResult | { error?: string; detail?: string };

      if ("totalRows" in payload) {
        setResult(payload);
        setMessage(payload.ok ? "Import completed." : "Import failed validation.");
      } else {
        setMessage(payload.detail || payload.error || "Import failed.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
      <div>
        <label className="block text-sm font-medium text-slate-700" htmlFor="monthly-forecast-csv">
          Monthly forecast CSV
        </label>
        <input
          accept=".csv,text/csv"
          className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
          id="monthly-forecast-csv"
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
        {isUploading ? "Importing CSV" : "Import monthly forecast CSV"}
      </button>

      {message ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</div>
      ) : null}

      {result ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Rows</div>
              <div className="mt-1 font-semibold text-slate-900">{result.totalRows}</div>
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
          </div>

          {result.saveSessionId ? (
            <div className="mt-3 text-xs text-slate-500">Save session: {result.saveSessionId}</div>
          ) : null}

          {result.errors.length > 0 ? (
            <div className="mt-4 max-h-64 overflow-auto rounded-xl border border-rose-200 bg-rose-50 p-3">
              <div className="text-sm font-semibold text-rose-900">Invalid rows</div>
              <ul className="mt-2 space-y-2 text-sm text-rose-800">
                {result.errors.map((error, index) => (
                  <li key={`${error.row}-${error.field}-${index}`}>
                    Row {error.row}, {error.field}: {error.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
