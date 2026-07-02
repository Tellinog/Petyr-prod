import { Prisma, type ForecastMonthly } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  getForecastEntryMode,
  type EditableForecastType,
  type ForecastEntryMode,
  type ForecastEntryTarget
} from "@/lib/forecastEntryMode";
import { getPetyrDefaultYear } from "@/lib/petyr/config";
import { PETYR_BUSINESS_UNITS, type ForecastType, type PetyrBusinessUnit } from "@/lib/petyr/constants";
import { resolvePreferredCsmName } from "@/lib/petyr/csmIdentity";
import {
  getForecastEntryCompanies,
  getForecastEntryContext,
  type PetyrDataServiceResult,
  type PetyrForecastEntryContext
} from "@/services/petyrDataService";

const SAVE_SOURCE = "Forecast Entry";
const SAVE_USER_FALLBACK = "petyr-forecast-entry";
const FORECAST_NOTE_REQUIRED_MESSAGE = "Add a CSM note before saving Forecast Entry changes.";
const NO_CHANGES_DETECTED_MESSAGE = "No changes detected";
const COMPANY_STATUS_CHANGE_SCOPE = "Company status";
const BUSINESS_UNITS = new Set<string>(PETYR_BUSINESS_UNITS);
const FORECAST_ENTRY_TARGETS = new Set(["previous_month", "ongoing", "ai_forecast", "actuals"]);

export class ForecastEntrySaveError extends Error {
  status: number;
  mode?: ForecastEntryMode;

  constructor(message: string, status = 400, mode?: ForecastEntryMode) {
    super(message);
    this.name = "ForecastEntrySaveError";
    this.status = status;
    this.mode = mode;
  }
}

export type ForecastEntryCompanyOption = {
  companyName: string;
  csmName: string;
  isForecastActive: boolean | null;
  priorityScore: number;
};

export type ForecastEntryChange = {
  id: string;
  businessUnit: string;
  fieldName: string;
  previousValue: string | null;
  newValue: string | null;
  aiForecastValueAtSave: number | null;
  createdBy: string;
  createdAt: string;
};

export type ForecastEntryChangeSession = {
  id: string;
  source: string;
  forecastType: ForecastType;
  note: string | null;
  companyActiveStatus: boolean;
  createdBy: string;
  createdAt: string;
  changes: ForecastEntryChange[];
};

export type ForecastEntryData = PetyrForecastEntryContext & {
  officialBusinessUnits: PetyrBusinessUnit[];
  companies: ForecastEntryCompanyOption[];
  recentChangeHistory: ForecastEntryChangeSession[];
};

export type ForecastEntryDataResult = PetyrDataServiceResult<ForecastEntryData>;

export type ForecastEntryQuery = {
  companyName?: unknown;
  csmName?: unknown;
  preferredCsmName?: unknown;
  year?: unknown;
  month?: unknown;
};

export type ForecastEntrySaveValueInput = {
  businessUnit: unknown;
  value: unknown;
};

export type ForecastEntrySaveInput = {
  companyName?: unknown;
  csmName?: unknown;
  year?: unknown;
  month?: unknown;
  forecastType?: unknown;
  values?: unknown;
  note?: unknown;
  companyActiveStatus?: unknown;
  createdBy?: unknown;
};

export type ForecastEntrySaveResult = {
  ok: true;
  saveSessionId: string | null;
  forecastType: EditableForecastType;
  forecastUpserts: number;
  changeLogRows: number;
  companyStatusSaved: boolean;
  noChanges: boolean;
  message?: string;
  entry: ForecastEntryDataResult;
};

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseYear(value: unknown) {
  const fallback = getPetyrDefaultYear();
  const parsed = typeof value === "number" ? value : Number(asString(value));
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : fallback;
}

function parseMonth(value: unknown) {
  const fallback = new Date().getMonth() + 1;
  const parsed = typeof value === "number" ? value : Number(asString(value));
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12 ? parsed : fallback;
}

function decimalToNumber(value: Prisma.Decimal | null | undefined) {
  return value === null || value === undefined ? null : Number(value.toString());
}

function decimalToLogValue(value: Prisma.Decimal | null | undefined) {
  return value === null || value === undefined ? null : value.toFixed(2);
}

function booleanToLogValue(value: boolean | null | undefined) {
  if (value === true) return "active";
  if (value === false) return "inactive";
  return null;
}

function normalizeMoneyString(value: string) {
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

function parseMoney(value: unknown) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return new Prisma.Decimal(value);
  }

  if (typeof value !== "string") return null;

  const normalized = normalizeMoneyString(value);
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;

  return new Prisma.Decimal(normalized);
}

function hasDecimalChanged(existingValue: Prisma.Decimal | null | undefined, nextValue: Prisma.Decimal) {
  return !existingValue || !existingValue.equals(nextValue);
}

function uniqueDiagnostics(values: string[]) {
  return [...new Set(values)];
}

function normalizeBusinessUnit(value: unknown): PetyrBusinessUnit | null {
  const normalized = asString(value);
  const official = PETYR_BUSINESS_UNITS.find((businessUnit) => normalizeKey(businessUnit) === normalizeKey(normalized));
  return official ?? null;
}

function toCompanyOptions(rows: Awaited<ReturnType<typeof getForecastEntryCompanies>>["data"]): ForecastEntryCompanyOption[] {
  return rows.map((row) => ({
    companyName: row.companyName,
    csmName: row.csmName,
    isForecastActive: row.isForecastActive,
    priorityScore: row.priorityScore
  }));
}

function selectCompany(input: ForecastEntryQuery, companies: ForecastEntryCompanyOption[]) {
  const requestedCompany = asString(input.companyName);
  const requestedCsm = asString(input.csmName);
  const preferredCsm = requestedCsm
    ? ""
    : resolvePreferredCsmName(input.preferredCsmName, companies.map((company) => company.csmName)) ?? "";
  const requestedCompanyKey = normalizeKey(requestedCompany);
  const requestedCsmKey = normalizeKey(requestedCsm || preferredCsm);

  const exactCompany = requestedCompanyKey
    ? companies.find((company) => normalizeKey(company.companyName) === requestedCompanyKey)
    : null;
  const firstForCsm = requestedCsmKey
    ? companies.find((company) => normalizeKey(company.csmName) === requestedCsmKey)
    : null;
  const selected = exactCompany ?? firstForCsm ?? companies[0] ?? null;

  return {
    companyName: requestedCompany || selected?.companyName || "",
    csmName: requestedCsm || selected?.csmName || preferredCsm || "Unassigned"
  };
}

async function readRecentChangeHistory(companyName: string, year: number, month: number, diagnostics: string[]) {
  if (!companyName.trim()) return [];

  try {
    const sessions = await prisma.forecastSaveSession.findMany({
      where: {
        companyName,
        year,
        month
      },
      include: {
        changeLogs: {
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 8
    });

    return sessions.map<ForecastEntryChangeSession>((session) => ({
      id: session.id,
      source: session.source,
      forecastType: session.forecastType,
      note: session.note,
      companyActiveStatus: session.companyActiveStatus,
      createdBy: session.createdBy,
      createdAt: session.createdAt.toISOString(),
      changes: session.changeLogs.map((change) => ({
        id: change.id,
        businessUnit: change.businessUnit,
        fieldName: change.fieldName,
        previousValue: change.previousValue,
        newValue: change.newValue,
        aiForecastValueAtSave: decimalToNumber(change.aiForecastValueAtSave),
        createdBy: change.createdBy,
        createdAt: change.createdAt.toISOString()
      }))
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    diagnostics.push(`Unable to read Forecast Entry change history: ${message}`);
    return [];
  }
}

export async function getForecastEntryData(input: ForecastEntryQuery = {}): Promise<ForecastEntryDataResult> {
  const diagnostics: string[] = [];
  const year = parseYear(input.year);
  const month = parseMonth(input.month);
  const companiesResult = await getForecastEntryCompanies();
  diagnostics.push(...companiesResult.diagnostics);

  const companies = toCompanyOptions(companiesResult.data);
  const selected = selectCompany(input, companies);
  const context = await getForecastEntryContext(selected.csmName, selected.companyName, year, month);
  diagnostics.push(...context.diagnostics);

  const recentChangeHistory = await readRecentChangeHistory(
    context.data.companyName,
    context.data.year,
    context.data.month,
    diagnostics
  );

  return {
    source: "postgresql",
    diagnostics: uniqueDiagnostics(diagnostics),
    data: {
      ...context.data,
      csmName: context.data.csmName || selected.csmName,
      officialBusinessUnits: [...PETYR_BUSINESS_UNITS],
      companies,
      recentChangeHistory
    }
  };
}

function parseForecastType(value: unknown): ForecastEntryTarget | null {
  const forecastType = asString(value);
  return FORECAST_ENTRY_TARGETS.has(forecastType) ? (forecastType as ForecastEntryTarget) : null;
}

function validateEditableForecastType(input: ForecastEntrySaveInput, year: number, month: number) {
  const requestedForecastType = parseForecastType(input.forecastType);
  const monthMode = getForecastEntryMode({ year, month });

  if (!monthMode.editable || !monthMode.editableForecastType) {
    throw new ForecastEntrySaveError(monthMode.reason, 423, monthMode);
  }

  if (requestedForecastType && requestedForecastType !== monthMode.editableForecastType) {
    const targetMode = getForecastEntryMode({ year, month, forecastType: requestedForecastType });
    throw new ForecastEntrySaveError(targetMode.reason, 423, targetMode);
  }

  return monthMode.editableForecastType;
}

function validateSaveValues(values: unknown) {
  if (values === undefined || values === null) {
    return [];
  }

  if (!Array.isArray(values)) {
    throw new ForecastEntrySaveError("Forecast Entry save requires a values array.", 400);
  }

  const byBusinessUnit = new Map<PetyrBusinessUnit, Prisma.Decimal>();

  for (const rawValue of values) {
    const row = rawValue as Partial<ForecastEntrySaveValueInput>;
    const businessUnit = normalizeBusinessUnit(row.businessUnit);
    if (!businessUnit || !BUSINESS_UNITS.has(businessUnit)) {
      throw new ForecastEntrySaveError("Forecast Entry save contains an unknown Business Unit.", 400);
    }

    if (byBusinessUnit.has(businessUnit)) {
      throw new ForecastEntrySaveError(`Forecast Entry save contains duplicate values for ${businessUnit}.`, 400);
    }

    const value = parseMoney(row.value);
    if (!value) {
      throw new ForecastEntrySaveError(`Forecast Entry value for ${businessUnit} must be numeric.`, 400);
    }

    byBusinessUnit.set(businessUnit, value);
  }

  return [...byBusinessUnit.entries()].map(([businessUnit, value]) => ({ businessUnit, value }));
}

type ValidatedForecastEntrySaveValue = ReturnType<typeof validateSaveValues>[number];

type PreparedForecastEntrySaveValue = {
  row: ValidatedForecastEntrySaveValue;
  where: Prisma.ForecastMonthlyWhereUniqueInput;
  existing: ForecastMonthly | null;
  changed: boolean;
  aiForecastValueAtSave: Prisma.Decimal | null;
};

function validateCompanyActiveStatus(value: unknown) {
  if (typeof value !== "boolean") {
    throw new ForecastEntrySaveError("companyActiveStatus must be a boolean.", 400);
  }

  return value;
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

function currentCompanyActiveStatus(context: PetyrForecastEntryContext, existingStatus?: { isActive: boolean } | null) {
  return existingStatus?.isActive ?? context.companyStatus?.isActive ?? context.company?.isForecastActive ?? true;
}

export async function saveForecastEntry(input: ForecastEntrySaveInput): Promise<ForecastEntrySaveResult> {
  const companyName = asString(input.companyName);
  if (!companyName) {
    throw new ForecastEntrySaveError("companyName is required.", 400);
  }

  const year = parseYear(input.year);
  const month = parseMonth(input.month);
  const forecastType = validateEditableForecastType(input, year, month);
  const values = validateSaveValues(input.values);
  const companyActiveStatus = validateCompanyActiveStatus(input.companyActiveStatus);
  const note = asString(input.note);
  const context = await getForecastEntryContext(asString(input.csmName), companyName, year, month);
  const resolvedCompanyName = context.data.companyName || companyName;
  const resolvedCsmName = asString(input.csmName) || context.data.company?.csmName || context.data.csmName || "Unassigned";
  const createdBy = asString(input.createdBy) || resolvedCsmName || SAVE_USER_FALLBACK;
  const aiForecasts = aiForecastByBusinessUnit(context.data);

  const written = await prisma.$transaction(async (tx) => {
    const preparedValues: PreparedForecastEntrySaveValue[] = [];
    const existingStatus = await tx.companyForecastStatus.findUnique({
      where: { companyName: resolvedCompanyName }
    });
    const previousCompanyActiveStatus = currentCompanyActiveStatus(context.data, existingStatus);
    const activeStatusChanged = previousCompanyActiveStatus !== companyActiveStatus;

    for (const row of values) {
      const where = {
        companyName_businessUnit_year_month_forecastType: {
          companyName: resolvedCompanyName,
          businessUnit: row.businessUnit,
          year,
          month,
          forecastType
        }
      };
      const existing = await tx.forecastMonthly.findUnique({ where });
      const changed = hasDecimalChanged(existing?.value, row.value);
      const aiForecastValueAtSave = existing?.aiForecastValue ?? aiForecasts.get(row.businessUnit) ?? null;

      preparedValues.push({
        row,
        where,
        existing,
        changed,
        aiForecastValueAtSave
      });
    }

    const hasForecastChanges = preparedValues.some((preparedValue) => preparedValue.changed);

    if (hasForecastChanges && !note) {
      throw new ForecastEntrySaveError(FORECAST_NOTE_REQUIRED_MESSAGE, 400);
    }

    if (!hasForecastChanges && !activeStatusChanged) {
      return {
        saveSessionId: null,
        forecastUpserts: 0,
        changeLogRows: 0,
        companyStatusSaved: false,
        noChanges: true,
        message: NO_CHANGES_DETECTED_MESSAGE
      };
    }

    let forecastUpserts = 0;
    let changeLogRows = 0;
    const saveSession = await tx.forecastSaveSession.create({
      data: {
        companyName: resolvedCompanyName,
        csmName: resolvedCsmName,
        source: SAVE_SOURCE,
        year,
        month,
        forecastType,
        note: note || null,
        companyActiveStatus,
        createdBy
      }
    });

    if (activeStatusChanged) {
      await tx.companyForecastStatus.upsert({
        where: { companyName: resolvedCompanyName },
        create: {
          companyName: resolvedCompanyName,
          isActive: companyActiveStatus,
          reason: note || null,
          updatedBy: createdBy
        },
        update: {
          isActive: companyActiveStatus,
          reason: note || null,
          updatedBy: createdBy
        }
      });

      await tx.forecastChangeLog.create({
        data: {
          saveSessionId: saveSession.id,
          companyName: resolvedCompanyName,
          businessUnit: COMPANY_STATUS_CHANGE_SCOPE,
          fieldName: "companyActiveStatus",
          previousValue: booleanToLogValue(previousCompanyActiveStatus),
          newValue: booleanToLogValue(companyActiveStatus),
          aiForecastValueAtSave: null,
          createdBy
        }
      });
      changeLogRows += 1;
    }

    for (const preparedValue of preparedValues) {
      if (!preparedValue.changed) continue;

      await tx.forecastMonthly.upsert({
        where: preparedValue.where,
        create: {
          companyName: resolvedCompanyName,
          csmName: resolvedCsmName,
          businessUnit: preparedValue.row.businessUnit,
          year,
          month,
          forecastType,
          value: preparedValue.row.value,
          aiForecastValue: aiForecasts.get(preparedValue.row.businessUnit) ?? null,
          status: "saved",
          createdBy,
          updatedBy: createdBy
        },
        update: {
          csmName: resolvedCsmName,
          value: preparedValue.row.value,
          status: "saved",
          updatedBy: createdBy
        }
      });
      forecastUpserts += 1;

      await tx.forecastChangeLog.create({
        data: {
          saveSessionId: saveSession.id,
          companyName: resolvedCompanyName,
          businessUnit: preparedValue.row.businessUnit,
          fieldName: forecastType,
          previousValue: decimalToLogValue(preparedValue.existing?.value),
          newValue: decimalToLogValue(preparedValue.row.value),
          aiForecastValueAtSave: preparedValue.aiForecastValueAtSave,
          createdBy
        }
      });
      changeLogRows += 1;
    }

    return {
      saveSessionId: saveSession.id,
      forecastUpserts,
      changeLogRows,
      companyStatusSaved: activeStatusChanged,
      noChanges: false,
      message: undefined
    };
  });

  return {
    ok: true,
    saveSessionId: written.saveSessionId,
    forecastType,
    forecastUpserts: written.forecastUpserts,
    changeLogRows: written.changeLogRows,
    companyStatusSaved: written.companyStatusSaved,
    noChanges: written.noChanges,
    message: written.message,
    entry: await getForecastEntryData({
      companyName: resolvedCompanyName,
      csmName: resolvedCsmName,
      year,
      month
    })
  };
}
