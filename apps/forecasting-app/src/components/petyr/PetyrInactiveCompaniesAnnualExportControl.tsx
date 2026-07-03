"use client";

import { useMemo, useState } from "react";

const exportEndpoint = "/api/petyr/admin/export-inactive-companies-annual-forecast-xlsx";
const minYear = 2000;
const maxYear = 2100;

function isValidYear(value: string) {
  const year = Number(value);

  return Number.isInteger(year) && year >= minYear && year <= maxYear;
}

export default function PetyrInactiveCompaniesAnnualExportControl() {
  const [year, setYear] = useState("2026");
  const isYearValid = isValidYear(year);
  const downloadHref = useMemo(() => {
    const params = new URLSearchParams({ year });

    return `${exportEndpoint}?${params.toString()}`;
  }, [year]);

  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
        Export all companies explicitly saved as inactive, with total saved annual Forecast Ongoing revenue and saved revenue by official Business Unit.
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700" htmlFor="inactive-companies-annual-export-year">
          Year
        </label>
        <input
          className="mt-2 flex h-10 w-full max-w-xs rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-slate-300"
          id="inactive-companies-annual-export-year"
          inputMode="numeric"
          max={maxYear}
          min={minYear}
          onChange={(event) => setYear(event.target.value)}
          type="number"
          value={year}
        />
      </div>

      {isYearValid ? (
        <a
          className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          href={downloadHref}
        >
          Download inactive companies Excel
        </a>
      ) : (
        <div className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-400">
          Download inactive companies Excel
        </div>
      )}

      {!isYearValid ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Enter a year between {minYear} and {maxYear}.
        </div>
      ) : null}
    </div>
  );
}
