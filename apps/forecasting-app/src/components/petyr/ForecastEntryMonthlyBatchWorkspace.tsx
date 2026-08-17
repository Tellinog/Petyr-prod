
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
import { PetyrSelectChevron, PetyrSelectField } from "@/components/petyr/PetyrForecastNavigation";
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

function buildBatchUrl(csmNames: string[], year: number, month: number) {
  const params = new URLSearchParams();
  for (const csmName of csmNames) if (csmName) params.append("csmName", csmName);
  params.set("year", String(year));
  params.set("month", String(month));
  const query = params.toString();
  return query ? `/api/petyr/forecast-entry/batch?${query}` : "/api/petyr/forecast-entry/batch";
}

function buildAnnualBatchUrl(csmNames: string[], year?: string) {
  const params = new URLSearchParams();
  for (const csmName of csmNames) if (csmName) params.append("csmName", csmName);
  if (year) params.set("year", year);
  const query = params.toString();
  return query ? `/api/petyr/forecast-entry/annual-batch?${query}` : "/api/petyr/forecast-entry/annual-batch";
}

function buildMonthlyExportUrl(csmNames: string[], year: number) {
  const params = new URLSearchParams();
  for (const csmName of csmNames) if (csmName) params.append("csmName", csmName);
  params.set("year", String(year));
  return `/api/petyr/forecast-entry/monthly-export-xlsx?${params.toString()}`;
}


function buildEntryPageUrl(csmNames: string[], year?: number, month?: number) {
  const params = new URLSearchParams();
  for (const csmName of csmNames) if (csmName) params.append("csmName", csmName);
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

function selectedCsmsLabel(csmNames: string[]) {
  if (csmNames.length === 0) return "No CSM selected";
  if (csmNames.length === 1) return csmNames[0];
  return `${csmNames[0]} + ${csmNames.length - 1}`;
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
  canViewCsmOverview = false,
  authenticatedUserEmail
}: {
  initialBatch: ForecastEntryBatchDataResult;
  initialAnnualYear?: string;
  initialAnnualBatch?: AnnualForecastEntryBatchDataResult | null;
  canViewCsmOverview?: boolean;
  authenticatedUserEmail: string;
}) {
  const [batch, setBatch] = useState(initialBatch);
  const [selectedCsms, setSelectedCsms] = useState<string[]>(() => initialBatch.data.selectedCsms ?? [initialBatch.data.selectedCsm].filter(Boolean));
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
  const [activeEntryTab, setActiveEntryTab] = useState<"monthly" | "annual">("monthly");
  const [annualBatch, setAnnualBatch] = useState<AnnualForecastEntryBatchDataResult | null>(initialAnnualBatch);
  const [isAnnualLoading, setIsAnnualLoading] = useState(false);
  const [annualLoadAttempted, setAnnualLoadAttempted] = useState(Boolean(initialAnnualBatch));
  const [monthlySort, setMonthlySort] = useState<MonthlySortState>({ key: "company", direction: "asc" });
  const [activeValues, setActiveValues] = useState<Record<string, boolean>>(() => activeValuesFromBatch(initialBatch));
  const [statusSavingCompanies, setStatusSavingCompanies] = useState<Set<string>>(() => new Set());
  const [activeVisibilityFilter, setActiveVisibilityFilter] = useState<ActiveVisibilityFilter>("all");
  const [isCsmDropdownOpen, setIsCsmDropdownOpen] = useState(false);
  const csmDropdownRef = useRef<HTMLDivElement | null>(null);

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
    setStatusSavingCompanies(new Set());
    setNotes({});
    setDraftMonth(String(batch.data.month));
    setDraftYear(String(batch.data.year));
    setSelectedCsms(batch.data.selectedCsms ?? [batch.data.selectedCsm].filter(Boolean));
    setIsCsmDropdownOpen(false);
    window.history.replaceState(null, "", buildEntryPageUrl(batch.data.selectedCsms ?? [batch.data.selectedCsm].filter(Boolean), batch.data.year, batch.data.month));
  }, [batch]);

  useEffect(() => {
    function closeCsmDropdownOnOutsideClick(event: MouseEvent) {
      if (!csmDropdownRef.current?.contains(event.target as Node)) setIsCsmDropdownOpen(false);
    }

    document.addEventListener("mousedown", closeCsmDropdownOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeCsmDropdownOnOutsideClick);
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

  async function loadBatch(csmNames: string[], year = batch.data.year, month = batch.data.month) {
    const nextCsms = csmNames.length > 0 ? csmNames : selectedCsms;
    setSelectedCsms(nextCsms);
    setIsLoading(true);
    setNotice(null);

    try {
      const response = await fetch(buildBatchUrl(nextCsms, year, month), { cache: "no-store" });
      const payload = (await response.json()) as ForecastEntryBatchDataResult;

      if (!response.ok) {
        throw new Error("Unable to load Forecast Entry batch.");
      }

      setBatch(payload);
      setSelectedCsms(payload.data.selectedCsms ?? [payload.data.selectedCsm].filter(Boolean));

      if (annualBatch) {
        const annualResponse = await fetch(buildAnnualBatchUrl(payload.data.selectedCsms ?? [payload.data.selectedCsm].filter(Boolean), String(annualBatch.data.selectedYear)), { cache: "no-store" });
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

    await loadBatch(selectedCsms, year, month);
  }
  async function loadAnnualBatchIfNeeded() {
    if (annualBatch || isAnnualLoading) return;

    setIsAnnualLoading(true);
    setAnnualLoadAttempted(true);
    setNotice(null);

    try {
      const response = await fetch(buildAnnualBatchUrl(batch.data.selectedCsms ?? [batch.data.selectedCsm].filter(Boolean), initialAnnualYear), { cache: "no-store" });
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

  function handleEntryTabChange(value: string) {
    const nextTab = value === "annual" ? "annual" : "monthly";
    setActiveEntryTab(nextTab);

    if (nextTab === "annual") {
      void loadAnnualBatchIfNeeded();
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

  function toggleCsmSelection(csmName: string) {
    setSelectedCsms((current) =>
      current.includes(csmName) ? current.filter((selectedCsm) => selectedCsm !== csmName) : [...current, csmName]
    );
  }

  function companyIsForecastActive(company: ForecastEntryBatchCompany) {
    return activeValues[company.companyName] ?? company.isForecastActive;
  }

  function synchronizeCompanyStatus(companyName: string, isActive: boolean) {
    setActiveValues((existing) => ({ ...existing, [companyName]: isActive }));
    setAnnualBatch((current) => {
      if (!current) return current;

      return {
        ...current,
        data: {
          ...current.data,
          companies: current.data.companies.map((company) =>
            company.companyName === companyName ? { ...company, isForecastActive: isActive } : company
          )
        }
      };
    });
  }

  async function updateActive(company: ForecastEntryBatchCompany, value: boolean) {
    const companyName = company.companyName;
    const previousValue = companyIsForecastActive(company);
    if (value === previousValue || statusSavingCompanies.has(companyName)) return;

    setActiveValues((existing) => ({ ...existing, [companyName]: value }));
    setStatusSavingCompanies((existing) => new Set(existing).add(companyName));
    setNotice(null);

    try {
      const response = await fetch("/api/petyr/forecast-entry/batch/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csmName: company.csmName,
          year: batch.data.year,
          month: batch.data.month,
          updates: [{ companyName, activeStatus: value, values: [] }]
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? payload.detail ?? "Unable to save company status.");
      }

      synchronizeCompanyStatus(companyName, value);
    } catch (error) {
      setActiveValues((existing) => ({ ...existing, [companyName]: previousValue }));
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to save company status."
      });
    } finally {
      setStatusSavingCompanies((existing) => {
        const next = new Set(existing);
        next.delete(companyName);
        return next;
      });
    }
  }

  async function saveBatch() {
    if (saveInFlightRef.current) return;

    if (isLocked || !editableForecastType) return;

    const updates = [];

    for (const company of batch.data.companies) {
      const note = notes[company.companyName]?.trim() ?? "";
      const saveValues = getCompanySaveValues(company, editableForecastType, values, sourceStates);
      if (note || companyHasTouchedValue(company, sourceStates)) {
        updates.push({
          companyName: company.companyName,
          activeStatus: undefined,
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
      const updatesByCsm = new Map<string, typeof updates>();
      for (const update of updates) {
        const csmName = batch.data.companies.find((company) => company.companyName === update.companyName)?.csmName ?? "";
        updatesByCsm.set(csmName, [...(updatesByCsm.get(csmName) ?? []), update]);
      }

      const payloads = await Promise.all([...updatesByCsm.entries()].map(async ([csmName, csmUpdates]) => {
        const response = await fetch("/api/petyr/forecast-entry/batch/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ csmName, year: batch.data.year, month: batch.data.month, forecastType: editableForecastType, updates: csmUpdates })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? payload.detail ?? "Unable to save Forecast Entry batch.");
        return payload;
      }));

      const forecastUpserts = payloads.reduce((sum, payload) => sum + payload.forecastUpserts, 0);
      const activeStatusUpdates = payloads.reduce((sum, payload) => sum + (payload.activeStatusUpdates ?? 0), 0);
      const companiesSaved = payloads.reduce((sum, payload) => sum + payload.companiesSaved, 0);
      const noChanges = payloads.every((payload) => payload.noChanges);
      const successText = noChanges
        ? "No changes detected"
        : `Saved ${forecastUpserts} value(s) and ${activeStatusUpdates} Active status update(s) across ${companiesSaved} compan${companiesSaved === 1 ? "y" : "ies"}.`;

      await loadBatch(selectedCsms);
      setNotice({
        type: "success",
        text: successText
      });
      if (!noChanges) {
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
    return 4 + batch.data.businessUnits.reduce((sum, businessUnit) => sum + (expandedBusinessUnits.has(businessUnit) ? 3 : 1), 0);
  }, [batch.data.businessUnits, expandedBusinessUnits]);
  const periodSelectionChanged = draftMonth !== String(batch.data.month) || draftYear !== String(batch.data.year);
  const monthlyCompanies = useMemo(() => {
    return batch.data.companies.filter((company) => {
      const isActive = companyIsForecastActive(company);
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
  }, [activeValues, activeVisibilityFilter, batch.data.companies, editableForecastType, isPastSelectedPeriod, monthlySort]);

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
      forecastEntryHref={buildEntryPageUrl(batch.data.selectedCsms ?? [batch.data.selectedCsm].filter(Boolean), batch.data.year, batch.data.month)}
      authenticatedUserEmail={authenticatedUserEmail}
      canViewCsmOverview={canViewCsmOverview}
      canRefreshSourceData
      contentClassName="max-w-[1800px]"
    >
      <section>
        <PetyrSectionTitle
          title="Forecast Entry"
          description={`Review monthly forecast entry for ${selectedMonthLabel}, or switch to Annual Forecast Entry when needed.`}
          actions={
            <Badge variant={isLocked ? "outline" : "secondary"}>
              {isLocked ? batch.data.entryMode.label : activeLabel}
            </Badge>
          }
        />

      </section>

      {notice ? <PetyrInlineNotice tone={notice.type === "success" ? "success" : "danger"}>{notice.text}</PetyrInlineNotice> : null}

      <Tabs
        defaultValue="monthly"
        className="space-y-5"
        onValueChange={handleEntryTabChange}
      >
        <TabsList className="rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
          <TabsTrigger value="monthly" className="rounded-xl">
            Monthly Forecast Entry
          </TabsTrigger>
          <TabsTrigger value="annual" className="rounded-xl">
            Annual Forecast Entry
          </TabsTrigger>
        </TabsList>

        <TabsContent value="monthly" className="space-y-5">
          <PetyrCard>
        <CardHeader>
          <CardTitle>Monthly Forecast Batch</CardTitle>
          <CardDescription>
            {selectedCsmsLabel(batch.data.selectedCsms ?? [batch.data.selectedCsm].filter(Boolean))}: {batch.data.companies.length} compan{batch.data.companies.length === 1 ? "y" : "ies"} - {selectedMonthLabel}
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
              <div ref={csmDropdownRef} className="relative space-y-1 text-sm font-medium text-slate-700">
                <span>CSM</span>
                <Button type="button" variant="outline" disabled={isLoading || isSaving} onClick={() => setIsCsmDropdownOpen((current) => !current)} className="h-10 w-full justify-between rounded-xl bg-white px-3 text-left font-normal" aria-haspopup="listbox" aria-expanded={isCsmDropdownOpen}>
                  <span className="truncate">{selectedCsmsLabel(selectedCsms)}</span>
                  <PetyrSelectChevron />
                </Button>
                {isCsmDropdownOpen ? (
                  <div role="listbox" aria-multiselectable="true" className="absolute left-0 top-full z-[70] mt-2 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10">
                    {batch.data.csmOptions.map((csmName) => (
                      <label key={csmName} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                        <input type="checkbox" checked={selectedCsms.includes(csmName)} disabled={isLoading || isSaving} onChange={() => toggleCsmSelection(csmName)} />
                        <span className="truncate">{csmName}</span>
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
              <PetyrSelectField
                label="Month"
                disabled={isLoading || isSaving || selectedCsms.length === 0}
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
                disabled={isLoading || isSaving || selectedCsms.length === 0}
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
                    className="sticky left-0 top-0 z-[60] min-w-[150px] bg-amber-50 align-top shadow-[0_1px_0_0_rgba(226,232,240,1)]"
                    rowSpan={2}
                  >
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
                  <TableHead
                    className="sticky left-[150px] top-0 z-[60] min-w-[240px] bg-white align-top shadow-[8px_0_12px_-12px_rgba(15,23,42,0.45)]"
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
                  <TableHead
                    className="sticky top-0 z-50 min-w-[190px] border-l border-cyan-200 bg-cyan-50 text-right text-xs font-semibold text-cyan-950 shadow-[0_1px_0_0_rgba(226,232,240,1)]"
                    rowSpan={2}
                  >
                    Monthly Total
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
                      <TableCell className="sticky left-0 z-40 min-w-[150px] border-r border-cyan-200 bg-cyan-50" aria-label="No active status for total row" />
                      <TableCell className="sticky left-[150px] z-40 min-w-[240px] border-r border-cyan-200 bg-cyan-50 shadow-[8px_0_12px_-12px_rgba(15,23,42,0.45)]">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-cyan-800">
                          {selectedMonthLabel} {isPastSelectedPeriod ? "Closed Revenue" : "CSM Forecast"}
                        </div>
                        <div className="mt-1 text-xs font-medium text-cyan-700">Portfolio total</div>
                        <div className={`mt-1 text-sm font-bold ${mutedNumericClass(isEmptyOrZeroDisplay(compactPortfolioTotal))}`}>
                          {formatPetyrIntegerCurrencyValue(compactPortfolioTotal)}
                        </div>
                      </TableCell>
                      <TableCell className={`min-w-[190px] ${monthlyTotalCellClass(compactPortfolioTotal)}`}>
                        {formatPetyrIntegerCurrencyValue(compactPortfolioTotal)}
                      </TableCell>
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
                    {monthlyCompanies.map((company) => {
                      const isActive = companyIsForecastActive(company);

                      return (
                      <TableRow key={company.companyName} className={isActive ? "" : "bg-slate-50 text-slate-500 opacity-75"}>
                      <TableCell className={`sticky left-0 z-20 min-w-[150px] border-r border-slate-200 ${isActive ? "bg-amber-50" : "bg-slate-50"}`}>
                        <label className="inline-flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={isActive}
                            disabled={isSaving || statusSavingCompanies.has(company.companyName)}
                            onChange={(event) => void updateActive(company, event.target.checked)}
                          />
                          {isActive ? "ON" : "OFF"}
                        </label>
                      </TableCell>
                      <TableCell className={`sticky left-[150px] z-20 min-w-[240px] bg-white shadow-[8px_0_12px_-12px_rgba(15,23,42,0.45)] ${isActive ? "bg-white" : "bg-slate-50"}`}>
                        <Link
                          href={buildCompanyDetailPageUrl(company.companyName, batch.data.year, company.csmName)}
                          className="font-semibold text-slate-900 underline-offset-4 hover:underline"
                        >
                          {company.companyName}
                        </Link>
                      </TableCell>
                      <TableCell className={`min-w-[190px] border-l border-cyan-200 bg-cyan-50 text-right font-bold ${mutedNumericClass(isEmptyOrZeroDisplay(currentCompanyForecastTotal(company)))}`}>
                        {formatPetyrIntegerCurrencyValue(currentCompanyForecastTotal(company))}
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
                      );
                    })}
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
                window.location.href = buildMonthlyExportUrl(batch.data.selectedCsms ?? [batch.data.selectedCsm].filter(Boolean), batch.data.year);
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
              companyActiveStatuses={activeValues}
              onCompanyStatusChange={synchronizeCompanyStatus}
              onBatchChange={(nextBatch) => {
                setAnnualBatch(nextBatch);
                if (nextBatch.data.selectedCsms.join("\u0000") !== (batch.data.selectedCsms ?? [batch.data.selectedCsm].filter(Boolean)).join("\u0000")) {
                  void loadBatch(nextBatch.data.selectedCsms);
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
                        : "Select Annual Forecast Entry to load its data."}
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
              disabled={isLocked || isSaving || isLoading}
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
