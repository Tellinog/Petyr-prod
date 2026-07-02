"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PetyrCard, PetyrInlineNotice } from "@/components/petyr/PetyrLayoutPrimitives";
import { PetyrSelectField } from "@/components/petyr/PetyrForecastNavigation";
import { formatPetyrCurrencyValue, formatPetyrNumber, formatPetyrPercent } from "@/lib/petyr/formatters";
import { calculateAnnualForecastPercentages } from "@/lib/petyr/annualForecastEntryRules";
import type {
  AnnualForecastEntryBatchCell,
  AnnualForecastEntryBatchCompany,
  AnnualForecastEntryBatchDataResult
} from "@/services/annualForecastEntryBatchService";

type Notice = {
  type: "success" | "error";
  text: string;
};

type SourceState = "accepted_ai" | "manual_edit";

function buildAnnualBatchUrl(csmName: string, year: number) {
  const params = new URLSearchParams();
  if (csmName) params.set("csmName", csmName);
  params.set("year", String(year));
  return `/api/petyr/forecast-entry/annual-batch?${params.toString()}`;
}

function buildCompanyDetailPageUrl(companyName: string, year: number) {
  const params = new URLSearchParams({ year: String(year) });
  return `/forecasting/company/${encodeURIComponent(companyName)}?${params.toString()}`;
}

function buildHistoryUrl(companyName: string, year: number) {
  return `${buildCompanyDetailPageUrl(companyName, year)}#company-logs`;
}

function cellKey(companyName: string, businessUnit: string) {
  return `${companyName}\u0000${businessUnit}`;
}

function formatInputValue(value: number | null | undefined) {
  return value === null || value === undefined ? "" : formatPetyrNumber(value);
}

function normalizeMoneyString(value: string) {
  let normalized = value.trim().replace(/\s+/g, "").replace(/EUR|\u20ac/gi, "");

  if (/^-?\d+,\d+$/.test(normalized)) {
    normalized = normalized.replace(",", ".");
  } else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(normalized)) {
    normalized = normalized.replace(/,/g, "");
  } else if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(normalized)) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  }

  return normalized;
}

function parseMoneyInput(value: string) {
  const normalized = normalizeMoneyString(value);
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function valuesFromBatch(batch: AnnualForecastEntryBatchDataResult) {
  const values: Record<string, string> = {};

  for (const company of batch.data.companies) {
    for (const cell of company.businessUnits) {
      values[cellKey(company.companyName, cell.businessUnit)] = cell.savedForecast.hasSavedValue
        ? formatInputValue(cell.savedForecast.value)
        : "";
    }
  }

  return values;
}

function initialValuesFromBatch(batch: AnnualForecastEntryBatchDataResult) {
  return Object.fromEntries(batch.data.companies.map((company) => [company.companyName, formatInputValue(company.initialForecast)]));
}

function activeValuesFromBatch(batch: AnnualForecastEntryBatchDataResult) {
  return Object.fromEntries(batch.data.companies.map((company) => [company.companyName, company.isForecastActive]));
}

function confidenceValuesFromBatch(batch: AnnualForecastEntryBatchDataResult) {
  return Object.fromEntries(batch.data.companies.map((company) => [company.companyName, company.ongoingConfidence ?? ""]));
}

function LegendChip({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-slate-600">
      <span className={`h-3 w-3 rounded-full border ${className}`} />
      {label}
    </span>
  );
}

function rowHasTouchedValue(company: AnnualForecastEntryBatchCompany, sourceStates: Record<string, SourceState | undefined>) {
  return company.businessUnits.some((cell) => Boolean(sourceStates[cellKey(company.companyName, cell.businessUnit)]));
}

function percentLabel(value: number | null | undefined) {
  return value === null || value === undefined ? "n/a" : formatPetyrPercent(value * 100);
}

const CUSTOMER_STICKY_CLASS = "sticky left-0 z-30 min-w-[220px] bg-white";
const CONFIDENCE_STICKY_CLASS = "sticky left-[220px] z-30 min-w-[150px] bg-amber-50 shadow-[8px_0_12px_-12px_rgba(15,23,42,0.45)]";
const HEADER_STICKY_CLASS = "sticky top-16 z-40 shadow-[0_1px_0_0_rgba(226,232,240,1)]";
const MANUAL_HEADER_CLASS = "bg-amber-50 text-amber-950";
const MANUAL_CELL_CLASS = "bg-amber-50/70";

export default function AnnualForecastEntryBatchWorkspace({
  initialBatch,
  onBatchChange
}: {
  initialBatch: AnnualForecastEntryBatchDataResult;
  onBatchChange?: (batch: AnnualForecastEntryBatchDataResult) => void;
}) {
  const [batch, setBatch] = useState(initialBatch);
  const [selectedCsm, setSelectedCsm] = useState(initialBatch.data.selectedCsm);
  const [selectedYear, setSelectedYear] = useState(initialBatch.data.selectedYear);
  const [values, setValues] = useState<Record<string, string>>(() => valuesFromBatch(initialBatch));
  const [initialValues, setInitialValues] = useState<Record<string, string>>(() => initialValuesFromBatch(initialBatch));
  const [activeValues, setActiveValues] = useState<Record<string, boolean>>(() => activeValuesFromBatch(initialBatch));
  const [confidenceValues, setConfidenceValues] = useState<Record<string, string>>(() => confidenceValuesFromBatch(initialBatch));
  const [sourceStates, setSourceStates] = useState<Record<string, SourceState | undefined>>({});
  const [touchedInitial, setTouchedInitial] = useState<Set<string>>(() => new Set());
  const [touchedActive, setTouchedActive] = useState<Set<string>>(() => new Set());
  const [touchedConfidence, setTouchedConfidence] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSavedState, setShowSavedState] = useState(false);
  const [showBusinessUnits, setShowBusinessUnits] = useState(true);
  const savedStateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  const hasLocalChanges = useMemo(
    () =>
      Object.values(sourceStates).some(Boolean) ||
      touchedInitial.size > 0 ||
      touchedActive.size > 0 ||
      touchedConfidence.size > 0,
    [sourceStates, touchedInitial, touchedActive, touchedConfidence]
  );

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasLocalChanges) return;
      event.preventDefault();
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasLocalChanges]);

  useEffect(() => {
    return () => {
      if (savedStateTimeoutRef.current) {
        clearTimeout(savedStateTimeoutRef.current);
      }
    };
  }, []);

  function markSavedState() {
    setShowSavedState(true);

    if (savedStateTimeoutRef.current) {
      clearTimeout(savedStateTimeoutRef.current);
    }

    savedStateTimeoutRef.current = setTimeout(() => {
      setShowSavedState(false);
      savedStateTimeoutRef.current = null;
    }, 5000);
  }

  function resetLocalState(nextBatch: AnnualForecastEntryBatchDataResult) {
    setBatch(nextBatch);
    setSelectedCsm(nextBatch.data.selectedCsm);
    setSelectedYear(nextBatch.data.selectedYear);
    setValues(valuesFromBatch(nextBatch));
    setInitialValues(initialValuesFromBatch(nextBatch));
    setActiveValues(activeValuesFromBatch(nextBatch));
    setConfidenceValues(confidenceValuesFromBatch(nextBatch));
    setSourceStates({});
    setTouchedInitial(new Set());
    setTouchedActive(new Set());
    setTouchedConfidence(new Set());
  }

  async function loadAnnualBatch(csmName: string, year: number) {
    if (hasLocalChanges && !window.confirm("Annual Forecast Entry has unsaved changes. Change filter and discard them?")) {
      return;
    }

    setSelectedCsm(csmName);
    setSelectedYear(year);
    setIsLoading(true);
    setNotice(null);

    try {
      const response = await fetch(buildAnnualBatchUrl(csmName, year), { cache: "no-store" });
      const payload = (await response.json()) as AnnualForecastEntryBatchDataResult;

      if (!response.ok) {
        throw new Error("Unable to load Annual Forecast Entry.");
      }

      resetLocalState(payload);
      onBatchChange?.(payload);
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to load Annual Forecast Entry."
      });
    } finally {
      setIsLoading(false);
    }
  }

  function acceptAiPlaceholder(company: AnnualForecastEntryBatchCompany, cell: AnnualForecastEntryBatchCell) {
    const key = cellKey(company.companyName, cell.businessUnit);
    const currentValue = values[key] ?? "";

    if (!cell.savedForecast.hasSavedValue && !currentValue.trim() && cell.aiForecast.value !== null) {
      setValues((existing) => ({ ...existing, [key]: formatInputValue(cell.aiForecast.value) }));
      setSourceStates((existing) => ({ ...existing, [key]: "accepted_ai" }));
    }
  }

  function updateValue(company: AnnualForecastEntryBatchCompany, cell: AnnualForecastEntryBatchCell, value: string) {
    const key = cellKey(company.companyName, cell.businessUnit);
    setValues((existing) => ({ ...existing, [key]: value }));
    setSourceStates((existing) => ({ ...existing, [key]: "manual_edit" }));
  }

  function updateInitial(companyName: string, value: string) {
    setInitialValues((existing) => ({ ...existing, [companyName]: value }));
    setTouchedInitial((existing) => new Set(existing).add(companyName));
  }

  function updateActive(companyName: string, value: boolean) {
    setActiveValues((existing) => ({ ...existing, [companyName]: value }));
    setTouchedActive((existing) => new Set(existing).add(companyName));
  }

  function updateConfidence(companyName: string, value: string) {
    setConfidenceValues((existing) => ({ ...existing, [companyName]: value }));
    setTouchedConfidence((existing) => new Set(existing).add(companyName));
  }

  function currentBuValue(company: AnnualForecastEntryBatchCompany, cell: AnnualForecastEntryBatchCell) {
    const key = cellKey(company.companyName, cell.businessUnit);
    const parsed = parseMoneyInput(values[key] ?? "");

    if (sourceStates[key] && parsed !== null) return parsed;
    if (cell.savedForecast.hasSavedValue) return cell.savedForecast.value ?? 0;

    return null;
  }

  function currentFcOngoing(company: AnnualForecastEntryBatchCompany) {
    return company.businessUnits.reduce((sum, cell) => sum + (currentBuValue(company, cell) ?? 0), 0);
  }

  const annualSummary = useMemo(() => {
    const byBusinessUnit = Object.fromEntries(batch.data.businessUnits.map((businessUnit) => [businessUnit, 0])) as Record<string, number>;
    let total = 0;

    for (const company of batch.data.companies) {
      for (const cell of company.businessUnits) {
        const value = currentBuValue(company, cell) ?? 0;
        byBusinessUnit[cell.businessUnit] = (byBusinessUnit[cell.businessUnit] ?? 0) + value;
        total += value;
      }
    }

    return {
      total,
      byBusinessUnit: batch.data.businessUnits.map((businessUnit) => ({
        businessUnit,
        value: byBusinessUnit[businessUnit] ?? 0
      }))
    };
  }, [batch.data.businessUnits, batch.data.companies, sourceStates, values]);

  function getCompanySaveValues(company: AnnualForecastEntryBatchCompany) {
    return company.businessUnits.flatMap((cell) => {
      const key = cellKey(company.companyName, cell.businessUnit);
      const sourceState = sourceStates[key];
      if (!sourceState) return [];

      return [
        {
          businessUnit: cell.businessUnit,
          value: values[key] ?? "",
          sourceState
        }
      ];
    });
  }

  function buildUpdates() {
    return batch.data.companies.flatMap((company) => {
      const valuesForCompany = getCompanySaveValues(company);
      const hasInitial = touchedInitial.has(company.companyName);
      const hasActive = touchedActive.has(company.companyName);
      const hasConfidence = touchedConfidence.has(company.companyName);
      const rowModified = valuesForCompany.length > 0 || hasInitial || hasActive;

      if (!rowModified && !hasConfidence) return [];

      const confidence = confidenceValues[company.companyName] ?? "";
      if (rowModified && !confidence) {
        throw new Error(`${company.companyName}: Confidence is required on modified annual rows.`);
      }

      return [
        {
          companyName: company.companyName,
          activeStatus: hasActive ? activeValues[company.companyName] : undefined,
          initialForecast: hasInitial ? initialValues[company.companyName] : undefined,
          confidence: rowModified || hasConfidence ? confidence : undefined,
          values: valuesForCompany
        }
      ];
    });
  }

  async function saveBatch() {
    let updates: ReturnType<typeof buildUpdates>;

    try {
      updates = buildUpdates();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Unable to validate Annual Forecast Entry." });
      return;
    }

    if (updates.length === 0) {
      setNotice({ type: "success", text: "No changes detected" });
      return;
    }

    setIsSaving(true);
    setNotice(null);

    try {
      const response = await fetch("/api/petyr/forecast-entry/annual-batch/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csmName: batch.data.selectedCsm,
          year: batch.data.selectedYear,
          updates
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? payload.detail ?? "Unable to save Annual Forecast Entry.");
      }

      resetLocalState(payload.batch);
      onBatchChange?.(payload.batch);
      setNotice({
        type: "success",
        text: payload.noChanges
          ? "No changes detected"
          : `Saved annual changes for ${payload.companiesSaved} compan${payload.companiesSaved === 1 ? "y" : "ies"}.`
      });
      if (!payload.noChanges) {
        markSavedState();
      }
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to save Annual Forecast Entry."
      });
    } finally {
      setIsSaving(false);
    }
  }

  const visibleBusinessUnitCount = showBusinessUnits ? batch.data.businessUnits.length : 0;
  const saveDisabled = isSaving || isLoading || !hasLocalChanges;

  return (
    <PetyrCard>
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Annual Forecast Entry</CardTitle>
            <CardDescription>
              {batch.data.selectedCsm}: {batch.data.companies.length} compan{batch.data.companies.length === 1 ? "y" : "ies"} - {batch.data.selectedYear}
            </CardDescription>
          </div>
          <Badge variant={batch.data.initialMode.editable ? "secondary" : "outline"}>{batch.data.initialMode.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_180px_minmax(0,1fr)] lg:items-end">
          <PetyrSelectField
            label="CSM"
            disabled={isLoading || isSaving}
            value={selectedCsm}
            onChange={(event) => void loadAnnualBatch(event.target.value, selectedYear)}
          >
            {batch.data.csmOptions.map((csmName) => (
              <option key={csmName} value={csmName}>
                {csmName}
              </option>
            ))}
          </PetyrSelectField>
          <PetyrSelectField
            label="Year"
            disabled={isLoading || isSaving}
            value={String(selectedYear)}
            onChange={(event) => void loadAnnualBatch(selectedCsm, Number(event.target.value))}
          >
            {batch.data.yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </PetyrSelectField>
          <PetyrInlineNotice tone={batch.data.initialMode.editable ? "success" : "warning"}>
            {batch.data.initialMode.reason}
          </PetyrInlineNotice>
        </div>

        {notice ? <PetyrInlineNotice tone={notice.type === "success" ? "success" : "danger"}>{notice.text}</PetyrInlineNotice> : null}

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <div className="flex min-w-max items-center gap-2 px-3 py-2">
            <div className="sticky left-0 z-10 flex min-w-[190px] items-center justify-between gap-3 border-r border-slate-200 bg-white pr-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {batch.data.selectedYear} CSM forecast
              </span>
              <span className="text-sm font-bold text-slate-950">{formatPetyrCurrencyValue(annualSummary.total)}</span>
            </div>
            {annualSummary.byBusinessUnit.map((item) => (
              <div
                key={item.businessUnit}
                className="flex min-w-[132px] items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <span className="max-w-[58px] truncate text-[11px] font-medium text-slate-500" title={item.businessUnit}>
                  {item.businessUnit}
                </span>
                <span className="text-sm font-semibold text-slate-900">{formatPetyrCurrencyValue(item.value)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="fixed bottom-5 right-5 z-50">
          <Button
            type="button"
            className={`h-12 min-w-[112px] rounded-xl px-6 shadow-lg shadow-slate-900/20 ${
              showSavedState ? "bg-emerald-600 text-white hover:bg-emerald-600" : ""
            }`}
            disabled={saveDisabled}
            onClick={saveBatch}
          >
            {isSaving ? "Saving" : "Save"}
          </Button>
        </div>

        <div className="sr-only" aria-live="polite">
          {showSavedState ? "Forecast saved." : ""}
        </div>

        <div className="max-h-[calc(100vh-10rem)] overflow-auto rounded-2xl border border-slate-200 bg-white">
          <div className="sticky top-0 z-50 flex h-16 min-w-max items-center justify-between gap-5 border-b border-slate-200 bg-slate-50 px-4 shadow-[0_1px_0_0_rgba(226,232,240,1)]">
            <div className="flex items-center gap-x-5 gap-y-2">
              <LegendChip className="border-blue-300 bg-blue-100" label="Forecast AI placeholder" />
              <LegendChip className="border-violet-300 bg-violet-100" label="AI confirmed" />
              <LegendChip className="border-emerald-300 bg-emerald-100" label="Manual value" />
              <LegendChip className="border-amber-300 bg-amber-50" label="Manual entry field" />
              <LegendChip className="border-slate-300 bg-white" label="Saved value" />
              <LegendChip className="border-slate-300 bg-slate-100" label="Inactive customer" />
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-9 shrink-0 rounded-xl border-slate-300 bg-white px-4 text-sm"
              onClick={() => setShowBusinessUnits((current) => !current)}
              aria-expanded={showBusinessUnits}
            >
              {showBusinessUnits ? "Collapse Business Units" : "Show Business Units"}
            </Button>
          </div>
          <Table className="min-w-max">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={`${CUSTOMER_STICKY_CLASS} ${HEADER_STICKY_CLASS}`}>Customer</TableHead>
                <TableHead className={`${HEADER_STICKY_CLASS} min-w-[120px] ${MANUAL_HEADER_CLASS}`}>Active</TableHead>
                <TableHead className={`${HEADER_STICKY_CLASS} w-[104px] min-w-[104px] ${MANUAL_HEADER_CLASS}`}>Forecast Initial</TableHead>
                <TableHead className={`${HEADER_STICKY_CLASS} min-w-[150px] bg-white`}>Forecast Ongoing</TableHead>
                <TableHead className={`${CONFIDENCE_STICKY_CLASS} ${HEADER_STICKY_CLASS}`}>Confidence</TableHead>
                {showBusinessUnits
                  ? batch.data.businessUnits.map((businessUnit) => (
                      <TableHead key={businessUnit} className={`${HEADER_STICKY_CLASS} min-w-[105px] text-right ${MANUAL_HEADER_CLASS}`}>
                        {businessUnit}
                      </TableHead>
                    ))
                  : null}
                <TableHead className={`${HEADER_STICKY_CLASS} min-w-[150px] bg-white text-right`}>Closed Revenue YTD</TableHead>
                <TableHead className={`${HEADER_STICKY_CLASS} min-w-[150px] bg-white text-right`}>Planned This Year</TableHead>
                <TableHead className={`${HEADER_STICKY_CLASS} min-w-[170px] bg-white text-right`}>Revenue / Forecast Ongoing</TableHead>
                <TableHead className={`${HEADER_STICKY_CLASS} min-w-[170px] bg-white text-right`}>Planned / Forecast Ongoing</TableHead>
                <TableHead className={`${HEADER_STICKY_CLASS} min-w-[180px] bg-white text-right`}>Uncovered / Forecast Ongoing</TableHead>
                <TableHead className={`${HEADER_STICKY_CLASS} min-w-[220px] bg-white`}>Logs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batch.data.companies.length > 0 ? (
                batch.data.companies.map((company) => {
                  const fcOngoing = currentFcOngoing(company);
                  const percentages = calculateAnnualForecastPercentages({
                    revenue: company.revenue,
                    planned: company.planned,
                    fcOngoing
                  });
                  const inactiveClass = company.isForecastActive ? "" : "bg-slate-50 text-slate-500 opacity-75";

                  return (
                    <TableRow key={company.companyName} className={inactiveClass}>
                      <TableCell className={`${CUSTOMER_STICKY_CLASS} ${company.isForecastActive ? "bg-white" : "bg-slate-50"}`}>
                        <Link
                          href={buildCompanyDetailPageUrl(company.companyName, batch.data.selectedYear)}
                          className="font-semibold text-slate-900 underline-offset-4 hover:underline"
                        >
                          {company.companyName}
                        </Link>
                        <div className="mt-1 text-xs text-slate-500">{company.csmName}</div>
                      </TableCell>
                      <TableCell className={MANUAL_CELL_CLASS}>
                        <label className="inline-flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={activeValues[company.companyName] ?? company.isForecastActive}
                            disabled={isSaving}
                            onChange={(event) => updateActive(company.companyName, event.target.checked)}
                          />
                          {activeValues[company.companyName] ? "ON" : "OFF"}
                        </label>
                      </TableCell>
                      <TableCell className={batch.data.initialMode.editable ? MANUAL_CELL_CLASS : "bg-slate-50"}>
                        <Input
                          inputMode="decimal"
                          disabled={!batch.data.initialMode.editable || isSaving}
                          readOnly={!batch.data.initialMode.editable}
                          value={initialValues[company.companyName] ?? ""}
                          onChange={(event) => updateInitial(company.companyName, event.target.value)}
                          placeholder="n/a"
                          className={`h-10 min-w-[91px] rounded-xl text-right font-semibold ${
                            touchedInitial.has(company.companyName)
                              ? "border-emerald-300 bg-emerald-50"
                              : batch.data.initialMode.editable
                                ? "border-amber-200 bg-amber-50"
                                : "bg-white"
                          }`}
                        />
                      </TableCell>
                      <TableCell className="text-right font-semibold">{formatPetyrCurrencyValue(fcOngoing)}</TableCell>
                      <TableCell className={`${CONFIDENCE_STICKY_CLASS} ${company.isForecastActive ? "" : "bg-slate-50"}`}>
                        <select
                          value={confidenceValues[company.companyName] ?? ""}
                          disabled={isSaving}
                          onChange={(event) => updateConfidence(company.companyName, event.target.value)}
                          className={`h-10 min-w-[130px] rounded-xl border px-3 text-sm ${
                            touchedConfidence.has(company.companyName) ? "border-emerald-300 bg-emerald-50" : "border-amber-200 bg-amber-50"
                          }`}
                        >
                          <option value="">Select...</option>
                          {batch.data.confidenceOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      {showBusinessUnits ? company.businessUnits.map((cell) => {
                        const key = cellKey(company.companyName, cell.businessUnit);
                        const sourceState = sourceStates[key];
                        const aiPlaceholder = !cell.savedForecast.hasSavedValue && cell.aiForecast.value !== null
                          ? formatInputValue(cell.aiForecast.value)
                          : "";
                        const inputClass =
                          sourceState === "accepted_ai"
                            ? "border-violet-300 bg-violet-50"
                            : sourceState === "manual_edit"
                              ? "border-emerald-300 bg-emerald-50"
                              : cell.savedForecast.hasSavedValue
                                ? "border-amber-200 bg-amber-50"
                                : aiPlaceholder
                                  ? "border-blue-300 bg-blue-50"
                                  : "border-amber-200 bg-amber-50";

                        return (
                          <TableCell key={key} className={MANUAL_CELL_CLASS}>
                            <Input
                              inputMode="decimal"
                              disabled={isSaving}
                              placeholder={aiPlaceholder || "n/a"}
                              value={values[key] ?? ""}
                              onFocus={() => acceptAiPlaceholder(company, cell)}
                              onClick={() => acceptAiPlaceholder(company, cell)}
                              onChange={(event) => updateValue(company, cell, event.target.value)}
                              className={`h-10 min-w-[91px] rounded-xl text-right font-semibold ${inputClass}`}
                            />
                            {sourceState ? (
                              <div className="mt-1 text-right text-[11px] font-medium text-slate-500">
                                {sourceState === "accepted_ai" ? "AI confirmed" : "Manual"}
                              </div>
                            ) : cell.savedForecast.hasSavedValue ? (
                              <div className="mt-1 text-right text-[11px] text-slate-500">
                                {cell.savedForecast.valueSource === "ai_confirmed" ? "AI confirmed" : "Saved"}
                                {cell.aiForecast.value !== null ? ` (${formatPetyrCurrencyValue(cell.aiForecast.value)} AI Forecast)` : ""}
                              </div>
                            ) : aiPlaceholder ? (
                              <div className="mt-1 text-right text-[11px] text-blue-700">Forecast AI</div>
                            ) : null}
                          </TableCell>
                        );
                      }) : null}
                      <TableCell className="text-right font-medium">{formatPetyrCurrencyValue(company.revenue)}</TableCell>
                      <TableCell className="text-right font-medium">{formatPetyrCurrencyValue(company.planned)}</TableCell>
                      <TableCell className="text-right">{percentLabel(percentages.revenuePct)}</TableCell>
                      <TableCell className="text-right">{percentLabel(percentages.plannedPct)}</TableCell>
                      <TableCell className="text-right">{percentLabel(percentages.uncoveredPct)}</TableCell>
                      <TableCell>
                        <a
                          href={buildHistoryUrl(company.companyName, batch.data.selectedYear)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-10 w-[190px] items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium leading-snug text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
                        >
                          See latest logs of {company.companyName}
                        </a>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={visibleBusinessUnitCount + 11} className="bg-slate-50 py-8 text-center text-sm text-slate-500">
                    No companies available for this CSM.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </PetyrCard>
  );
}
