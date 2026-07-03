"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatPetyrCurrencyValue, formatPetyrNumber, formatPetyrPercent } from "@/lib/petyr/formatters";
import { PetyrAiForecastCompanyAction } from "@/components/petyr/PetyrAiForecastCompanyAction";
import { PetyrCompanyIntelligenceSection } from "@/components/petyr/PetyrCompanyIntelligenceSection";
import {
  PetyrCard,
  PetyrInlineNotice,
  PetyrSectionTitle,
  PetyrWorkspaceShell
} from "@/components/petyr/PetyrLayoutPrimitives";
import { PetyrFloatingDiagnosticsMenu } from "@/components/petyr/PetyrFloatingDiagnosticsMenu";
import {
  PetyrForecastNavigatorShell,
  PetyrPreviousNextControl,
  PetyrSelectField,
  PetyrToggleSwitch
} from "@/components/petyr/PetyrForecastNavigation";
import type { AnnualForecastDataResult } from "@/services/annualForecastService";
import type { ForecastEntryDataResult } from "@/services/forecastEntryService";

type Notice = {
  type: "success" | "error";
  text: string;
};

type Selection = {
  companyName: string;
  csmName: string;
  year: number;
  month: number;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FORECAST_NOTE_REQUIRED_MESSAGE = "Add a CSM note before saving Forecast Entry changes.";
const NO_CHANGES_DETECTED_MESSAGE = "No changes detected";

type ForecastEntryBusinessUnit = ForecastEntryDataResult["data"]["businessUnits"][number];

type ReadOnlyMetricProps = {
  label: string;
  value: number | string | null | undefined;
  helper?: string | null;
};

function formatMoney(value: number | string | null | undefined) {
  return formatPetyrCurrencyValue(value);
}

function formatPct(value: number | null | undefined) {
  return formatPetyrPercent(value);
}

function monthLabel(month: number) {
  return MONTHS[month - 1] ?? `Month ${month}`;
}

function buildCompanyDetailPageUrl(selection: Pick<Selection, "companyName" | "csmName" | "year">) {
  const params = new URLSearchParams({
    year: String(selection.year)
  });
  if (selection.csmName) params.set("csmName", selection.csmName);

  return `/forecasting/company/${encodeURIComponent(selection.companyName)}?${params.toString()}`;
}


function activeStatusLabel(isActive: boolean) {
  return isActive ? "Company active" : "Company inactive";
}

function otherMonthlyForecast(row: ForecastEntryBusinessUnit, editableForecastType: string | null) {
  return editableForecastType === "ongoing" ? row.previousMonthForecast.value : row.ongoingForecast.value;
}

function otherMonthlyForecastLabel(editableForecastType: string | null) {
  return editableForecastType === "ongoing" ? "Previous-month forecast" : "Ongoing forecast";
}

function ReadOnlyMetric({ label, value, helper }: ReadOnlyMetricProps) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
      {label}
      <div className="mt-1 text-sm font-semibold text-slate-900">{formatMoney(value)}</div>
      {helper ? <div className="mt-1 text-[11px] leading-4 text-slate-500">{helper}</div> : null}
    </div>
  );
}

function inputValuesFromEntry(entry: ForecastEntryDataResult) {
  const editableType = entry.data.entryMode.editableForecastType;

  return Object.fromEntries(
    entry.data.businessUnits.map((row) => {
      const value = editableType === "ongoing" ? row.ongoingForecast.value : row.previousMonthForecast.value;
      return [row.businessUnit, value === null ? "" : formatPetyrNumber(value)];
    })
  );
}

function annualValuesFromForecast(annualForecast: AnnualForecastDataResult) {
  return Object.fromEntries(
    annualForecast.data.businessUnits.map((row) => [row.businessUnit, row.value === null ? "" : formatPetyrNumber(row.value)])
  );
}

function activeStatusFromEntry(entry: ForecastEntryDataResult) {
  return entry.data.companyStatus?.isActive ?? entry.data.company?.isForecastActive ?? true;
}

function selectionFromEntry(entry: ForecastEntryDataResult): Selection {
  return {
    companyName: entry.data.companyName,
    csmName: entry.data.csmName,
    year: entry.data.year,
    month: entry.data.month
  };
}

function forecastTypeLabel(forecastType: string | null) {
  if (forecastType === "companyActiveStatus") return "Company active status";
  if (forecastType === "ongoing") return "Ongoing forecast";
  if (forecastType === "previous_month") return "Previous-month forecast";
  return "Forecast";
}

function formatChangeValue(fieldName: string, value: string | null) {
  if (fieldName === "companyActiveStatus") {
    if (value === "active") return "Active";
    if (value === "inactive") return "Inactive";
    return "n/a";
  }

  return formatMoney(value);
}

function buildEntryUrl(selection: Selection) {
  const params = new URLSearchParams({
    companyName: selection.companyName,
    csmName: selection.csmName,
    year: String(selection.year),
    month: String(selection.month)
  });

  return `/api/petyr/forecast-entry?${params.toString()}`;
}

function buildEntryPageUrl(selection: Selection) {
  const params = new URLSearchParams({
    companyName: selection.companyName,
    csmName: selection.csmName,
    year: String(selection.year),
    month: String(selection.month)
  });

  return `/forecasting/entry?${params.toString()}`;
}

function buildAnnualForecastUrl(selection: Pick<Selection, "companyName" | "csmName" | "year">) {
  const params = new URLSearchParams({
    companyName: selection.companyName,
    csmName: selection.csmName,
    year: String(selection.year)
  });

  return `/api/petyr/annual-forecast?${params.toString()}`;
}

function annualForecastStatusLabel(status: string | null) {
  if (status === "consolidated") return "Consolidated";
  if (status === "draft") return "Draft";
  return "Not saved";
}

function normalizeMoneyInput(value: string) {
  let normalized = value.trim().replace(/\s+/g, "").replace(/EUR|€/gi, "");

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
  const normalized = normalizeMoneyInput(value);
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function getChangedMonthlyForecastValues(entry: ForecastEntryDataResult, values: Record<string, string>, dirtyBusinessUnits: Set<string>) {
  const editableType = entry.data.entryMode.editableForecastType;
  if (!editableType) return [];

  return entry.data.businessUnits.flatMap((row) => {
    if (!dirtyBusinessUnits.has(row.businessUnit)) return [];

    const currentForecast = editableType === "ongoing" ? row.ongoingForecast : row.previousMonthForecast;
    const rawValue = values[row.businessUnit] ?? "";
    const nextValue = parseMoneyInput(rawValue);
    const hasSavedValue = Boolean(currentForecast.status || currentForecast.updatedAt);

    if (nextValue === null) {
      return rawValue.trim() || hasSavedValue ? [{ businessUnit: row.businessUnit, value: rawValue }] : [];
    }

    if (!hasSavedValue || currentForecast.value !== nextValue) {
      return [{ businessUnit: row.businessUnit, value: rawValue }];
    }

    return [];
  });
}

export default function ForecastEntryWorkspace({
  initialEntry,
  canViewAdminTools = false
}: {
  initialEntry: ForecastEntryDataResult;
  canViewAdminTools?: boolean;
}) {
  const [entry, setEntry] = useState(initialEntry);
  const [selection, setSelection] = useState<Selection>(() => selectionFromEntry(initialEntry));
  const [values, setValues] = useState<Record<string, string>>(() => inputValuesFromEntry(initialEntry));
  const [dirtyBusinessUnits, setDirtyBusinessUnits] = useState<Set<string>>(() => new Set());
  const [note, setNote] = useState("");
  const [companyActive, setCompanyActive] = useState(() => activeStatusFromEntry(initialEntry));
  const [annualForecast, setAnnualForecast] = useState<AnnualForecastDataResult | null>(null);
  const [annualValues, setAnnualValues] = useState<Record<string, string>>({});
  const [annualNote, setAnnualNote] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [annualNotice, setAnnualNotice] = useState<Notice | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAnnualLoading, setIsAnnualLoading] = useState(false);
  const [isAnnualSaving, setIsAnnualSaving] = useState(false);
  const [isAnnualConsolidating, setIsAnnualConsolidating] = useState(false);

  const editableForecastType = entry.data.entryMode.editableForecastType;
  const isLocked = entry.data.entryMode.locked || !editableForecastType;
  const annualEditableRows = annualForecast?.data.businessUnits.filter((row) => row.mode.canSaveDraft) ?? [];
  const canSaveAnnualDraft = annualEditableRows.length > 0 && !isAnnualLoading && !isAnnualSaving && !isAnnualConsolidating;
  const canConsolidateAnnual =
    annualForecast?.data.mode.canConsolidate === true && !isAnnualLoading && !isAnnualSaving && !isAnnualConsolidating;
  const csmOptions = useMemo(() => {
    return [...new Set(entry.data.companies.map((company) => company.csmName || "Unassigned"))].sort((left, right) =>
      left.localeCompare(right)
    );
  }, [entry.data.companies]);
  const csmSelectOptions = useMemo(() => {
    if (!selection.csmName || csmOptions.includes(selection.csmName)) return csmOptions;

    return [selection.csmName, ...csmOptions];
  }, [csmOptions, selection.csmName]);
  const filteredCompanyOptions = useMemo(() => {
    const csmKey = selection.csmName.trim().toLowerCase();
    if (!csmKey) return entry.data.companies;

    return entry.data.companies.filter((company) => (company.csmName || "Unassigned").trim().toLowerCase() === csmKey);
  }, [entry.data.companies, selection.csmName]);
  const selectedCompanyOption = useMemo(
    () => entry.data.companies.find((company) => company.companyName === selection.companyName),
    [entry.data.companies, selection.companyName]
  );
  const selectedCompanyIndex = filteredCompanyOptions.findIndex((company) => company.companyName === selection.companyName);
  const companyCounter =
    filteredCompanyOptions.length > 0 && selectedCompanyIndex >= 0
      ? `${selectedCompanyIndex + 1} of ${filteredCompanyOptions.length}`
      : "0 of 0";
  const canNavigateCompany = filteredCompanyOptions.length > 1 && selectedCompanyIndex >= 0;
  const floatingDiagnostics = useMemo(
    () => [...entry.diagnostics, ...(annualForecast?.diagnostics ?? [])],
    [annualForecast?.diagnostics, entry.diagnostics]
  );

  useEffect(() => {
    setValues(inputValuesFromEntry(entry));
    setDirtyBusinessUnits(new Set());
    setCompanyActive(activeStatusFromEntry(entry));
  }, [entry]);

  useEffect(() => {
    window.history.replaceState(null, "", buildEntryPageUrl(selectionFromEntry(entry)));
  }, [entry]);

  useEffect(() => {
    let cancelled = false;

    async function loadAnnualForecastForEntry() {
      if (!entry.data.companyName) {
        setAnnualForecast(null);
        setAnnualValues({});
        return;
      }

      setIsAnnualLoading(true);
      setAnnualNotice(null);

      try {
        const response = await fetch(
          buildAnnualForecastUrl({
            companyName: entry.data.companyName,
            csmName: entry.data.csmName,
            year: entry.data.year
          }),
          { cache: "no-store" }
        );
        const payload = (await response.json()) as AnnualForecastDataResult;

        if (!response.ok) {
          throw new Error("Unable to load annual forecast.");
        }

        if (!cancelled) {
          setAnnualForecast(payload);
          setAnnualValues(annualValuesFromForecast(payload));
        }
      } catch (error) {
        if (!cancelled) {
          setAnnualNotice({
            type: "error",
            text: error instanceof Error ? error.message : "Unable to load annual forecast."
          });
        }
      } finally {
        if (!cancelled) setIsAnnualLoading(false);
      }
    }

    void loadAnnualForecastForEntry();

    return () => {
      cancelled = true;
    };
  }, [entry.data.companyName, entry.data.csmName, entry.data.year]);

  async function loadEntry(nextSelection: Selection) {
    setIsLoading(true);
    setNotice(null);

    try {
      const response = await fetch(buildEntryUrl(nextSelection), { cache: "no-store" });
      const payload = (await response.json()) as ForecastEntryDataResult;

      if (!response.ok) {
        throw new Error("Unable to load Forecast Entry.");
      }

      setEntry(payload);
      setSelection(selectionFromEntry(payload));
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to load Forecast Entry."
      });
    } finally {
      setIsLoading(false);
    }
  }

  function updateValue(businessUnit: string, value: string) {
    setValues((current) => ({ ...current, [businessUnit]: value }));
    setDirtyBusinessUnits((current) => new Set(current).add(businessUnit));
  }

  async function saveEntry() {
    if (isLocked || !editableForecastType) return;

    const changedMonthlyValues = getChangedMonthlyForecastValues(entry, values, dirtyBusinessUnits);
    const activeStatusChanged = companyActive !== activeStatusFromEntry(entry);

    if (changedMonthlyValues.length === 0 && !activeStatusChanged) {
      setNotice({ type: "success", text: NO_CHANGES_DETECTED_MESSAGE });
      return;
    }

    if (changedMonthlyValues.length > 0 && note.trim().length === 0) {
      setNotice({ type: "error", text: FORECAST_NOTE_REQUIRED_MESSAGE });
      return;
    }

    setIsSaving(true);
    setNotice(null);

    try {
      const response = await fetch("/api/petyr/forecast-entry/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: entry.data.companyName,
          csmName: entry.data.csmName,
          year: entry.data.year,
          month: entry.data.month,
          forecastType: editableForecastType,
          companyActiveStatus: companyActive,
          note,
          values: changedMonthlyValues
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? payload.detail ?? "Unable to save Forecast Entry.");
      }

      setEntry(payload.entry);
      setSelection(selectionFromEntry(payload.entry));
      setNote("");
      setNotice({
        type: "success",
        text: payload.noChanges
          ? NO_CHANGES_DETECTED_MESSAGE
          : `Saved ${payload.forecastUpserts} Business Unit value(s) in one session with ${payload.changeLogRows} change row(s).`
      });
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to save Forecast Entry."
      });
    } finally {
      setIsSaving(false);
    }
  }

  function updateAnnualValue(businessUnit: string, value: string) {
    setAnnualValues((current) => ({ ...current, [businessUnit]: value }));
  }

  async function saveAnnualDraft() {
    if (!annualForecast || annualEditableRows.length === 0) return;

    setIsAnnualSaving(true);
    setAnnualNotice(null);

    try {
      const response = await fetch("/api/petyr/annual-forecast/save-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: annualForecast.data.companyName,
          csmName: annualForecast.data.csmName,
          year: annualForecast.data.year,
          note: annualNote,
          values: annualEditableRows.map((row) => ({
            businessUnit: row.businessUnit,
            value: annualValues[row.businessUnit] ?? ""
          }))
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? payload.detail ?? "Unable to save annual forecast draft.");
      }

      setAnnualForecast(payload.annualForecast);
      setAnnualValues(annualValuesFromForecast(payload.annualForecast));
      setAnnualNote("");
      setAnnualNotice({
        type: "success",
        text: `Saved ${payload.forecastUpserts} annual Business Unit value(s) as draft.`
      });
    } catch (error) {
      setAnnualNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to save annual forecast draft."
      });
    } finally {
      setIsAnnualSaving(false);
    }
  }

  async function consolidateAnnualForecast() {
    if (!annualForecast || !annualForecast.data.mode.canConsolidate) return;

    setIsAnnualConsolidating(true);
    setAnnualNotice(null);

    try {
      const response = await fetch("/api/petyr/annual-forecast/consolidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: annualForecast.data.companyName,
          csmName: annualForecast.data.csmName,
          year: annualForecast.data.year,
          note: annualNote,
          values: annualForecast.data.businessUnits.map((row) => ({
            businessUnit: row.businessUnit,
            value: annualValues[row.businessUnit] ?? ""
          }))
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? payload.detail ?? "Unable to consolidate annual forecast.");
      }

      setAnnualForecast(payload.annualForecast);
      setAnnualValues(annualValuesFromForecast(payload.annualForecast));
      setAnnualNote("");
      setAnnualNotice({
        type: "success",
        text: `Consolidated ${payload.forecastUpserts} annual Business Unit value(s).`
      });
    } catch (error) {
      setAnnualNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to consolidate annual forecast."
      });
    } finally {
      setIsAnnualConsolidating(false);
    }
  }

  function handleCompanyChange(companyName: string) {
    const company = entry.data.companies.find((row) => row.companyName === companyName);
    const nextSelection = {
      ...selection,
      companyName,
      csmName: company?.csmName ?? selection.csmName
    };
    setSelection(nextSelection);
    void loadEntry(nextSelection);
  }

  function handleCsmChange(csmName: string) {
    const firstCompanyForCsm = entry.data.companies.find((company) => (company.csmName || "Unassigned") === csmName);
    const nextSelection = {
      ...selection,
      csmName,
      companyName: firstCompanyForCsm?.companyName ?? selection.companyName
    };

    setSelection(nextSelection);
    void loadEntry(nextSelection);
  }

  function navigateCompany(direction: -1 | 1) {
    if (!canNavigateCompany) return;

    const nextIndex = (selectedCompanyIndex + direction + filteredCompanyOptions.length) % filteredCompanyOptions.length;
    const nextCompany = filteredCompanyOptions[nextIndex];

    if (nextCompany) {
      handleCompanyChange(nextCompany.companyName);
    }
  }

  function handleMonthChange(month: number) {
    const nextSelection = { ...selection, month };
    setSelection(nextSelection);
    void loadEntry(nextSelection);
  }

  function handleYearLoad() {
    const nextYear = Number(selection.year);
    if (!Number.isInteger(nextYear) || nextYear < 2000 || nextYear > 2100) {
      setNotice({ type: "error", text: "Select a valid year between 2000 and 2100." });
      return;
    }

    void loadEntry({ ...selection, year: nextYear });
  }

  const selectedMonthLabel = monthLabel(entry.data.month);
  const companyDetailUrl = entry.data.companyName
      ? buildCompanyDetailPageUrl({
          companyName: entry.data.companyName,
          csmName: entry.data.csmName,
          year: entry.data.year
        })
    : null;
  const forecastEntryHref = buildEntryPageUrl(selectionFromEntry(entry));

  return (
    <PetyrWorkspaceShell
      activeSection="entry"
      companyDetailHref={companyDetailUrl}
      forecastEntryHref={forecastEntryHref}
      canViewCsmOverview={canViewAdminTools}
    >
      <PetyrForecastNavigatorShell
        sticky
        csmSlot={
          <PetyrSelectField
            label="CSM filter"
            disabled={isLoading || csmSelectOptions.length === 0}
            value={selection.csmName}
            onChange={(event) => handleCsmChange(event.target.value)}
          >
            {csmSelectOptions.length === 0 ? <option value="">No CSM data</option> : null}
            {csmSelectOptions.map((csmName) => (
              <option key={csmName} value={csmName}>
                {csmName}
              </option>
            ))}
          </PetyrSelectField>
        }
        companySlot={
          <PetyrSelectField
            label="Company"
            disabled={isLoading || filteredCompanyOptions.length === 0}
            value={selection.companyName}
            onChange={(event) => handleCompanyChange(event.target.value)}
          >
            {filteredCompanyOptions.length === 0 ? <option value="">No company data</option> : null}
            {filteredCompanyOptions.map((company) => (
              <option key={company.companyName} value={company.companyName}>
                {company.companyName}
              </option>
            ))}
          </PetyrSelectField>
        }
        navigationSlot={
          <PetyrPreviousNextControl
            counter={companyCounter.replace(" of ", " / ")}
            helperText={selectedCompanyOption?.isForecastActive === false ? "Inactive company" : null}
            previousDisabled={isLoading || !canNavigateCompany}
            nextDisabled={isLoading || !canNavigateCompany}
            onPrevious={() => navigateCompany(-1)}
            onNext={() => navigateCompany(1)}
          />
        }
        extraSlot={
          companyDetailUrl ? (
            <div className="space-y-2">
              <div className="text-sm text-slate-500">Company sheet</div>
              <Link
                className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50"
                href={companyDetailUrl}
              >
                Company Detail
              </Link>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">Company Detail unavailable</div>
          )
        }
      />

      {notice ? <PetyrInlineNotice tone={notice.type === "success" ? "success" : "danger"}>{notice.text}</PetyrInlineNotice> : null}

      <Tabs defaultValue="monthly" className="space-y-6">
        <TabsList className="grid h-auto grid-cols-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm md:grid-cols-2">
          <TabsTrigger value="monthly" className="rounded-xl py-3">
            Monthly forecast
          </TabsTrigger>
          <TabsTrigger value="annual" className="rounded-xl py-3">
            Annual forecast
          </TabsTrigger>
        </TabsList>

        <TabsContent value="monthly">
          <PetyrCard>
            <CardHeader>
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <CardTitle>
                    {entry.data.companyName || "Company"}: {selectedMonthLabel} {entry.data.year}
                  </CardTitle>
                  <CardDescription>{entry.data.entryMode.reason}</CardDescription>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_160px_auto] sm:items-end">
                  <label className="space-y-2">
                    <span className="text-sm text-slate-500">Year</span>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min={2000}
                        max={2100}
                        value={selection.year}
                        onChange={(event) => setSelection((current) => ({ ...current, year: Number(event.target.value) }))}
                      />
                      <Button variant="outline" type="button" disabled={isLoading} onClick={handleYearLoad}>
                        Load
                      </Button>
                    </div>
                  </label>
                  <PetyrSelectField
                    label="Month"
                    disabled={isLoading}
                    value={selection.month}
                    onChange={(event) => handleMonthChange(Number(event.target.value))}
                  >
                    {MONTHS.map((month, index) => (
                      <option key={month} value={index + 1}>
                        {month}
                      </option>
                    ))}
                  </PetyrSelectField>
                  <Badge className="h-10 justify-center rounded-xl px-4" variant={isLocked ? "outline" : "secondary"}>
                    {forecastTypeLabel(editableForecastType)}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <PetyrInlineNotice tone={isLocked ? "warning" : "success"}>
                {isLocked
                  ? entry.data.entryMode.reason
                  : `Editable field: ${forecastTypeLabel(editableForecastType)}. Closed revenue and AI Forecast are read-only.`}
              </PetyrInlineNotice>

              <PetyrCompanyIntelligenceSection
                companyName={entry.data.companyName}
                year={entry.data.year}
                selectedMonth={entry.data.month}
              />

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {entry.data.businessUnits.map((row) => {
                  const aiHelper =
                    row.aiForecast.confidenceScore !== null && row.aiForecast.confidenceScore !== undefined
                      ? `Confidence ${formatPetyrNumber(row.aiForecast.confidenceScore)}`
                      : row.aiForecast.generatedAt
                        ? `Generated ${new Date(row.aiForecast.generatedAt).toLocaleDateString()}`
                        : null;

                  return (
                    <div key={row.businessUnit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-sm font-semibold text-slate-900">{row.businessUnit}</div>
                        <Badge variant={!isLocked && editableForecastType ? "secondary" : "outline"}>
                          {!isLocked && editableForecastType ? "Editable" : "Locked"}
                        </Badge>
                      </div>

                      {!isLocked && editableForecastType ? (
                        <label className="mt-3 block">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-slate-500">{forecastTypeLabel(editableForecastType)}</span>
                            <span className="text-[11px] font-medium text-emerald-700">CSM-owned</span>
                          </div>
                          <Input
                            inputMode="decimal"
                            disabled={isSaving}
                            placeholder="n/a"
                            value={values[row.businessUnit] ?? ""}
                            onChange={(event) => updateValue(row.businessUnit, event.target.value)}
                            className="h-10 rounded-xl border-slate-900 bg-white text-right font-semibold focus:ring-slate-400"
                          />
                        </label>
                      ) : null}

                      <div className={`mt-3 grid gap-2 ${isLocked ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
                        {isLocked ? (
                          <>
                            <ReadOnlyMetric label="Previous-month forecast" value={row.previousMonthForecast.value} />
                            <ReadOnlyMetric label="Ongoing forecast" value={row.ongoingForecast.value} />
                          </>
                        ) : (
                          <ReadOnlyMetric label={otherMonthlyForecastLabel(editableForecastType)} value={otherMonthlyForecast(row, editableForecastType)} />
                        )}
                        <ReadOnlyMetric label="Closed revenue" value={row.actualRevenue} />
                        <ReadOnlyMetric label="AI Forecast" value={row.aiForecast.value} helper={aiHelper} />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_280px]">
                <div>
                  <div className="mb-2 text-sm text-slate-500">Save note</div>
                  <Textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Add context for this forecast update..."
                    disabled={isSaving || isLocked}
                    className="min-h-[120px] rounded-xl"
                  />
                  <div className="mt-2 text-xs text-slate-500">A note is required when monthly forecast values change.</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-2 text-sm font-medium text-slate-700">Company status</div>
                  <PetyrToggleSwitch
                    checked={companyActive}
                    disabled={isSaving || isLoading || isLocked}
                    onCheckedChange={setCompanyActive}
                    label={activeStatusLabel(companyActive)}
                  />
                  <div className="mt-2 text-xs text-slate-500">Company status is saved with the Forecast Entry session.</div>
                </div>
              </div>

              <Button className="w-full rounded-xl" type="button" disabled={isLocked || isSaving || isLoading} onClick={saveEntry}>
                {isSaving ? "Saving" : "Save forecast entry"}
              </Button>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Recent change history</div>
                    <div className="mt-1 text-xs text-slate-500">Latest save sessions for this company, year and month.</div>
                  </div>
                  <Badge variant="outline">ForecastChangeHistory</Badge>
                </div>
                <div className="mt-4 space-y-3">
                  {entry.data.recentChangeHistory.length > 0 ? (
                    entry.data.recentChangeHistory.map((session) => (
                      <div key={session.id} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-900">{forecastTypeLabel(session.forecastType)}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {new Date(session.createdAt).toLocaleString()} by {session.createdBy}
                            </div>
                          </div>
                          <Badge variant="outline">{session.changes.length} change(s)</Badge>
                        </div>
                        <div className="mt-3 space-y-2">
                          {session.changes.length > 0 ? (
                            session.changes.map((change) => (
                              <div key={change.id} className="grid gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs md:grid-cols-[1fr_auto]">
                                <span className="font-medium text-slate-700">
                                  {change.businessUnit} · {forecastTypeLabel(change.fieldName)}
                                </span>
                                <span className="text-slate-600">
                                  {formatChangeValue(change.fieldName, change.previousValue)} to {formatChangeValue(change.fieldName, change.newValue)}
                                </span>
                              </div>
                            ))
                          ) : (
                            <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">No Business Unit value changed in this save.</div>
                          )}
                        </div>
                        {session.note ? <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">{session.note}</div> : null}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl bg-white px-3 py-3 text-sm text-slate-500 shadow-sm">No saved change history for this selection yet.</div>
                  )}
                </div>
              </div>
            </CardContent>
          </PetyrCard>
        </TabsContent>

        <TabsContent value="annual">
          <section className="space-y-6">
            <PetyrCard>
              <CardHeader>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <CardTitle>Annual forecast</CardTitle>
                    <CardDescription>
                      {annualForecast
                        ? `${annualForecast.data.companyName || "Company"}: ${annualForecast.data.year}. ${annualForecast.data.mode.reason} Annual forecast is the CSM forecast, not a management objective.`
                        : "Loading annual forecast context."}
                    </CardDescription>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_auto] sm:items-end">
                    <label className="space-y-2">
                      <span className="text-sm text-slate-500">Year</span>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          min={2000}
                          max={2100}
                          value={selection.year}
                          onChange={(event) => setSelection((current) => ({ ...current, year: Number(event.target.value) }))}
                        />
                        <Button variant="outline" type="button" disabled={isLoading || isAnnualLoading} onClick={handleYearLoad}>
                          Load
                        </Button>
                      </div>
                    </label>
                    <Badge className="h-10 justify-center rounded-xl px-4" variant={annualForecast?.data.mode.readOnly ? "outline" : "secondary"}>
                      {annualForecast?.data.mode.label ?? "Loading"}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {annualNotice ? <PetyrInlineNotice tone={annualNotice.type === "success" ? "success" : "danger"}>{annualNotice.text}</PetyrInlineNotice> : null}


                {annualForecast ? (
                  <>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="text-xs font-semibold uppercase text-slate-500">Closed revenue</div>
                        <div className="mt-1 text-xl font-semibold text-slate-900">{formatMoney(annualForecast.data.summary.actualRevenue)}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="text-xs font-semibold uppercase text-slate-500">Annual forecast</div>
                        <div className="mt-1 text-xl font-semibold text-slate-900">{formatMoney(annualForecast.data.summary.annualForecast)}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="text-xs font-semibold uppercase text-slate-500">Progress</div>
                        <div className="mt-1 text-xl font-semibold text-slate-900">{formatPct(annualForecast.data.summary.progressPct)}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {annualForecast.data.businessUnits.map((row) => (
                        <div key={row.businessUnit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-sm font-semibold text-slate-900">{row.businessUnit}</div>
                            <Badge variant={row.status === "consolidated" ? "default" : row.status === "draft" ? "secondary" : "outline"}>
                              {annualForecastStatusLabel(row.status)}
                            </Badge>
                          </div>

                          <div className="mt-3 text-xs font-medium text-slate-500">CSM forecast {annualForecast.data.year}</div>
                          {row.mode.canSaveDraft ? (
                            <Input
                              inputMode="decimal"
                              disabled={isAnnualSaving || isAnnualConsolidating}
                              placeholder="n/a"
                              value={annualValues[row.businessUnit] ?? ""}
                              onChange={(event) => updateAnnualValue(row.businessUnit, event.target.value)}
                              className="mt-1 h-10 rounded-xl border-slate-900 text-right font-semibold focus:ring-slate-400"
                            />
                          ) : (
                            <Input value={formatMoney(row.value)} readOnly disabled className="mt-1 h-10 rounded-xl text-right font-semibold" />
                          )}

                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <ReadOnlyMetric label="AI Forecast" value={row.aiForecastValue} />
                            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                              Closed revenue/progress
                              <div className="mt-1 text-sm font-semibold text-slate-900">{formatMoney(row.actualRevenue)}</div>
                              <div className="mt-1 text-[11px] leading-4 text-slate-500">{formatPct(row.progressPct)}</div>
                            </div>
                          </div>

                          {row.consolidatedBy && row.consolidatedAt ? (
                            <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                              {new Date(row.consolidatedAt).toLocaleString()} by {row.consolidatedBy}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                      <label className="space-y-2">
                        <span className="text-sm font-medium text-slate-700">Annual notes</span>
                        <Textarea
                          value={annualNote}
                          onChange={(event) => setAnnualNote(event.target.value)}
                          placeholder="Add context on the annual forecast, assumptions and main risks..."
                          disabled={!canSaveAnnualDraft && !canConsolidateAnnual}
                          className="min-h-[110px] rounded-xl"
                        />
                      </label>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <Button variant="outline" type="button" disabled={!canSaveAnnualDraft} onClick={saveAnnualDraft}>
                          {isAnnualSaving ? "Saving draft" : "Save annual draft"}
                        </Button>
                        <Button type="button" disabled={!canConsolidateAnnual} onClick={consolidateAnnualForecast}>
                          {isAnnualConsolidating ? "Consolidating" : "Consolidate annual forecast"}
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl bg-slate-50 px-4 py-4 text-sm text-slate-500">
                    {isAnnualLoading ? "Loading annual forecast." : "Annual forecast data is unavailable for this selection."}
                  </div>
                )}
              </CardContent>
            </PetyrCard>

          </section>
        </TabsContent>
      </Tabs>

      {canViewAdminTools ? (
        <section className="space-y-4" aria-label="Forecast Entry support tools">
          <PetyrSectionTitle
            title="Support tools"
            description="AI Forecast remains available after the core editor; data diagnostics are available from the floating menu."
            actions={<Badge variant="outline">Secondary</Badge>}
          />

          <PetyrAiForecastCompanyAction
            companyName={entry.data.companyName}
            year={entry.data.year}
            onApplied={() => {
              void loadEntry(selectionFromEntry(entry));
            }}
          />
        </section>
      ) : null}
      {canViewAdminTools ? <PetyrFloatingDiagnosticsMenu diagnostics={floatingDiagnostics} /> : null}
    </PetyrWorkspaceShell>
  );

}
