"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PetyrSelectField } from "@/components/petyr/PetyrForecastNavigation";
import type { PetyrInitialForecastWindowOverrides } from "@/services/petyrInitialForecastWindowOverrideService";

const endpoint = "/api/petyr/admin/initial-forecast-window";

type Notice = {
  tone: "success" | "error";
  text: string;
};

function formatDateTime(value: string | null) {
  if (!value) return "n/a";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export default function PetyrInitialForecastWindowControl({
  initialSetting,
  initialError = null,
  yearOptions
}: {
  initialSetting: PetyrInitialForecastWindowOverrides;
  initialError?: string | null;
  yearOptions: number[];
}) {
  const [setting, setSetting] = useState(initialSetting);
  const [selectedYear, setSelectedYear] = useState(yearOptions[0] ?? new Date().getFullYear());
  const [notice, setNotice] = useState<Notice | null>(
    initialError ? { tone: "error", text: initialError } : null
  );
  const [isSaving, setIsSaving] = useState(false);
  const isUnlocked = setting.unlockedYears.includes(selectedYear);
  const unlockedYearsLabel = useMemo(
    () => setting.unlockedYears.length ? setting.unlockedYears.join(", ") : "None",
    [setting.unlockedYears]
  );

  async function updateSelectedYear(unlocked: boolean) {
    setIsSaving(true);
    setNotice(null);

    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: selectedYear, unlocked })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.detail || payload.error || "Unable to update Forecast Initial window.");
      }

      setSetting(payload as PetyrInitialForecastWindowOverrides);
      setNotice({
        tone: "success",
        text: unlocked
          ? `Forecast Initial is unlocked for ${selectedYear}.`
          : `Forecast Initial is locked again for ${selectedYear}.`
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to update Forecast Initial window."
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Selected year</div>
          <div className="mt-2">
            <PetyrSelectField
              label="Year"
              value={String(selectedYear)}
              disabled={isSaving}
              onChange={(event) => setSelectedYear(Number(event.target.value))}
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </PetyrSelectField>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Current state</div>
          <div className="mt-2">
            <Badge className={isUnlocked ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}>
              {isUnlocked ? "admin-unlocked" : "default window"}
            </Badge>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Default window remains December 10 through January 10.
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Last update</div>
          <div className="mt-1 font-semibold text-slate-900">{formatDateTime(setting.updatedAt)}</div>
          <div className="mt-1 text-xs text-slate-500">{setting.updatedBy}</div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
        Unlocked years: <span className="font-semibold text-slate-900">{unlockedYearsLabel}</span>
      </div>

      {notice ? (
        <div className={`rounded-xl border p-3 text-sm ${
          notice.tone === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : "border-rose-200 bg-rose-50 text-rose-900"
        }`}>
          {notice.text}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="button" className="rounded-xl" disabled={isSaving || isUnlocked} onClick={() => void updateSelectedYear(true)}>
          {isSaving ? "Saving" : "Unlock selected year"}
        </Button>
        <Button type="button" variant="outline" className="rounded-xl" disabled={isSaving || !isUnlocked} onClick={() => void updateSelectedYear(false)}>
          Lock selected year
        </Button>
      </div>
    </div>
  );
}
