import { Prisma, type ForecastAnnual, type ForecastMonthly } from "@prisma/client";
import { getRedashPetyrSourceMapping, type PetyrLogicalField, type RedashPetyrSourceKey } from "@/config/redashFieldMapping";
import { prisma } from "@/lib/db";
import { normalizePetyrBusinessUnit } from "@/lib/petyr/constants";

export const PETYR_CLOSED_REVENUE_ONGOING_BACKFILL_YEAR = 2026;

const SOURCE = "One-shot 2026 Closed Revenue Backfill";
const DEFAULT_USER = "petyr-one-shot-2026";
const CHUNK_SIZE = 500;
const SAFE_IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;
const SAFE_SQL_ALIAS_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const REQUIRED_FORECAST_RELATIONS = ["forecast_monthly", "forecast_annual", "forecast_save_session", "forecast_change_log"];
const CAMPAIGN_SOURCE_KEY = "master_campaigns" satisfies RedashPetyrSourceKey;
const OWNERSHIP_SOURCE_KEY = "company_ownership" satisfies RedashPetyrSourceKey;

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

type RelationExistsRow = { exists: boolean };
type TableColumnRow = { column_name: string };

type CampaignRow = {
  companyName: string | null;
  campaignCsmName: string | null;
  businessUnit: string | null;
  revenueValue: string | null;
  endDate: string | null;
  campaignStatus: string | null;
  rowIndex: number | null;
};

type OwnershipRow = {
  companyName: string | null;
  csmName: string | null;
  workspaceCreatedOn: string | null;
  workspaceUpdatedOn: string | null;
};

type OwnershipCandidate = {
  companyName: string;
  csmName: string;
  workspaceCreatedOn: string | null;
  workspaceUpdatedOn: string | null;
};

type OwnershipMap = {
  byCompanyKey: Map<string, OwnershipCandidate>;
  available: boolean;
  warning?: string;
};

type ClosedRevenueAggregate = {
  companyName: string;
  csmName: string;
  businessUnit: string;
  year: number;
  month?: number;
  value: number;
  campaignRows: number;
  months?: number[];
};

type AggregateStats = {
  campaignRowsRead: number;
  includedCampaignRows: number;
  skippedMissingDate: number;
  skippedFutureOrOtherYear: number;
  skippedInvalidStatus: number;
  skippedPlanningStatus: number;
  missingOwnershipCampaignRows: number;
  missingOwnershipAggregates: number;
  businessUnitFallbackCounts: Map<string, number>;
  negativeMonthlyAggregateKeys: number;
  negativeAnnualAggregateKeys: number;
};

type MonthlyChange = Required<Pick<ClosedRevenueAggregate, "month">> &
  Omit<ClosedRevenueAggregate, "month"> & {
    forecastType: "previous_month" | "ongoing";
    fieldName: "previousMonthForecast" | "ongoingForecast";
    existing: ForecastMonthly | null;
    nextValue: Prisma.Decimal;
    previousValue: number | null;
  };

type AnnualChange = Omit<ClosedRevenueAggregate, "month"> & {
  month: 12;
  fieldName: "annualOngoingForecast";
  existing: ForecastAnnual | null;
  nextValue: Prisma.Decimal;
  previousValue: number | null;
};

type ForecastChange = MonthlyChange | AnnualChange;

type ForecastWriteResult = {
  saveSessionIds: string[];
  forecastUpserts: number;
  changeLogRows: number;
};

export type PetyrClosedRevenueOngoingBackfillPreviewRow = {
  companyName: string;
  csmName: string;
  businessUnit: string;
  year: number;
  month: number;
  fieldName: string;
  previousValue: number | null;
  nextValue: number;
  campaignRows: number;
};

export type PetyrClosedRevenueOngoingBackfillResult = {
  ok: true;
  mode: "dry-run" | "apply";
  year: typeof PETYR_CLOSED_REVENUE_ONGOING_BACKFILL_YEAR;
  asOf: string;
  source: string;
  durationMs: number;
  campaignRowsRead: number;
  includedCampaignRows: number;
  monthlyClosedRevenueAggregates: number;
  annualClosedRevenueAggregates: number;
  changedMonthlyPreviousMonthRows: number;
  changedMonthlyOngoingRows: number;
  changedAnnualOngoingRows: number;
  skipped: {
    missingDate: number;
    futureOrOtherYear: number;
    invalidStatus: number;
    planningOnlyStatus: number;
    negativeMonthlyAggregates: number;
    negativeAnnualAggregates: number;
  };
  warnings: string[];
  stats: Omit<AggregateStats, "businessUnitFallbackCounts"> & {
    businessUnitFallbackCounts: Record<string, number>;
  };
  preview: {
    monthly: PetyrClosedRevenueOngoingBackfillPreviewRow[];
    annual: PetyrClosedRevenueOngoingBackfillPreviewRow[];
  };
  write: {
    monthly: ForecastWriteResult;
    annual: ForecastWriteResult;
  };
};

export type PetyrClosedRevenueOngoingBackfillInput = {
  apply?: boolean;
  asOf?: string | Date | null;
  requestedBy?: string | null;
};

function sqlIdentifier(identifier: string) {
  if (!SAFE_IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(`Unsafe PostgreSQL identifier: ${identifier}`);
  }

  return Prisma.raw(`"${identifier}"`);
}

function sqlAlias(alias: string) {
  if (!SAFE_SQL_ALIAS_PATTERN.test(alias)) {
    throw new Error(`Unsafe PostgreSQL alias: ${alias}`);
  }

  return Prisma.raw(`"${alias}"`);
}

function selectedRequiredTextColumn(column: string, alias: string) {
  return Prisma.sql`NULLIF(BTRIM(${sqlIdentifier(column)}::text), '') AS ${sqlAlias(alias)}`;
}

function selectedNullableTextColumn(column: string | null, alias: string) {
  return column
    ? Prisma.sql`${sqlIdentifier(column)}::text AS ${sqlAlias(alias)}`
    : Prisma.sql`NULL::text AS ${sqlAlias(alias)}`;
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function normalizeCellValue(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || "";
}

function parseNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  let normalized = value.trim();
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

function parseDate(value: string | Date | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const europeanMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (europeanMatch) {
    const [, day, month, year] = europeanMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const isoMatch = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(trimmed);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const timestamp = Date.parse(trimmed);
  return Number.isNaN(timestamp) ? null : new Date(timestamp);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function decimalToNumber(value: Prisma.Decimal | null | undefined) {
  return value === null || value === undefined ? null : Number(value.toString());
}

function decimalToLogValue(value: Prisma.Decimal | null | undefined) {
  if (value === null || value === undefined) return null;
  return new Prisma.Decimal(value).toFixed(2);
}

function isInvalidCampaignStatus(status: string) {
  return INVALID_CAMPAIGN_STATUS_TOKENS.some((token) => status.includes(token));
}

function isPlanningOnlyCampaignStatus(status: string) {
  return PLANNING_ONLY_STATUS_TOKENS.some((token) => status.includes(token));
}

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function requiredMappedColumn(sourceKey: RedashPetyrSourceKey, logicalField: PetyrLogicalField) {
  const source = getRedashPetyrSourceMapping(sourceKey);
  const column = source.fields[logicalField].dbColumnName;

  if (!column) {
    throw new Error(`${source.tableName}.${logicalField} is not mapped in redashFieldMapping.ts.`);
  }

  return column;
}

async function relationExists(relationName: string) {
  const rows = await prisma.$queryRaw<RelationExistsRow[]>`
    SELECT to_regclass(${relationName}) IS NOT NULL AS "exists"
  `;

  return rows[0]?.exists ?? false;
}

async function getTableColumnNames(tableName: string) {
  const rows = await prisma.$queryRaw<TableColumnRow[]>`
    SELECT "column_name"
    FROM information_schema.columns
    WHERE "table_schema" = current_schema()
      AND "table_name" = ${tableName}
    ORDER BY "ordinal_position" ASC
  `;

  return new Set(rows.map((row) => row.column_name));
}

async function requireRelations() {
  const campaignSource = getRedashPetyrSourceMapping(CAMPAIGN_SOURCE_KEY);
  const requiredRelations = [campaignSource.tableName, ...REQUIRED_FORECAST_RELATIONS];

  for (const relation of requiredRelations) {
    if (!(await relationExists(relation))) {
      throw new Error(`${relation} is missing. Run the Redash sync and Petyr schema sync before this backfill.`);
    }
  }
}

async function requireColumns(tableName: string, columns: string[]) {
  const available = await getTableColumnNames(tableName);
  const missing = columns.filter((column) => !available.has(column));

  if (missing.length > 0) {
    throw new Error(`${tableName} is missing required column(s): ${missing.join(", ")}.`);
  }

  return available;
}

async function readCampaignRows() {
  const source = getRedashPetyrSourceMapping(CAMPAIGN_SOURCE_KEY);
  const columns = {
    companyName: requiredMappedColumn(CAMPAIGN_SOURCE_KEY, "companyName"),
    csmName: requiredMappedColumn(CAMPAIGN_SOURCE_KEY, "csmName"),
    businessUnit: requiredMappedColumn(CAMPAIGN_SOURCE_KEY, "businessUnit"),
    campaignValue: requiredMappedColumn(CAMPAIGN_SOURCE_KEY, "campaignValue"),
    campaignEndDate: requiredMappedColumn(CAMPAIGN_SOURCE_KEY, "campaignEndDate"),
    campaignStatus: requiredMappedColumn(CAMPAIGN_SOURCE_KEY, "campaignStatus")
  };

  await requireColumns(source.tableName, Object.values(columns));

  return prisma.$queryRaw<CampaignRow[]>(Prisma.sql`
    SELECT ${Prisma.join([
      selectedRequiredTextColumn(columns.companyName, "companyName"),
      selectedRequiredTextColumn(columns.csmName, "campaignCsmName"),
      selectedRequiredTextColumn(columns.businessUnit, "businessUnit"),
      selectedNullableTextColumn(columns.campaignValue, "revenueValue"),
      selectedNullableTextColumn(columns.campaignEndDate, "endDate"),
      selectedRequiredTextColumn(columns.campaignStatus, "campaignStatus"),
      Prisma.sql`"row_index"::integer AS "rowIndex"`
    ])}
    FROM ${sqlIdentifier(source.tableName)}
    WHERE NULLIF(BTRIM(${sqlIdentifier(columns.companyName)}::text), '') IS NOT NULL
  `);
}

function ownershipTime(value: string | null) {
  return parseDate(value)?.getTime() ?? 0;
}

function compareOwnershipCandidate(candidate: OwnershipCandidate, existing: OwnershipCandidate) {
  const updatedDiff = ownershipTime(candidate.workspaceUpdatedOn) - ownershipTime(existing.workspaceUpdatedOn);
  if (updatedDiff !== 0) return updatedDiff;

  const createdDiff = ownershipTime(candidate.workspaceCreatedOn) - ownershipTime(existing.workspaceCreatedOn);
  if (createdDiff !== 0) return createdDiff;

  return candidate.csmName.localeCompare(existing.csmName);
}

async function readOwnershipMap(): Promise<OwnershipMap> {
  const source = getRedashPetyrSourceMapping(OWNERSHIP_SOURCE_KEY);

  if (!(await relationExists(source.tableName))) {
    return { byCompanyKey: new Map(), available: false };
  }

  const available = await getTableColumnNames(source.tableName);
  const companyColumn = requiredMappedColumn(OWNERSHIP_SOURCE_KEY, "companyName");
  const csmColumn = requiredMappedColumn(OWNERSHIP_SOURCE_KEY, "csmName");
  const required = [companyColumn, csmColumn];
  const missing = required.filter((column) => !available.has(column));

  if (missing.length > 0) {
    return {
      byCompanyKey: new Map(),
      available: false,
      warning: `${source.tableName} is missing column(s): ${missing.join(", ")}.`
    };
  }

  const workspaceCreatedColumn = available.has("workspace_created_on") ? "workspace_created_on" : null;
  const workspaceUpdatedColumn = available.has("workspace_updated_on") ? "workspace_updated_on" : null;
  const rows = await prisma.$queryRaw<OwnershipRow[]>(Prisma.sql`
    SELECT DISTINCT ${Prisma.join([
      selectedRequiredTextColumn(companyColumn, "companyName"),
      selectedRequiredTextColumn(csmColumn, "csmName"),
      selectedNullableTextColumn(workspaceCreatedColumn, "workspaceCreatedOn"),
      selectedNullableTextColumn(workspaceUpdatedColumn, "workspaceUpdatedOn")
    ])}
    FROM ${sqlIdentifier(source.tableName)}
    WHERE NULLIF(BTRIM(${sqlIdentifier(companyColumn)}::text), '') IS NOT NULL
  `);
  const byCompanyKey = new Map<string, OwnershipCandidate>();

  for (const row of rows) {
    const companyName = normalizeCellValue(row.companyName);
    if (!companyName) continue;

    const candidate = {
      companyName,
      csmName: normalizeCellValue(row.csmName) || "Unassigned",
      workspaceCreatedOn: row.workspaceCreatedOn,
      workspaceUpdatedOn: row.workspaceUpdatedOn
    };
    const key = normalizeKey(companyName);
    const existing = byCompanyKey.get(key);

    if (!existing || compareOwnershipCandidate(candidate, existing) > 0) {
      byCompanyKey.set(key, candidate);
    }
  }

  return { byCompanyKey, available: byCompanyKey.size > 0 };
}

function createStats(rowCount: number): AggregateStats {
  return {
    campaignRowsRead: rowCount,
    includedCampaignRows: 0,
    skippedMissingDate: 0,
    skippedFutureOrOtherYear: 0,
    skippedInvalidStatus: 0,
    skippedPlanningStatus: 0,
    missingOwnershipCampaignRows: 0,
    missingOwnershipAggregates: 0,
    businessUnitFallbackCounts: new Map(),
    negativeMonthlyAggregateKeys: 0,
    negativeAnnualAggregateKeys: 0
  };
}

function aggregateClosedRevenue(rows: CampaignRow[], ownershipMap: OwnershipMap, asOf: Date) {
  const monthlyAggregates = new Map<string, Required<Pick<ClosedRevenueAggregate, "month">> & Omit<ClosedRevenueAggregate, "month">>();
  const missingOwnershipKeys = new Set<string>();
  const stats = createStats(rows.length);

  for (const row of rows) {
    const status = normalizeCellValue(row.campaignStatus).toLowerCase();
    const campaignDate = parseDate(row.endDate);

    if (!campaignDate) {
      stats.skippedMissingDate += 1;
      continue;
    }

    if (campaignDate.getFullYear() !== PETYR_CLOSED_REVENUE_ONGOING_BACKFILL_YEAR || campaignDate.getTime() > asOf.getTime()) {
      stats.skippedFutureOrOtherYear += 1;
      continue;
    }

    if (isInvalidCampaignStatus(status)) {
      stats.skippedInvalidStatus += 1;
      continue;
    }

    if (isPlanningOnlyCampaignStatus(status)) {
      stats.skippedPlanningStatus += 1;
      continue;
    }

    const sourceCompanyName = normalizeCellValue(row.companyName);
    if (!sourceCompanyName) continue;

    const ownership = ownershipMap.byCompanyKey.get(normalizeKey(sourceCompanyName));
    const companyName = ownership?.companyName ?? sourceCompanyName;
    const csmName = ownership?.csmName ?? (normalizeCellValue(row.campaignCsmName) || "Unassigned");
    const normalizedBusinessUnit = normalizePetyrBusinessUnit(row.businessUnit);
    const businessUnit = normalizedBusinessUnit.businessUnit;
    const month = campaignDate.getMonth() + 1;
    const key = [normalizeKey(companyName), businessUnit, PETYR_CLOSED_REVENUE_ONGOING_BACKFILL_YEAR, month].join("\u0000");
    const existing = monthlyAggregates.get(key);

    if (!ownership) {
      stats.missingOwnershipCampaignRows += 1;
      missingOwnershipKeys.add(normalizeKey(companyName));
    }

    if (normalizedBusinessUnit.reason !== "official") {
      increment(stats.businessUnitFallbackCounts, normalizedBusinessUnit.reason);
    }

    stats.includedCampaignRows += 1;

    if (existing) {
      existing.value = roundMoney(existing.value + parseNumber(row.revenueValue));
      existing.campaignRows += 1;
    } else {
      monthlyAggregates.set(key, {
        companyName,
        csmName,
        businessUnit,
        year: PETYR_CLOSED_REVENUE_ONGOING_BACKFILL_YEAR,
        month,
        value: roundMoney(parseNumber(row.revenueValue)),
        campaignRows: 1
      });
    }
  }

  stats.missingOwnershipAggregates = missingOwnershipKeys.size;

  const monthly: Array<Required<Pick<ClosedRevenueAggregate, "month">> & Omit<ClosedRevenueAggregate, "month">> = [];
  for (const aggregate of monthlyAggregates.values()) {
    aggregate.value = roundMoney(aggregate.value);
    if (aggregate.value < 0) {
      stats.negativeMonthlyAggregateKeys += 1;
      continue;
    }
    monthly.push(aggregate);
  }

  const annualByKey = new Map<string, ClosedRevenueAggregate & { months: number[] }>();
  for (const row of monthly) {
    const key = [normalizeKey(row.companyName), row.businessUnit, PETYR_CLOSED_REVENUE_ONGOING_BACKFILL_YEAR].join("\u0000");
    const existing = annualByKey.get(key);

    if (existing) {
      existing.value = roundMoney(existing.value + row.value);
      existing.campaignRows += row.campaignRows;
      existing.months.push(row.month);
    } else {
      annualByKey.set(key, {
        companyName: row.companyName,
        csmName: row.csmName,
        businessUnit: row.businessUnit,
        year: PETYR_CLOSED_REVENUE_ONGOING_BACKFILL_YEAR,
        value: row.value,
        campaignRows: row.campaignRows,
        months: [row.month]
      });
    }
  }

  const annual: Array<ClosedRevenueAggregate & { months: number[] }> = [];
  for (const aggregate of annualByKey.values()) {
    aggregate.value = roundMoney(aggregate.value);
    aggregate.months = [...new Set(aggregate.months)].sort((left, right) => left - right);
    if (aggregate.value < 0) {
      stats.negativeAnnualAggregateKeys += 1;
      continue;
    }
    annual.push(aggregate);
  }

  monthly.sort(compareAggregateRows);
  annual.sort(compareAggregateRows);

  return { monthly, annual, stats };
}

function compareAggregateRows(left: ClosedRevenueAggregate, right: ClosedRevenueAggregate) {
  return (
    left.companyName.localeCompare(right.companyName) ||
    left.businessUnit.localeCompare(right.businessUnit) ||
    (left.month ?? 0) - (right.month ?? 0)
  );
}

async function readExistingForecasts() {
  const [monthlyRows, annualRows] = await Promise.all([
    prisma.forecastMonthly.findMany({
      where: {
        year: PETYR_CLOSED_REVENUE_ONGOING_BACKFILL_YEAR,
        forecastType: { in: ["previous_month", "ongoing"] }
      }
    }),
    prisma.forecastAnnual.findMany({
      where: {
        year: PETYR_CLOSED_REVENUE_ONGOING_BACKFILL_YEAR
      }
    })
  ]);
  const monthlyByKey = new Map<string, ForecastMonthly>();
  const annualByKey = new Map<string, ForecastAnnual>();

  for (const row of monthlyRows) {
    const key = [normalizeKey(row.companyName), row.businessUnit, row.year, row.month, row.forecastType].join("\u0000");
    monthlyByKey.set(key, row);
  }

  for (const row of annualRows) {
    const key = [normalizeKey(row.companyName), row.businessUnit, row.year].join("\u0000");
    annualByKey.set(key, row);
  }

  return { monthlyByKey, annualByKey };
}

function buildMonthlyChanges(
  aggregates: Array<Required<Pick<ClosedRevenueAggregate, "month">> & Omit<ClosedRevenueAggregate, "month">>,
  existingByKey: Map<string, ForecastMonthly>
): MonthlyChange[] {
  const changes: MonthlyChange[] = [];
  const targetForecastTypes: Array<Pick<MonthlyChange, "forecastType" | "fieldName">> = [
    { forecastType: "previous_month", fieldName: "previousMonthForecast" },
    { forecastType: "ongoing", fieldName: "ongoingForecast" }
  ];

  for (const aggregate of aggregates) {
    if (aggregate.value === 0) continue;

    for (const target of targetForecastTypes) {
      const key = [
        normalizeKey(aggregate.companyName),
        aggregate.businessUnit,
        aggregate.year,
        aggregate.month,
        target.forecastType
      ].join("\u0000");
      const existing = existingByKey.get(key) ?? null;
      const existingValue = decimalToNumber(existing?.value);

      if (existingValue !== aggregate.value) {
        changes.push({
          ...aggregate,
          forecastType: target.forecastType,
          fieldName: target.fieldName,
          existing,
          nextValue: new Prisma.Decimal(aggregate.value.toFixed(2)),
          previousValue: existingValue
        });
      }
    }
  }

  return changes;
}

function buildAnnualChanges(
  aggregates: Array<ClosedRevenueAggregate & { months: number[] }>,
  existingByKey: Map<string, ForecastAnnual>
): AnnualChange[] {
  const changes: AnnualChange[] = [];

  for (const aggregate of aggregates) {
    if (aggregate.value === 0) continue;

    const key = [normalizeKey(aggregate.companyName), aggregate.businessUnit, aggregate.year].join("\u0000");
    const existing = existingByKey.get(key) ?? null;
    const existingValue = decimalToNumber(existing?.value);

    if (existingValue !== aggregate.value) {
      changes.push({
        ...aggregate,
        month: 12,
        fieldName: "annualOngoingForecast",
        existing,
        nextValue: new Prisma.Decimal(aggregate.value.toFixed(2)),
        previousValue: existingValue
      });
    }
  }

  return changes;
}

function buildChangeLogRows(saveSessionId: string, changes: ForecastChange[], createdBy: string): Prisma.ForecastChangeLogCreateManyInput[] {
  return changes.map((change) => ({
    saveSessionId,
    companyName: change.companyName,
    businessUnit: change.businessUnit,
    fieldName: change.fieldName,
    previousValue: decimalToLogValue(change.existing?.value),
    newValue: change.nextValue.toFixed(2),
    aiForecastValueAtSave: change.existing?.aiForecastValue ?? null,
    createdBy
  }));
}

async function applyMonthlyChanges(changes: MonthlyChange[], asOf: Date, createdBy: string): Promise<ForecastWriteResult> {
  const saveSessionIds: string[] = [];
  let forecastUpserts = 0;
  let changeLogRows = 0;
  const changesByForecastType = new Map<MonthlyChange["forecastType"], MonthlyChange[]>();

  for (const change of changes) {
    changesByForecastType.set(change.forecastType, [...(changesByForecastType.get(change.forecastType) ?? []), change]);
  }

  for (const forecastTypeChanges of changesByForecastType.values()) {
    for (const chunk of chunkArray(forecastTypeChanges, CHUNK_SIZE)) {
      const written = await prisma.$transaction(async (tx) => {
      const first = chunk[0];
      const saveSession = await tx.forecastSaveSession.create({
        data: {
          companyName: SOURCE,
          csmName: createdBy,
          source: SOURCE,
          year: PETYR_CLOSED_REVENUE_ONGOING_BACKFILL_YEAR,
          month: first.month,
          forecastType: first.forecastType,
          note: `One-time ${PETYR_CLOSED_REVENUE_ONGOING_BACKFILL_YEAR} DB alignment: copied monthly closed revenue as ${first.forecastType} forecast through ${asOf.toISOString().slice(0, 10)}.`,
          companyActiveStatus: true,
          createdBy
        }
      });

      for (const change of chunk) {
        await tx.forecastMonthly.upsert({
          where: {
            companyName_businessUnit_year_month_forecastType: {
              companyName: change.companyName,
              businessUnit: change.businessUnit,
              year: PETYR_CLOSED_REVENUE_ONGOING_BACKFILL_YEAR,
              month: change.month,
              forecastType: change.forecastType
            }
          },
          create: {
            companyName: change.companyName,
            csmName: change.csmName,
            businessUnit: change.businessUnit,
            year: PETYR_CLOSED_REVENUE_ONGOING_BACKFILL_YEAR,
            month: change.month,
            forecastType: change.forecastType,
            value: change.nextValue,
            status: "saved",
            createdBy,
            updatedBy: createdBy
          },
          update: {
            csmName: change.csmName,
            value: change.nextValue,
            status: "saved",
            updatedBy: createdBy
          }
        });
      }

      const logs = buildChangeLogRows(saveSession.id, chunk, createdBy);
      await tx.forecastChangeLog.createMany({ data: logs });

      return {
        saveSessionId: saveSession.id,
        forecastUpserts: chunk.length,
        changeLogRows: logs.length
      };
    }, { maxWait: 10000, timeout: 120000 });

      saveSessionIds.push(written.saveSessionId);
      forecastUpserts += written.forecastUpserts;
      changeLogRows += written.changeLogRows;
    }
  }

  return { saveSessionIds, forecastUpserts, changeLogRows };
}

async function applyAnnualChanges(changes: AnnualChange[], asOf: Date, createdBy: string): Promise<ForecastWriteResult> {
  const saveSessionIds: string[] = [];
  let forecastUpserts = 0;
  let changeLogRows = 0;

  for (const chunk of chunkArray(changes, CHUNK_SIZE)) {
    const written = await prisma.$transaction(async (tx) => {
      const saveSession = await tx.forecastSaveSession.create({
        data: {
          companyName: SOURCE,
          csmName: createdBy,
          source: SOURCE,
          year: PETYR_CLOSED_REVENUE_ONGOING_BACKFILL_YEAR,
          month: 12,
          forecastType: "ongoing",
          note: `One-time ${PETYR_CLOSED_REVENUE_ONGOING_BACKFILL_YEAR} DB alignment: copied closed revenue YTD as annual Ongoing Forecast through ${asOf.toISOString().slice(0, 10)}.`,
          companyActiveStatus: true,
          createdBy
        }
      });

      for (const change of chunk) {
        await tx.forecastAnnual.upsert({
          where: {
            companyName_businessUnit_year: {
              companyName: change.companyName,
              businessUnit: change.businessUnit,
              year: PETYR_CLOSED_REVENUE_ONGOING_BACKFILL_YEAR
            }
          },
          create: {
            companyName: change.companyName,
            csmName: change.csmName,
            businessUnit: change.businessUnit,
            year: PETYR_CLOSED_REVENUE_ONGOING_BACKFILL_YEAR,
            value: change.nextValue,
            status: "draft",
            note: `One-time ${PETYR_CLOSED_REVENUE_ONGOING_BACKFILL_YEAR} closed revenue alignment through ${asOf.toISOString().slice(0, 10)}.`,
            createdBy,
            updatedBy: createdBy
          },
          update: {
            csmName: change.csmName,
            value: change.nextValue,
            status: change.existing?.status ?? "draft",
            note: `One-time ${PETYR_CLOSED_REVENUE_ONGOING_BACKFILL_YEAR} closed revenue alignment through ${asOf.toISOString().slice(0, 10)}.`,
            updatedBy: createdBy
          }
        });
      }

      const logs = buildChangeLogRows(saveSession.id, chunk, createdBy);
      await tx.forecastChangeLog.createMany({ data: logs });

      return {
        saveSessionId: saveSession.id,
        forecastUpserts: chunk.length,
        changeLogRows: logs.length
      };
    }, { maxWait: 10000, timeout: 120000 });

    saveSessionIds.push(written.saveSessionId);
    forecastUpserts += written.forecastUpserts;
    changeLogRows += written.changeLogRows;
  }

  return { saveSessionIds, forecastUpserts, changeLogRows };
}

function previewChanges(changes: ForecastChange[]): PetyrClosedRevenueOngoingBackfillPreviewRow[] {
  return changes.slice(0, 10).map((change) => ({
    companyName: change.companyName,
    csmName: change.csmName,
    businessUnit: change.businessUnit,
    year: change.year,
    month: change.month,
    fieldName: change.fieldName,
    previousValue: change.previousValue,
    nextValue: change.value,
    campaignRows: change.campaignRows
  }));
}

function statsForJson(stats: AggregateStats): PetyrClosedRevenueOngoingBackfillResult["stats"] {
  return {
    ...stats,
    businessUnitFallbackCounts: Object.fromEntries(stats.businessUnitFallbackCounts)
  };
}

function normalizeAsOf(value: PetyrClosedRevenueOngoingBackfillInput["asOf"]) {
  const parsed = value ? parseDate(value) : new Date();

  if (!parsed) {
    throw new Error("Invalid asOf date. Use YYYY-MM-DD.");
  }

  return parsed;
}

function normalizeRequestedBy(value: string | null | undefined) {
  return normalizeCellValue(value) || DEFAULT_USER;
}

function emptyWriteResult(): ForecastWriteResult {
  return { forecastUpserts: 0, changeLogRows: 0, saveSessionIds: [] };
}

export async function runPetyr2026ClosedRevenueOngoingBackfill(
  input: PetyrClosedRevenueOngoingBackfillInput = {}
): Promise<PetyrClosedRevenueOngoingBackfillResult> {
  const startedAt = Date.now();
  const apply = input.apply === true;
  const asOf = normalizeAsOf(input.asOf);
  const createdBy = normalizeRequestedBy(input.requestedBy);

  await requireRelations();

  const [campaignRows, ownershipMap, existing] = await Promise.all([
    readCampaignRows(),
    readOwnershipMap(),
    readExistingForecasts()
  ]);
  const { monthly, annual, stats } = aggregateClosedRevenue(campaignRows, ownershipMap, asOf);
  const monthlyChanges = buildMonthlyChanges(monthly, existing.monthlyByKey);
  const annualChanges = buildAnnualChanges(annual, existing.annualByKey);
  const monthlyPreviousMonthChanges = monthlyChanges.filter((change) => change.forecastType === "previous_month");
  const monthlyOngoingChanges = monthlyChanges.filter((change) => change.forecastType === "ongoing");
  const write = apply
    ? {
        monthly: monthlyChanges.length > 0 ? await applyMonthlyChanges(monthlyChanges, asOf, createdBy) : emptyWriteResult(),
        annual: annualChanges.length > 0 ? await applyAnnualChanges(annualChanges, asOf, createdBy) : emptyWriteResult()
      }
    : {
        monthly: emptyWriteResult(),
        annual: emptyWriteResult()
      };

  return {
    ok: true,
    mode: apply ? "apply" : "dry-run",
    year: PETYR_CLOSED_REVENUE_ONGOING_BACKFILL_YEAR,
    asOf: asOf.toISOString(),
    source: SOURCE,
    durationMs: Date.now() - startedAt,
    campaignRowsRead: stats.campaignRowsRead,
    includedCampaignRows: stats.includedCampaignRows,
    monthlyClosedRevenueAggregates: monthly.length,
    annualClosedRevenueAggregates: annual.length,
    changedMonthlyPreviousMonthRows: monthlyPreviousMonthChanges.length,
    changedMonthlyOngoingRows: monthlyOngoingChanges.length,
    changedAnnualOngoingRows: annualChanges.length,
    skipped: {
      missingDate: stats.skippedMissingDate,
      futureOrOtherYear: stats.skippedFutureOrOtherYear,
      invalidStatus: stats.skippedInvalidStatus,
      planningOnlyStatus: stats.skippedPlanningStatus,
      negativeMonthlyAggregates: stats.negativeMonthlyAggregateKeys,
      negativeAnnualAggregates: stats.negativeAnnualAggregateKeys
    },
    warnings: [
      ownershipMap.warning,
      !ownershipMap.available ? "Company Ownership was unavailable or empty; campaign CSM fallback was used where possible." : null,
      stats.missingOwnershipCampaignRows > 0
        ? `${stats.missingOwnershipCampaignRows} included campaign row(s), across ${stats.missingOwnershipAggregates} company aggregate(s), had no matching Company Ownership row; campaign CSM fallback was used.`
        : null,
      stats.businessUnitFallbackCounts.size > 0
        ? `Business Unit fallback to Other was used: ${JSON.stringify(Object.fromEntries(stats.businessUnitFallbackCounts))}.`
        : null,
      stats.negativeMonthlyAggregateKeys > 0
        ? `${stats.negativeMonthlyAggregateKeys} monthly aggregate(s) were negative and were skipped because monthly forecast values must be non-negative.`
        : null,
      stats.negativeAnnualAggregateKeys > 0
        ? `${stats.negativeAnnualAggregateKeys} annual aggregate(s) were negative and were skipped because annual forecast values must be non-negative.`
        : null
    ].filter((warning): warning is string => Boolean(warning)),
    stats: statsForJson(stats),
    preview: {
      monthly: previewChanges(monthlyChanges),
      annual: previewChanges(annualChanges)
    },
    write
  };
}
