
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PetyrCard,
  PetyrInlineNotice,
  PetyrSectionTitle,
  PetyrWorkspaceShell
} from "@/components/petyr/PetyrLayoutPrimitives";
import { PetyrSelectField } from "@/components/petyr/PetyrForecastNavigation";
import AnnualForecastEntryBatchWorkspace from "@/components/petyr/AnnualForecastEntryBatchWorkspace";
import { formatBusinessUnitDisplayName } from "@/lib/petyr/businessUnitDisplay";
import { formatPetyrInteger, formatPetyrIntegerCurrencyValue, formatPetyrIntegerInputDraft } from "@/lib/petyr/formatters";
import type { AnnualForecastEntryBatchDataResult } from "@/services/annualForecastEntryBatchService";
import type {
  ForecastEntryBatchCell,
  ForecastEntryBatchCompany,
  ForecastEntryBatchDataResult
} from "@/services/forecastEntryBatchService";

type Notice = {
  type: "success" | "error";
  text: string;
};

type SourceState = "accepted_ai" | "manual_edit";
type MonthlyForecastType = "previous_month" | "ongoing";
type MonthlyCompanySortDirection = "asc" | "desc";
type MonthlySortState =
  | { key: "company"; direction: MonthlyCompanySortDirection }
  | { key: "business_unit"; businessUnit: string };
type ActiveVisibilityFilter = "all" | "active" | "inactive";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const EXPANDED_FORECAST_COLUMNS: MonthlyForecastType[] = ["previous_month", "ongoing"];

function monthLabel(month: number) {
  return MONTHS[month - 1] ?? `Month ${month}`;
}

function forecastTypeLabel(forecastType: string | null) {
  if (forecastType === "ongoing") return "Ongoing Forecast";
  if (forecastType === "previous_month") return "Previous Month Forecast";
  return "Forecast";
}

function buildBatchUrl(csmName: string, year: number, month: number) {
  const params = new URLSearchParams();
  if (csmName) params.set("csmName", csmName);
  params.set("year", String(year));
  params.set("month", String(month));
  const query = params.toString();
  return query ? `/api/petyr/forecast-entry/batch?${query}` : "/api/petyr/forecast-entry/batch";
}

function buildAnnualBatchUrl(csmName: string, year?: string) {
  const params = new URLSearchParams();
  if (csmName) params.set("csmName", csmName);
  if (year) params.set("year", year);
  const query = params.toString();
  return query ? `/api/petyr/forecast-entry/annual-batch?${query}` : "/api/petyr/forecast-entry/annual-batch";
}

function buildMonthlyExportUrl(csmName: string, year: number) {
  const params = new URLSearchParams();
  if (csmName) params.set("csmName", csmName);
  params.set("year", String(year));
  return `/api/petyr/forecast-entry/monthly-export-xlsx?${params.toString()}`;
}


function buildEntryPageUrl(csmName: string, year?: number, month?: number) {
  const params = new URLSearchParams();
  if (csmName) params.set("csmName", csmName);
  if (year) params.set("year", String(year));
  if (month) params.set("month", String(month));
  const query = params.toString();
  return query ? `/forecasting/entry?${query}` : "/forecasting/entry";
}

function buildCompanyDetailPageUrl(companyName: string, year: number, csmName?: string | null) {
  const params = new URLSearchParams({ year: String(year) });
  if (csmName) params.set("csmName", csmName);
  return `/forecasting/company/${encodeURIComponent(companyName)}?${params.toString()}`;
}

function cellKey(companyName: string, businessUnit: string) {
  return `${companyName}\u0000${businessUnit}`;
}

function formatInputValue(value: number | null | undefined) {
  return value === null || value === undefined ? "" : formatPetyrInteger(value);
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
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function activeForecast(cell: ForecastEntryBatchCell, editableForecastType: string | null) {
  return editableForecastType === "ongoing" ? cell.ongoingForecast : cell.previousMonthForecast;
}

function forecastForType(cell: ForecastEntryBatchCell, forecastType: MonthlyForecastType) {
  return forecastType === "ongoing" ? cell.ongoingForecast : cell.previousMonthForecast;
}

function expandedForecastHeaderClass(forecastType: MonthlyForecastType, editableForecastType: string | null) {
  return forecastType === editableForecastType ? "bg-white text-slate-700" : "bg-slate-50 text-slate-500";
}

function isEmptyOrZeroDisplay(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return true;
  if (typeof value === "number") return value === 0;
  const parsed = parseMoneyInput(value);
  return parsed === null || parsed === 0;
}

function mutedNumericClass(isMuted: boolean) {
  return isMuted ? "text-slate-400 placeholder:text-slate-300" : "text-slate-900 placeholder:text-slate-400";
}

function monthlyTotalCellClass(value: number) {
  return `border-l border-cyan-200 bg-cyan-50 text-right font-bold ${mutedNumericClass(isEmptyOrZeroDisplay(value))}`;
}

function monthlyCompanySortLabel(direction: MonthlyCompanySortDirection) {
  return direction === "asc" ? "A-Z" : "Z-A";
}

function monthlyBusinessUnitSortLabel(sort: MonthlySortState, businessUnit: string) {
  return sort.key === "business_unit" && sort.businessUnit === businessUnit ? "High-Low" : "Sort";
}

function isPastMonthlyPeriod(year: number, month: number) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  return year < currentYear || (year === currentYear && month < currentMonth);
}

function valuesFromBatch(batch: ForecastEntryBatchDataResult) {
  const editableType = batch.data.entryMode.editableForecastType;
  const values: Record<string, string> = {};

  for (const company of batch.data.companies) {
    for (const cell of company.businessUnits) {
      const forecast = activeForecast(cell, editableType);
      values[cellKey(company.companyName, cell.businessUnit)] = forecast.hasSavedCsmValue ? formatInputValue(forecast.value) : "";
    }
  }

  return values;
}

function activeValuesFromBatch(batch: ForecastEntryBatchDataResult) {
  return Object.fromEntries(batch.data.companies.map((company) => [company.companyName, company.isForecastActive]));
}

function companyHasTouchedValue(company: ForecastEntryBatchCompany, sourceStates: Record<string, SourceState | undefined>) {
  return company.businessUnits.some((cell) => Boolean(sourceStates[cellKey(company.companyName, cell.businessUnit)]));
}

function getCompanySaveValues(
  company: ForecastEntryBatchCompany,
  editableForecastType: string | null,
  values: Record<string, string>,
  sourceStates: Record<string, SourceState | undefined>
) {
  if (!editableForecastType) return [];

  return company.businessUnits.flatMap((cell) => {
    const key = cellKey(company.companyName, cell.businessUnit);
    const sourceState = sourceStates[key];
    if (!sourceState) return [];

    const rawValue = values[key] ?? "";
    const nextValue = parseMoneyInput(rawValue);
    if (nextValue === null) {
      return [{ businessUnit: cell.businessUnit, value: rawValue.trim() ? rawValue : "0", sourceState }];
    }

    const current = activeForecast(cell, editableForecastType);
    if (!current.hasSavedCsmValue || current.value !== nextValue) {
      return [{ businessUnit: cell.businessUnit, value: rawValue, sourceState }];
    }

    return [];
  });
}

function LegendChip({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-slate-600">
      <span className={`h-3 w-3 rounded-full border ${className}`} />
      {label}
    </span>
  );
}

function SavedForecastStatus({ aiForecastValue }: { aiForecastValue: number | null }) {
  return (
    <div className="mt-1 space-y-0.5 text-[11px] leading-tight text-slate-500">
      <div>Saved CSM forecast</div>
      {aiForecastValue !== null ? (
        <div className="text-blue-700">({formatPetyrIntegerCurrencyValue(aiForecastValue)} AI Forecast)</div>
      ) : null}
    </div>
  );
}

function monthlyPlaceholderFor(cell: ForecastEntryBatchCell, editableForecastType: string | null) {
  const current = activeForecast(cell, editableForecastType);
  if (current.hasSavedCsmValue) return { value: null, label: "" };

  if (editableForecastType === "ongoing" && cell.previousMonthForecast.hasSavedCsmValue && cell.previousMonthForecast.value !== null) {
    return {
      value: cell.previousMonthForecast.value,
      label: "Previous Month Forecast placeholder"
    };
  }

  if (cell.aiForecast.value !== null) {
    return {
      value: cell.aiForecast.value,
      label: "AI suggestion"
    };
  }

  return { value: null, label: "" };
}

export default function ForecastEntryMonthlyBatchWorkspace({
  initialBatch,
  initialAnnualYear,
  initialAnnualBatch = null,
  canViewCsmOverview = false
}: {
  initialBatch: ForecastEntryBatchDataResult;
  initialAnnualYear?: string;
  initialAnnualBatch?: AnnualForecastEntryBatchDataResult | null;
  canViewCsmOverview?: boolean;
}) {
  const [batch, setBatch] = useState(initialBatch);
  const [selectedCsm, setSelectedCsm] = useState(initialBatch.data.selectedCsm);
  const [draftMonth, setDraftMonth] = useState(String(initialBatch.data.month));
  const [draftYear, setDraftYear] = useState(String(initialBatch.data.year));
  const [expandedBusinessUnits, setExpandedBusinessUnits] = useState<Set<string>>(() => new Set());
  const [values, setValues] = useState<Record<string, string>>(() => valuesFromBatch(initialBatch));
  const [sourceStates, setSourceStates] = useState<Record<string, SourceState | undefined>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSavedState, setShowSavedState] = useState(false);
  const [savedSummary, setSavedSummary] = useState("");
  const savedStateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlightRef = useRef(false);
  const [activeEntryTab, setActiveEntryTab] = useState("annual");
  const [annualBatch, setAnnualBatch] = useState<AnnualForecastEntryBatchDataResult | null>(initialAnnualBatch);
  const [isAnnualLoading, setIsAnnualLoading] = useState(false);
  const [annualLoadAttempted, setAnnualLoadAttempted] = useState(Boolean(initialAnnualBatch));
  const [monthlySort, setMonthlySort] = useState<MonthlySortState>({ key: "company", direction: "asc" });
  const [activeValues, setActiveValues] = useState<Record<string, boolean>>(() => activeValuesFromBatch(initialBatch));
  const [touchedActive, setTouchedActive] = useState<Set<string>>(() => new Set());
  const [activeVisibilityFilter, setActiveVisibilityFilter] = useState<ActiveVisibilityFilter>("all");

  const editableForecastType = batch.data.entryMode.editableForecastType;
  const isLocked = batch.data.entryMode.locked || !editableForecastType;
  const activeLabel = forecastTypeLabel(editableForecastType);
  const selectedMonthLabel = `${monthLabel(batch.data.month)} ${batch.data.year}`;
  const isPastSelectedPeriod = isPastMonthlyPeriod(batch.data.year, batch.data.month);
  const compactBusinessUnitHeader = isPastSelectedPeriod ? "Closed Revenue" : activeLabel;
  const closedRevenueHeader = isPastSelectedPeriod ? "Closed Revenue" : "Closed Revenue YTD";

  const companyDetailHref = batch.data.companies[0]
    ? buildCompanyDetailPageUrl(batch.data.companies[0].companyName, batch.data.year, batch.data.companies[0].csmName)
    : null;

  useEffect(() => {
    setValues(valuesFromBatch(batch));
    setActiveValues(activeValuesFromBatch(batch));
    setSourceStates({});
    setTouchedActive(new Set());
    setNotes({});
    setDraftMonth(String(batch.data.month));
    setDraftYear(String(batch.data.year));
    window.history.replaceState(null, "", buildEntryPageUrl(batch.data.selectedCsm, batch.data.year, batch.data.month));
  }, [batch]);

  useEffect(() => {
    void loadAnnualBatchIfNeeded();
    // Annual Forecast Entry is a background warmup for the initial CSM/year.
    // Filter changes reload it through loadBatch/onBatchChange synchronization.
  }, []);

  useEffect(() => {
    return () => {
      if (savedStateTimeoutRef.current) {
        clearTimeout(savedStateTimeoutRef.current);
      }
    };
  }, []);

  function markSavedState(summary: string) {
    setSavedSummary(summary);
    setShowSavedState(true);

    if (savedStateTimeoutRef.current) {
      clearTimeout(savedStateTimeoutRef.current);
    }

    savedStateTimeoutRef.current = setTimeout(() => {
      setShowSavedState(false);
      setSavedSummary("");
      savedStateTimeoutRef.current = null;
    }, 5000);
  }

  function toggleBusinessUnit(businessUnit: string) {
    setExpandedBusinessUnits((current) => {
      const next = new Set(current);
      if (next.has(businessUnit)) {
        next.delete(businessUnit);
      } else {
        next.add(businessUnit);
      }
      return next;
    });
  }

  async function loadBatch(csmName: string, year = batch.data.year, month = batch.data.month) {
    setSelectedCsm(csmName);
    setIsLoading(true);
    setNotice(null);

    try {
      const response = await fetch(buildBatchUrl(csmName, year, month), { cache: "no-store" });
      const payload = (await response.json()) as ForecastEntryBatchDataResult;

      if (!response.ok) {
        throw new Error("Unable to load Forecast Entry batch.");
      }

      setBatch(payload);
      setSelectedCsm(payload.data.selectedCsm);

      if (annualBatch) {
        const annualResponse = await fetch(buildAnnualBatchUrl(payload.data.selectedCsm, String(annualBatch.data.selectedYear)), { cache: "no-store" });
        const annualPayload = (await annualResponse.json()) as AnnualForecastEntryBatchDataResult;

        if (!annualResponse.ok) {
          throw new Error("Unable to load Annual Forecast Entry.");
        }

        setAnnualBatch(annualPayload);
      }
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to load Forecast Entry batch."
      });
    } finally {
      setIsLoading(false);
    }
  }


  async function loadSelectedPeriod() {
    const year = Number(draftYear);
    const month = Number(draftMonth);

    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
      setNotice({ type: "error", text: "Select a valid month and year before loading." });
      return;
    }

    await loadBatch(batch.data.selectedCsm, year, month);
  }
  async function loadAnnualBatchIfNeeded() {
    if (annualBatch || isAnnualLoading) return;

    setIsAnnualLoading(true);
    setAnnualLoadAttempted(true);
    setNotice(null);

    try {
      const response = await fetch(buildAnnualBatchUrl(batch.data.selectedCsm, initialAnnualYear), { cache: "no-store" });
      const payload = (await response.json()) as AnnualForecastEntryBatchDataResult;

      if (!response.ok) {
        throw new Error("Unable to load Annual Forecast Entry.");
      }

      setAnnualBatch(payload);
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to load Annual Forecast Entry."
      });
    } finally {
      setIsAnnualLoading(false);
    }
  }


  function acceptMonthlyPlaceholder(company: ForecastEntryBatchCompany, cell: ForecastEntryBatchCell) {
    if (isLocked || !editableForecastType) return;

    const key = cellKey(company.companyName, cell.businessUnit);
    const currentValue = values[key] ?? "";
    const placeholder = monthlyPlaceholderFor(cell, editableForecastType);

    if (!currentValue.trim() && placeholder.value !== null) {
      setValues((existing) => ({ ...existing, [key]: formatInputValue(placeholder.value) }));
      setSourceStates((existing) => ({ ...existing, [key]: "accepted_ai" }));
    }
  }

  function updateValue(company: ForecastEntryBatchCompany, cell: ForecastEntryBatchCell, value: string) {
    const key = cellKey(company.companyName, cell.businessUnit);
    setValues((existing) => ({ ...existing, [key]: formatPetyrIntegerInputDraft(value) }));
    setSourceStates((existing) => ({ ...existing, [key]: "manual_edit" }));
  }

  function currentForecastValue(company: ForecastEntryBatchCompany, cell: ForecastEntryBatchCell, forecastType: MonthlyForecastType) {
    const key = cellKey(company.companyName, cell.businessUnit);
    const parsed = parseMoneyInput(values[key] ?? "");

    if (forecastType === editableForecastType && sourceStates[key]) return parsed ?? 0;

    const forecast = forecastForType(cell, forecastType);
    return forecast?.hasSavedCsmValue ? forecast.value ?? 0 : 0;
  }

  function monthlyBusinessUnitSortValue(company: ForecastEntryBatchCompany, businessUnit: string) {
    const cell = company.businessUnits.find((item) => item.businessUnit === businessUnit);
    if (!cell) return 0;
    if (isPastSelectedPeriod) return cell.closedRevenue ?? 0;

    const forecastType = (editableForecastType ?? "previous_month") as MonthlyForecastType;
    const forecast = forecastForType(cell, forecastType);
    if (forecast?.hasSavedCsmValue) return forecast.value ?? 0;

    return monthlyPlaceholderFor(cell, editableForecastType).value ?? 0;
  }

  function currentCompanyForecastTotal(company: ForecastEntryBatchCompany) {
    const forecastType = (editableForecastType ?? "previous_month") as MonthlyForecastType;
    return company.businessUnits.reduce((sum, cell) => sum + currentForecastValue(company, cell, forecastType), 0);
  }

  function updateNote(companyName: string, value: string) {
    setNotes((existing) => ({ ...existing, [companyName]: value }));
  }

  function updateActive(companyName: string, value: boolean) {
    setActiveValues((existing) => ({ ...existing, [companyName]: value }));
    setTouchedActive((existing) => new Set(existing).add(companyName));
  }

  async function saveBatch() {
    if (saveInFlightRef.current) return;

    const hasActiveChanges = touchedActive.size > 0;
    if ((isLocked || !editableForecastType) && !hasActiveChanges) return;

    const updates = [];

    for (const company of batch.data.companies) {
      const note = notes[company.companyName]?.trim() ?? "";
      const saveValues = getCompanySaveValues(company, editableForecastType, values, sourceStates);
      const hasActive = touchedActive.has(company.companyName);

      if (note || companyHasTouchedValue(company, sourceStates) || hasActive) {
        updates.push({
          companyName: company.companyName,
          activeStatus: hasActive ? activeValues[company.companyName] : undefined,
          note,
          values: saveValues
        });
      }
    }

    if (updates.length === 0) {
      setNotice({ type: "success", text: "No changes detected" });
      return;
    }

    saveInFlightRef.current = true;
    setIsSaving(true);
    setNotice(null);

    try {
      const response = await fetch("/api/petyr/forecast-entry/batch/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csmName: batch.data.selectedCsm,
          year: batch.data.year,
          month: batch.data.month,
          forecastType: editableForecastType,
          updates
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? payload.detail ?? "Unable to save Forecast Entry batch.");
      }

      const successText = payload.noChanges
        ? "No changes detected"
        : `Saved ${payload.forecastUpserts} value(s) and ${payload.activeStatusUpdates ?? 0} Active status update(s) across ${payload.companiesSaved} compan${payload.companiesSaved === 1 ? "y" : "ies"}.`;

      setBatch(payload.batch);
      setNotice({
        type: "success",
        text: successText
      });
      if (!payload.noChanges) {
        markSavedState(successText);
      }
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to save Forecast Entry batch."
      });
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  }

  function handleSaveKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || isSaving || saveInFlightRef.current) return;

    event.preventDefault();
    void saveBatch();
  }

  const tableColumnCount = useMemo(() => {
    return 3 + batch.data.businessUnits.reduce((sum, businessUnit) => sum + (expandedBusinessUnits.has(businessUnit) ? 3 : 1), 0);
  }, [batch.data.businessUnits, expandedBusinessUnits]);
  const periodSelectionChanged = draftMonth !== String(batch.data.month) || draftYear !== String(batch.data.year);
  const monthlyCompanies = useMemo(() => {
    return batch.data.companies.filter((company) => {
      const isActive = company.isForecastActive;
      if (activeVisibilityFilter === "active") return isActive;
      if (activeVisibilityFilter === "inactive") return !isActive;
      return true;
    }).sort((left, right) => {
      if (monthlySort.key === "business_unit") {
        const result = monthlyBusinessUnitSortValue(right, monthlySort.businessUnit) - monthlyBusinessUnitSortValue(left, monthlySort.businessUnit);
        if (result !== 0) return result;
        return left.companyName.localeCompare(right.companyName);
      }

      const result = left.companyName.localeCompare(right.companyName);
      return monthlySort.direction === "asc" ? result : -result;
    });
  }, [activeVisibilityFilter, batch.data.companies, editableForecastType, isPastSelectedPeriod, monthlySort]);

  const monthlySummary = useMemo(() => {
    const byBusinessUnit = Object.fromEntries(
      batch.data.businessUnits.map((businessUnit) => [
        businessUnit,
        {
          previous_month: 0,
          ongoing: 0,
          active: 0,
          closed: 0
        }
      ])
    ) as Record<string, { previous_month: number; ongoing: number; active: number; closed: number }>;
    let activeTotal = 0;
    let closedTotal = 0;

    for (const company of monthlyCompanies) {
      for (const cell of company.businessUnits) {
        const previousMonth = currentForecastValue(company, cell, "previous_month");
        const ongoing = currentForecastValue(company, cell, "ongoing");
        const active = editableForecastType === "ongoing" ? ongoing : previousMonth;
        const closed = cell.closedRevenue ?? 0;
        const totals = byBusinessUnit[cell.businessUnit] ?? {
          previous_month: 0,
          ongoing: 0,
          active: 0,
          closed: 0
        };

        totals.previous_month += previousMonth;
        totals.ongoing += ongoing;
        totals.active += active;
        totals.closed += closed;
        byBusinessUnit[cell.businessUnit] = totals;
        activeTotal += active;
        closedTotal += closed;
      }
    }

    return {
      activeTotal,
      closedTotal,
      byBusinessUnit
    };
  }, [batch.data.businessUnits, editableForecastType, monthlyCompanies, sourceStates, values]);
  const compactPortfolioTotal = isPastSelectedPeriod ? monthlySummary.closedTotal : monthlySummary.activeTotal;


  return (
    <PetyrWorkspaceShell
      activeSection="entry"
      companyDetailHref={companyDetailHref}
      forecastEntryHref={buildEntryPageUrl(batch.data.selectedCsm, batch.data.year, batch.data.month)}
      canViewCsmOverview={canViewCsmOverview}
      canRefreshSourceData
      contentClassName="max-w-[1800px]"
    >
      <section>
        <PetyrSectionTitle
          title="Forecast Entry"
          description={`Review annual Forecast Ongoing by default, or switch to monthly forecast entry for ${selectedMonthLabel}.`}
          actions={
            <Badge variant={isLocked ? "outline" : "secondary"}>
              {isLocked ? batch.data.entryMode.label : activeLabel}
            </Badge>
          }
        />

      </section>

      {notice ? <PetyrInlineNotice tone={notice.type === "success" ? "success" : "danger"}>{notice.text}</PetyrInlineNotice> : null}

      <Tabs
        defaultValue="annual"
        className="space-y-5"
        onValueChange={setActiveEntryTab}
      >
        <TabsList className="rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
          <TabsTrigger value="annual" className="rounded-xl">
            Annual Forecast Entry
          </TabsTrigger>
          <TabsTrigger value="monthly" className="rounded-xl">
            Monthly Forecast Entry
          </TabsTrigger>
        </TabsList>

        <TabsContent value="monthly" className="space-y-5">
          <PetyrCard>
        <CardHeader>
          <CardTitle>Monthly Forecast Batch</CardTitle>
          <CardDescription>
            {batch.data.selectedCsm}: {batch.data.companies.length} compan{batch.data.companies.length === 1 ? "y" : "ies"} - {selectedMonthLabel}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <PetyrInlineNotice tone={isLocked ? "warning" : "success"}>
            {isLocked
              ? batch.data.entryMode.reason
              : `${activeLabel} is editable for ${selectedMonthLabel}. Other forecast fields and ${closedRevenueHeader} are read-only.`}
          </PetyrInlineNotice>

          <div className="sticky top-4 z-40 flex h-[calc(100dvh-2rem)] min-h-0 flex-col gap-3">
          <div className="shrink-0 space-y-2 border-b border-slate-200 bg-white/95 pb-2 pt-1 backdrop-blur">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_150px_120px_auto_minmax(0,1fr)] lg:items-end">
              <PetyrSelectField
                label="CSM"
                disabled={isLoading || isSaving}
                value={selectedCsm}
                onChange={(event) => {
                  void loadBatch(event.target.value);
                }}
              >
                {batch.data.csmOptions.map((csmName) => (
                  <option key={csmName} value={csmName}>
                    {csmName}
                  </option>
                ))}
              </PetyrSelectField>
              <PetyrSelectField
                label="Month"
                disabled={isLoading || isSaving}
                value={draftMonth}
                onChange={(event) => setDraftMonth(event.target.value)}
              >
                {MONTHS.map((label, index) => (
                  <option key={label} value={String(index + 1)}>
                    {label}
                  </option>
                ))}
              </PetyrSelectField>
              <label className="space-y-1 text-sm font-medium text-slate-700">
                Year
                <Input
                  type="number"
                  min={2000}
                  max={2100}
                  step={1}
                  disabled={isLoading || isSaving}
                  value={draftYear}
                  onChange={(event) => setDraftYear(event.target.value)}
                  className="h-10 rounded-xl bg-white"
                />
              </label>
              <Button
                type="button"
                variant={periodSelectionChanged ? "default" : "outline"}
                disabled={isLoading || isSaving}
                onClick={() => {
                  void loadSelectedPeriod();
                }}
                className="h-10 rounded-xl px-5"
              >
                {isLoading ? "Loading" : "Load"}
              </Button>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2">
              <LegendChip className="border-blue-300 bg-blue-100" label="AI suggestion/placeholder" />
              <LegendChip className="border-violet-300 bg-violet-100" label="CSM validated from AI" />
              <LegendChip className="border-emerald-300 bg-emerald-100" label="CSM manually edited" />
              <LegendChip className="border-slate-300 bg-white" label="Saved CSM forecast" />
              <LegendChip className="border-amber-300 bg-amber-100" label={`${closedRevenueHeader} read-only`} />
              <LegendChip className="border-slate-300 bg-slate-200" label="Locked forecast field" />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-slate-200 bg-white">
            <Table className="min-w-max [&_tbody_td]:align-top [&_tbody_td]:py-[5px]">
              <TableHeader>
                <TableRow className="h-20 hover:bg-transparent">
                  <TableHead
                    className="sticky left-0 top-0 z-[60] min-w-[240px] bg-white align-top shadow-[0_1px_0_0_rgba(226,232,240,1)]"
                    rowSpan={2}
                    aria-sort={monthlySort.key === "company" ? (monthlySort.direction === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <button
                      type="button"
                      className="inline-flex h-8 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
                      onClick={() =>
                        setMonthlySort((current) => ({
                          key: "company",
                          direction: current.key === "company" && current.direction === "asc" ? "desc" : "asc"
                        }))
                      }
                    >
                      <span>Company</span>
                      <span className="text-xs font-semibold text-slate-500">
                        {monthlySort.key === "company" ? monthlyCompanySortLabel(monthlySort.direction) : "Sort"}
                      </span>
                    </button>
                  </TableHead>
                  <TableHead className="sticky top-0 z-50 min-w-[180px] bg-amber-50 align-top shadow-[0_1px_0_0_rgba(226,232,240,1)]" rowSpan={2}>
                    <div className="space-y-1 rounded-lg border border-amber-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800 shadow-sm">
                      <div className="flex min-h-8 items-center gap-2">
                        <span className="shrink-0">Active</span>
                        <select
                          value={activeVisibilityFilter}
                          disabled={isLoading || isSaving}
                          onChange={(event) => setActiveVisibilityFilter(event.target.value as ActiveVisibilityFilter)}
                          className="h-7 min-w-0 flex-1 rounded-lg border border-amber-200 bg-white px-2 text-xs font-medium text-slate-700"
                          aria-label="Filter companies by active status"
                        >
                          <option value="all">All</option>
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </div>
                      <p className="max-w-[150px] text-[11px] font-medium leading-snug text-amber-800">
                        Company status is global, not monthly.
                      </p>
                    </div>
                  </TableHead>
                  {batch.data.businessUnits.map((businessUnit) => {
                    const expanded = expandedBusinessUnits.has(businessUnit);
                    return (
                      <TableHead
                        key={businessUnit}
                        className="sticky top-0 z-50 min-w-[190px] border-l border-slate-200 bg-slate-50 text-center shadow-[0_1px_0_0_rgba(226,232,240,1)]"
                        colSpan={expanded ? 3 : 1}
                      >
                        <div className="flex w-full items-center gap-2">
                          <button
                            type="button"
                            className="flex min-h-9 flex-1 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
                            onClick={() => toggleBusinessUnit(businessUnit)}
                            aria-expanded={expanded}
                          >
                            <span>{formatBusinessUnitDisplayName(businessUnit)}</span>
                            <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                              {expanded ? "Collapse" : "Expand"}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="min-h-9 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
                            onClick={() => setMonthlySort({ key: "business_unit", businessUnit })}
                          >
                            {monthlyBusinessUnitSortLabel(monthlySort, businessUnit)}
                          </button>
                        </div>
                      </TableHead>
                    );
                  })}
                  <TableHead className="sticky top-0 z-50 min-w-[260px] bg-white shadow-[0_1px_0_0_rgba(226,232,240,1)]" rowSpan={2}>
                    Note
                  </TableHead>
                </TableRow>
                <TableRow className="hover:bg-transparent">
                  {batch.data.businessUnits.flatMap((businessUnit) => {
                    const expanded = expandedBusinessUnits.has(businessUnit);
                    if (!expanded) {
                      return [
                       <TableHead key={`${businessUnit}-active`} className="sticky top-20 z-40 min-w-[190px] border-l border-slate-200 bg-white text-xs text-slate-700 shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                        {compactBusinessUnitHeader}
                      </TableHead>
                      ];
                    }

                    return [
                      ...EXPANDED_FORECAST_COLUMNS.map((forecastType) => (
                        <TableHead
                          key={`${businessUnit}-${forecastType}`}
                          className={`sticky top-20 z-40 min-w-[190px] border-l border-slate-200 text-xs shadow-[0_1px_0_0_rgba(226,232,240,1)] ${expandedForecastHeaderClass(forecastType, editableForecastType)}`}
                        >
                          {forecastTypeLabel(forecastType)}
                        </TableHead>
                      )),
                      <TableHead key={`${businessUnit}-closed`} className="sticky top-20 z-40 min-w-[170px] border-l border-slate-200 bg-amber-50 text-xs text-amber-900 shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                        {closedRevenueHeader}
                      </TableHead>
                    ];
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyCompanies.length > 0 ? (
                  <>
                    <TableRow className="sticky top-32 z-30 border-b-2 border-cyan-200 bg-cyan-50 shadow-[0_1px_0_0_rgba(165,243,252,1)] hover:bg-cyan-50">
                      <TableCell className="sticky left-0 z-40 min-w-[240px] border-r border-cyan-200 bg-cyan-50">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-cyan-800">
                          {selectedMonthLabel} {isPastSelectedPeriod ? "Closed Revenue" : "CSM Forecast"}
                        </div>
                        <div className="mt-1 text-xs font-medium text-cyan-700">Portfolio total</div>
                        <div className={`mt-1 text-sm font-bold ${mutedNumericClass(isEmptyOrZeroDisplay(compactPortfolioTotal))}`}>
                          {formatPetyrIntegerCurrencyValue(compactPortfolioTotal)}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[150px] bg-cyan-50" aria-label="No active status for total row" />
                      {batch.data.businessUnits.flatMap((businessUnit) => {
                        const expanded = expandedBusinessUnits.has(businessUnit);
                        const totals = monthlySummary.byBusinessUnit[businessUnit] ?? {
                          previous_month: 0,
                          ongoing: 0,
                          active: 0,
                          closed: 0
                        };

                        if (!expanded) {
                          const compactTotal = isPastSelectedPeriod ? totals.closed : totals.active;
                          return [
                            <TableCell key={`total-${businessUnit}-active`} className={`min-w-[190px] ${monthlyTotalCellClass(compactTotal)}`}>
                              {formatPetyrIntegerCurrencyValue(compactTotal)}
                            </TableCell>
                          ];
                        }

                        return [
                          <TableCell key={`total-${businessUnit}-previous_month`} className={`min-w-[190px] ${monthlyTotalCellClass(totals.previous_month)}`}>
                            {formatPetyrIntegerCurrencyValue(totals.previous_month)}
                          </TableCell>,
                          <TableCell key={`total-${businessUnit}-ongoing`} className={`min-w-[190px] ${monthlyTotalCellClass(totals.ongoing)}`}>
                            {formatPetyrIntegerCurrencyValue(totals.ongoing)}
                          </TableCell>,
                          <TableCell key={`total-${businessUnit}-closed`} className={`min-w-[170px] ${monthlyTotalCellClass(totals.closed)}`}>
                            {formatPetyrIntegerCurrencyValue(totals.closed)}
                          </TableCell>
                        ];
                      })}
                      <TableCell className="min-w-[260px] bg-cyan-50" aria-label="No note for total row" />
                    </TableRow>
                    {monthlyCompanies.map((company) => (
                      <TableRow key={company.companyName} className={company.isForecastActive ? "" : "bg-slate-50 text-slate-500 opacity-75"}>
                      <TableCell className="sticky left-0 z-10 min-w-[240px] bg-white">
                        <Link
                          href={buildCompanyDetailPageUrl(company.companyName, batch.data.year, company.csmName)}
                          className="font-semibold text-slate-900 underline-offset-4 hover:underline"
                        >
                          {company.companyName}
                        </Link>
                        <div className={`mt-1 text-xs font-semibold ${mutedNumericClass(isEmptyOrZeroDisplay(currentCompanyForecastTotal(company)))}`}>
                          Totale forecast BU: {formatPetyrIntegerCurrencyValue(currentCompanyForecastTotal(company))}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[150px] border-l border-slate-200 bg-amber-50">
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
                      {company.businessUnits.flatMap((cell) => {
                        const expanded = expandedBusinessUnits.has(cell.businessUnit);
                        const key = cellKey(company.companyName, cell.businessUnit);
                        const current = activeForecast(cell, editableForecastType);
                        const sourceState = sourceStates[key];
                        const monthlyPlaceholder = monthlyPlaceholderFor(cell, editableForecastType);
                        const placeholderValue = monthlyPlaceholder.value !== null ? formatInputValue(monthlyPlaceholder.value) : "";
                        const currentInputValue = values[key] ?? "";
                        const mutedInput = isEmptyOrZeroDisplay(currentInputValue || placeholderValue);
                        const activeInputClass =
                          sourceState === "accepted_ai"
                            ? "border-violet-300 bg-violet-50"
                            : sourceState === "manual_edit"
                              ? "border-emerald-300 bg-emerald-50"
                              : current.hasSavedCsmValue
                                ? "border-slate-300 bg-white"
                                : placeholderValue
                                  ? "border-blue-300 bg-blue-50"
                                  : "border-slate-200 bg-white";
                        const renderEditableCell = (cellKeySuffix: string) => (
                          <TableCell key={`${key}-${cellKeySuffix}`} className="min-w-[190px] border-l border-slate-200">
                              <Input
                                inputMode="numeric"
                                disabled={isLocked || isSaving}
                                readOnly={isLocked}
                                placeholder={placeholderValue || "n/a"}
                                value={currentInputValue}
                                onFocus={() => acceptMonthlyPlaceholder(company, cell)}
                                onClick={() => acceptMonthlyPlaceholder(company, cell)}
                                onChange={(event) => updateValue(company, cell, event.target.value)}
                                onKeyDown={handleSaveKeyDown}
                                className={`h-8 w-full min-w-[158px] rounded-xl text-right font-semibold ${mutedNumericClass(mutedInput)} ${isLocked ? "bg-slate-100" : activeInputClass}`}
                              />
                              {sourceState ? (
                                <div className="mt-1 text-[11px] font-medium text-slate-500">
                                  {sourceState === "accepted_ai" ? "Validated from placeholder" : "Manual edit"}
                                </div>
                              ) : current.hasSavedCsmValue ? (
                                <SavedForecastStatus aiForecastValue={cell.aiForecast.value} />
                              ) : placeholderValue ? (
                                <div className="mt-1 text-[11px] text-blue-700">{monthlyPlaceholder.label}</div>
                              ) : null}
                            </TableCell>
                        );

                        if (!expanded) {
                          if (isPastSelectedPeriod) {
                            return [
                              <TableCell
                                key={`${key}-active`}
                                className={`min-w-[190px] border-l border-slate-200 bg-amber-50 text-right font-medium ${mutedNumericClass(isEmptyOrZeroDisplay(cell.closedRevenue))}`}
                              >
                                {formatPetyrIntegerCurrencyValue(cell.closedRevenue)}
                              </TableCell>
                            ];
                          }

                          return [renderEditableCell("active")];
                        }

                        return [
                          ...EXPANDED_FORECAST_COLUMNS.map((forecastType) => {
                            if (forecastType === editableForecastType) {
                              return renderEditableCell(forecastType);
                            }

                            return (
                              <TableCell
                                key={`${key}-${forecastType}`}
                                className={`min-w-[190px] border-l border-slate-200 bg-slate-50 text-right font-medium ${mutedNumericClass(isEmptyOrZeroDisplay(forecastForType(cell, forecastType)?.value))}`}
                              >
                                {formatPetyrIntegerCurrencyValue(forecastForType(cell, forecastType)?.value)}
                              </TableCell>
                            );
                          }),
                          <TableCell
                            key={`${key}-closed`}
                            className={`min-w-[170px] border-l border-slate-200 bg-amber-50 text-right font-medium ${mutedNumericClass(isEmptyOrZeroDisplay(cell.closedRevenue))}`}
                          >
                            {formatPetyrIntegerCurrencyValue(cell.closedRevenue)}
                          </TableCell>
                        ];
                      })}
                      <TableCell className="min-w-[260px]">
                        <Textarea
                          value={notes[company.companyName] ?? ""}
                          onChange={(event) => updateNote(company.companyName, event.target.value)}
                          disabled={isSaving}
                          placeholder="Company note..."
                          className="min-h-12 rounded-xl"
                        />
                      </TableCell>
                      </TableRow>
                    ))}
                  </>
                ) : (
                  <TableRow>
                    <TableCell colSpan={tableColumnCount} className="bg-slate-50 py-8 text-center text-sm text-slate-500">
                      No companies available for this CSM.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={isLoading || isSaving}
              onClick={() => {
                window.location.href = buildMonthlyExportUrl(batch.data.selectedCsm, batch.data.year);
              }}
              className="rounded-xl"
            >
              Export Excel
            </Button>
          </div>

        </CardContent>
          </PetyrCard>
        </TabsContent>

        <TabsContent value="annual" className="space-y-5">
          {annualBatch ? (
            <AnnualForecastEntryBatchWorkspace
              key={`${annualBatch.data.selectedCsms.join("|")}-${annualBatch.data.selectedYear}`}
              initialBatch={annualBatch}
              onBatchChange={(nextBatch) => {
                setAnnualBatch(nextBatch);
                if (nextBatch.data.selectedCsms.length === 1 && nextBatch.data.selectedCsms[0] !== batch.data.selectedCsm) {
                  void loadBatch(nextBatch.data.selectedCsms[0]);
                }
              }}
            />
          ) : (
            <PetyrCard>
              <CardContent className="space-y-4 p-5">
                <PetyrInlineNotice tone={notice?.type === "error" ? "danger" : "success"}>
                  {isAnnualLoading
                    ? "Loading Annual Forecast Entry..."
                    : notice?.type === "error"
                      ? notice.text
                      : annualLoadAttempted
                        ? "Annual Forecast Entry data is unavailable."
                        : "Annual Forecast Entry is loading in the background."}
                </PetyrInlineNotice>
              </CardContent>
            </PetyrCard>
          )}
        </TabsContent>

      </Tabs>
      {activeEntryTab === "monthly" ? (
        <>
          <div className="fixed bottom-5 right-5 z-50 flex max-w-[360px] flex-col items-end gap-3">
            {showSavedState && savedSummary ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-right shadow-lg shadow-emerald-950/10">
                <div className="text-sm font-bold text-emerald-950">Forecast saved</div>
                <div className="mt-1 text-sm font-medium text-emerald-800">{savedSummary}</div>
              </div>
            ) : null}
            <Button
              className={`h-12 min-w-[112px] rounded-xl px-6 shadow-lg shadow-slate-900/20 ${
                showSavedState ? "bg-emerald-600 text-white hover:bg-emerald-600" : ""
              }`}
              type="button"
              disabled={(isLocked && touchedActive.size === 0) || isSaving || isLoading}
              onClick={saveBatch}
            >
              {isSaving ? "Saving" : "Save"}
            </Button>
          </div>
          <div className="sr-only" aria-live="polite">
            {showSavedState ? `Forecast saved. ${savedSummary}` : ""}
          </div>
        </>
      ) : null}
    </PetyrWorkspaceShell>
  );
}
