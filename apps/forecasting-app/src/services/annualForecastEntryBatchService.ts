import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PETYR_BUSINESS_UNITS, normalizePetyrBusinessUnit, type PetyrBusinessUnit } from "@/lib/petyr/constants";
import { startPetyrPerformanceTimer } from "@/lib/petyr/performance";
import { resolvePreferredCsmName } from "@/lib/petyr/csmIdentity";
import {
  calculateAnnualForecastOngoing,
  calculateAnnualForecastPercentages,
  getAnnualForecastEntryDefaultYear,
  getAnnualForecastEntryInitialMode,
  getAnnualForecastEntryYearOptions,
  isPetyrAnnualConfidence,
  isValidAnnualForecastEntryYear,
  type PetyrAnnualConfidence,
  type PetyrAnnualForecastValueSource
} from "@/lib/petyr/annualForecastEntryRules";
import {
  getAnnualForecastEntryScopedPortfolio,
  getAnnualForecastEntryPortfolioCompanies,
  getCompanyDetail,
  getForecastEntryCompanies,
  type PetyrAnnualForecastEntryPortfolioCompany,
  type PetyrCampaignDetail,
  type PetyrCompanyDetail,
  type PetyrDataServiceResult
} from "@/services/petyrDataService";
import { getForecastEntryCachedRead, invalidateForecastEntryReadCache } from "@/services/forecastEntryReadCache";
import {
  getPetyrInitialForecastWindowOverridesWithDiagnostics,
  isInitialForecastYearAdminUnlocked
} from "@/services/petyrInitialForecastWindowOverrideService";

const SAVE_SOURCE = "Annual Forecast Entry";
const SAVE_USER_FALLBACK = "petyr-annual-forecast-entry";
const COMPANY_FIELD_BUSINESS_UNIT = "__company__";
const BUSINESS_UNITS = new Set<string>(PETYR_BUSINESS_UNITS);
const SOURCE_STATES = new Set(["accepted_ai", "manual_edit"]);

type RelationExistsRow = {
  exists: boolean;
};

type CompanyOption = {
  companyName: string;
  csmName: string;
  isForecastActive: boolean | null;
  priorityScore: number;
};

type ValidatedAnnualBuValue = {
  businessUnit: PetyrBusinessUnit;
  value: Prisma.Decimal;
  valueSource: PetyrAnnualForecastValueSource;
  submittedSourceState: "accepted_ai" | "manual_edit";
};

type ValidatedAnnualUpdate = {
  companyName: string;
  activeStatus: boolean | null;
  initialForecast: Prisma.Decimal | null;
  confidence: PetyrAnnualConfidence | null;
  values: ValidatedAnnualBuValue[];
};

export class AnnualForecastEntryBatchError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AnnualForecastEntryBatchError";
    this.status = status;
  }
}

export type AnnualForecastEntryBatchQuery = {
  csmName?: unknown;
  year?: unknown;
  preferredCsmName?: unknown;
  warmup?: unknown;
};

export type AnnualForecastEntryBatchCell = {
  businessUnit: PetyrBusinessUnit;
  savedForecast: {
    value: number | null;
    valueSource: PetyrAnnualForecastValueSource | null;
    hasSavedValue: boolean;
    updatedAt: string | null;
  };
  aiForecast: {
    value: number | null;
    confidenceScore: number | null;
    modelVersion: string | null;
    generatedAt: string | null;
  };
};

export type AnnualForecastEntryBatchCompany = {
  companyName: string;
  csmName: string;
  isForecastActive: boolean;
  initialForecast: number | null;
  ongoingConfidence: PetyrAnnualConfidence | null;
  fcOngoing: number;
  revenue: number;
  planned: number;
  revenuePct: number | null;
  plannedPct: number | null;
  uncoveredPct: number | null;
  orderingBucket: "active" | "inactive_with_revenue_or_planned" | "inactive_empty";
  businessUnits: AnnualForecastEntryBatchCell[];
};

export type AnnualForecastEntryBatchData = {
  selectedCsm: string;
  csmOptions: string[];
  selectedYear: number;
  defaultYear: number;
  yearOptions: number[];
  initialMode: ReturnType<typeof getAnnualForecastEntryInitialMode>;
  businessUnits: PetyrBusinessUnit[];
  confidenceOptions: PetyrAnnualConfidence[];
  companies: AnnualForecastEntryBatchCompany[];
};

export type AnnualForecastEntryBatchDataResult = PetyrDataServiceResult<AnnualForecastEntryBatchData>;

export type AnnualForecastEntryBatchSaveInput = {
  csmName?: unknown;
  year?: unknown;
  createdBy?: unknown;
  updates?: unknown;
};

export type AnnualForecastEntryBatchSaveResult = {
  ok: true;
  forecastUpserts: number;
  metadataUpserts: number;
  activeStatusUpdates: number;
  changeLogRows: number;
  saveSessionIds: string[];
  companiesSaved: number;
  noChanges: boolean;
  batch: AnnualForecastEntryBatchDataResult;
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function annualCacheKey(input: AnnualForecastEntryBatchQuery, selectedYear: number, initialWindowOverrideToken: string) {
  return [
    "annual",
    selectedYear,
    initialWindowOverrideToken,
    normalizeKey(asString(input.csmName)),
    normalizeKey(asString(input.preferredCsmName))
  ].join(":");
}

function uniqueDiagnostics(values: string[]) {
  return [...new Set(values)];
}

function decimalToNumber(value: Prisma.Decimal | null | undefined) {
  return value === null || value === undefined ? null : Number(value.toString());
}

function decimalToLogValue(value: Prisma.Decimal | null | undefined) {
  return value === null || value === undefined ? null : value.toFixed(2);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
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

function normalizeBusinessUnit(value: unknown): PetyrBusinessUnit | null {
  const normalized = asString(value);
  return PETYR_BUSINESS_UNITS.find((businessUnit) => normalizeKey(businessUnit) === normalizeKey(normalized)) ?? null;
}

async function relationExists(relationName: string) {
  const rows = await prisma.$queryRaw<RelationExistsRow[]>`
    SELECT to_regclass(${relationName}) IS NOT NULL AS "exists"
  `;

  return rows[0]?.exists ?? false;
}

function parseYear(value: unknown, currentDate = new Date()) {
  const defaultYear = getAnnualForecastEntryDefaultYear(currentDate);
  const parsed = typeof value === "number" ? value : Number(asString(value));
  return isValidAnnualForecastEntryYear(parsed, currentDate) ? parsed : defaultYear;
}

function requireYear(value: unknown, currentDate = new Date()) {
  const parsed = typeof value === "number" ? value : Number(asString(value));

  if (!isValidAnnualForecastEntryYear(parsed, currentDate)) {
    throw new AnnualForecastEntryBatchError(
      `Annual Forecast Entry year must be one of: ${getAnnualForecastEntryYearOptions(currentDate).join(", ")}.`,
      400
    );
  }

  return parsed;
}

function toCompanyOptions(rows: Awaited<ReturnType<typeof getForecastEntryCompanies>>["data"]): CompanyOption[] {
  return rows.map((row) => ({
    companyName: row.companyName,
    csmName: row.csmName,
    isForecastActive: row.isForecastActive,
    priorityScore: row.priorityScore
  }));
}

function selectCsm(input: AnnualForecastEntryBatchQuery, companies: CompanyOption[]) {
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

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp);
}

function campaignStatusKey(value: string) {
  return value.trim().toLowerCase();
}

function isInvalidCampaignStatus(status: string) {
  return ["abort", "cancel", "cancell", "annull", "delete", "deleted", "void", "lost", "reject", "archive", "archiv", "invalid"].some(
    (token) => status.includes(token)
  );
}

function isPlanningOnlyStatus(status: string) {
  return ["draft", "planned", "planning", "pipeline", "tentative", "proposed", "setup", "recruiting"].some((token) =>
    status.includes(token)
  );
}

function isRevenueCampaign(campaign: PetyrCampaignDetail, year: number, today: Date) {
  const endDate = parseDate(campaign.endDate);
  if (!endDate || endDate.getFullYear() !== year || startOfLocalDay(endDate).getTime() > startOfLocalDay(today).getTime()) {
    return false;
  }

  const status = campaignStatusKey(campaign.status);
  return !isInvalidCampaignStatus(status) && !isPlanningOnlyStatus(status);
}

function isPlannedCampaign(campaign: PetyrCampaignDetail, year: number, today: Date) {
  const endDate = parseDate(campaign.endDate);
  if (!endDate || endDate.getFullYear() !== year) return false;

  const campaignDate = startOfLocalDay(endDate);
  const tomorrow = startOfLocalDay(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yearEnd = new Date(year, 11, 31);

  if (campaignDate.getTime() < tomorrow.getTime() || campaignDate.getTime() > yearEnd.getTime()) return false;

  const status = campaignStatusKey(campaign.status);
  return status === "setup" || status === "recruiting" || status === "running";
}

function summarizeRevenueAndPlanned(detail: PetyrCompanyDetail, year: number, today: Date) {
  const byBusinessUnit = new Map<PetyrBusinessUnit, { revenue: number; planned: number }>();

  for (const businessUnit of PETYR_BUSINESS_UNITS) {
    byBusinessUnit.set(businessUnit, { revenue: 0, planned: 0 });
  }

  for (const campaign of detail.campaigns) {
    const businessUnit = normalizePetyrBusinessUnit(campaign.businessUnit).businessUnit;
    const bucket = byBusinessUnit.get(businessUnit) ?? byBusinessUnit.get("Other");
    if (!bucket) continue;

    if (isRevenueCampaign(campaign, year, today)) {
      bucket.revenue += campaign.revenue;
    } else if (isPlannedCampaign(campaign, year, today)) {
      bucket.planned += campaign.revenue;
    }
  }

  return byBusinessUnit;
}

function latestAnnualAiForecasts(detail: PetyrCompanyDetail, year: number) {
  const byBusinessUnit = new Map<PetyrBusinessUnit, { value: number; confidenceScores: number[]; modelVersion: string | null; generatedAt: string | null }>();

  for (const businessUnit of PETYR_BUSINESS_UNITS) {
    byBusinessUnit.set(businessUnit, {
      value: 0,
      confidenceScores: [],
      modelVersion: null,
      generatedAt: null
    });
  }

  for (const row of detail.aiForecasts) {
    if (row.year !== year) continue;
    const businessUnit = normalizePetyrBusinessUnit(row.businessUnit).businessUnit;
    const bucket = byBusinessUnit.get(businessUnit);
    if (!bucket) continue;

    bucket.value += row.forecastValue;
    if (row.confidenceScore !== null) bucket.confidenceScores.push(row.confidenceScore);
    bucket.modelVersion = row.modelVersion;
    bucket.generatedAt = row.generatedAt;
  }

  return byBusinessUnit;
}

function confidenceAverage(values: number[]) {
  if (values.length === 0) return null;
  return roundMoney(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function sortAnnualCompanies(companies: AnnualForecastEntryBatchCompany[]) {
  const bucketRank: Record<AnnualForecastEntryBatchCompany["orderingBucket"], number> = {
    active: 0,
    inactive_with_revenue_or_planned: 1,
    inactive_empty: 2
  };

  return [...companies].sort(
    (left, right) =>
      bucketRank[left.orderingBucket] - bucketRank[right.orderingBucket] ||
      right.revenue + right.planned - (left.revenue + left.planned) ||
      left.companyName.localeCompare(right.companyName)
  );
}

function buildAnnualCompany(input: {
  company: CompanyOption;
  portfolio: PetyrAnnualForecastEntryPortfolioCompany;
  entry: {
    initialForecast: Prisma.Decimal | null;
    ongoingConfidence: string | null;
  } | null;
  annualRows: Map<PetyrBusinessUnit, { value: Prisma.Decimal; initialForecast: Prisma.Decimal | null; valueSource: string; updatedAt: Date }>;
}): AnnualForecastEntryBatchCompany {
  const businessUnits = PETYR_BUSINESS_UNITS.map<AnnualForecastEntryBatchCell>((businessUnit) => {
    const saved = input.annualRows.get(businessUnit);
    const ai = input.portfolio.annualAiForecastsByBusinessUnit.get(businessUnit);

    return {
      businessUnit,
      savedForecast: {
        value: decimalToNumber(saved?.value),
        valueSource: saved?.valueSource === "ai_confirmed" ? "ai_confirmed" : saved ? "manual" : null,
        hasSavedValue: Boolean(saved),
        updatedAt: saved?.updatedAt.toISOString() ?? null
      },
      aiForecast: {
        value: ai && ai.value > 0 ? roundMoney(ai.value) : null,
        confidenceScore: confidenceAverage(ai?.confidenceScores ?? []),
        modelVersion: ai?.modelVersion ?? null,
        generatedAt: ai?.generatedAt ?? null
      }
    };
  });
  const fcOngoing = roundMoney(calculateAnnualForecastOngoing(businessUnits.map((cell) => cell.savedForecast.value)));
  const initialForecastFromBusinessUnits = [...input.annualRows.values()].reduce(
    (sum, row) => row.initialForecast ? sum + (decimalToNumber(row.initialForecast) ?? 0) : sum,
    0
  );
  const initialForecastBusinessUnitRows = [...input.annualRows.values()].filter((row) => row.initialForecast !== null).length;
  const revenue = roundMoney([...input.portfolio.revenueByBusinessUnit.values()].reduce((sum, value) => sum + value, 0));
  const planned = roundMoney([...input.portfolio.plannedByBusinessUnit.values()].reduce((sum, value) => sum + value, 0));
  const percentages = calculateAnnualForecastPercentages({ revenue, planned, fcOngoing });
  const isForecastActive = input.portfolio.companyStatus?.isActive ?? input.company.isForecastActive ?? true;
  const orderingBucket = isForecastActive
    ? "active"
    : revenue > 0 || planned > 0
      ? "inactive_with_revenue_or_planned"
      : "inactive_empty";

  return {
    companyName: input.portfolio.companyName || input.company.companyName,
    csmName: input.portfolio.csmName || input.company.csmName || "Unassigned",
    isForecastActive,
    initialForecast: decimalToNumber(input.entry?.initialForecast) ?? (initialForecastBusinessUnitRows > 0 ? roundMoney(initialForecastFromBusinessUnits) : null),
    ongoingConfidence: isPetyrAnnualConfidence(input.entry?.ongoingConfidence ?? "") ? input.entry?.ongoingConfidence as PetyrAnnualConfidence : null,
    fcOngoing,
    revenue,
    planned,
    revenuePct: percentages.revenuePct,
    plannedPct: percentages.plannedPct,
    uncoveredPct: percentages.uncoveredPct,
    orderingBucket,
    businessUnits
  };
}

export async function getAnnualForecastEntryBatch(
  input: AnnualForecastEntryBatchQuery = {}
): Promise<AnnualForecastEntryBatchDataResult> {
  const today = new Date();
  const selectedYear = parseYear(input.year, today);
  const initialWindowOverrides = await getPetyrInitialForecastWindowOverridesWithDiagnostics();
  const initialWindowOverrideToken = [
    initialWindowOverrides.overrides.updatedAt ?? "default",
    initialWindowOverrides.overrides.unlockedYears.join(",")
  ].join("|");
  const finishPerformance = startPetyrPerformanceTimer("getAnnualForecastEntryBatch", {
    year: selectedYear,
    warmup: asString(input.warmup) === "1" || input.warmup === true
  });

  try {
    const cached = await getForecastEntryCachedRead(annualCacheKey(input, selectedYear, initialWindowOverrideToken), async () => {
      const diagnostics: string[] = [...initialWindowOverrides.diagnostics];
      const scopedPortfolio = await getAnnualForecastEntryScopedPortfolio({
        csmName: input.csmName,
        preferredCsmName: input.preferredCsmName,
        year: selectedYear
      });
      let selectedCsm: string;
      let csmOptions: string[];
      let scopedCompanies: CompanyOption[];
      let portfolioData: Map<string, PetyrAnnualForecastEntryPortfolioCompany>;
      let fallback = false;
      let scopedRowsCount = 0;

      if (scopedPortfolio) {
        diagnostics.push(...scopedPortfolio.diagnostics);
        selectedCsm = scopedPortfolio.selectedCsm;
        csmOptions = scopedPortfolio.csmOptions;
        scopedCompanies = scopedPortfolio.companies;
        portfolioData = scopedPortfolio.portfolio;
        scopedRowsCount = scopedPortfolio.scopedRowsCount;
      } else {
        fallback = true;
        const companiesResult = await getForecastEntryCompanies();
        diagnostics.push(...companiesResult.diagnostics);

        const companies = toCompanyOptions(companiesResult.data);
        const selection = selectCsm(input, companies);
        selectedCsm = selection.selectedCsm;
        csmOptions = selection.csmOptions;
        const selectedCsmKey = normalizeKey(selectedCsm);
        scopedCompanies = companies.filter((company) => normalizeKey(company.csmName || "Unassigned") === selectedCsmKey);
        const portfolioResult = await getAnnualForecastEntryPortfolioCompanies({ companies: scopedCompanies, year: selectedYear });
        diagnostics.push(...portfolioResult.diagnostics);
        portfolioData = portfolioResult.data;
      }

      const scopedCompanyNames = scopedCompanies.map((company) => company.companyName);
      const [annualTableExists, entryTableExists] = await Promise.all([
        relationExists("forecast_annual"),
        relationExists("forecast_annual_entry")
      ]);
      const [annualRows, entryRows] = await Promise.all([
        annualTableExists && scopedCompanyNames.length > 0
          ? prisma.forecastAnnual.findMany({ where: { companyName: { in: scopedCompanyNames }, year: selectedYear } })
          : Promise.resolve([]),
        entryTableExists && scopedCompanyNames.length > 0
          ? prisma.forecastAnnualEntry.findMany({ where: { companyName: { in: scopedCompanyNames }, year: selectedYear } })
          : Promise.resolve([])
      ]);

      if (!annualTableExists) {
        diagnostics.push("forecast_annual is missing. Apply the forecasting app Prisma schema before Petyr can read annual BU forecasts.");
      }
      if (!entryTableExists) {
        diagnostics.push("forecast_annual_entry is missing. Run Petyr schema sync before FC Initial and Confidence can be loaded.");
      }

      const annualRowsByCompany = new Map<string, Map<PetyrBusinessUnit, { value: Prisma.Decimal; initialForecast: Prisma.Decimal | null; valueSource: string; updatedAt: Date }>>();
      for (const row of annualRows) {
        const businessUnit = normalizeBusinessUnit(row.businessUnit);
        if (!businessUnit) continue;
        const companyKey = normalizeKey(row.companyName);
        const byBusinessUnit = annualRowsByCompany.get(companyKey) ?? new Map();
        byBusinessUnit.set(businessUnit, {
          value: row.value,
          initialForecast: row.initialForecast,
          valueSource: row.valueSource,
          updatedAt: row.updatedAt
        });
        annualRowsByCompany.set(companyKey, byBusinessUnit);
      }

      const entriesByCompany = new Map(entryRows.map((row) => [normalizeKey(row.companyName), row]));
      const batchCompanies = scopedCompanies.map((company) => {
        const companyKey = normalizeKey(company.companyName);
        const portfolio = portfolioData.get(companyKey) ?? {
          companyName: company.companyName,
          csmName: company.csmName || "Unassigned",
          companyStatus: null,
          revenueByBusinessUnit: new Map<string, number>(PETYR_BUSINESS_UNITS.map((businessUnit) => [businessUnit, 0])),
          plannedByBusinessUnit: new Map<string, number>(PETYR_BUSINESS_UNITS.map((businessUnit) => [businessUnit, 0])),
          annualAiForecastsByBusinessUnit: new Map<string, { value: number; confidenceScores: number[]; modelVersion: string | null; generatedAt: string | null }>(
            PETYR_BUSINESS_UNITS.map((businessUnit) => [
              businessUnit,
              { value: 0, confidenceScores: [], modelVersion: null, generatedAt: null }
            ])
          )
        } satisfies PetyrAnnualForecastEntryPortfolioCompany;

        return buildAnnualCompany({
          company,
          portfolio,
          entry: entriesByCompany.get(companyKey) ?? null,
          annualRows: annualRowsByCompany.get(companyKey) ?? new Map()
        });
      });

      return {
        result: {
          source: "postgresql",
          diagnostics: uniqueDiagnostics(diagnostics),
          data: {
            selectedCsm,
            csmOptions,
            selectedYear,
            defaultYear: getAnnualForecastEntryDefaultYear(today),
            yearOptions: getAnnualForecastEntryYearOptions(today),
            initialMode: getAnnualForecastEntryInitialMode(selectedYear, today, {
              adminUnlocked: isInitialForecastYearAdminUnlocked(initialWindowOverrides.overrides, selectedYear)
            }),
            businessUnits: [...PETYR_BUSINESS_UNITS],
            confidenceOptions: ["01 High", "02 Mid", "03 Low"],
            companies: sortAnnualCompanies(batchCompanies)
          }
        } satisfies AnnualForecastEntryBatchDataResult,
        meta: {
          fallback,
          companiesCount: batchCompanies.length,
          scopedRowsCount,
          annualRows: annualRows.length,
          entryRows: entryRows.length
        }
      };
    });

    finishPerformance({
      status: "success",
      rowCount: cached.value.result.data.companies.length,
      companiesCount: cached.value.result.data.companies.length,
      annualRows: cached.value.meta.annualRows,
      entryRows: cached.value.meta.entryRows,
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

function validateAnnualValues(values: unknown) {
  if (!Array.isArray(values)) return [];

  const byBusinessUnit = new Map<PetyrBusinessUnit, ValidatedAnnualBuValue>();

  for (const rawValue of values) {
    const row = rawValue as { businessUnit?: unknown; value?: unknown; sourceState?: unknown };
    const businessUnit = normalizeBusinessUnit(row.businessUnit);
    if (!businessUnit || !BUSINESS_UNITS.has(businessUnit)) {
      throw new AnnualForecastEntryBatchError("Annual Forecast Entry save contains an unknown Business Unit.", 400);
    }
    if (byBusinessUnit.has(businessUnit)) {
      throw new AnnualForecastEntryBatchError(`Annual Forecast Entry save contains duplicate values for ${businessUnit}.`, 400);
    }

    const value = parseMoney(row.value);
    if (!value) {
      throw new AnnualForecastEntryBatchError(`Annual forecast value for ${businessUnit} must be numeric and greater than or equal to 0.`, 400);
    }

    const sourceState = asString(row.sourceState);
    if (!SOURCE_STATES.has(sourceState)) {
      throw new AnnualForecastEntryBatchError(`Annual forecast value for ${businessUnit} requires sourceState accepted_ai or manual_edit.`, 400);
    }

    byBusinessUnit.set(businessUnit, {
      businessUnit,
      value,
      valueSource: sourceState === "accepted_ai" ? "ai_confirmed" : "manual",
      submittedSourceState: sourceState as "accepted_ai" | "manual_edit"
    });
  }

  return [...byBusinessUnit.values()];
}

function validateUpdates(updates: unknown): ValidatedAnnualUpdate[] {
  if (!Array.isArray(updates)) {
    throw new AnnualForecastEntryBatchError("Annual Forecast Entry save requires an updates array.", 400);
  }

  return updates.map((rawUpdate) => {
    const update = rawUpdate as {
      companyName?: unknown;
      activeStatus?: unknown;
      initialForecast?: unknown;
      confidence?: unknown;
      values?: unknown;
    };
    const companyName = asString(update.companyName);
    if (!companyName) {
      throw new AnnualForecastEntryBatchError("Each Annual Forecast Entry update requires companyName.", 400);
    }

    const activeStatus = typeof update.activeStatus === "boolean" ? update.activeStatus : null;
    const initialForecast =
      Object.prototype.hasOwnProperty.call(update, "initialForecast") ? parseMoney(update.initialForecast) : null;
    if (Object.prototype.hasOwnProperty.call(update, "initialForecast") && !initialForecast) {
      throw new AnnualForecastEntryBatchError(`${companyName}: Forecast Initial must be numeric and greater than or equal to 0.`, 400);
    }

    const confidenceValue = asString(update.confidence);
    const confidence = confidenceValue ? confidenceValue : null;
    if (confidence !== null && !isPetyrAnnualConfidence(confidence)) {
      throw new AnnualForecastEntryBatchError(`${companyName}: Confidence must be 01 High, 02 Mid or 03 Low.`, 400);
    }

    return {
      companyName,
      activeStatus,
      initialForecast,
      confidence,
      values: validateAnnualValues(update.values)
    };
  });
}

function hasDecimalChanged(existingValue: Prisma.Decimal | null | undefined, nextValue: Prisma.Decimal | null) {
  if (nextValue === null) return false;
  return !existingValue || !existingValue.equals(nextValue);
}

function formatForecastLogValue(value: Prisma.Decimal | null | undefined, source: string | null | undefined) {
  const amount = decimalToLogValue(value);
  if (amount === null) return null;
  return source ? `${amount} (${source})` : amount;
}

function statusLogValue(value: boolean | null | undefined) {
  if (value === null || value === undefined) return null;
  return value ? "active" : "inactive";
}

function activeStatusFromDetail(detail: PetyrCompanyDetail, fallback: boolean | null) {
  return detail.companyStatus?.isActive ?? fallback ?? true;
}

function currentAnnualForecastByBusinessUnit(detail: PetyrCompanyDetail) {
  const byBusinessUnit = new Map<PetyrBusinessUnit, { value: Prisma.Decimal | null; initialForecast: Prisma.Decimal | null; source: string | null }>();

  for (const row of detail.annualForecasts) {
    const businessUnit = normalizeBusinessUnit(row.businessUnit);
    if (!businessUnit) continue;
    byBusinessUnit.set(businessUnit, {
      value: new Prisma.Decimal(row.value),
      initialForecast: null,
      source: null
    });
  }

  return byBusinessUnit;
}

function annualAiForecastByBusinessUnit(detail: PetyrCompanyDetail, year: number) {
  const annual = latestAnnualAiForecasts(detail, year);
  const byBusinessUnit = new Map<PetyrBusinessUnit, Prisma.Decimal | null>();

  for (const [businessUnit, row] of annual.entries()) {
    byBusinessUnit.set(businessUnit, row.value > 0 ? new Prisma.Decimal(roundMoney(row.value)) : null);
  }

  return byBusinessUnit;
}

export async function saveAnnualForecastEntryBatch(
  input: AnnualForecastEntryBatchSaveInput
): Promise<AnnualForecastEntryBatchSaveResult> {
  const currentDate = new Date();
  const year = requireYear(input.year, currentDate);
  const initialWindowOverrides = await getPetyrInitialForecastWindowOverridesWithDiagnostics();
  const initialMode = getAnnualForecastEntryInitialMode(year, currentDate, {
    adminUnlocked: isInitialForecastYearAdminUnlocked(initialWindowOverrides.overrides, year)
  });
  const csmName = asString(input.csmName);
  if (!csmName) {
    throw new AnnualForecastEntryBatchError("csmName is required.", 400);
  }

  const updates = validateUpdates(input.updates);
  const createdBy = asString(input.createdBy) || csmName || SAVE_USER_FALLBACK;

  const companiesResult = await getForecastEntryCompanies();
  const companyOptions = toCompanyOptions(companiesResult.data);
  const companyOptionsByKey = new Map(companyOptions.map((company) => [normalizeKey(company.companyName), company]));
  const detailsByKey = new Map<string, PetyrCompanyDetail>();

  for (const update of updates) {
    const option = companyOptionsByKey.get(normalizeKey(update.companyName));
    if (!option) {
      throw new AnnualForecastEntryBatchError(`${update.companyName} is not available in Forecast Entry customer portfolio.`, 400);
    }
    if (normalizeKey(option.csmName || "Unassigned") !== normalizeKey(csmName)) {
      throw new AnnualForecastEntryBatchError(`${update.companyName} is not assigned to selected CSM ${csmName}.`, 400);
    }

    const detail = await getCompanyDetail(option.companyName, year);
    detailsByKey.set(normalizeKey(option.companyName), detail.data);
  }

  const written = await prisma.$transaction(async (tx) => {
    let forecastUpserts = 0;
    let metadataUpserts = 0;
    let activeStatusUpdates = 0;
    let changeLogRows = 0;
    const saveSessionIds: string[] = [];

    for (const update of updates) {
      const option = companyOptionsByKey.get(normalizeKey(update.companyName));
      const detail = option ? detailsByKey.get(normalizeKey(option.companyName)) : null;
      if (!option || !detail) continue;

      const resolvedCompanyName = detail.overview?.companyName ?? option.companyName;
      const resolvedCsmName = detail.overview?.csmName ?? option.csmName ?? csmName ?? "Unassigned";
      const existingEntry = await tx.forecastAnnualEntry.findUnique({
        where: { companyName_year: { companyName: resolvedCompanyName, year } }
      });
      const currentActiveStatus = activeStatusFromDetail(detail, option.isForecastActive);
      const nextActiveStatus = update.activeStatus ?? currentActiveStatus;
      const activeChanged = update.activeStatus !== null && update.activeStatus !== currentActiveStatus;
      const confidenceChanged = update.confidence !== null && update.confidence !== existingEntry?.ongoingConfidence;

      if (update.initialForecast !== null && !initialMode.editable && hasDecimalChanged(existingEntry?.initialForecast, update.initialForecast)) {
        throw new AnnualForecastEntryBatchError(`${resolvedCompanyName}: ${initialMode.reason}`, 423);
      }

      const annualByBusinessUnit = new Map<PetyrBusinessUnit, { value: Prisma.Decimal | null; initialForecast: Prisma.Decimal | null; source: string | null }>();
      const rows = await tx.forecastAnnual.findMany({
        where: {
          companyName: { equals: resolvedCompanyName, mode: "insensitive" },
          year
        }
      });
      for (const row of rows) {
        const businessUnit = normalizeBusinessUnit(row.businessUnit);
        if (!businessUnit) continue;
        annualByBusinessUnit.set(businessUnit, { value: row.value, initialForecast: row.initialForecast, source: row.valueSource });
      }
      for (const [businessUnit, row] of currentAnnualForecastByBusinessUnit(detail).entries()) {
        if (!annualByBusinessUnit.has(businessUnit)) annualByBusinessUnit.set(businessUnit, row);
      }

      const aiForecasts = annualAiForecastByBusinessUnit(detail, year);
      const changedValues = update.values.filter((row) => {
        const existing = annualByBusinessUnit.get(row.businessUnit);
        return hasDecimalChanged(existing?.value, row.value) || existing?.source !== row.valueSource;
      });
      const effectiveInitialForecast = (() => {
        if (!initialMode.editable) return update.initialForecast;

        const initialValuesByBusinessUnit = new Map<PetyrBusinessUnit, Prisma.Decimal>();
        for (const [businessUnit, row] of annualByBusinessUnit.entries()) {
          const initialValue = row.initialForecast ?? row.value;
          if (initialValue) initialValuesByBusinessUnit.set(businessUnit, initialValue);
        }
        for (const row of changedValues) {
          initialValuesByBusinessUnit.set(row.businessUnit, row.value);
        }
        if (initialValuesByBusinessUnit.size === 0) return update.initialForecast;

        return [...initialValuesByBusinessUnit.values()].reduce((sum, value) => sum.plus(value), new Prisma.Decimal(0));
      })();
      const initialChanged = hasDecimalChanged(existingEntry?.initialForecast, effectiveInitialForecast);

      const rowModified = activeChanged || initialChanged || changedValues.length > 0;
      if (rowModified && update.confidence === null && !existingEntry?.ongoingConfidence) {
        throw new AnnualForecastEntryBatchError(`${resolvedCompanyName}: Confidence is required on modified annual rows.`, 400);
      }

      if (!rowModified && !confidenceChanged) continue;

      const saveSession = await tx.forecastSaveSession.create({
        data: {
          companyName: resolvedCompanyName,
          csmName: resolvedCsmName,
          source: SAVE_SOURCE,
          year,
          month: 0,
          forecastType: "ongoing",
          note: update.confidence ? `Annual confidence: ${update.confidence}` : null,
          companyActiveStatus: nextActiveStatus,
          createdBy
        }
      });
      saveSessionIds.push(saveSession.id);

      if (activeChanged) {
        await tx.companyForecastStatus.upsert({
          where: { companyName: resolvedCompanyName },
          create: {
            companyName: resolvedCompanyName,
            isActive: nextActiveStatus,
            reason: "Annual Forecast Entry",
            updatedBy: createdBy
          },
          update: {
            isActive: nextActiveStatus,
            reason: "Annual Forecast Entry",
            updatedBy: createdBy
          }
        });
        activeStatusUpdates += 1;

        await tx.forecastChangeLog.create({
          data: {
            saveSessionId: saveSession.id,
            companyName: resolvedCompanyName,
            businessUnit: COMPANY_FIELD_BUSINESS_UNIT,
            fieldName: "active_status",
            previousValue: statusLogValue(currentActiveStatus),
            newValue: statusLogValue(nextActiveStatus),
            createdBy
          }
        });
        changeLogRows += 1;
      }

      if (initialChanged || confidenceChanged) {
        await tx.forecastAnnualEntry.upsert({
          where: { companyName_year: { companyName: resolvedCompanyName, year } },
          create: {
            companyName: resolvedCompanyName,
            csmName: resolvedCsmName,
            year,
            initialForecast: effectiveInitialForecast,
            ongoingConfidence: update.confidence ?? existingEntry?.ongoingConfidence ?? null,
            createdBy,
            updatedBy: createdBy
          },
          update: {
            csmName: resolvedCsmName,
            initialForecast: initialChanged ? effectiveInitialForecast : existingEntry?.initialForecast ?? null,
            ongoingConfidence: update.confidence ?? existingEntry?.ongoingConfidence ?? null,
            updatedBy: createdBy
          }
        });
        metadataUpserts += 1;
      }

      if (initialChanged) {
        await tx.forecastChangeLog.create({
          data: {
            saveSessionId: saveSession.id,
            companyName: resolvedCompanyName,
            businessUnit: COMPANY_FIELD_BUSINESS_UNIT,
            fieldName: "annual_initial_forecast",
            previousValue: decimalToLogValue(existingEntry?.initialForecast),
            newValue: decimalToLogValue(effectiveInitialForecast),
            createdBy
          }
        });
        changeLogRows += 1;
      }

      if (confidenceChanged) {
        await tx.forecastChangeLog.create({
          data: {
            saveSessionId: saveSession.id,
            companyName: resolvedCompanyName,
            businessUnit: COMPANY_FIELD_BUSINESS_UNIT,
            fieldName: "annual_ongoing_confidence",
            previousValue: existingEntry?.ongoingConfidence ?? null,
            newValue: update.confidence,
            createdBy
          }
        });
        changeLogRows += 1;
      }

      for (const row of changedValues) {
        const where = {
          companyName_businessUnit_year: {
            companyName: resolvedCompanyName,
            businessUnit: row.businessUnit,
            year
          }
        };
        const existing = annualByBusinessUnit.get(row.businessUnit);

        await tx.forecastAnnual.upsert({
          where,
          create: {
            companyName: resolvedCompanyName,
            csmName: resolvedCsmName,
            businessUnit: row.businessUnit,
            year,
            value: row.value,
            initialForecast: initialMode.editable ? row.value : null,
            aiForecastValue: aiForecasts.get(row.businessUnit) ?? null,
            valueSource: row.valueSource,
            status: "draft",
            note: null,
            createdBy,
            updatedBy: createdBy
          },
          update: {
            csmName: resolvedCsmName,
            value: row.value,
            ...(initialMode.editable ? { initialForecast: row.value } : {}),
            aiForecastValue: aiForecasts.get(row.businessUnit) ?? null,
            valueSource: row.valueSource,
            status: "draft",
            updatedBy: createdBy
          }
        });
        forecastUpserts += 1;

        await tx.forecastChangeLog.create({
          data: {
            saveSessionId: saveSession.id,
            companyName: resolvedCompanyName,
            businessUnit: row.businessUnit,
            fieldName: "annual_forecast",
            previousValue: formatForecastLogValue(existing?.value, existing?.source),
            newValue: formatForecastLogValue(row.value, row.valueSource),
            aiForecastValueAtSave: aiForecasts.get(row.businessUnit) ?? null,
            createdBy
          }
        });
        changeLogRows += 1;
      }
    }

    return {
      forecastUpserts,
      metadataUpserts,
      activeStatusUpdates,
      changeLogRows,
      saveSessionIds
    };
  });

  invalidateForecastEntryReadCache((key) => key.startsWith("monthly:") || key.startsWith("annual:") || key.startsWith("overview:"));

  return {
    ok: true,
    forecastUpserts: written.forecastUpserts,
    metadataUpserts: written.metadataUpserts,
    activeStatusUpdates: written.activeStatusUpdates,
    changeLogRows: written.changeLogRows,
    saveSessionIds: written.saveSessionIds,
    companiesSaved: written.saveSessionIds.length,
    noChanges: written.saveSessionIds.length === 0,
    batch: await getAnnualForecastEntryBatch({ csmName, year })
  };
}
