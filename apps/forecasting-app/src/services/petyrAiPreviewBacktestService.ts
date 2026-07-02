import { getRedashPetyrSourceMapping } from "@/config/redashFieldMapping";
import { prisma } from "@/lib/db";
import {
  PETYR_BUSINESS_UNITS,
  normalizePetyrBusinessUnit,
  type PetyrBusinessUnit
} from "@/lib/petyr/constants";
import { buildCompanyBuForecastSignals } from "@/services/petyrAiForecastStrategyService";

const SAFE_IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;
export const PETYR_AI_PREVIEW_BACKTEST_DEFAULT_AS_OF = "2026-03-15";
export const PETYR_AI_PREVIEW_BACKTEST_DEFAULT_YEAR = 2026;
export const PETYR_AI_PREVIEW_BACKTEST_DEFAULT_MONTHS = [5, 6] as const;
export const PETYR_AI_PREVIEW_BACKTEST_DEFAULT_LIMIT = 10;

const CAMPAIGN_SOURCE = getRedashPetyrSourceMapping("master_campaigns");
const CAMPAIGN_TABLE = CAMPAIGN_SOURCE.tableName;
const CAMPAIGN_COLUMNS = {
  companyName: CAMPAIGN_SOURCE.fields.companyName.dbColumnName ?? "company_name",
  businessUnit: CAMPAIGN_SOURCE.fields.businessUnit.dbColumnName ?? "budget_group",
  revenue: CAMPAIGN_SOURCE.fields.campaignValue.dbColumnName ?? "campaign_value",
  status: CAMPAIGN_SOURCE.fields.campaignStatus.dbColumnName ?? "status",
  endDate: CAMPAIGN_SOURCE.fields.campaignEndDate.dbColumnName ?? "end_date",
  startDate: CAMPAIGN_SOURCE.fields.campaignStartDate.dbColumnName ?? "start_date"
};
const INVALID_CAMPAIGN_STATUS_TOKENS = [
  "abort",
  "cancel",
  "cancell",
  "annull",
  "delete",
  "deleted",
  "void",
  "lost",
  "reject",
  "archive",
  "archiv",
  "invalid"
];
const PLANNING_ONLY_STATUS_TOKENS = [
  "draft",
  "planned",
  "planning",
  "pipeline",
  "tentative",
  "proposed",
  "setup",
  "recruiting"
];

type CampaignRow = {
  companyName: string | null;
  businessUnit: string | null;
  revenueValue: string | null;
  campaignStatus: string | null;
  endDate: string | null;
  startDate: string | null;
};

type ActualRevenueRow = {
  companyName: string;
  businessUnit: PetyrBusinessUnit;
  month: number;
  actualRevenue: number;
};

export type PetyrAiPreviewBacktestRequest = {
  asOf?: string | Date | null;
  year?: number | null;
  months?: number[] | readonly number[] | null;
  selection?: "top_revenue" | null;
  limit?: number | null;
};

export type PetyrAiPreviewBacktestSelectedCompany = {
  rank: number;
  companyName: string;
  closedRevenueThroughAsOf: number;
};

export type PetyrAiPreviewBacktestRow = {
  companyName: string;
  businessUnit: PetyrBusinessUnit;
  year: number;
  month: number;
  predictedValue: number;
  actualClosedRevenue: number;
  absoluteError: number;
  percentageError: number | null;
};

export type PetyrAiPreviewBacktestAggregate = {
  scope: string;
  month: number | null;
  rows: number;
  predictedValue: number;
  actualClosedRevenue: number;
  absoluteError: number;
  percentageError: number | null;
};

export type PetyrAiPreviewBacktestResult = {
  ok: true;
  source: "postgresql";
  mode: "read-only";
  selection: "top_revenue";
  asOf: string;
  year: number;
  months: number[];
  limit: number;
  durationMs: number;
  selectedCompanies: PetyrAiPreviewBacktestSelectedCompany[];
  rows: PetyrAiPreviewBacktestRow[];
  monthlyAggregates: PetyrAiPreviewBacktestAggregate[];
  totalAggregate: PetyrAiPreviewBacktestAggregate;
  diagnostics: string[];
};

function parseDate(value: string | Date | null | undefined) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error("Invalid as-of date.");
    return value;
  }

  const rawValue = value?.trim() || PETYR_AI_PREVIEW_BACKTEST_DEFAULT_AS_OF;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawValue);
  if (!match) throw new Error(`Invalid as-of date "${rawValue}". Use YYYY-MM-DD.`);

  const [, year, month, day] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid as-of date "${rawValue}". Use YYYY-MM-DD.`);
  return parsed;
}

function toIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeMonths(value: number[] | readonly number[] | null | undefined) {
  const input = value && value.length > 0 ? value : PETYR_AI_PREVIEW_BACKTEST_DEFAULT_MONTHS;
  const months = input
    .map((month) => Number(month))
    .filter((month) => Number.isInteger(month) && month >= 1 && month <= 12);

  if (months.length === 0) throw new Error("At least one valid backtest month is required.");
  return [...new Set(months)].sort((left, right) => left - right);
}

function normalizeYear(value: number | null | undefined) {
  const year = value ?? PETYR_AI_PREVIEW_BACKTEST_DEFAULT_YEAR;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error("Backtest year must be an integer between 2000 and 2100.");
  return year;
}

function normalizeLimit(value: number | null | undefined) {
  const limit = value ?? PETYR_AI_PREVIEW_BACKTEST_DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Backtest limit must be an integer between 1 and 100.");
  return limit;
}

function sqlIdentifier(identifier: string) {
  if (!SAFE_IDENTIFIER_PATTERN.test(identifier)) throw new Error(`Unsafe PostgreSQL identifier: ${identifier}`);
  return `"${identifier}"`;
}

function normalizeKey(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function parseNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  let normalized = String(value).trim();
  if (!normalized) return 0;

  const negative = normalized.startsWith("(") && normalized.endsWith(")");
  normalized = normalized.replace(/[^\d,.\-]/g, "");

  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot
      ? normalized.replace(/\./g, "").replace(",", ".")
      : normalized.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const fractionalLength = normalized.length - lastComma - 1;
    normalized = fractionalLength === 3 ? normalized.replace(/,/g, "") : normalized.replace(",", ".");
  } else if (lastDot >= 0) {
    const fractionalLength = normalized.length - lastDot - 1;
    if (fractionalLength === 3) normalized = normalized.replace(/\./g, "");
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return 0;
  return negative ? -parsed : parsed;
}

function parseCampaignDate(row: CampaignRow) {
  const value = row.endDate || row.startDate;
  if (!value) return null;

  const timestamp = Date.parse(value);
  if (!Number.isNaN(timestamp)) return new Date(timestamp);

  const europeanMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value.trim());
  if (!europeanMatch) return null;

  const [, day, month, year] = europeanMatch;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function isClosedRevenueCampaign(row: CampaignRow, currentDate: Date) {
  const status = normalizeKey(row.campaignStatus);
  const date = parseCampaignDate(row);

  if (!date) return false;
  if (INVALID_CAMPAIGN_STATUS_TOKENS.some((token) => status.includes(token))) return false;
  if (PLANNING_ONLY_STATUS_TOKENS.some((token) => status.includes(token))) return false;

  return startOfLocalDay(date).getTime() <= startOfLocalDay(currentDate).getTime();
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

async function relationExists(relationName: string) {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT to_regclass(${relationName}) IS NOT NULL AS "exists"
  `;
  return rows[0]?.exists ?? false;
}

async function readCampaignRows(): Promise<CampaignRow[]> {
  if (!(await relationExists(CAMPAIGN_TABLE))) {
    throw new Error(`${CAMPAIGN_TABLE} is missing. Run Redash sync before this backtest.`);
  }

  const sql = `
    SELECT
      NULLIF(BTRIM(${sqlIdentifier(CAMPAIGN_COLUMNS.companyName)}::text), '') AS "companyName",
      NULLIF(BTRIM(${sqlIdentifier(CAMPAIGN_COLUMNS.businessUnit)}::text), '') AS "businessUnit",
      ${sqlIdentifier(CAMPAIGN_COLUMNS.revenue)}::text AS "revenueValue",
      NULLIF(BTRIM(${sqlIdentifier(CAMPAIGN_COLUMNS.status)}::text), '') AS "campaignStatus",
      ${sqlIdentifier(CAMPAIGN_COLUMNS.endDate)}::text AS "endDate",
      ${sqlIdentifier(CAMPAIGN_COLUMNS.startDate)}::text AS "startDate"
    FROM ${sqlIdentifier(CAMPAIGN_TABLE)}
    WHERE NULLIF(BTRIM(${sqlIdentifier(CAMPAIGN_COLUMNS.companyName)}::text), '') IS NOT NULL
  `;

  return prisma.$queryRawUnsafe<CampaignRow[]>(sql);
}

function selectTopRevenueCompanies(rows: CampaignRow[], year: number, asOf: Date, limit: number) {
  const totals = new Map<string, { companyName: string; revenue: number }>();

  for (const row of rows) {
    if (!row.companyName || !isClosedRevenueCampaign(row, asOf)) continue;

    const date = parseCampaignDate(row);
    if (!date || date.getFullYear() !== year) continue;

    const key = normalizeKey(row.companyName);
    const existing = totals.get(key) ?? { companyName: row.companyName.trim(), revenue: 0 };
    existing.revenue = roundMoney(existing.revenue + parseNumber(row.revenueValue));
    totals.set(key, existing);
  }

  return [...totals.values()]
    .filter((row) => row.revenue > 0)
    .sort((left, right) => right.revenue - left.revenue || left.companyName.localeCompare(right.companyName))
    .slice(0, limit)
    .map<PetyrAiPreviewBacktestSelectedCompany>((row, index) => ({
      rank: index + 1,
      companyName: row.companyName,
      closedRevenueThroughAsOf: row.revenue
    }));
}

function aggregateActualRevenue(rows: CampaignRow[], year: number, months: number[]) {
  const selectedMonths = new Set(months);
  const actuals = new Map<string, ActualRevenueRow>();

  for (const row of rows) {
    if (!row.companyName || !isClosedRevenueCampaign(row, new Date())) continue;

    const date = parseCampaignDate(row);
    if (!date || date.getFullYear() !== year || !selectedMonths.has(date.getMonth() + 1)) continue;

    const businessUnit = normalizePetyrBusinessUnit(row.businessUnit).businessUnit;
    const key = actualKey(row.companyName, businessUnit, date.getMonth() + 1);
    const existing = actuals.get(key) ?? {
      companyName: row.companyName.trim(),
      businessUnit,
      month: date.getMonth() + 1,
      actualRevenue: 0
    };
    existing.actualRevenue = roundMoney(existing.actualRevenue + parseNumber(row.revenueValue));
    actuals.set(key, existing);
  }

  return actuals;
}

function actualKey(companyName: string, businessUnit: PetyrBusinessUnit, month: number) {
  return [normalizeKey(companyName), businessUnit, month].join("\u0000");
}

function toReportRow(companyName: string, businessUnit: PetyrBusinessUnit, year: number, month: number, predicted: number, actual: number): PetyrAiPreviewBacktestRow {
  const absoluteError = Math.abs(predicted - actual);
  return {
    companyName,
    businessUnit,
    year,
    month,
    predictedValue: roundMoney(predicted),
    actualClosedRevenue: roundMoney(actual),
    absoluteError: roundMoney(absoluteError),
    percentageError: actual > 0 ? absoluteError / actual : null
  };
}

function buildReportRows(input: {
  companyName: string;
  year: number;
  months: number[];
  actuals: Map<string, ActualRevenueRow>;
  forecasts: Awaited<ReturnType<typeof buildCompanyBuForecastSignals>>["candidates"];
}) {
  const selectedMonths = new Set(input.months);
  const rowKeys = new Set<string>();
  const rows: PetyrAiPreviewBacktestRow[] = [];

  for (const forecast of input.forecasts) {
    if (!selectedMonths.has(forecast.month)) continue;
    rowKeys.add(actualKey(input.companyName, forecast.businessUnit, forecast.month));
    const actual = input.actuals.get(actualKey(input.companyName, forecast.businessUnit, forecast.month))?.actualRevenue ?? 0;
    rows.push(toReportRow(input.companyName, forecast.businessUnit, input.year, forecast.month, forecast.roundedForecastValue, actual));
  }

  for (const businessUnit of PETYR_BUSINESS_UNITS) {
    for (const month of input.months) {
      const key = actualKey(input.companyName, businessUnit, month);
      if (rowKeys.has(key)) continue;

      const actual = input.actuals.get(key)?.actualRevenue ?? 0;
      if (actual <= 0) continue;
      rows.push(toReportRow(input.companyName, businessUnit, input.year, month, 0, actual));
    }
  }

  return rows;
}

function aggregateRows(scope: string, month: number | null, rows: PetyrAiPreviewBacktestRow[]): PetyrAiPreviewBacktestAggregate {
  const predicted = roundMoney(rows.reduce((sum, row) => sum + row.predictedValue, 0));
  const actual = roundMoney(rows.reduce((sum, row) => sum + row.actualClosedRevenue, 0));
  const absoluteError = roundMoney(Math.abs(predicted - actual));

  return {
    scope,
    month,
    rows: rows.length,
    predictedValue: predicted,
    actualClosedRevenue: actual,
    absoluteError,
    percentageError: actual > 0 ? absoluteError / actual : null
  };
}

export async function runPetyrAiPreviewBacktest(input: PetyrAiPreviewBacktestRequest = {}): Promise<PetyrAiPreviewBacktestResult> {
  const startedAt = Date.now();
  const asOfDate = parseDate(input.asOf);
  const year = normalizeYear(input.year);
  const months = normalizeMonths(input.months);
  const limit = normalizeLimit(input.limit);
  const selection = input.selection ?? "top_revenue";
  const diagnostics: string[] = [];

  if (selection !== "top_revenue") throw new Error("Only top_revenue selection is supported for Petyr AI preview backtest.");

  const campaignRows = await readCampaignRows();
  const selectedCompanies = selectTopRevenueCompanies(campaignRows, year, asOfDate, limit);
  const actuals = aggregateActualRevenue(campaignRows, year, months);
  const rows: PetyrAiPreviewBacktestRow[] = [];

  if (selectedCompanies.length === 0) {
    diagnostics.push("No companies with positive closed revenue were found for the selected as-of date.");
  }

  for (const company of selectedCompanies) {
    const signals = await buildCompanyBuForecastSignals(company.companyName, year, {
      currentDate: asOfDate
    });
    diagnostics.push(...signals.diagnostics);
    rows.push(...buildReportRows({
      companyName: signals.companyName,
      year,
      months,
      actuals,
      forecasts: signals.candidates
    }));
  }

  const monthlyAggregates = months.map((month) => aggregateRows(`Month ${month}`, month, rows.filter((row) => row.month === month)));

  return {
    ok: true,
    source: "postgresql",
    mode: "read-only",
    selection,
    asOf: toIsoDate(asOfDate),
    year,
    months,
    limit,
    durationMs: Date.now() - startedAt,
    selectedCompanies,
    rows,
    monthlyAggregates,
    totalAggregate: aggregateRows("All selected months", null, rows),
    diagnostics: [...new Set(diagnostics)]
  };
}
