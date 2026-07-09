"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PetyrCard, PetyrInlineNotice } from "@/components/petyr/PetyrLayoutPrimitives";
import { PetyrSelectField } from "@/components/petyr/PetyrForecastNavigation";
import { formatBusinessUnitDisplayName } from "@/lib/petyr/businessUnitDisplay";
import { formatPetyrInteger, formatPetyrIntegerCurrencyValue, formatPetyrIntegerInputDraft, formatPetyrPercent } from "@/lib/petyr/formatters";
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
type AnnualSortKey = "company" | "initial" | "ongoing" | "confidence" | "business_unit";
type AnnualSortDirection = "asc" | "desc";
type ActiveVisibilityFilter = "all" | "active" | "inactive";
type AnnualSortState = {
  key: AnnualSortKey | null;
  direction: AnnualSortDirection;
  businessUnit?: string;
};

function buildAnnualBatchUrl(csmNames: string[], year: number) {
  const params = new URLSearchParams();
  for (const csmName of csmNames) {
    if (csmName) params.append("csmName", csmName);
  }
  params.set("year", String(year));
  return `/api/petyr/forecast-entry/annual-batch?${params.toString()}`;
}

function buildAnnualExportUrl(csmNames: string[], year: number) {
  const params = new URLSearchParams();
  for (const csmName of csmNames) {
    if (csmName) params.append("csmName", csmName);
  }
  params.set("year", String(year));
  return `/api/petyr/forecast-entry/annual-export-xlsx?${params.toString()}`;
}

function buildCompanyDetailPageUrl(companyName: string, year: number, csmName?: string | null) {
  const params = new URLSearchParams({ year: String(year) });
  if (csmName) params.set("csmName", csmName);
  return `/forecasting/company/${encodeURIComponent(companyName)}?${params.toString()}`;
}

function buildHistoryUrl(companyName: string, year: number, csmName?: string | null) {
  return `${buildCompanyDetailPageUrl(companyName, year, csmName)}#company-logs`;
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

function businessUnitInitialValuesFromBatch(batch: AnnualForecastEntryBatchDataResult) {
  const values: Record<string, string> = {};

  for (const company of batch.data.companies) {
    for (const cell of company.businessUnits) {
      values[cellKey(company.companyName, cell.businessUnit)] = formatInputValue(cell.initialForecast.value);
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

function SavedForecastStatus({ label, aiForecastValue }: { label: string; aiForecastValue: number | null }) {
  return (
    <div className="mt-1 space-y-0.5 text-right text-[11px] leading-tight text-slate-500">
      <div>{label}</div>
      {aiForecastValue !== null ? (
        <div className="text-blue-700">({formatPetyrIntegerCurrencyValue(aiForecastValue)} AI Forecast)</div>
      ) : null}
    </div>
  );
}

function rowHasTouchedValue(company: AnnualForecastEntryBatchCompany, sourceStates: Record<string, SourceState | undefined>) {
  return company.businessUnits.some((cell) => Boolean(sourceStates[cellKey(company.companyName, cell.businessUnit)]));
}

function percentLabel(value: number | null | undefined) {
  return value === null || value === undefined ? "n/a" : formatPetyrPercent(value * 100);
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

function selectedCsmsLabel(csmNames: string[]) {
  if (csmNames.length === 0) return "No CSM selected";
  if (csmNames.length === 1) return csmNames[0];
  return `${csmNames[0]} + ${csmNames.length - 1}`;
}

function nextAnnualSort(current: AnnualSortState, key: AnnualSortKey): AnnualSortState {
  if (current.key === key) {
    return {
      key,
      direction: current.direction === "asc" ? "desc" : "asc"
    };
  }

  return {
    key,
    direction: "asc"
  };
}

function nextAnnualBusinessUnitSort(businessUnit: string): AnnualSortState {
  return {
    key: "business_unit",
    direction: "desc",
    businessUnit
  };
}

function annualSortLabel(sort: AnnualSortState, key: AnnualSortKey) {
  if (sort.key !== key) return "Sort";
  if (key === "company") return sort.direction === "asc" ? "A-Z" : "Z-A";
  if (key === "confidence") return sort.direction === "asc" ? "High-Low" : "Low-High";
  return sort.direction === "asc" ? "Low-High" : "High-Low";
}

function annualBusinessUnitSortLabel(sort: AnnualSortState, businessUnit: string) {
  return sort.key === "business_unit" && sort.businessUnit === businessUnit ? "High-Low" : "Sort";
}

function confidenceSortRank(value: string) {
  if (value === "01 High") return 0;
  if (value === "02 Mid") return 1;
  if (value === "03 Low") return 2;
  return 3;
}

function initialExpandedStateFromBatch(batch: AnnualForecastEntryBatchDataResult) {
  return Object.fromEntries(
    batch.data.businessUnits.map((businessUnit) => [businessUnit, batch.data.initialMode.showInitialBusinessUnitsByDefault])
  );
}

const COMPANY_COLUMN_WIDTH = 220;
const ACTIVE_COLUMN_WIDTH = 150;
const INITIAL_COLUMN_WIDTH = 128;
const ONGOING_COLUMN_WIDTH = 150;
const CONFIDENCE_COLUMN_WIDTH = 150;
const BUSINESS_UNIT_COLUMN_WIDTH = 128;
const REVENUE_COLUMN_WIDTH = 150;
const PLANNED_COLUMN_WIDTH = 150;
const REVENUE_RATIO_COLUMN_WIDTH = 170;
const PLANNED_RATIO_COLUMN_WIDTH = 170;
const UNCOVERED_RATIO_COLUMN_WIDTH = 180;
const LOGS_COLUMN_WIDTH = 220;
const COMPANY_STICKY_CLASS = "sticky left-0 min-w-[220px]";
const CONFIDENCE_STICKY_CLASS = "sticky left-[220px] min-w-[150px] shadow-[8px_0_12px_-12px_rgba(15,23,42,0.45)]";
const PINNED_BODY_STICKY_CLASS = "z-20";
const PINNED_HEADER_STICKY_CLASS = "z-[60]";
const HEADER_STICKY_CLASS = "sticky top-16 z-40 shadow-[0_1px_0_0_rgba(226,232,240,1)]";
const TOTAL_ROW_STICKY_CLASS = "sticky top-[112px] z-40";
const MANUAL_HEADER_CLASS = "bg-amber-50 text-amber-950";
const MANUAL_CELL_CLASS = "bg-amber-50/70 align-top";
const SORT_BUTTON_BASE_CLASS =
  "flex min-h-9 w-full flex-col items-start justify-center gap-0.5 rounded-lg border bg-white px-2 py-1 text-left text-xs font-semibold leading-tight text-slate-800 shadow-sm transition-colors";

export default function AnnualForecastEntryBatchWorkspace({
  initialBatch,
  onBatchChange
}: {
  initialBatch: AnnualForecastEntryBatchDataResult;
  onBatchChange?: (batch: AnnualForecastEntryBatchDataResult) => void;
}) {
  const [batch, setBatch] = useState(initialBatch);
  const [selectedCsms, setSelectedCsms] = useState<string[]>(() => initialBatch.data.selectedCsms ?? [initialBatch.data.selectedCsm].filter(Boolean));
  const [selectedYear, setSelectedYear] = useState(initialBatch.data.selectedYear);
  const [values, setValues] = useState<Record<string, string>>(() => valuesFromBatch(initialBatch));
  const [businessUnitInitialValues, setBusinessUnitInitialValues] = useState<Record<string, string>>(() => businessUnitInitialValuesFromBatch(initialBatch));
  const [initialValues, setInitialValues] = useState<Record<string, string>>(() => initialValuesFromBatch(initialBatch));
  const [activeValues, setActiveValues] = useState<Record<string, boolean>>(() => activeValuesFromBatch(initialBatch));
  const [confidenceValues, setConfidenceValues] = useState<Record<string, string>>(() => confidenceValuesFromBatch(initialBatch));
  const [sourceStates, setSourceStates] = useState<Record<string, SourceState | undefined>>({});
  const [touchedBusinessUnitInitial, setTouchedBusinessUnitInitial] = useState<Set<string>>(() => new Set());
  const [touchedInitial, setTouchedInitial] = useState<Set<string>>(() => new Set());
  const [touchedActive, setTouchedActive] = useState<Set<string>>(() => new Set());
  const [touchedConfidence, setTouchedConfidence] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSavedState, setShowSavedState] = useState(false);
  const [savedSummary, setSavedSummary] = useState("");
  const [showBusinessUnits, setShowBusinessUnits] = useState(true);
  const [expandedInitialBusinessUnits, setExpandedInitialBusinessUnits] = useState<Record<string, boolean>>(() => initialExpandedStateFromBatch(initialBatch));
  const [isCsmDropdownOpen, setIsCsmDropdownOpen] = useState(false);
  const [annualSort, setAnnualSort] = useState<AnnualSortState>({ key: null, direction: "asc" });
  const [activeVisibilityFilter, setActiveVisibilityFilter] = useState<ActiveVisibilityFilter>("all");
  const savedStateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const annualTableRef = useRef<HTMLTableElement | null>(null);
  const csmDropdownRef = useRef<HTMLDivElement | null>(null);


  const hasLocalChanges = useMemo(
    () =>
      Object.values(sourceStates).some(Boolean) ||
      touchedBusinessUnitInitial.size > 0 ||
      touchedInitial.size > 0 ||
      touchedActive.size > 0 ||
      touchedConfidence.size > 0,
    [sourceStates, touchedBusinessUnitInitial, touchedInitial, touchedActive, touchedConfidence]
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

  useEffect(() => {
    function closeCsmDropdownOnOutsideClick(event: MouseEvent) {
      if (!csmDropdownRef.current?.contains(event.target as Node)) {
        setIsCsmDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", closeCsmDropdownOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeCsmDropdownOnOutsideClick);
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

  function resetLocalState(nextBatch: AnnualForecastEntryBatchDataResult) {
    setBatch(nextBatch);
    setSelectedCsms(nextBatch.data.selectedCsms ?? [nextBatch.data.selectedCsm].filter(Boolean));
    setSelectedYear(nextBatch.data.selectedYear);
    setIsCsmDropdownOpen(false);
    setValues(valuesFromBatch(nextBatch));
    setBusinessUnitInitialValues(businessUnitInitialValuesFromBatch(nextBatch));
    setInitialValues(initialValuesFromBatch(nextBatch));
    setActiveValues(activeValuesFromBatch(nextBatch));
    setConfidenceValues(confidenceValuesFromBatch(nextBatch));
    setSourceStates({});
    setTouchedBusinessUnitInitial(new Set());
    setTouchedInitial(new Set());
    setTouchedActive(new Set());
    setTouchedConfidence(new Set());
    setExpandedInitialBusinessUnits(initialExpandedStateFromBatch(nextBatch));
  }

  async function loadAnnualBatch(csmNames: string[], year: number) {
    if (hasLocalChanges && !window.confirm("Annual Forecast Entry has unsaved changes. Change filter and discard them?")) {
      return;
    }

    const nextCsms = csmNames.length > 0 ? csmNames : selectedCsms;
    setSelectedCsms(nextCsms);
    setSelectedYear(year);
    setIsLoading(true);
    setNotice(null);

    try {
      const response = await fetch(buildAnnualBatchUrl(nextCsms, year), { cache: "no-store" });
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
    setValues((existing) => ({ ...existing, [key]: formatPetyrIntegerInputDraft(value) }));
    setSourceStates((existing) => ({ ...existing, [key]: "manual_edit" }));
  }

  function updateBusinessUnitInitial(company: AnnualForecastEntryBatchCompany, cell: AnnualForecastEntryBatchCell, value: string) {
    const key = cellKey(company.companyName, cell.businessUnit);
    setBusinessUnitInitialValues((existing) => ({ ...existing, [key]: formatPetyrIntegerInputDraft(value) }));
    setTouchedBusinessUnitInitial((existing) => new Set(existing).add(key));
  }

  function updateInitial(companyName: string, value: string) {
    setInitialValues((existing) => ({ ...existing, [companyName]: formatPetyrIntegerInputDraft(value) }));
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

  function currentBusinessUnitInitialValue(company: AnnualForecastEntryBatchCompany, cell: AnnualForecastEntryBatchCell) {
    const key = cellKey(company.companyName, cell.businessUnit);
    const rawValue = businessUnitInitialValues[key] ?? "";
    if (!rawValue.trim()) return 0;

    const parsed = parseMoneyInput(rawValue);
    return parsed ?? cell.initialForecast.value ?? 0;
  }

  function annualBusinessUnitSortValue(company: AnnualForecastEntryBatchCompany, businessUnit: string) {
    const cell = company.businessUnits.find((item) => item.businessUnit === businessUnit);
    if (!cell) return 0;
    return currentBuValue(company, cell) ?? cell.aiForecast.value ?? 0;
  }

  function currentFcOngoing(company: AnnualForecastEntryBatchCompany) {
    return company.businessUnits.reduce((sum, cell) => sum + (currentBuValue(company, cell) ?? 0), 0);
  }

  function toggleCsmSelection(csmName: string) {
    setSelectedCsms((current) =>
      current.includes(csmName)
        ? current.filter((selectedCsm) => selectedCsm !== csmName)
        : [...current, csmName]
    );
  }

  function currentInitialForecast(company: AnnualForecastEntryBatchCompany) {
    const rawValue = initialValues[company.companyName] ?? "";
    if (!rawValue.trim()) return 0;

    const parsed = parseMoneyInput(rawValue);
    return parsed ?? company.initialForecast ?? 0;
  }

  const displayedAnnualCompanies = useMemo(() => {
    const filteredCompanies = batch.data.companies.filter((company) => {
      const isActive = activeValues[company.companyName] ?? company.isForecastActive;
      if (activeVisibilityFilter === "active") return isActive;
      if (activeVisibilityFilter === "inactive") return !isActive;
      return true;
    });

    if (!annualSort.key) return filteredCompanies;

    return [...filteredCompanies].sort((left, right) => {
      let result = 0;

      if (annualSort.key === "company") {
        result = left.companyName.localeCompare(right.companyName);
      } else if (annualSort.key === "initial") {
        result = currentInitialForecast(left) - currentInitialForecast(right);
      } else if (annualSort.key === "ongoing") {
        result = currentFcOngoing(left) - currentFcOngoing(right);
      } else if (annualSort.key === "business_unit" && annualSort.businessUnit) {
        result = annualBusinessUnitSortValue(left, annualSort.businessUnit) - annualBusinessUnitSortValue(right, annualSort.businessUnit);
      } else if (annualSort.key === "confidence") {
        const leftRank = confidenceSortRank(confidenceValues[left.companyName] ?? "");
        const rightRank = confidenceSortRank(confidenceValues[right.companyName] ?? "");
        const leftMissing = leftRank === 3;
        const rightMissing = rightRank === 3;

        if (leftMissing || rightMissing) {
          if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
        } else {
          result = leftRank - rightRank;
        }
      }

      if (result !== 0) {
        return annualSort.direction === "asc" ? result : -result;
      }

      return left.companyName.localeCompare(right.companyName);
    });
  }, [activeValues, activeVisibilityFilter, annualSort, batch.data.companies, confidenceValues, initialValues, sourceStates, values]);

  const annualSummary = useMemo(() => {
    const byBusinessUnit = Object.fromEntries(batch.data.businessUnits.map((businessUnit) => [businessUnit, 0])) as Record<string, number>;
    const initialByBusinessUnit = Object.fromEntries(batch.data.businessUnits.map((businessUnit) => [businessUnit, 0])) as Record<string, number>;
    let initialTotal = 0;
    let total = 0;
    let revenue = 0;
    let planned = 0;

    for (const company of displayedAnnualCompanies) {
      initialTotal += currentInitialForecast(company);
      revenue += company.revenue;
      planned += company.planned;

      for (const cell of company.businessUnits) {
        const value = currentBuValue(company, cell) ?? 0;
        byBusinessUnit[cell.businessUnit] = (byBusinessUnit[cell.businessUnit] ?? 0) + value;
        initialByBusinessUnit[cell.businessUnit] = (initialByBusinessUnit[cell.businessUnit] ?? 0) + currentBusinessUnitInitialValue(company, cell);
        total += value;
      }
    }

    return {
      initialTotal,
      total,
      revenue,
      planned,
      byBusinessUnit: batch.data.businessUnits.map((businessUnit) => ({
        businessUnit,
        value: byBusinessUnit[businessUnit] ?? 0
      })),
      initialByBusinessUnit: batch.data.businessUnits.map((businessUnit) => ({
        businessUnit,
        value: initialByBusinessUnit[businessUnit] ?? 0
      })),
      percentages: calculateAnnualForecastPercentages({ revenue, planned, fcOngoing: total })
    };
  }, [batch.data.businessUnits, businessUnitInitialValues, displayedAnnualCompanies, initialValues, sourceStates, values]);

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

  function getCompanySaveInitialBusinessUnitValues(company: AnnualForecastEntryBatchCompany) {
    if (!batch.data.initialMode.editable) return [];

    return company.businessUnits.flatMap((cell) => {
      const key = cellKey(company.companyName, cell.businessUnit);
      if (!touchedBusinessUnitInitial.has(key)) return [];

      return [
        {
          businessUnit: cell.businessUnit,
          value: businessUnitInitialValues[key] ?? ""
        }
      ];
    });
  }

  function buildUpdates() {
    return batch.data.companies.flatMap((company) => {
      const valuesForCompany = getCompanySaveValues(company);
      const initialBusinessUnitValues = getCompanySaveInitialBusinessUnitValues(company);
      const hasInitial = touchedInitial.has(company.companyName);
      const hasActive = touchedActive.has(company.companyName);
      const hasConfidence = touchedConfidence.has(company.companyName);
      const ongoingModified = valuesForCompany.length > 0;
      const initialBusinessUnitModified = initialBusinessUnitValues.length > 0;
      const rowModified = ongoingModified || initialBusinessUnitModified || hasInitial || hasActive;

      if (!rowModified && !hasConfidence) return [];

      const confidence = confidenceValues[company.companyName] ?? "";
      if (ongoingModified && !confidence) {
        throw new Error(`${company.companyName}: Confidence is required when Forecast Ongoing changes.`);
      }

      return [
        {
          companyName: company.companyName,
          activeStatus: hasActive ? activeValues[company.companyName] : undefined,
          initialForecast: hasInitial ? initialValues[company.companyName] : undefined,
          confidence: ongoingModified || hasConfidence ? confidence : undefined,
          values: valuesForCompany,
          initialBusinessUnitValues
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
          csmNames: batch.data.selectedCsms,
          year: batch.data.selectedYear,
          updates
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? payload.detail ?? "Unable to save Annual Forecast Entry.");
      }

      const successText = payload.noChanges
        ? "No changes detected"
        : [
            `Saved annual changes for ${payload.companiesSaved} compan${payload.companiesSaved === 1 ? "y" : "ies"}`,
            `${payload.forecastUpserts} Forecast Ongoing value(s)`,
            `${payload.initialForecastUpserts ?? 0} Business Unit Initial Forecast value(s)`,
            `${payload.metadataUpserts} annual metadata update(s)`,
            `${payload.activeStatusUpdates} Active status update(s)`,
            `${payload.changeLogRows} log row(s)`
          ].join(". ") + ".";

      resetLocalState(payload.batch);
      onBatchChange?.(payload.batch);
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
        text: error instanceof Error ? error.message : "Unable to save Annual Forecast Entry."
      });
    } finally {
      setIsSaving(false);
    }
  }

  function handleSaveKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) {
    if (event.key !== "Enter" || isSaving) return;

    event.preventDefault();
    void saveBatch();
  }

  const showBusinessUnitInitialForecast = batch.data.initialMode.editable;
  const visibleInitialBusinessUnits = batch.data.businessUnits.filter(
    (businessUnit) => showBusinessUnitInitialForecast && (batch.data.initialMode.showInitialBusinessUnitsByDefault || expandedInitialBusinessUnits[businessUnit])
  );
  const visibleInitialBusinessUnitSet = new Set(visibleInitialBusinessUnits);
  const visibleBusinessUnitCount = showBusinessUnits
    ? batch.data.businessUnits.length + visibleInitialBusinessUnits.length
    : 0;
  const annualTableMinWidth =
    COMPANY_COLUMN_WIDTH +
    ACTIVE_COLUMN_WIDTH +
    INITIAL_COLUMN_WIDTH +
    ONGOING_COLUMN_WIDTH +
    CONFIDENCE_COLUMN_WIDTH +
    visibleBusinessUnitCount * BUSINESS_UNIT_COLUMN_WIDTH +
    REVENUE_COLUMN_WIDTH +
    PLANNED_COLUMN_WIDTH +
    REVENUE_RATIO_COLUMN_WIDTH +
    PLANNED_RATIO_COLUMN_WIDTH +
    UNCOVERED_RATIO_COLUMN_WIDTH +
    LOGS_COLUMN_WIDTH;
  const [annualLegendMinWidth, setAnnualLegendMinWidth] = useState(annualTableMinWidth);
  const saveDisabled = isSaving || isLoading || !hasLocalChanges;

  useEffect(() => {
    function updateLegendWidth() {
      setAnnualLegendMinWidth(Math.max(annualTableMinWidth, annualTableRef.current?.scrollWidth ?? 0));
    }

    updateLegendWidth();

    if (typeof ResizeObserver === "undefined" || !annualTableRef.current) {
      window.addEventListener("resize", updateLegendWidth);
      return () => window.removeEventListener("resize", updateLegendWidth);
    }

    const observer = new ResizeObserver(updateLegendWidth);
    observer.observe(annualTableRef.current);
    window.addEventListener("resize", updateLegendWidth);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateLegendWidth);
    };
  }, [annualTableMinWidth, batch.data.companies.length, showBusinessUnits]);

  function toggleBusinessUnitInitialForecast(businessUnit: string) {
    setExpandedInitialBusinessUnits((current) => ({
      ...current,
      [businessUnit]: !current[businessUnit]
    }));
  }

  return (
    <PetyrCard>
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Annual Forecast Entry</CardTitle>
            <CardDescription>
              {selectedCsmsLabel(batch.data.selectedCsms)}: {batch.data.companies.length} compan{batch.data.companies.length === 1 ? "y" : "ies"} - {batch.data.selectedYear}
            </CardDescription>
          </div>
          <Badge variant={batch.data.initialMode.editable ? "secondary" : "outline"}>{batch.data.initialMode.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_180px_auto_minmax(0,1fr)] lg:items-end">
          <div ref={csmDropdownRef} className="relative space-y-1 text-sm font-medium text-slate-700">
            <div>CSM</div>
            <Button
              type="button"
              variant="outline"
              disabled={isLoading || isSaving}
              onClick={() => setIsCsmDropdownOpen((current) => !current)}
              className="h-10 w-full justify-between rounded-xl border-slate-200 bg-white px-3 text-left font-normal"
              aria-haspopup="listbox"
              aria-expanded={isCsmDropdownOpen}
            >
              <span className="truncate">{selectedCsmsLabel(selectedCsms)}</span>
              <span className="ml-3 shrink-0 text-slate-400">v</span>
            </Button>
            {isCsmDropdownOpen ? (
              <div
                role="listbox"
                aria-multiselectable="true"
                className="absolute left-0 top-full z-[70] mt-2 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10"
              >
                {batch.data.csmOptions.map((csmName) => (
                  <label
                    key={csmName}
                    className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCsms.includes(csmName)}
                      disabled={isLoading || isSaving}
                      onChange={() => toggleCsmSelection(csmName)}
                    />
                    <span className="truncate">{csmName}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>
          <PetyrSelectField
            label="Year"
            disabled={isLoading || isSaving}
            value={String(selectedYear)}
            onChange={(event) => setSelectedYear(Number(event.target.value))}
          >
            {batch.data.yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </PetyrSelectField>
          <Button
            type="button"
            variant="outline"
            disabled={isLoading || isSaving || selectedCsms.length === 0}
            onClick={() => void loadAnnualBatch(selectedCsms, selectedYear)}
            className="h-10 rounded-xl px-5"
          >
            {isLoading ? "Loading" : "Load"}
          </Button>
          <PetyrInlineNotice tone={batch.data.initialMode.editable ? "success" : "warning"}>
            {batch.data.initialMode.reason}
          </PetyrInlineNotice>
        </div>

        {notice ? <PetyrInlineNotice tone={notice.type === "success" ? "success" : "danger"}>{notice.text}</PetyrInlineNotice> : null}

        <div className="fixed bottom-5 right-5 z-50 flex max-w-[420px] flex-col items-end gap-3">
          {showSavedState && savedSummary ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-right shadow-lg shadow-emerald-950/10">
              <div className="text-sm font-bold text-emerald-950">Annual forecast saved</div>
              <div className="mt-1 text-sm font-medium text-emerald-800">{savedSummary}</div>
            </div>
          ) : null}
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
          {showSavedState ? `Forecast saved. ${savedSummary}` : ""}
        </div>

        <div className="max-h-[calc(100vh-2rem)] overflow-auto rounded-2xl border border-slate-200 bg-white">
          <div
            className="sticky top-0 z-50 flex h-16 items-center gap-5 border-b border-slate-200 bg-slate-50 px-4 shadow-[0_1px_0_0_rgba(226,232,240,1)]"
            style={{ minWidth: annualLegendMinWidth }}
          >
            <div className="flex items-center gap-x-5 gap-y-2">
              <LegendChip className="border-blue-300 bg-blue-100" label="Forecast AI placeholder" />
              <LegendChip className="border-violet-300 bg-violet-100" label="AI confirmed" />
              <LegendChip className="border-emerald-300 bg-emerald-100" label="Manual CSM edit" />
              <LegendChip className="border-amber-300 bg-amber-50" label="Saved" />
              <LegendChip className="border-slate-300 bg-slate-100" label="Inactive company" />
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
          </div>
          <Table ref={annualTableRef} className="min-w-max [&_tbody_td]:align-top [&_tbody_td]:py-[5px]" style={{ minWidth: annualTableMinWidth }}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead
                  className={`${COMPANY_STICKY_CLASS} bg-white ${HEADER_STICKY_CLASS} ${PINNED_HEADER_STICKY_CLASS}`}
                  aria-sort={annualSort.key === "company" ? (annualSort.direction === "asc" ? "ascending" : "descending") : "none"}
                >
                  <button
                    type="button"
                    className={`${SORT_BUTTON_BASE_CLASS} border-slate-200 hover:border-slate-300 hover:bg-slate-50`}
                    onClick={() => setAnnualSort((current) => nextAnnualSort(current, "company"))}
                  >
                    <span>Company</span>
                    <span className="text-[11px] font-semibold text-slate-500">{annualSortLabel(annualSort, "company")}</span>
                  </button>
                </TableHead>
                <TableHead
                  className={`${HEADER_STICKY_CLASS} min-w-[150px] ${MANUAL_HEADER_CLASS}`}
                >
                  <div className="flex min-h-9 items-center gap-2 rounded-lg border border-amber-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800 shadow-sm">
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
                </TableHead>
                <TableHead
                  className={`${HEADER_STICKY_CLASS} w-[128px] min-w-[128px] ${MANUAL_HEADER_CLASS}`}
                  aria-sort={annualSort.key === "initial" ? (annualSort.direction === "asc" ? "ascending" : "descending") : "none"}
                >
                  <button
                    type="button"
                    className={`${SORT_BUTTON_BASE_CLASS} border-amber-200 hover:border-amber-300 hover:bg-amber-50`}
                    onClick={() => setAnnualSort((current) => nextAnnualSort(current, "initial"))}
                  >
                    <span>Forecast Initial</span>
                    <span className="text-[11px] font-semibold text-slate-500">{annualSortLabel(annualSort, "initial")}</span>
                  </button>
                </TableHead>
                <TableHead
                  className={`${HEADER_STICKY_CLASS} min-w-[150px] bg-white`}
                  aria-sort={annualSort.key === "ongoing" ? (annualSort.direction === "asc" ? "ascending" : "descending") : "none"}
                >
                  <button
                    type="button"
                    className={`${SORT_BUTTON_BASE_CLASS} border-slate-200 hover:border-slate-300 hover:bg-slate-50`}
                    onClick={() => setAnnualSort((current) => nextAnnualSort(current, "ongoing"))}
                  >
                    <span>Forecast Ongoing</span>
                    <span className="text-[11px] font-semibold text-slate-500">{annualSortLabel(annualSort, "ongoing")}</span>
                  </button>
                </TableHead>
                <TableHead
                  className={`${CONFIDENCE_STICKY_CLASS} bg-amber-50 ${HEADER_STICKY_CLASS} ${PINNED_HEADER_STICKY_CLASS}`}
                  aria-sort={annualSort.key === "confidence" ? (annualSort.direction === "asc" ? "ascending" : "descending") : "none"}
                >
                  <button
                    type="button"
                    className={`${SORT_BUTTON_BASE_CLASS} border-amber-200 hover:border-amber-300 hover:bg-amber-50`}
                    onClick={() => setAnnualSort((current) => nextAnnualSort(current, "confidence"))}
                  >
                    <span>Confidence</span>
                    <span className="text-[11px] font-semibold text-slate-500">{annualSortLabel(annualSort, "confidence")}</span>
                  </button>
                </TableHead>
                {showBusinessUnits
                  ? batch.data.businessUnits.map((businessUnit) => (
                      <Fragment key={businessUnit}>
                        <TableHead
                          className={`${HEADER_STICKY_CLASS} min-w-[128px] text-right ${MANUAL_HEADER_CLASS}`}
                          aria-sort={annualSort.key === "business_unit" && annualSort.businessUnit === businessUnit ? "descending" : "none"}
                        >
                          <div className="flex min-h-9 w-full items-start justify-between gap-2 rounded-lg border border-amber-200 bg-white px-2 py-1 text-xs font-semibold leading-tight text-slate-800 shadow-sm">
                            <span className="pt-1 text-left">Forecast Ongoing</span>
                            <div className="flex min-w-0 flex-col items-end gap-1 text-right">
                              <button
                                type="button"
                                className="max-w-full rounded-md px-1 text-right transition-colors hover:bg-amber-50"
                                onClick={() => setAnnualSort(nextAnnualBusinessUnitSort(businessUnit))}
                              >
                                <span className="block truncate">{formatBusinessUnitDisplayName(businessUnit)}</span>
                                <span className="block text-[11px] font-semibold text-slate-500">{annualBusinessUnitSortLabel(annualSort, businessUnit)}</span>
                              </button>
                              {batch.data.initialMode.canToggleInitialBusinessUnits ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-6 rounded-lg border-amber-200 px-2 text-[11px]"
                                  onClick={() => toggleBusinessUnitInitialForecast(businessUnit)}
                                  aria-expanded={Boolean(expandedInitialBusinessUnits[businessUnit])}
                                >
                                  {expandedInitialBusinessUnits[businessUnit] ? "Hide Initial" : "Show Initial"}
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        </TableHead>
                        {visibleInitialBusinessUnitSet.has(businessUnit) ? (
                          <TableHead className={`${HEADER_STICKY_CLASS} min-w-[128px] text-right ${MANUAL_HEADER_CLASS}`}>
                            <div className="flex min-h-9 w-full items-start justify-between gap-2 rounded-lg border border-amber-200 bg-white px-2 py-1 text-xs font-semibold leading-tight text-slate-800 shadow-sm">
                              <span className="pt-1 text-left">Initial Forecast</span>
                              <span className="max-w-[72px] truncate text-right">{formatBusinessUnitDisplayName(businessUnit)}</span>
                            </div>
                          </TableHead>
                        ) : null}
                      </Fragment>
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
              {displayedAnnualCompanies.length > 0 ? (
                <TableRow className={`${TOTAL_ROW_STICKY_CLASS} border-b-2 border-cyan-200 bg-cyan-50 shadow-[0_1px_0_0_rgba(165,243,252,1)] hover:bg-cyan-50`}>
                  <TableCell className={`${COMPANY_STICKY_CLASS} z-50 border-r border-cyan-200 bg-cyan-50`}>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-cyan-800">
                      {batch.data.selectedYear} CSM Forecast
                    </div>
                    <div className="mt-1 text-xs font-medium text-cyan-700">Portfolio total</div>
                  </TableCell>
                  <TableCell className="min-w-[150px] bg-cyan-50" aria-label="No active status for total row" />
                  <TableCell className={`w-[128px] min-w-[128px] bg-cyan-50 text-right font-bold ${mutedNumericClass(isEmptyOrZeroDisplay(annualSummary.initialTotal))}`}>
                    {formatPetyrIntegerCurrencyValue(annualSummary.initialTotal)}
                  </TableCell>
                  <TableCell className={`min-w-[150px] bg-cyan-50 text-right font-bold ${mutedNumericClass(isEmptyOrZeroDisplay(annualSummary.total))}`}>
                    {formatPetyrIntegerCurrencyValue(annualSummary.total)}
                  </TableCell>
                  <TableCell
                    className={`${CONFIDENCE_STICKY_CLASS} z-50 bg-cyan-50`}
                    aria-label="No confidence value for total row"
                  />
                  {showBusinessUnits
                    ? annualSummary.byBusinessUnit.map((item, index) => {
                        const initialItem = annualSummary.initialByBusinessUnit[index];

                        return (
                          <Fragment key={`total-${item.businessUnit}`}>
                            <TableCell
                              className={`min-w-[128px] bg-cyan-50 text-right font-bold ${mutedNumericClass(isEmptyOrZeroDisplay(item.value))}`}
                            >
                              {formatPetyrIntegerCurrencyValue(item.value)}
                            </TableCell>
                            {visibleInitialBusinessUnitSet.has(item.businessUnit) ? (
                              <TableCell
                                className={`min-w-[128px] bg-cyan-50 text-right font-bold ${mutedNumericClass(isEmptyOrZeroDisplay(initialItem?.value))}`}
                              >
                                {formatPetyrIntegerCurrencyValue(initialItem?.value ?? 0)}
                              </TableCell>
                            ) : null}
                          </Fragment>
                        );
                      })
                    : null}
                  <TableCell className={`min-w-[150px] bg-cyan-50 text-right font-bold ${mutedNumericClass(isEmptyOrZeroDisplay(annualSummary.revenue))}`}>
                    {formatPetyrIntegerCurrencyValue(annualSummary.revenue)}
                  </TableCell>
                  <TableCell className={`min-w-[150px] bg-cyan-50 text-right font-bold ${mutedNumericClass(isEmptyOrZeroDisplay(annualSummary.planned))}`}>
                    {formatPetyrIntegerCurrencyValue(annualSummary.planned)}
                  </TableCell>
                  <TableCell className="min-w-[170px] bg-cyan-50 text-right font-semibold text-cyan-950">
                    {percentLabel(annualSummary.percentages.revenuePct)}
                  </TableCell>
                  <TableCell className="min-w-[170px] bg-cyan-50 text-right font-semibold text-cyan-950">
                    {percentLabel(annualSummary.percentages.plannedPct)}
                  </TableCell>
                  <TableCell className="min-w-[180px] bg-cyan-50 text-right font-semibold text-cyan-950">
                    {percentLabel(annualSummary.percentages.uncoveredPct)}
                  </TableCell>
                  <TableCell className="min-w-[220px] bg-cyan-50" aria-label="No logs for total row" />
                </TableRow>
              ) : null}
              {displayedAnnualCompanies.length > 0 ? (
                displayedAnnualCompanies.map((company) => {
                  const fcOngoing = currentFcOngoing(company);
                  const percentages = calculateAnnualForecastPercentages({
                    revenue: company.revenue,
                    planned: company.planned,
                    fcOngoing
                  });
                  const inactiveClass = company.isForecastActive ? "" : "bg-slate-50 text-slate-500 opacity-75";

                  return (
                    <TableRow key={company.companyName} className={inactiveClass}>
                      <TableCell className={`${COMPANY_STICKY_CLASS} ${PINNED_BODY_STICKY_CLASS} ${company.isForecastActive ? "bg-white" : "bg-slate-50"}`}>
                        <Link
                          href={buildCompanyDetailPageUrl(company.companyName, batch.data.selectedYear, company.csmName)}
                          className="font-semibold text-slate-900 underline-offset-4 hover:underline"
                        >
                          {company.companyName}
                        </Link>
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
                          inputMode="numeric"
                          disabled={!batch.data.initialMode.editable || isSaving}
                          readOnly={!batch.data.initialMode.editable}
                          value={initialValues[company.companyName] ?? ""}
                          onChange={(event) => updateInitial(company.companyName, event.target.value)}
                          onKeyDown={handleSaveKeyDown}
                          placeholder="n/a"
                          className={`h-8 min-w-[112px] rounded-xl text-right font-semibold ${mutedNumericClass(isEmptyOrZeroDisplay(initialValues[company.companyName] ?? ""))} ${
                            touchedInitial.has(company.companyName)
                              ? "border-emerald-300 bg-emerald-50"
                              : batch.data.initialMode.editable
                                ? "border-amber-200 bg-amber-50"
                                : "bg-white"
                          }`}
                        />
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${mutedNumericClass(isEmptyOrZeroDisplay(fcOngoing))}`}>
                        {formatPetyrIntegerCurrencyValue(fcOngoing)}
                      </TableCell>
                      <TableCell className={`${CONFIDENCE_STICKY_CLASS} ${PINNED_BODY_STICKY_CLASS} ${company.isForecastActive ? "bg-amber-50" : "bg-slate-50"}`}>
                        <select
                          value={confidenceValues[company.companyName] ?? ""}
                          disabled={isSaving}
                          onChange={(event) => updateConfidence(company.companyName, event.target.value)}
                          onKeyDown={handleSaveKeyDown}
                          className={`h-8 min-w-[130px] rounded-xl border px-3 text-sm ${
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
                        const currentInputValue = values[key] ?? "";
                        const currentInitialInputValue = businessUnitInitialValues[key] ?? "";
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
                          <Fragment key={key}>
                            <TableCell className={MANUAL_CELL_CLASS}>
                              <Input
                                inputMode="numeric"
                                disabled={isSaving}
                                placeholder={aiPlaceholder || "n/a"}
                                value={currentInputValue}
                                onFocus={() => acceptAiPlaceholder(company, cell)}
                                onClick={() => acceptAiPlaceholder(company, cell)}
                                onChange={(event) => updateValue(company, cell, event.target.value)}
                                onKeyDown={handleSaveKeyDown}
                                className={`h-8 min-w-[112px] rounded-xl text-right font-semibold ${mutedNumericClass(isEmptyOrZeroDisplay(currentInputValue || aiPlaceholder))} ${inputClass}`}
                              />
                              {sourceState ? (
                                <div className="mt-1 text-right text-[11px] font-medium text-slate-500">
                                  {sourceState === "accepted_ai" ? "AI confirmed" : "Manual"}
                                </div>
                              ) : cell.savedForecast.hasSavedValue ? (
                                <SavedForecastStatus
                                  label={cell.savedForecast.valueSource === "ai_confirmed" ? "AI confirmed" : "Saved"}
                                  aiForecastValue={cell.aiForecast.value}
                                />
                              ) : aiPlaceholder ? (
                                <div className="mt-1 text-right text-[11px] text-blue-700">Forecast AI</div>
                              ) : null}
                            </TableCell>
                            {visibleInitialBusinessUnitSet.has(cell.businessUnit) ? (
                              <TableCell className={MANUAL_CELL_CLASS}>
                                <Input
                                  inputMode="numeric"
                                  disabled={isSaving}
                                  placeholder="n/a"
                                  value={currentInitialInputValue}
                                  onChange={(event) => updateBusinessUnitInitial(company, cell, event.target.value)}
                                  onKeyDown={handleSaveKeyDown}
                                  className={`h-8 min-w-[112px] rounded-xl text-right font-semibold ${mutedNumericClass(isEmptyOrZeroDisplay(currentInitialInputValue))} ${
                                    touchedBusinessUnitInitial.has(key)
                                      ? "border-emerald-300 bg-emerald-50"
                                      : cell.initialForecast.hasSavedValue
                                        ? "border-amber-200 bg-amber-50"
                                        : "border-amber-200 bg-amber-50"
                                  }`}
                                />
                                {touchedBusinessUnitInitial.has(key) ? (
                                  <div className="mt-1 text-right text-[11px] font-medium text-slate-500">Manual</div>
                                ) : cell.initialForecast.hasSavedValue ? (
                                  <div className="mt-1 text-right text-[11px] text-slate-500">Saved Initial</div>
                                ) : null}
                              </TableCell>
                            ) : null}
                          </Fragment>
                        );
                      }) : null}
                      <TableCell className={`text-right font-medium ${mutedNumericClass(isEmptyOrZeroDisplay(company.revenue))}`}>
                        {formatPetyrIntegerCurrencyValue(company.revenue)}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${mutedNumericClass(isEmptyOrZeroDisplay(company.planned))}`}>
                        {formatPetyrIntegerCurrencyValue(company.planned)}
                      </TableCell>
                      <TableCell className="text-right">{percentLabel(percentages.revenuePct)}</TableCell>
                      <TableCell className="text-right">{percentLabel(percentages.plannedPct)}</TableCell>
                      <TableCell className="text-right">{percentLabel(percentages.uncoveredPct)}</TableCell>
                      <TableCell>
                        <a
                          href={buildHistoryUrl(company.companyName, batch.data.selectedYear, company.csmName)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-8 w-[190px] items-start rounded-xl border border-slate-200 bg-white px-3 py-1 text-sm font-medium leading-snug text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
                        >
                          See latest logs
                        </a>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={visibleBusinessUnitCount + 11} className="bg-slate-50 py-8 text-center text-sm text-slate-500">
                    {batch.data.companies.length > 0
                      ? "No companies match the selected Active filter."
                      : "No companies available for the selected CSM filter."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            type="button"
            variant="outline"
            disabled={isLoading || isSaving}
            onClick={() => {
              window.location.href = buildAnnualExportUrl(batch.data.selectedCsms, batch.data.selectedYear);
            }}
            className="rounded-xl"
          >
            Export Excel
          </Button>
        </div>
      </CardContent>
    </PetyrCard>
  );
}
