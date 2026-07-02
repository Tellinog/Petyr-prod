import { Prisma, type ForecastAnnual } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  getAnnualForecastMode,
  isAnnualForecastConsolidationTarget,
  type AnnualForecastMode
} from "@/lib/forecasting/calendarRules";
import { PETYR_BUSINESS_UNITS, type PetyrBusinessUnit } from "@/lib/petyr/constants";
import {
  getCompanyDetail,
  getForecastEntryCompanies,
  type PetyrDataServiceResult
} from "@/services/petyrDataService";

const ANNUAL_FORECAST_USER_FALLBACK = "petyr-annual-forecast";
const BUSINESS_UNITS = new Set<string>(PETYR_BUSINESS_UNITS);

type RelationExistsRow = {
  exists: boolean;
};

export class AnnualForecastError extends Error {
  status: number;
  mode?: AnnualForecastMode;

  constructor(message: string, status = 400, mode?: AnnualForecastMode) {
    super(message);
    this.name = "AnnualForecastError";
    this.status = status;
    this.mode = mode;
  }
}

export type AnnualForecastCompanyOption = {
  companyName: string;
  csmName: string;
  isForecastActive: boolean | null;
  priorityScore: number;
};

export type AnnualForecastBusinessUnitRow = {
  businessUnit: PetyrBusinessUnit;
  actualRevenue: number;
  progressPct: number | null;
  value: number;
  aiForecastValue: number | null;
  status: "draft" | "consolidated" | null;
  note: string | null;
  updatedAt: string | null;
  consolidatedBy: string | null;
  consolidatedAt: string | null;
  mode: AnnualForecastMode;
};

export type AnnualForecastData = {
  companyName: string;
  csmName: string;
  year: number;
  currentYear: number;
  mode: AnnualForecastMode;
  companies: AnnualForecastCompanyOption[];
  businessUnits: AnnualForecastBusinessUnitRow[];
  summary: {
    actualRevenue: number;
    annualForecast: number;
    progressPct: number | null;
  };
  consolidationWindow: {
    targetYear: number;
    isOpen: boolean;
    startDay: 15;
    endDay: 30;
  };
};

export type AnnualForecastDataResult = PetyrDataServiceResult<AnnualForecastData>;

export type AnnualForecastQuery = {
  companyName?: unknown;
  csmName?: unknown;
  year?: unknown;
  isAdmin?: unknown;
};

export type AnnualForecastValueInput = {
  businessUnit: unknown;
  value: unknown;
};

export type AnnualForecastSaveInput = AnnualForecastQuery & {
  values?: unknown;
  note?: unknown;
  createdBy?: unknown;
};

export type AnnualForecastSaveResult = {
  ok: true;
  action: "draft_saved" | "consolidated";
  forecastUpserts: number;
  annualForecast: AnnualForecastDataResult;
};

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  const normalized = asString(value).toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "admin";
}

function parseYear(value: unknown) {
  const fallback = new Date().getFullYear();
  const parsed = typeof value === "number" ? value : Number(asString(value));
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : fallback;
}

function requireYear(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(asString(value));

  if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 2100) {
    throw new AnnualForecastError("Annual forecast requires a valid year between 2000 and 2100.", 400);
  }

  return parsed;
}

function decimalToNumber(value: Prisma.Decimal | null | undefined) {
  return value === null || value === undefined ? null : Number(value.toString());
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function progressPct(actualRevenue: number, forecastValue: number) {
  if (forecastValue <= 0) return null;
  return Math.round((actualRevenue / forecastValue) * 10000) / 100;
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

function normalizeBusinessUnit(value: unknown): PetyrBusinessUnit | null {
  const normalized = asString(value);
  const official = PETYR_BUSINESS_UNITS.find((businessUnit) => normalizeKey(businessUnit) === normalizeKey(normalized));
  return official ?? null;
}

function validateSaveValues(values: unknown, options: { requireAllBusinessUnits?: boolean } = {}) {
  if (!Array.isArray(values)) {
    throw new AnnualForecastError("Annual forecast save requires a values array.", 400);
  }

  const byBusinessUnit = new Map<PetyrBusinessUnit, Prisma.Decimal>();

  for (const rawValue of values) {
    const row = rawValue as Partial<AnnualForecastValueInput>;
    const businessUnit = normalizeBusinessUnit(row.businessUnit);

    if (!businessUnit || !BUSINESS_UNITS.has(businessUnit)) {
      throw new AnnualForecastError("Annual forecast save contains an unknown Business Unit.", 400);
    }

    if (byBusinessUnit.has(businessUnit)) {
      throw new AnnualForecastError(`Annual forecast save contains duplicate values for ${businessUnit}.`, 400);
    }

    const value = parseMoney(row.value);
    if (!value) {
      throw new AnnualForecastError(`Annual forecast value for ${businessUnit} must be numeric.`, 400);
    }

    byBusinessUnit.set(businessUnit, value);
  }

  if (byBusinessUnit.size === 0) {
    throw new AnnualForecastError("Annual forecast save requires at least one Business Unit value.", 400);
  }

  if (options.requireAllBusinessUnits && byBusinessUnit.size !== PETYR_BUSINESS_UNITS.length) {
    throw new AnnualForecastError("Annual forecast consolidation requires values for every official Business Unit.", 400);
  }

  return [...byBusinessUnit.entries()].map(([businessUnit, value]) => ({ businessUnit, value }));
}

async function relationExists(relationName: string) {
  const rows = await prisma.$queryRaw<RelationExistsRow[]>`
    SELECT to_regclass(${relationName}) IS NOT NULL AS "exists"
  `;

  return rows[0]?.exists ?? false;
}

async function readAnnualRows(companyName: string, year: number, diagnostics: string[]) {
  if (!(await relationExists("forecast_annual"))) {
    diagnostics.push("forecast_annual is missing. Apply the forecasting app Prisma schema before Petyr can read or save annual forecasts.");
    return [];
  }

  return prisma.forecastAnnual.findMany({
    where: {
      companyName: {
        equals: companyName,
        mode: "insensitive"
      },
      year
    }
  });
}

function toCompanyOptions(rows: Awaited<ReturnType<typeof getForecastEntryCompanies>>["data"]): AnnualForecastCompanyOption[] {
  return rows.map((row) => ({
    companyName: row.companyName,
    csmName: row.csmName,
    isForecastActive: row.isForecastActive,
    priorityScore: row.priorityScore
  }));
}

function selectCompany(input: AnnualForecastQuery, companies: AnnualForecastCompanyOption[]) {
  const requestedCompany = asString(input.companyName);
  const requestedCsm = asString(input.csmName);
  const requestedCompanyKey = normalizeKey(requestedCompany);
  const requestedCsmKey = normalizeKey(requestedCsm);
  const exactCompany = requestedCompanyKey
    ? companies.find((company) => normalizeKey(company.companyName) === requestedCompanyKey)
    : null;
  const firstForCsm = requestedCsmKey
    ? companies.find((company) => normalizeKey(company.csmName) === requestedCsmKey)
    : null;
  const selected = exactCompany ?? firstForCsm ?? companies[0] ?? null;

  return {
    companyName: requestedCompany || selected?.companyName || "",
    csmName: requestedCsm || selected?.csmName || "Unassigned"
  };
}

async function resolveAnnualSelection(input: AnnualForecastQuery) {
  const companiesResult = await getForecastEntryCompanies();
  const companies = toCompanyOptions(companiesResult.data);
  const selected = selectCompany(input, companies);

  return {
    diagnostics: companiesResult.diagnostics,
    companies,
    selected
  };
}

function annualRowsByBusinessUnit(rows: ForecastAnnual[]) {
  const byBusinessUnit = new Map<PetyrBusinessUnit, ForecastAnnual>();

  for (const row of rows) {
    const businessUnit = normalizeBusinessUnit(row.businessUnit);
    if (!businessUnit) continue;
    byBusinessUnit.set(businessUnit, row);
  }

  return byBusinessUnit;
}

function uniqueDiagnostics(values: string[]) {
  return [...new Set(values)];
}

export async function getAnnualForecastData(input: AnnualForecastQuery = {}): Promise<AnnualForecastDataResult> {
  const diagnostics: string[] = [];
  const today = new Date();
  const year = parseYear(input.year);
  const isAdmin = parseBoolean(input.isAdmin);
  const selection = await resolveAnnualSelection(input);
  diagnostics.push(...selection.diagnostics);

  const selectedCompanyName = selection.selected.companyName;
  const selectedCsmName = selection.selected.csmName;
  const companyDetail = await getCompanyDetail(selectedCompanyName, year);
  diagnostics.push(...companyDetail.diagnostics);
  const annualRows = await readAnnualRows(selectedCompanyName, year, diagnostics);
  const annualByBusinessUnit = annualRowsByBusinessUnit(annualRows);
  const summaryByBusinessUnit = new Map(
    companyDetail.data.businessUnitSummary.map((row) => [normalizeKey(row.businessUnit), row])
  );
  const anyConsolidated = annualRows.some((row) => row.status === "consolidated");
  const allConsolidated =
    annualRows.length > 0 &&
    PETYR_BUSINESS_UNITS.every((businessUnit) => annualByBusinessUnit.get(businessUnit)?.status === "consolidated");
  const aggregateStatus = allConsolidated ? "consolidated" : null;
  const baseMode = getAnnualForecastMode({
    year,
    currentDate: today,
    status: aggregateStatus,
    isAdmin
  });
  const mode =
    anyConsolidated && !allConsolidated && !isAdmin
      ? {
          ...baseMode,
          canConsolidate: false,
          reason: "Some annual forecast records are already consolidated. Draft rows can still be saved, but consolidation requires admin review."
        }
      : baseMode;

  const businessUnits = PETYR_BUSINESS_UNITS.map<AnnualForecastBusinessUnitRow>((businessUnit) => {
    const forecastRow = annualByBusinessUnit.get(businessUnit);
    const summary = summaryByBusinessUnit.get(normalizeKey(businessUnit));
    const actualRevenue = summary?.actualRevenue ?? 0;
    const value = decimalToNumber(forecastRow?.value) ?? 0;

    return {
      businessUnit,
      actualRevenue,
      progressPct: progressPct(actualRevenue, value),
      value,
      aiForecastValue: decimalToNumber(forecastRow?.aiForecastValue) ?? summary?.aiForecast ?? null,
      status: forecastRow?.status ?? null,
      note: forecastRow?.note ?? null,
      updatedAt: forecastRow?.updatedAt.toISOString() ?? null,
      consolidatedBy: forecastRow?.consolidatedBy ?? null,
      consolidatedAt: forecastRow?.consolidatedAt?.toISOString() ?? null,
      mode: getAnnualForecastMode({
        year,
        currentDate: today,
        status: forecastRow?.status ?? null,
        isAdmin
      })
    };
  });
  const actualRevenue = roundMoney(businessUnits.reduce((sum, row) => sum + row.actualRevenue, 0));
  const annualForecast = roundMoney(businessUnits.reduce((sum, row) => sum + row.value, 0));

  return {
    source: "postgresql",
    diagnostics: uniqueDiagnostics(diagnostics),
    data: {
      companyName: companyDetail.data.overview?.companyName ?? selectedCompanyName,
      csmName: companyDetail.data.overview?.csmName ?? selectedCsmName,
      year,
      currentYear: today.getFullYear(),
      mode,
      companies: selection.companies,
      businessUnits,
      summary: {
        actualRevenue,
        annualForecast,
        progressPct: progressPct(actualRevenue, annualForecast)
      },
      consolidationWindow: {
        targetYear: today.getFullYear() + 1,
        isOpen: isAnnualForecastConsolidationTarget(year, today),
        startDay: 15,
        endDay: 30
      }
    }
  };
}

function validateFutureDraftYear(year: number, currentDate: Date) {
  const mode = getAnnualForecastMode({ year, currentDate });

  if (!mode.isFutureYear) {
    throw new AnnualForecastError(mode.reason, 423, mode);
  }
}

function formatCreatedBy(input: AnnualForecastSaveInput, csmName: string) {
  return asString(input.createdBy) || csmName || ANNUAL_FORECAST_USER_FALLBACK;
}

export async function saveDraftAnnualForecast(
  input: AnnualForecastSaveInput,
  options: { currentDate?: Date } = {}
): Promise<AnnualForecastSaveResult> {
  const currentDate = options.currentDate ?? new Date();
  const year = requireYear(input.year);
  const values = validateSaveValues(input.values);
  const isAdmin = parseBoolean(input.isAdmin);
  const note = asString(input.note) || null;

  validateFutureDraftYear(year, currentDate);

  const selection = await resolveAnnualSelection(input);
  const companyName = selection.selected.companyName;
  const csmName = selection.selected.csmName;

  if (!companyName) {
    throw new AnnualForecastError("companyName is required.", 400);
  }

  const createdBy = formatCreatedBy(input, csmName);
  let forecastUpserts = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of values) {
      const where = {
        companyName_businessUnit_year: {
          companyName,
          businessUnit: row.businessUnit,
          year
        }
      };
      const existing = await tx.forecastAnnual.findUnique({ where });

      if (existing?.status === "consolidated" && !isAdmin) {
        const mode = getAnnualForecastMode({
          year,
          currentDate,
          status: "consolidated",
          isAdmin
        });
        throw new AnnualForecastError(`Annual forecast for ${row.businessUnit} is consolidated and read-only.`, 423, mode);
      }

      const nextStatus = existing?.status === "consolidated" ? "consolidated" : "draft";
      const changed = hasDecimalChanged(existing?.value, row.value) || existing?.note !== note;

      await tx.forecastAnnual.upsert({
        where,
        create: {
          companyName,
          csmName,
          businessUnit: row.businessUnit,
          year,
          value: row.value,
          status: "draft",
          note,
          createdBy,
          updatedBy: createdBy
        },
        update: {
          csmName,
          value: row.value,
          status: nextStatus,
          note,
          updatedBy: createdBy
        }
      });

      if (changed) forecastUpserts += 1;
    }
  });

  return {
    ok: true,
    action: "draft_saved",
    forecastUpserts,
    annualForecast: await getAnnualForecastData({
      companyName,
      csmName,
      year,
      isAdmin
    })
  };
}

export async function consolidateAnnualForecast(
  input: AnnualForecastSaveInput,
  options: { currentDate?: Date } = {}
): Promise<AnnualForecastSaveResult> {
  const currentDate = options.currentDate ?? new Date();
  const year = requireYear(input.year);
  const values = validateSaveValues(input.values, { requireAllBusinessUnits: true });
  const isAdmin = parseBoolean(input.isAdmin);
  const note = asString(input.note) || null;

  if (!isAnnualForecastConsolidationTarget(year, currentDate)) {
    const mode = getAnnualForecastMode({ year, currentDate, isAdmin });
    throw new AnnualForecastError("Annual forecast can only be consolidated for next year between December 15 and December 30.", 423, mode);
  }

  const selection = await resolveAnnualSelection(input);
  const companyName = selection.selected.companyName;
  const csmName = selection.selected.csmName;

  if (!companyName) {
    throw new AnnualForecastError("companyName is required.", 400);
  }

  const consolidatedBy = formatCreatedBy(input, csmName);
  let forecastUpserts = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of values) {
      const where = {
        companyName_businessUnit_year: {
          companyName,
          businessUnit: row.businessUnit,
          year
        }
      };
      const existing = await tx.forecastAnnual.findUnique({ where });

      if (existing?.status === "consolidated" && !isAdmin) {
        const mode = getAnnualForecastMode({
          year,
          currentDate,
          status: "consolidated",
          isAdmin
        });
        throw new AnnualForecastError(`Annual forecast for ${row.businessUnit} is already consolidated and read-only.`, 423, mode);
      }

      const changed =
        hasDecimalChanged(existing?.value, row.value) ||
        existing?.status !== "consolidated" ||
        existing?.note !== note;

      await tx.forecastAnnual.upsert({
        where,
        create: {
          companyName,
          csmName,
          businessUnit: row.businessUnit,
          year,
          value: row.value,
          status: "consolidated",
          note,
          createdBy: consolidatedBy,
          updatedBy: consolidatedBy,
          consolidatedBy,
          consolidatedAt: currentDate
        },
        update: {
          csmName,
          value: row.value,
          status: "consolidated",
          note,
          updatedBy: consolidatedBy,
          consolidatedBy,
          consolidatedAt: currentDate
        }
      });

      if (changed) forecastUpserts += 1;
    }
  });

  return {
    ok: true,
    action: "consolidated",
    forecastUpserts,
    annualForecast: await getAnnualForecastData({
      companyName,
      csmName,
      year,
      isAdmin
    })
  };
}
