"use client";

import { useState, useTransition } from "react";

type SaveState = "idle" | "saving" | "saved" | "error";

export function CompanyForecastStatusAutosave({
  companyName,
  csmName,
  year,
  initialIsActive,
  canEdit
}: {
  companyName: string;
  csmName: string;
  year: number;
  initialIsActive: boolean;
  canEdit: boolean;
}) {
  const [isActive, setIsActive] = useState(initialIsActive);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function updateStatus(nextIsActive: boolean) {
    if (!canEdit || nextIsActive === isActive) return;

    const previous = isActive;
    setIsActive(nextIsActive);
    setSaveState("saving");
    setError("");

    startTransition(async () => {
      try {
        const response = await fetch("/api/petyr/company-status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            companyName,
            csmName,
            year,
            isActive: nextIsActive
          })
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload.error || payload.detail || "Unable to save company status.");
        }

        setIsActive(Boolean(payload.isActive));
        setSaveState("saved");
        window.setTimeout(() => {
          setSaveState((current) => (current === "saved" ? "idle" : current));
        }, 3000);
      } catch (saveError) {
        setIsActive(previous);
        setSaveState("error");
        setError(saveError instanceof Error ? saveError.message : "Unable to save company status.");
      }
    });
  }

  const disabled = !canEdit || isPending || saveState === "saving";
  const helper = saveState === "saving"
    ? "Saving..."
    : saveState === "saved"
      ? "Saved"
      : saveState === "error"
        ? error
        : canEdit
          ? "Auto-saves on change"
          : "Read-only";

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <label className="flex items-center gap-3 text-sm font-medium text-slate-900">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300 text-slate-900"
          checked={isActive}
          disabled={disabled}
          onChange={(event) => updateStatus(event.target.checked)}
        />
        <span>Forecast status: {isActive ? "Active" : "Inactive"}</span>
      </label>
      <span className={saveState === "error" ? "text-xs text-rose-700" : "text-xs text-slate-500"}>
        {helper}
      </span>
    </div>
  );
}
