"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatPetyrCurrency, formatPetyrNumber } from "@/lib/petyr/formatters";
import type { ManagementObjectiveDisplayRow, ManagementObjectivesData } from "@/services/petyrManagementObjectiveService";

type Notice = {
  type: "success" | "error";
  text: string;
};

type ObjectiveState = {
  values: Record<string, string>;
  notes: Record<string, string>;
};

function rowKey(row: Pick<ManagementObjectiveDisplayRow, "scopeType" | "scopeKey">) {
  return `${row.scopeType}:${row.scopeKey}`;
}

function objectiveStateFromData(data: ManagementObjectivesData): ObjectiveState {
  const values: Record<string, string> = {};
  const notes: Record<string, string> = {};

  for (const row of [...data.branchObjectives, ...data.businessUnitObjectives]) {
    const key = rowKey(row);
    values[key] = row.currentValue === null ? "" : formatPetyrNumber(row.currentValue);
    notes[key] = row.note ?? "";
  }

  return { values, notes };
}

function formatMoney(value: number | null | undefined) {
  return formatPetyrCurrency(value);
}

function formatUpdated(row: ManagementObjectiveDisplayRow) {
  if (!row.updatedAt) return "Not saved";
  return `${new Date(row.updatedAt).toLocaleString()} by ${row.updatedBy ?? row.createdBy ?? "unknown"}`;
}

function ObjectiveTable({
  title,
  description,
  emptyText,
  rows,
  values,
  notes,
  savingKey,
  onValueChange,
  onNoteChange,
  onSave
}: {
  title: string;
  description: string;
  emptyText: string;
  rows: ManagementObjectiveDisplayRow[];
  values: Record<string, string>;
  notes: Record<string, string>;
  savingKey: string | null;
  onValueChange: (key: string, value: string) => void;
  onNoteChange: (key: string, value: string) => void;
  onSave: (row: ManagementObjectiveDisplayRow) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{emptyText}</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[880px] border-collapse text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-3 text-left">Name</th>
                  <th className="px-3 py-3 text-right">Current objective</th>
                  <th className="px-3 py-3 text-left">New objective value</th>
                  <th className="px-3 py-3 text-left">Note</th>
                  <th className="px-3 py-3 text-left">Last update</th>
                  <th className="px-3 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {rows.map((row) => {
                  const key = rowKey(row);
                  const isSaving = savingKey === key;

                  return (
                    <tr key={key}>
                      <td className="px-3 py-3 font-medium text-slate-900">{row.scopeKey}</td>
                      <td className="px-3 py-3 text-right font-medium text-slate-700">{formatMoney(row.currentValue)}</td>
                      <td className="px-3 py-3">
                        <Input
                          inputMode="decimal"
                          min={0}
                          placeholder="0"
                          value={values[key] ?? ""}
                          onChange={(event) => onValueChange(key, event.target.value)}
                          className="w-40"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <Textarea
                          value={notes[key] ?? ""}
                          onChange={(event) => onNoteChange(key, event.target.value)}
                          placeholder="Optional note"
                          className="min-h-10"
                        />
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-500">{formatUpdated(row)}</td>
                      <td className="px-3 py-3 text-right">
                        <Button type="button" disabled={isSaving} onClick={() => onSave(row)}>
                          {isSaving ? "Saving" : "Save"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type ManagementObjectivesWorkspaceProps = {
  initialObjectives: ManagementObjectivesData | null;
  initialYear: number;
};

export function ManagementObjectivesPanel({
  initialObjectives,
  initialYear
}: ManagementObjectivesWorkspaceProps) {
  const [objectives, setObjectives] = useState<ManagementObjectivesData | null>(initialObjectives);
  const [values, setValues] = useState<Record<string, string>>(() =>
    initialObjectives ? objectiveStateFromData(initialObjectives).values : {}
  );
  const [notes, setNotes] = useState<Record<string, string>>(() =>
    initialObjectives ? objectiveStateFromData(initialObjectives).notes : {}
  );
  const [yearInput, setYearInput] = useState(String(initialObjectives?.year ?? initialYear));
  const [isUnlocked, setIsUnlocked] = useState(Boolean(initialObjectives));
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isLoadingYear, setIsLoadingYear] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  function applyObjectives(nextObjectives: ManagementObjectivesData) {
    const nextState = objectiveStateFromData(nextObjectives);
    setObjectives(nextObjectives);
    setValues(nextState.values);
    setNotes(nextState.notes);
    setYearInput(String(nextObjectives.year));
  }

  async function loadYear() {
    const nextYear = Number(yearInput);
    if (!Number.isInteger(nextYear) || nextYear < 2000 || nextYear > 2100) {
      setNotice({ type: "error", text: "Select a valid year between 2000 and 2100." });
      return;
    }

    setIsLoadingYear(true);
    setNotice(null);

    try {
      const response = await fetch(`/api/petyr/management-objectives?year=${nextYear}`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? payload.detail ?? "Unable to load Management Objectives.");
      }

      applyObjectives(payload);
      setIsUnlocked(true);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Unable to load Management Objectives." });
    } finally {
      setIsLoadingYear(false);
    }
  }

  async function saveObjective(row: ManagementObjectiveDisplayRow) {
    if (!objectives) return;

    const key = rowKey(row);
    setSavingKey(key);
    setNotice(null);

    try {
      const response = await fetch("/api/petyr/management-objectives", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          scope_type: row.scopeType,
          scope_key: row.scopeKey,
          year: objectives.year,
          value: values[key],
          note: notes[key],
          updated_by: "petyr-management-objectives"
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? payload.detail ?? "Unable to save Management Objective.");
      }

      applyObjectives(payload.objectives);
      setNotice({ type: "success", text: `Saved objective for ${row.scopeKey}.` });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Unable to save Management Objective." });
    } finally {
      setSavingKey(null);
    }
  }

  useEffect(() => {
    if (initialObjectives) return;

    void loadYear();
    // Run once on mount so management users see the current objective table without a password step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle>Management Objectives</CardTitle>
              <CardDescription>
                Set annual Branch and Business Unit objectives. Access is controlled by Petyr Management permissions.
              </CardDescription>
            </div>
            <Badge variant="outline">Management</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {!isUnlocked || !objectives ? (
            <div className="grid gap-4 md:grid-cols-[160px_auto] md:items-end">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase text-slate-500">Year</span>
                <Input
                  type="number"
                  min={2000}
                  max={2100}
                  value={yearInput}
                  onChange={(event) => setYearInput(event.target.value)}
                />
              </label>
              <Button type="button" disabled={isLoadingYear} onClick={loadYear}>
                {isLoadingYear ? "Loading" : "Load objectives"}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase text-slate-500">Year</span>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={2000}
                    max={2100}
                    value={yearInput}
                    onChange={(event) => setYearInput(event.target.value)}
                    className="w-36"
                  />
                  <Button variant="outline" type="button" disabled={isLoadingYear} onClick={loadYear}>
                    {isLoadingYear ? "Loading" : "Load"}
                  </Button>
                </div>
              </label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Annual objectives are management targets. Annual Forecast remains the CSM forecast.
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {notice ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            notice.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          {notice.text}
        </div>
      ) : null}

      {isUnlocked && objectives ? (
        <>
          {objectives.diagnostics.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Data diagnostics</CardTitle>
                <CardDescription>PostgreSQL read model messages for Management Objectives.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {objectives.diagnostics.map((diagnostic) => (
                  <div key={diagnostic} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {diagnostic}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <ObjectiveTable
            title="Branch Objectives"
            description="Annual objectives keyed by dynamic Branch values from company ownership."
            emptyText="No Branch values are available from company ownership."
            rows={objectives.branchObjectives}
            values={values}
            notes={notes}
            savingKey={savingKey}
            onValueChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
            onNoteChange={(key, value) => setNotes((current) => ({ ...current, [key]: value }))}
            onSave={saveObjective}
          />

          <ObjectiveTable
            title="Business Unit Objectives"
            description="Annual objectives limited to the official Business Unit list."
            emptyText="No official Business Unit values are configured."
            rows={objectives.businessUnitObjectives}
            values={values}
            notes={notes}
            savingKey={savingKey}
            onValueChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
            onNoteChange={(key, value) => setNotes((current) => ({ ...current, [key]: value }))}
            onSave={saveObjective}
          />
        </>
      ) : null}
    </div>
  );
}

export default function ManagementObjectivesWorkspace(props: ManagementObjectivesWorkspaceProps) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 md:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link className="text-sm font-medium text-slate-600 hover:text-slate-900" href="/forecasting?view=management">
              Back to Management
            </Link>
            <h1 className="mt-3 text-3xl font-semibold">Management Objectives</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Set annual objectives for Branches and Business Units. These values are used only as management targets and are also available at the bottom of Management View.
            </p>
          </div>
        </div>

        <ManagementObjectivesPanel {...props} />
      </div>
    </main>
  );
}
