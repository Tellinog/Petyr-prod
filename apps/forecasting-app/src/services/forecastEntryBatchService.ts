import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getForecastEntryMode, type EditableForecastType, type ForecastEntryMode } from "@/lib/forecastEntryMode";
import { PETYR_BUSINESS_UNITS, type PetyrBusinessUnit } from "@/lib/petyr/constants";
import { startPetyrPerformanceTimer } from "@/lib/petyr/performance";
import { resolvePreferredCsmName } from "@/lib/petyr/csmIdentity";
import {
  getForecastEntryCompanies,
  getForecastEntryContext,
  getForecastEntryContextsBatch,
  getForecastEntryScopedBatch,
  type PetyrDataServiceResult,
  type PetyrForecastEntryContext,
  type PetyrForecastValueContext
} from "@/services/petyrDataService";
import { getForecastEntryCachedRead, invalidateForecastEntryReadCache } from "@/services/forecastEntryReadCache";

const SAVE_SOURCE = "Forecast Entry Batch";
const SAVE_USER_FALLBACK = "petyr-forecast-entry-batch";
const NOTE_ONLY_MESSAGE = "Company note requires at least one active forecast value entered, accepted from AI or modified.";
const NO_CHANGES_DETECTED_MESSAGE = "No changes detected";
const BUSINESS_UNITS = new Set<string>(PETYR_BUSINESS_UNITS);
const SOURCE_STATES = new Set(["accepted_ai", "manual_edit"]);

export class ForecastEntryBatchError extends Error {
  status: number;
  mode?: ForecastEntryMode;

  constructor(message: string, status = 400, mode?: ForecastEntryMode) {
    super(message);
    this.name = "ForecastEntryBatchError";
    this.status = status;
    this.mode = mode;
  }
}

export type ForecastEntryBatchQuery = {
  csmName?: unknown;
  preferredCsmName?: unknown;
  year?: unknown;
  month?: unknown;
  warmup?: unknown;
};

export type ForecastEntryBatchCell = {
  businessUnit: PetyrBusinessUnit;
  previousMonthForecast: PetyrForecastValueContext & {
    hasSavedCsmValue: boolean;
  };
  ongoingForecast: PetyrForecastValueContext & {
    hasSavedCsmValue: boolean;
  };
  closedRevenue: number;
  aiForecast: {
    value: number | null;
    confidenceScore: number | null;
    modelVersion: string | null;
    explanation: string | null;
    generatedAt: string | null;
  };
};

export type ForecastEntryBatchCompany = {
  companyName: string;
  csmName: string;
  isForecastActive: boolean;
  priorityScore: number;
  businessUnits: ForecastEntryBatchCell[];
};

export type ForecastEntryBatchData = {
  selectedCsm: string;
  csmOptions: string[];
  year: number;
  month: number;
  entryMode: ForecastEntryMode;
  businessUnits: PetyrBusinessUnit[];
  companies: ForecastEntryBatchCompany[];
};

export type ForecastEntryBatchDataResult = PetyrDataServiceResult<ForecastEntryBatchData>;

export type ForecastEntryBatchSaveValueInput = {
  businessUnit?: unknown;
  value?: unknown;
  sourceState?: unknown;
};

export type ForecastEntryBatchSaveCompanyInput = {
  companyName?: unknown;
  note?: unknown;
  values?: unknown;
};

export type ForecastEntryBatchSaveInput = {
  csmName?: unknown;
  year?: unknown;
  month?: unknown;
  forecastType?: unknown;
  createdBy?: unknown;
  updates?: unknown;
};

export type ForecastEntryBatchSaveResult = {
  ok: true;
  forecastType: EditableForecastType;
  forecastUpserts: number;
  changeLogRows: number;
  saveSessionIds: string[];
  companiesSaved: number;
  noChanges: boolean;
  message?: string;
  batch: ForecastEntryBatchDataResult;
};

type CompanyOption = {
  companyName: string;
  csmName: string;
  isForecastActive: boolean | null;
  priorityScore: number;
};

type ValidatedBatchValue = {
  businessUnit: PetyrBusinessUnit;
  value: Prisma.Decimal;
  sourceState: "accepted_ai" | "manual_edit";
};

type ValidatedCompanyUpdate = {
  companyName: string;
  note: string;
  values: ValidatedBatchValue[];
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function monthlyCacheKey(input: ForecastEntryBatchQuery, year: number, month: number) {
  return [
    "monthly",
    year,
    month,
    normalizeKey(asString(input.csmName)),
    normalizeKey(asString(input.preferredCsmName))
  ].join(":");
}

function uniqueDiagnostics(values: string[]) {
  return [...new Set(values)];
}

function currentServerPeriod() {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1
  };
}

function parseOptionalPeriod(input: ForecastEntryBatchQuery) {
  const current = currentServerPeriod();
  const requestedYear = Number(input.year);
  const requestedMonth = Number(input.month);
  const hasRequestedMonth = Number.isInteger(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12;
  const hasRequestedYear = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2100;

  return {
    year: hasRequestedMonth && hasRequestedYear ? requestedYear : current.year,
    month: hasRequestedMonth ? requestedMonth : current.month
  };
}

function parseRequiredTargetPeriod(input: ForecastEntryBatchSaveInput) {
  const year = Number(input.year);
  const month = Number(input.month);

  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new ForecastEntryBatchError("Forecast Entry batch save requires a valid target year and month.", 400);
  }

  return { year, month };
}

function decimalToLogValue(value: Prisma.Decimal | null | undefined) {
  return value === null || value === undefined ? null : value.toFixed(2);
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

function parseMoney(value: unknown) {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    return new Prisma.Decimal(value);
  }

  if (typeof value !== "string") return null;

  const normalized = normalizeMoneyString(value);
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  return new Prisma.Decimal(normalized);
}

function hasDecimalChanged(existingValue: Prisma.Decimal | null | undefined, nextValue: Prisma.Decimal) {
  return !existingValue || !existingValue.equals(nextValue);
}

function normalizeBusinessUnit(value: unknown): PetyrBusinessUnit | null {
  const normalized = asString(value);
  return PETYR_BUSINESS_UNITS.find((businessUnit) => normalizeKey(businessUnit) === normalizeKey(normalized)) ?? null;
}

function savedForecast(row: PetyrForecastValueContext) {
  return {
    ...row,
    hasSavedCsmValue: Boolean(row.status || row.updatedAt)
  };
}

function currentCompanyActiveStatus(context: PetyrForecastEntryContext) {
  return context.companyStatus?.isActive ?? context.company?.isForecastActive ?? true;
}

function toCompanyOptions(rows: Awaited<ReturnType<typeof getForecastEntryCompanies>>["data"]): CompanyOption[] {
  return rows.map((row) => ({
    companyName: row.companyName,
    csmName: row.csmName,
    isForecastActive: row.isForecastActive,
    priorityScore: row.priorityScore
  }));
}

function selectCsm(input: ForecastEntryBatchQuery, companies: CompanyOption[]) {
  const requestedCsm = asString(input.csmName);
  const csmOptions = [...new Set(companies.map((company) => company.csmName || "Unassigned"))].sort((left, right) =>
    left.localeCompare(right)
  );
  const preferredCsm = requestedCsm ? null : resolvePreferredCsmName(input.preferredCsmName, csmOptions);
  const selected = requestedCsm || preferredCsm || csmOptions[0] || "Unassigned";

  return {
    selectedCsm: selected,
    csmOptions: selected && !csmOptions.includes(selected) ? [selected, ...csmOptions] : csmOptions
  };
}

function companyFromContext(context: PetyrForecastEntryContext, fallback: CompanyOption): ForecastEntryBatchCompany {
  return {
    companyName: context.companyName || fallback.companyName,
    csmName: context.csmName || fallback.csmName || "Unassigned",
    isForecastActive: currentCompanyActiveStatus(context),
    priorityScore: fallback.priorityScore,
    businessUnits: context.businessUnits.map((row) => ({
      businessUnit: normalizeBusinessUnit(row.businessUnit) ?? "Other",
      previousMonthForecast: savedForecast(row.previousMonthForecast),
      ongoingForecast: savedForecast(row.ongoingForecast),
      closedRevenue: row.actualRevenue,
      aiForecast: row.aiForecast
    }))
  };
}

export async function getForecastEntryBatch(input: ForecastEntryBatchQuery = {}): Promise<ForecastEntryBatchDataResult> {
  const { year, month } = parseOptionalPeriod(input);
  const finishPerformance = startPetyrPerformanceTimer("getForecastEntryBatch", {
    year,
    month,
    warmup: asString(input.warmup) === "1" || input.warmup === true
  });

  try {
    const cached = await getForecastEntryCachedRead(monthlyCacheKey(input, year, month), async () => {
      const diagnostics: string[] = [];
      const scopedResult = await getForecastEntryScopedBatch({
        csmName: input.csmName,
        preferredCsmName: input.preferredCsmName,
        year,
        month
      });

      if (scopedResult) {
        diagnostics.push(...scopedResult.diagnostics);
        const contexts = scopedResult.contexts.map((context, index) => companyFromContext(context, scopedResult.companies[index]));

        return {
          result: {
            source: "postgresql",
            diagnostics: uniqueDiagnostics(diagnostics),
            data: {
              selectedCsm: scopedResult.selectedCsm,
              csmOptions: scopedResult.csmOptions,
              year,
              month,
              entryMode: getForecastEntryMode({ year, month }),
              businessUnits: [...PETYR_BUSINESS_UNITS],
              companies: contexts
            }
          } satisfies ForecastEntryBatchDataResult,
          meta: {
            fallback: false,
            companiesCount: contexts.length,
            scopedRowsCount: scopedResult.scopedRowsCount
          }
        };
      }

      const companiesResult = await getForecastEntryCompanies();
      diagnostics.push(...companiesResult.diagnostics);

      const companies = toCompanyOptions(companiesResult.data);
      const { selectedCsm, csmOptions } = selectCsm(input, companies);
      const selectedCsmKey = normalizeKey(selectedCsm);
      const scopedCompanies = companies.filter((company) => normalizeKey(company.csmName || "Unassigned") === selectedCsmKey);
      const contextsResult = await getForecastEntryContextsBatch({
        csmName: selectedCsm,
        companies: scopedCompanies,
        year,
        month
      });
      diagnostics.push(...contextsResult.diagnostics);

      const contexts = contextsResult.data.map((context, index) => companyFromContext(context, scopedCompanies[index]));

      return {
        result: {
          source: "postgresql",
          diagnostics: uniqueDiagnostics(diagnostics),
          data: {
            selectedCsm,
            csmOptions,
            year,
            month,
            entryMode: getForecastEntryMode({ year, month }),
            businessUnits: [...PETYR_BUSINESS_UNITS],
            companies: contexts
          }
        } satisfies ForecastEntryBatchDataResult,
        meta: {
          fallback: true,
          companiesCount: contexts.length,
          scopedRowsCount: 0
        }
      };
    });

    finishPerformance({
      status: "success",
      rowCount: cached.value.result.data.companies.length,
      companiesCount: cached.value.result.data.companies.length,
      cacheHit: cached.cacheHit,
      fallback: cached.value.meta.fallback,
      scopedRowsCount: cached.value.meta.scopedRowsCount
    });

    return cached.value.result;
  } catch (error) {
    finishPerformance({ status: "failed" });
    throw error;
  }
}


function validateForecastType(input: ForecastEntryBatchSaveInput, year: number, month: number) {
  const mode = getForecastEntryMode({ year, month });
  const requestedForecastType = asString(input.forecastType);

  if (!mode.editable || !mode.editableForecastType) {
    throw new ForecastEntryBatchError(mode.reason, 423, mode);
  }

  if (requestedForecastType && requestedForecastType !== mode.editableForecastType) {
    throw new ForecastEntryBatchError(`Only ${mode.editableForecastType} can be saved for the selected month.`, 423, mode);
  }

  return mode.editableForecastType;
}

function validateBatchValues(values: unknown) {
  if (!Array.isArray(values)) {
    return [];
  }

  const byBusinessUnit = new Map<PetyrBusinessUnit, ValidatedBatchValue>();

  for (const rawValue of values) {
    const row = rawValue as ForecastEntryBatchSaveValueInput;
    const businessUnit = normalizeBusinessUnit(row.businessUnit);
    if (!businessUnit || !BUSINESS_UNITS.has(businessUnit)) {
      throw new ForecastEntryBatchError("Forecast Entry batch save contains an unknown Business Unit.", 400);
    }

    if (byBusinessUnit.has(businessUnit)) {
      throw new ForecastEntryBatchError(`Forecast Entry batch save contains duplicate values for ${businessUnit}.`, 400);
    }

    const value = parseMoney(row.value);
    if (!value) {
      throw new ForecastEntryBatchError(`Forecast Entry value for ${businessUnit} must be a non-negative numeric value.`, 400);
    }

    const sourceState = asString(row.sourceState);
    if (!SOURCE_STATES.has(sourceState)) {
      throw new ForecastEntryBatchError(`Forecast Entry value for ${businessUnit} requires sourceState accepted_ai or manual_edit.`, 400);
    }

    byBusinessUnit.set(businessUnit, {
      businessUnit,
      value,
      sourceState: sourceState as "accepted_ai" | "manual_edit"
    });
  }

  return [...byBusinessUnit.values()];
}

function validateUpdates(updates: unknown): ValidatedCompanyUpdate[] {
  if (!Array.isArray(updates)) {
    throw new ForecastEntryBatchError("Forecast Entry batch save requires an updates array.", 400);
  }

  return updates.map((rawUpdate) => {
    const update = rawUpdate as ForecastEntryBatchSaveCompanyInput;
    const companyName = asString(update.companyName);
    if (!companyName) {
      throw new ForecastEntryBatchError("Each Forecast Entry batch update requires companyName.", 400);
    }

    return {
      companyName,
      note: asString(update.note),
      values: validateBatchValues(update.values)
    };
  });
}

function aiForecastByBusinessUnit(context: PetyrForecastEntryContext) {
  const rows = new Map<PetyrBusinessUnit, Prisma.Decimal | null>();

  for (const row of context.businessUnits) {
    const businessUnit = normalizeBusinessUnit(row.businessUnit);
    if (!businessUnit || row.aiForecast.value === null) continue;
    rows.set(businessUnit, new Prisma.Decimal(row.aiForecast.value));
  }

  return rows;
}

function monthlyForecastFor(context: PetyrForecastEntryContext, businessUnit: PetyrBusinessUnit, forecastType: EditableForecastType) {
  const row = context.businessUnits.find((item) => normalizeBusinessUnit(item.businessUnit) === businessUnit);
  return forecastType === "ongoing" ? row?.ongoingForecast : row?.previousMonthForecast;
}

export async function saveForecastEntryBatch(input: ForecastEntryBatchSaveInput): Promise<ForecastEntryBatchSaveResult> {
  const { year, month } = parseRequiredTargetPeriod(input);
  const forecastType = validateForecastType(input, year, month);
  const csmName = asString(input.csmName);
  if (!csmName) {
    throw new ForecastEntryBatchError("csmName is required.", 400);
  }

  const updates = validateUpdates(input.updates);
  const createdBy = asString(input.createdBy) || csmName || SAVE_USER_FALLBACK;

  for (const update of updates) {
    if (update.note && update.values.length === 0) {
      throw new ForecastEntryBatchError(`${update.companyName}: ${NOTE_ONLY_MESSAGE}`, 400);
    }
  }

  const contexts = new Map<string, PetyrForecastEntryContext>();
  for (const update of updates) {
    const context = await getForecastEntryContext(csmName, update.companyName, year, month);
    const resolvedCsm = context.data.csmName || context.data.company?.csmName || csmName;
    if (normalizeKey(resolvedCsm || "Unassigned") !== normalizeKey(csmName)) {
      throw new ForecastEntryBatchError(`${update.companyName} is not assigned to selected CSM ${csmName}.`, 400);
    }
    contexts.set(normalizeKey(update.companyName), context.data);
  }

  const written = await prisma.$transaction(async (tx) => {
    let forecastUpserts = 0;
    let changeLogRows = 0;
    const saveSessionIds: string[] = [];

    for (const update of updates) {
      const context = contexts.get(normalizeKey(update.companyName));
      if (!context) continue;

      const resolvedCompanyName = context.companyName || update.companyName;
      const resolvedCsmName = context.csmName || context.company?.csmName || csmName || "Unassigned";
      const aiForecasts = aiForecastByBusinessUnit(context);
      const prepared = [];

      for (const value of update.values) {
        const where = {
          companyName_businessUnit_year_month_forecastType: {
            companyName: resolvedCompanyName,
            businessUnit: value.businessUnit,
            year,
            month,
            forecastType
          }
        };
        const existing = await tx.forecastMonthly.findUnique({ where });
        const readModelExisting = monthlyForecastFor(context, value.businessUnit, forecastType);
        const existingReadValue =
          readModelExisting && Boolean(readModelExisting.status || readModelExisting.updatedAt)
            ? new Prisma.Decimal(readModelExisting.value)
            : null;
        const changed = hasDecimalChanged(existing?.value ?? existingReadValue, value.value);
        const aiForecastValueAtSave = existing?.aiForecastValue ?? aiForecasts.get(value.businessUnit) ?? null;

        prepared.push({
          value,
          where,
          existing,
          existingReadValue,
          changed,
          aiForecastValueAtSave
        });
      }

      const changedValues = prepared.filter((row) => row.changed);
      if (update.note && changedValues.length === 0) {
        throw new ForecastEntryBatchError(`${resolvedCompanyName}: ${NOTE_ONLY_MESSAGE}`, 400);
      }

      if (changedValues.length === 0) continue;

      const saveSession = await tx.forecastSaveSession.create({
        data: {
          companyName: resolvedCompanyName,
          csmName: resolvedCsmName,
          source: SAVE_SOURCE,
          year,
          month,
          forecastType,
          note: update.note || null,
          companyActiveStatus: currentCompanyActiveStatus(context),
          createdBy
        }
      });
      saveSessionIds.push(saveSession.id);

      for (const preparedValue of changedValues) {
        await tx.forecastMonthly.upsert({
          where: preparedValue.where,
          create: {
            companyName: resolvedCompanyName,
            csmName: resolvedCsmName,
            businessUnit: preparedValue.value.businessUnit,
            year,
            month,
            forecastType,
            value: preparedValue.value.value,
            aiForecastValue: aiForecasts.get(preparedValue.value.businessUnit) ?? null,
            status: "saved",
            createdBy,
            updatedBy: createdBy
          },
          update: {
            csmName: resolvedCsmName,
            value: preparedValue.value.value,
            status: "saved",
            updatedBy: createdBy
          }
        });
        forecastUpserts += 1;

        await tx.forecastChangeLog.create({
          data: {
            saveSessionId: saveSession.id,
            companyName: resolvedCompanyName,
            businessUnit: preparedValue.value.businessUnit,
            fieldName: forecastType,
            previousValue: decimalToLogValue(preparedValue.existing?.value ?? preparedValue.existingReadValue),
            newValue: decimalToLogValue(preparedValue.value.value),
            aiForecastValueAtSave: preparedValue.aiForecastValueAtSave,
            createdBy
          }
        });
        changeLogRows += 1;
      }
    }

    return {
      forecastUpserts,
      changeLogRows,
      saveSessionIds
    };
  });

  invalidateForecastEntryReadCache((key) => key.startsWith("monthly:") || key.startsWith("annual:") || key.startsWith("overview:"));

  return {
    ok: true,
    forecastType,
    forecastUpserts: written.forecastUpserts,
    changeLogRows: written.changeLogRows,
    saveSessionIds: written.saveSessionIds,
    companiesSaved: written.saveSessionIds.length,
    noChanges: written.saveSessionIds.length === 0,
    message: written.saveSessionIds.length === 0 ? NO_CHANGES_DETECTED_MESSAGE : undefined,
    batch: await getForecastEntryBatch({ csmName, year, month })
  };
}
