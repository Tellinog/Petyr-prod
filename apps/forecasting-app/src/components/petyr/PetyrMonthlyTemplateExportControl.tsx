"use client";

import { useMemo, useState } from "react";

const exportEndpoint = "/api/petyr/admin/export-monthly-template";
const minYear = 2000;
const maxYear = 2100;

function isValidYear(value: string) {
  const year = Number(value);

  return Number.isInteger(year) && year >= minYear && year <= maxYear;
}

export default function PetyrMonthlyTemplateExportControl() {
  const [year, setYear] = useState(() => String(new Date().getFullYear()));
  const isYearValid = isValidYear(year);
  const downloadHref = useMemo(() => {
    const params = new URLSearchParams({ year });

    return `${exportEndpoint}?${params.toString()}`;
  }, [year]);

  return (
    <div className="mt-5 space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700" htmlFor="monthly-template-year">
          Template year
        </label>
        <input
          className="mt-2 flex h-10 w-full max-w-xs rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-slate-300"
          id="monthly-template-year"
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
          Download monthly template CSV
        </a>
      ) : (
        <div className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-400">
          Download monthly template CSV
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
