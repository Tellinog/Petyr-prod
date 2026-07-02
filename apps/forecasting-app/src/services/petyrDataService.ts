import { Prisma, type CompanyForecastStatus, type ForecastAnnual, type ForecastMonthly } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  getRedashPetyrSourceMapping,
  type PetyrLogicalField,
  type RedashPetyrSourceKey
} from "@/config/redashFieldMapping";
import { getForecastEntryMode, type ForecastEntryMode } from "@/lib/forecastEntryMode";
import {
  PETYR_BUSINESS_UNITS,
  PETYR_FORECAST_INTELLIGENCE_CACHE_BUSINESS_UNIT,
  normalizePetyrBusinessUnit
} from "@/lib/petyr/constants";
import { formatPetyrCurrency, formatPetyrPercent } from "@/lib/petyr/formatters";
import {
  getManagementObjectiveMapValue,
  getManagementObjectiveMaps,
  type ManagementObjectiveMaps
} from "@/services/petyrManagementObjectiveService";
import { logPetyrPerformance, startPetyrPerformanceTimer } from "@/lib/petyr/performance";
import { resolvePreferredCsmName } from "@/lib/petyr/csmIdentity";
import { getPetyrCachedRead } from "@/services/forecastEntryReadCache";
import type { PetyrNumericAiForecastCacheReadModelRow } from "@/lib/petyr/numericAiForecastCacheReadModel";

const SAFE_IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;
const SYSTEM_COLUMNS = new Set(["snapshot_id", "row_index", "synced_at"]);
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const HIGH_RESIDUAL_ABSOLUTE_THRESHOLD = 50000;
const HIGH_RESIDUAL_RATIO_THRESHOLD = 0.4;
const BUSINESS_UNIT_HISTORY_RATIO_THRESHOLD = 0.7;
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
const PLANNED_FUTURE_INCLUDED_STATUSES = new Set(["setup", "recruiting"]);
const PLANNED_FUTURE_EXCLUDED_STATUSES = new Set([
  "running",
  "completed",
  "aborted",
  "cancelled",
  "canceled",
  "deleted",
  "rejected",
  "lost",
  "archived"
]);
const MAX_AI_FORECAST_CACHE_READ_ROWS = 50000;
const RECENT_WORKSPACE_ASSOCIATION_MONTHS = 6;

const CAMPAIGN_SOURCE = getRedashPetyrSourceMapping("master_campaigns");
const AGREEMENT_SOURCE = getRedashPetyrSourceMapping("master_agreements");
const OWNERSHIP_SOURCE = getRedashPetyrSourceMapping("company_ownership");

type SourceKey = RedashPetyrSourceKey;

type RelationExistsRow = {
  exists: boolean;
};

type PetyrNumericAiForecastCacheRow = Omit<PetyrNumericAiForecastCacheReadModelRow, "forecastValue" | "confidenceScore"> & {
  forecastValue: Prisma.Decimal;
  confidenceScore: Prisma.Decimal | null;
};

type PetyrAiForecastCacheReadFilter = {
  year?: number;
  month?: number;
  companyNames?: string[];
  limit?: number;
};

type TableColumnRow = {
  column_name: string;
  ordinal_position: number;
};

type ColumnMappingRow = {
  redashColumnName: string;
  dbColumnName: string;
  position: number;
  detectedType: string;
};

type TableColumn = {
  name: string;
  position: number;
};

type ResolvableColumn = {
  dbColumnName: string;
  redashColumnName: string;
  position: number;
  detectedType: string | null;
};

type SourceContext<TColumns extends Record<string, ResolvableColumn | null>> = {
  sourceKey: SourceKey;
  tableName: string;
  exists: boolean;
  columns: TColumns;
};

type CampaignColumns = {
  company: ResolvableColumn | null;
  csm: ResolvableColumn | null;
  branch: ResolvableColumn | null;
  businessUnit: ResolvableColumn | null;
  revenue: ResolvableColumn | null;
  cost: ResolvableColumn | null;
  grossMarginPct: ResolvableColumn | null;
  campaignName: ResolvableColumn | null;
  status: ResolvableColumn | null;
  agreementName: ResolvableColumn | null;
  startDate: ResolvableColumn | null;
  endDate: ResolvableColumn | null;
  link: ResolvableColumn | null;
};

type AgreementColumns = {
  company: ResolvableColumn | null;
  csm: ResolvableColumn | null;
  agreementName: ResolvableColumn | null;
  status: ResolvableColumn | null;
  totalValue: ResolvableColumn | null;
  residualValue: ResolvableColumn | null;
  expiryDate: ResolvableColumn | null;
  link: ResolvableColumn | null;
};

type OwnershipColumns = {
  company: ResolvableColumn | null;
  csm: ResolvableColumn | null;
  branch: ResolvableColumn | null;
  workspaceCreatedOn: ResolvableColumn | null;
  workspaceUpdatedOn: ResolvableColumn | null;
};

type MaterializedCampaignRow = {
  row_index: number | null;
  company_name: string | null;
  csm_name: string | null;
  branch_name: string | null;
  business_unit: string | null;
  revenue_value: string | null;
  cost_value: string | null;
  gross_margin_pct: string | null;
  campaign_name: string | null;
  campaign_status: string | null;
  agreement_name: string | null;
  start_date: string | null;
  end_date: string | null;
  campaign_link: string | null;
};

type MaterializedAgreementRow = {
  company_name: string | null;
  csm_name: string | null;
  agreement_name: string | null;
  agreement_status: string | null;
  total_value: string | null;
  residual_value: string | null;
  expiry_date: string | null;
  agreement_link: string | null;
};

type MaterializedOwnershipRow = {
  company_name: string | null;
  csm_name: string | null;
  branch_name: string | null;
  workspace_created_on: string | null;
  workspace_updated_on: string | null;
};

type CompanyOwnership = {
  companyName: string;
  csmName: string;
  branchName: string;
  workspaceCreatedOn: Date | null;
  workspaceUpdatedOn: Date | null;
};

type CompanyOwnershipMaps = {
  byCompany: Map<string, CompanyOwnership>;
  recentAssociations: CompanyOwnership[];
  hasRows: boolean;
};

type CompanyAccumulator = {
  companyName: string;
  csmCounts: Map<string, number>;
  campaignsCount: number;
  agreementsCount: number;
  activeAgreementsCount: number;
  currentYearRevenue: number;
  totalAgreementValue: number;
  residualAgreementValue: number;
  activeTotalAgreementValue: number;
  activeResidualAgreementValue: number;
  lastCampaignEndDate: Date | null;
  primaryAgreementName: string | null;
  primaryAgreementExpiry: Date | null;
  primaryAgreementActiveRank: number;
  primaryAgreementExpirySortValue: number;
  primaryAgreementResidualValue: number;
  primaryAgreementTotalValue: number;
  primaryAgreementNameSortValue: string;
  previousMonthForecast: number;
  ongoingForecast: number;
  annualForecast: number;
  aiForecast: number;
  forecastStatus: CompanyForecastStatus | null;
};

type PlannedFutureStatusClassification = "planned" | "excluded" | "missing" | "unrecognized";

type PlannedFutureCampaignDiagnostics = {
  missingStatusCount: number;
  missingStatusExamples: string[];
  unrecognizedStatusCounts: Map<string, number>;
  unrecognizedStatusExamples: string[];
  excludedStatusCounts: Map<string, number>;
  excludedStatusExamples: string[];
};

export type PetyrDataServiceResult<T> = {
  source: "postgresql";
  diagnostics: string[];
  data: T;
};

export type PetyrCompanyOverview = {
  companyName: string;
  csmName: string;
  campaignsCount: number;
  agreementsCount: number;
  currentYearRevenue: number;
  activeAgreementsCount: number;
  residualAgreementValue: number;
  totalAgreementValue: number;
  activeResidualAgreementValue: number;
  activeTotalAgreementValue: number;
  lastCampaignEndDate: string | null;
  dataQualityStatus: string;
  primaryAgreementName: string | null;
  primaryAgreementExpiry: string | null;
  previousMonthForecast: number;
  ongoingForecast: number;
  annualForecast: number;
  aiForecast: number;
  forecastAccuracyLabel: string;
  aiAccuracyLabel: string;
  isForecastActive: boolean | null;
};

export type PetyrCampaignDetail = {
  name: string;
  status: string;
  businessUnit: string;
  agreementName: string;
  agreementLink: string;
  value: number;
  revenue: number;
  costs: number;
  grossMarginPct: number | null;
  startDate: string | null;
  endDate: string | null;
  link: string;
};

export type PetyrAgreementDetail = {
  name: string;
  status: string;
  totalValue: number;
  residualValue: number;
  expiryDate: string | null;
  agreementDealLink: string;
  link: string;
};

export type PetyrForecastChangeHistorySession = {
  id: string;
  source: string;
  year: number;
  month: number;
  forecastType: string;
  note: string | null;
  companyActiveStatus: boolean;
  createdBy: string;
  createdAt: string;
  changes: Array<{
    id: string;
    businessUnit: string;
    fieldName: string;
    previousValue: string | null;
    newValue: string | null;
    aiForecastValueAtSave: number | null;
    createdBy: string;
    createdAt: string;
  }>;
};

export type PetyrCompanyBusinessUnitMonth = {
  month: number;
  actualRevenue: number;
  previousMonthForecast: number;
  ongoingForecast: number;
  aiForecast: number;
};

export type PetyrCompanyBusinessUnitMonthlyView = {
  businessUnit: string;
  months: PetyrCompanyBusinessUnitMonth[];
};

export type PetyrCompanyDetail = {
  overview: PetyrCompanyOverview | null;
  campaigns: PetyrCampaignDetail[];
  agreements: PetyrAgreementDetail[];
  monthlyForecasts: Array<{
    businessUnit: string;
    year: number;
    month: number;
    forecastType: string;
    value: number;
    aiForecastValue: number | null;
    status: string;
  }>;
  annualForecasts: Array<{
    businessUnit: string;
    year: number;
    value: number;
    aiForecastValue: number | null;
    status: string;
    note: string | null;
  }>;
  companyStatus: {
    isActive: boolean;
    reason: string | null;
    updatedAt: string;
  } | null;
  aiForecasts: Array<{
    businessUnit: string;
    year: number;
    month: number;
    forecastValue: number;
    confidenceScore: number | null;
    modelVersion: string;
    explanation: string | null;
    generatedAt: string;
  }>;
  monthlyTrend: PetyrMonthlyRevenueTrend[];
  monthlyBusinessUnitView: PetyrCompanyBusinessUnitMonthlyView[];
  businessUnitSummary: PetyrBusinessUnitSummary[];
  changeHistory: PetyrForecastChangeHistorySession[];
};

export type PetyrForecastEntryCompany = PetyrCompanyOverview & {
  priorityScore: number;
};

export type PetyrCompanyNavigationOption = {
  companyName: string;
  csmName: string;
  isForecastActive: boolean | null;
  priorityScore: number;
};

export type PetyrBusinessUnitRevenueSummary = {
  businessUnit: string;
  actualRevenue: number;
  plannedFuture: number;
  initialForecast: number | null;
  forecast: number | null;
  forecastSource: "annual" | "monthly" | null;
  previousMonthForecast: number;
  ongoingForecast: number;
  annualForecast: number;
  aiForecast: number;
  closedRevenueCampaignsCount: number;
  plannedFutureCampaignsCount: number;
  monthlyForecastRowsCount: number;
  previousMonthForecastRowsCount: number;
  initialForecastRowsCount: number;
  annualForecastRowsCount: number;
  aiForecastRowsCount: number;
  normalizedToOtherCount: number;
};

export type PetyrBusinessUnitSummary = PetyrBusinessUnitRevenueSummary;

export type PetyrMonthlyRevenueTrend = {
  month: number;
  actualRevenue: number;
  previousMonthForecast: number;
  ongoingForecast: number;
  aiForecast: number;
};

export type PetyrManagementMonthlyMetric = {
  month: number;
  forecast: number;
  worked: number;
  planned: number;
  workedAndPlanned: number;
};

export type PetyrManagementAggregateKind = "branch" | "business_unit" | "csm";

export type PetyrManagementAggregateRow = {
  kind: PetyrManagementAggregateKind;
  key: string;
  label: string;
  yearlyObjective: number | null;
  hasYearlyObjective: boolean;
  initialForecast: number | null;
  ongoingForecast: number | null;
  forecast: number;
  workedYtd: number;
  workedYtdPct: number | null;
  plannedFuture: number;
  workedAndPlanned: number;
  workedAndPlannedPct: number | null;
  denominatorNote: string;
  monthly: PetyrManagementMonthlyMetric[];
};

export type PetyrManagementTotals = {
  companiesCount: number;
  activeCompaniesCount: number;
  actualRevenue: number;
  previousMonthForecast: number;
  ongoingForecast: number;
  annualForecast: number;
  aiForecast: number;
  residualAgreementValue: number;
  totalAgreementValue: number;
};

export type PetyrCsmRevenueSummary = PetyrManagementTotals & {
  csmName: string;
  dataQualityIssuesCount: number;
};

export type PetyrManagementView = {
  year: number;
  reportingMonth: number;
  totals: PetyrManagementTotals;
  monthlyTotals: PetyrManagementMonthlyMetric[];
  branchAggregates: PetyrManagementAggregateRow[];
  businessUnitAggregates: PetyrManagementAggregateRow[];
  csmAggregates: PetyrManagementAggregateRow[];
  csmDenominatorNote: string;
  plannedSourceNote: string;
  monthlyTrend: PetyrMonthlyRevenueTrend[];
  companies: PetyrCompanyOverview[];
  csmSummaries: PetyrCsmRevenueSummary[];
  businessUnits: PetyrBusinessUnitSummary[];
  riskBreakdown: Array<{
    status: string;
    companiesCount: number;
  }>;
};

export type PetyrCsmOverview = {
  csmName: string;
  year: number;
  reportingMonth: number;
  totals: PetyrManagementTotals;
  monthlyTrend: PetyrMonthlyRevenueTrend[];
  companies: PetyrCompanyOverview[];
  businessUnits: PetyrBusinessUnitSummary[];
};

export type PetyrCsmOverviewBusinessUnitForecast = {
  businessUnit: string;
  actualRevenue: number;
  previousMonthForecast: number;
  ongoingForecast: number;
  aiForecast: number;
};

export type PetyrCsmOverviewCompanyMonth = {
  year: number;
  month: number;
  businessUnits: PetyrCsmOverviewBusinessUnitForecast[];
};

export type PetyrCsmOverviewCompany = PetyrCompanyOverview & {
  months: PetyrCsmOverviewCompanyMonth[];
};

export type PetyrCsmUrgentActionTarget = "company" | "forecast-entry";

export type PetyrCsmUrgentActionCompany = {
  companyName: string;
  csmName: string;
  reason: string;
  detail: string;
  target: PetyrCsmUrgentActionTarget;
  year: number;
  month: number;
  businessUnit: string | null;
  agreementName: string | null;
  agreementExpiry: string | null;
  agreementDealLink: string | null;
  residualAgreementValue: number;
  totalAgreementValue: number;
};

export type PetyrCsmUrgentAction = {
  id: "forecast-update" | "expiring-agreements" | "expired-agreement-residual" | "high-residual" | "business-unit-gap";
  title: string;
  description: string;
  companies: PetyrCsmUrgentActionCompany[];
};

export type PetyrCsmOverviewWorkspace = {
  year: number;
  currentMonth: number;
  nextMonth: number;
  csmNames: string[];
  companies: PetyrCsmOverviewCompany[];
  urgentActions: PetyrCsmUrgentAction[];
};

export type PetyrForecastValueContext = {
  value: number;
  status: string | null;
  updatedAt: string | null;
};

export type PetyrForecastEntryBusinessUnitContext = {
  businessUnit: string;
  actualRevenue: number;
  previousMonthForecast: PetyrForecastValueContext;
  ongoingForecast: PetyrForecastValueContext;
  annualForecast: PetyrForecastValueContext;
  aiForecast: {
    value: number | null;
    confidenceScore: number | null;
    modelVersion: string | null;
    explanation: string | null;
    generatedAt: string | null;
  };
};

export type PetyrForecastEntryContext = {
  csmName: string;
  companyName: string;
  year: number;
  month: number;
  entryMode: ForecastEntryMode;
  company: PetyrCompanyOverview | null;
  companyStatus: {
    isActive: boolean;
    reason: string | null;
    updatedAt: string;
  } | null;
  businessUnits: PetyrForecastEntryBusinessUnitContext[];
  campaigns: PetyrCampaignDetail[];
  agreements: PetyrAgreementDetail[];
};

export type PetyrAnnualForecastEntryPortfolioCompany = {
  companyName: string;
  csmName: string;
  companyStatus: {
    isActive: boolean;
    reason: string | null;
    updatedAt: string;
  } | null;
  revenueByBusinessUnit: Map<string, number>;
  plannedByBusinessUnit: Map<string, number>;
  annualAiForecastsByBusinessUnit: Map<
    string,
    {
      value: number;
      confidenceScores: number[];
      modelVersion: string | null;
      generatedAt: string | null;
    }
  >;
};

function sqlIdentifier(identifier: string) {
  if (!SAFE_IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(`Unsafe PostgreSQL identifier: ${identifier}`);
  }

  return Prisma.raw(`"${identifier}"`);
}

function selectedTextColumn(column: ResolvableColumn | null, alias: string) {
  return column
    ? Prisma.sql`${sqlIdentifier(column.dbColumnName)} AS ${sqlIdentifier(alias)}`
    : Prisma.sql`NULL::text AS ${sqlIdentifier(alias)}`;
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function normalizeCellValue(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || "";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function createResult<T>(data: T, diagnostics: string[]): PetyrDataServiceResult<T> {
  return {
    source: "postgresql",
    diagnostics: [...new Set(diagnostics)],
    data
  };
}

async function relationExists(relationName: string) {
  const rows = await prisma.$queryRaw<RelationExistsRow[]>`
    SELECT to_regclass(${relationName}) IS NOT NULL AS "exists"
  `;

  return rows[0]?.exists ?? false;
}

async function getTableColumns(tableName: string) {
  const rows = await prisma.$queryRaw<TableColumnRow[]>`
    SELECT "column_name", "ordinal_position"
    FROM information_schema.columns
    WHERE "table_schema" = current_schema()
      AND "table_name" = ${tableName}
    ORDER BY "ordinal_position" ASC
  `;

  return rows
    .map((row) => ({
      name: row.column_name,
      position: row.ordinal_position
    }))
    .filter((column) => !SYSTEM_COLUMNS.has(column.name));
}

async function getColumnMappings(sourceKey: SourceKey, diagnostics: string[]) {
  if (!(await relationExists("redash_column_mapping"))) {
    diagnostics.push("redash_column_mapping is missing. Petyr can inspect materialized table columns, but cannot use Redash column mapping metadata.");
    return [];
  }

  return prisma.$queryRaw<ColumnMappingRow[]>`
    SELECT
      "redash_column_name" AS "redashColumnName",
      "db_column_name" AS "dbColumnName",
      "position",
      "detected_type" AS "detectedType"
    FROM "redash_column_mapping"
    WHERE "source_key" = ${sourceKey}
    ORDER BY "position" ASC, "db_column_name" ASC
  `;
}

function buildResolvableColumns(columns: TableColumn[], mappings: ColumnMappingRow[]) {
  const tableColumnNames = new Set(columns.map((column) => column.name));
  const resolvableByDbColumn = new Map<string, ResolvableColumn>();

  for (const mapping of mappings) {
    if (!tableColumnNames.has(mapping.dbColumnName)) continue;

    resolvableByDbColumn.set(mapping.dbColumnName, {
      dbColumnName: mapping.dbColumnName,
      redashColumnName: mapping.redashColumnName,
      position: mapping.position,
      detectedType: mapping.detectedType
    });
  }

  for (const column of columns) {
    if (resolvableByDbColumn.has(column.name)) continue;

    resolvableByDbColumn.set(column.name, {
      dbColumnName: column.name,
      redashColumnName: column.name,
      position: column.position,
      detectedType: null
    });
  }

  return [...resolvableByDbColumn.values()];
}

function resolveMappedColumn(input: {
  sourceKey: SourceKey;
  tableName: string;
  columns: ResolvableColumn[];
  logicalField: PetyrLogicalField;
  diagnostics: string[];
  required?: boolean;
}) {
  const source = getRedashPetyrSourceMapping(input.sourceKey);
  const fieldMapping = source.fields[input.logicalField];

  if (!fieldMapping.dbColumnName) {
    if (input.required) {
      input.diagnostics.push(
        `${input.tableName}.${input.logicalField} is not mapped in redashFieldMapping.ts: ${fieldMapping.note}`
      );
    }

    return null;
  }

  const column = input.columns.find((item) => item.dbColumnName === fieldMapping.dbColumnName) ?? null;

  if (!column && input.columns.length === 0) {
    return null;
  }

  if (!column) {
    input.diagnostics.push(
      `${input.tableName}.${input.logicalField} maps to "${fieldMapping.dbColumnName}", but that column does not exist in PostgreSQL.`
    );
  }

  return column;
}

function resolveDirectColumn(columns: ResolvableColumn[], dbColumnName: string) {
  return columns.find((column) => column.dbColumnName === dbColumnName) ?? null;
}

async function buildSourceContext<TColumns extends Record<string, ResolvableColumn | null>>(input: {
  sourceKey: SourceKey;
  tableName: string;
  diagnostics: string[];
  resolveColumns: (columns: ResolvableColumn[]) => TColumns;
}) {
  if (!(await relationExists(input.tableName))) {
    input.diagnostics.push(`${input.tableName} does not exist. Run the Redash ingestor sync to materialize latest rows before Petyr can use this source.`);
    return {
      sourceKey: input.sourceKey,
      tableName: input.tableName,
      exists: false,
      columns: input.resolveColumns([])
    } satisfies SourceContext<TColumns>;
  }

  const [tableColumns, mappings] = await Promise.all([
    getTableColumns(input.tableName),
    getColumnMappings(input.sourceKey, input.diagnostics)
  ]);
  const resolvableColumns = buildResolvableColumns(tableColumns, mappings);

  return {
    sourceKey: input.sourceKey,
    tableName: input.tableName,
    exists: true,
    columns: input.resolveColumns(resolvableColumns)
  } satisfies SourceContext<TColumns>;
}

async function buildCampaignContext(diagnostics: string[]) {
  const source = CAMPAIGN_SOURCE;

  const context = await buildSourceContext({
    sourceKey: source.sourceKey,
    tableName: source.tableName,
    diagnostics,
    resolveColumns: (columns): CampaignColumns => ({
      company: resolveMappedColumn({ sourceKey: source.sourceKey, tableName: source.tableName, columns, logicalField: "companyName", diagnostics, required: true }),
      csm: resolveMappedColumn({ sourceKey: source.sourceKey, tableName: source.tableName, columns, logicalField: "csmName", diagnostics }),
      branch: resolveMappedColumn({ sourceKey: source.sourceKey, tableName: source.tableName, columns, logicalField: "branch", diagnostics }),
      businessUnit: resolveMappedColumn({ sourceKey: source.sourceKey, tableName: source.tableName, columns, logicalField: "businessUnit", diagnostics }),
      revenue: resolveMappedColumn({ sourceKey: source.sourceKey, tableName: source.tableName, columns, logicalField: "campaignValue", diagnostics }),
      cost: resolveMappedColumn({ sourceKey: source.sourceKey, tableName: source.tableName, columns, logicalField: "campaignCost", diagnostics }),
      grossMarginPct: resolveMappedColumn({ sourceKey: source.sourceKey, tableName: source.tableName, columns, logicalField: "grossMarginPct", diagnostics }),
      campaignName: resolveMappedColumn({ sourceKey: source.sourceKey, tableName: source.tableName, columns, logicalField: "campaignName", diagnostics }),
      status: resolveMappedColumn({ sourceKey: source.sourceKey, tableName: source.tableName, columns, logicalField: "campaignStatus", diagnostics }),
      agreementName: resolveMappedColumn({ sourceKey: source.sourceKey, tableName: source.tableName, columns, logicalField: "agreementName", diagnostics }),
      startDate: resolveMappedColumn({ sourceKey: source.sourceKey, tableName: source.tableName, columns, logicalField: "campaignStartDate", diagnostics }),
      endDate: resolveMappedColumn({ sourceKey: source.sourceKey, tableName: source.tableName, columns, logicalField: "campaignEndDate", diagnostics }),
      link: resolveMappedColumn({ sourceKey: source.sourceKey, tableName: source.tableName, columns, logicalField: "campaignLink", diagnostics })
    })
  });

  return context;
}

async function buildAgreementContext(diagnostics: string[]) {
  const source = AGREEMENT_SOURCE;

  const context = await buildSourceContext({
    sourceKey: source.sourceKey,
    tableName: source.tableName,
    diagnostics,
    resolveColumns: (columns): AgreementColumns => ({
      company: resolveMappedColumn({ sourceKey: source.sourceKey, tableName: source.tableName, columns, logicalField: "companyName", diagnostics, required: true }),
      csm: resolveMappedColumn({ sourceKey: source.sourceKey, tableName: source.tableName, columns, logicalField: "csmName", diagnostics }),
      agreementName: resolveMappedColumn({ sourceKey: source.sourceKey, tableName: source.tableName, columns, logicalField: "agreementName", diagnostics }),
      status: null,
      totalValue: resolveMappedColumn({ sourceKey: source.sourceKey, tableName: source.tableName, columns, logicalField: "agreementValue", diagnostics }),
      residualValue: resolveMappedColumn({ sourceKey: source.sourceKey, tableName: source.tableName, columns, logicalField: "agreementResidual", diagnostics }),
      expiryDate: resolveMappedColumn({ sourceKey: source.sourceKey, tableName: source.tableName, columns, logicalField: "agreementExpiryDate", diagnostics }),
      link: resolveMappedColumn({ sourceKey: source.sourceKey, tableName: source.tableName, columns, logicalField: "agreementLink", diagnostics })
    })
  });

  return context;
}

async function buildOwnershipContext(diagnostics: string[]) {
  const source = OWNERSHIP_SOURCE;

  const context = await buildSourceContext({
    sourceKey: source.sourceKey,
    tableName: source.tableName,
    diagnostics,
    resolveColumns: (columns): OwnershipColumns => ({
      company: resolveMappedColumn({ sourceKey: source.sourceKey, tableName: source.tableName, columns, logicalField: "companyName", diagnostics, required: true }),
      csm: resolveMappedColumn({ sourceKey: source.sourceKey, tableName: source.tableName, columns, logicalField: "csmName", diagnostics }),
      branch: resolveMappedColumn({ sourceKey: source.sourceKey, tableName: source.tableName, columns, logicalField: "branch", diagnostics }),
      workspaceCreatedOn: resolveDirectColumn(columns, "workspace_created_on"),
      workspaceUpdatedOn: resolveDirectColumn(columns, "workspace_updated_on")
    })
  });

  return context;
}

async function queryCampaignRows(context: SourceContext<CampaignColumns>) {
  if (!context.exists || !context.columns.company) return [];

  const rows = await prisma.$queryRaw<MaterializedCampaignRow[]>(Prisma.sql`
    SELECT ${Prisma.join([
      Prisma.sql`"row_index"::integer AS "row_index"`,
      selectedTextColumn(context.columns.company, "company_name"),
      selectedTextColumn(context.columns.csm, "csm_name"),
      selectedTextColumn(context.columns.branch, "branch_name"),
      selectedTextColumn(context.columns.businessUnit, "business_unit"),
      selectedTextColumn(context.columns.revenue, "revenue_value"),
      selectedTextColumn(context.columns.cost, "cost_value"),
      selectedTextColumn(context.columns.grossMarginPct, "gross_margin_pct"),
      selectedTextColumn(context.columns.campaignName, "campaign_name"),
      selectedTextColumn(context.columns.status, "campaign_status"),
      selectedTextColumn(context.columns.agreementName, "agreement_name"),
      selectedTextColumn(context.columns.startDate, "start_date"),
      selectedTextColumn(context.columns.endDate, "end_date"),
      selectedTextColumn(context.columns.link, "campaign_link")
    ])}
    FROM ${sqlIdentifier(context.tableName)}
  `);

  logPetyrPerformance("queryCampaignRows", {
    tableName: context.tableName,
    rowCount: rows.length
  });

  return rows;
}

async function queryAgreementRows(context: SourceContext<AgreementColumns>) {
  if (!context.exists || !context.columns.company) return [];

  const rows = await prisma.$queryRaw<MaterializedAgreementRow[]>(Prisma.sql`
    SELECT ${Prisma.join([
      selectedTextColumn(context.columns.company, "company_name"),
      selectedTextColumn(context.columns.csm, "csm_name"),
      selectedTextColumn(context.columns.agreementName, "agreement_name"),
      selectedTextColumn(context.columns.status, "agreement_status"),
      selectedTextColumn(context.columns.totalValue, "total_value"),
      selectedTextColumn(context.columns.residualValue, "residual_value"),
      selectedTextColumn(context.columns.expiryDate, "expiry_date"),
      selectedTextColumn(context.columns.link, "agreement_link")
    ])}
    FROM ${sqlIdentifier(context.tableName)}
  `);

  logPetyrPerformance("queryAgreementRows", {
    tableName: context.tableName,
    rowCount: rows.length
  });

  return rows;
}

async function queryOwnershipRows(context: SourceContext<OwnershipColumns>) {
  if (!context.exists || !context.columns.company) return [];

  const rows = await prisma.$queryRaw<MaterializedOwnershipRow[]>(Prisma.sql`
    SELECT ${Prisma.join([
      selectedTextColumn(context.columns.company, "company_name"),
      selectedTextColumn(context.columns.csm, "csm_name"),
      selectedTextColumn(context.columns.branch, "branch_name"),
      selectedTextColumn(context.columns.workspaceCreatedOn, "workspace_created_on"),
      selectedTextColumn(context.columns.workspaceUpdatedOn, "workspace_updated_on")
    ])}
    FROM ${sqlIdentifier(context.tableName)}
  `);

  logPetyrPerformance("queryOwnershipRows", {
    tableName: context.tableName,
    rowCount: rows.length
  });

  return rows;
}

function normalizedSqlValues(values: Iterable<string>) {
  return [...new Set([...values].map((value) => normalizeKey(value)).filter(Boolean))];
}

async function queryCampaignRowsForCompanies(context: SourceContext<CampaignColumns>, companies: Iterable<string>) {
  const companyKeys = normalizedSqlValues(companies);
  if (!context.exists || !context.columns.company || companyKeys.length === 0) return [];

  const rows = await prisma.$queryRaw<MaterializedCampaignRow[]>(Prisma.sql`
    SELECT ${Prisma.join([
      Prisma.sql`"row_index"::integer AS "row_index"`,
      selectedTextColumn(context.columns.company, "company_name"),
      selectedTextColumn(context.columns.csm, "csm_name"),
      selectedTextColumn(context.columns.branch, "branch_name"),
      selectedTextColumn(context.columns.businessUnit, "business_unit"),
      selectedTextColumn(context.columns.revenue, "revenue_value"),
      selectedTextColumn(context.columns.cost, "cost_value"),
      selectedTextColumn(context.columns.grossMarginPct, "gross_margin_pct"),
      selectedTextColumn(context.columns.campaignName, "campaign_name"),
      selectedTextColumn(context.columns.status, "campaign_status"),
      selectedTextColumn(context.columns.agreementName, "agreement_name"),
      selectedTextColumn(context.columns.startDate, "start_date"),
      selectedTextColumn(context.columns.endDate, "end_date"),
      selectedTextColumn(context.columns.link, "campaign_link")
    ])}
    FROM ${sqlIdentifier(context.tableName)}
    WHERE lower(trim(${sqlIdentifier(context.columns.company.dbColumnName)}::text)) IN (${Prisma.join(companyKeys)})
  `);

  logPetyrPerformance("queryCampaignRows", {
    tableName: context.tableName,
    rowCount: rows.length,
    scoped: true,
    companiesCount: companyKeys.length
  });

  return rows;
}

async function queryAgreementRowsForCompanies(context: SourceContext<AgreementColumns>, companies: Iterable<string>) {
  const companyKeys = normalizedSqlValues(companies);
  if (!context.exists || !context.columns.company || companyKeys.length === 0) return [];

  const rows = await prisma.$queryRaw<MaterializedAgreementRow[]>(Prisma.sql`
    SELECT ${Prisma.join([
      selectedTextColumn(context.columns.company, "company_name"),
      selectedTextColumn(context.columns.csm, "csm_name"),
      selectedTextColumn(context.columns.agreementName, "agreement_name"),
      selectedTextColumn(context.columns.status, "agreement_status"),
      selectedTextColumn(context.columns.totalValue, "total_value"),
      selectedTextColumn(context.columns.residualValue, "residual_value"),
      selectedTextColumn(context.columns.expiryDate, "expiry_date"),
      selectedTextColumn(context.columns.link, "agreement_link")
    ])}
    FROM ${sqlIdentifier(context.tableName)}
    WHERE lower(trim(${sqlIdentifier(context.columns.company.dbColumnName)}::text)) IN (${Prisma.join(companyKeys)})
  `);

  logPetyrPerformance("queryAgreementRows", {
    tableName: context.tableName,
    rowCount: rows.length,
    scoped: true,
    companiesCount: companyKeys.length
  });

  return rows;
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
    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
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

function parseOptionalNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && !value.trim()) return null;

  return parseNumber(value);
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
  if (Number.isNaN(timestamp)) return null;

  return new Date(timestamp);
}

function toIsoDate(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : null;
}

function ownershipTime(value: Date | null) {
  return value?.getTime() ?? 0;
}

function compareOwnershipCandidate(candidate: CompanyOwnership, existing: CompanyOwnership) {
  const updatedDiff = ownershipTime(candidate.workspaceUpdatedOn) - ownershipTime(existing.workspaceUpdatedOn);
  if (updatedDiff !== 0) return updatedDiff;

  const createdDiff = ownershipTime(candidate.workspaceCreatedOn) - ownershipTime(existing.workspaceCreatedOn);
  if (createdDiff !== 0) return createdDiff;

  return candidate.csmName.localeCompare(existing.csmName);
}

function workspaceAssociationCutoff(today = new Date()) {
  const cutoff = new Date(today);
  cutoff.setMonth(cutoff.getMonth() - RECENT_WORKSPACE_ASSOCIATION_MONTHS);
  return cutoff;
}

function isRecentWorkspaceAssociation(ownership: Pick<CompanyOwnership, "workspaceUpdatedOn">, today = new Date()) {
  const updatedOn = ownership.workspaceUpdatedOn;
  return Boolean(updatedOn && updatedOn.getTime() >= workspaceAssociationCutoff(today).getTime());
}

function buildCompanyOwnershipMaps(rows: MaterializedOwnershipRow[]): CompanyOwnershipMaps {
  const byCompany = new Map<string, CompanyOwnership>();
  const byCompanyAndCsm = new Map<string, CompanyOwnership>();

  for (const row of rows) {
    const companyName = normalizeCellValue(row.company_name);
    if (!companyName) continue;

    const candidate: CompanyOwnership = {
      companyName,
      csmName: normalizeCellValue(row.csm_name) || "Unassigned",
      branchName: normalizeCellValue(row.branch_name) || UNASSIGNED_BRANCH,
      workspaceCreatedOn: parseDate(row.workspace_created_on),
      workspaceUpdatedOn: parseDate(row.workspace_updated_on)
    };
    const companyKey = normalizeKey(companyName);
    const existing = byCompany.get(companyKey);

    if (!existing || compareOwnershipCandidate(candidate, existing) > 0) {
      byCompany.set(companyKey, candidate);
    }

    const associationKey = [companyKey, normalizeKey(candidate.csmName)].join("\u0000");
    const existingAssociation = byCompanyAndCsm.get(associationKey);
    if (!existingAssociation || compareOwnershipCandidate(candidate, existingAssociation) > 0) {
      byCompanyAndCsm.set(associationKey, candidate);
    }
  }

  const recentAssociations = [...byCompanyAndCsm.values()]
    .filter((ownership) => isRecentWorkspaceAssociation(ownership))
    .sort((left, right) => left.csmName.localeCompare(right.csmName) || left.companyName.localeCompare(right.companyName));

  return {
    byCompany,
    recentAssociations,
    hasRows: byCompany.size > 0
  };
}

function companyOwnership(input: CompanyOwnershipMaps | undefined, companyName: string) {
  return input?.byCompany.get(normalizeKey(companyName)) ?? null;
}

function recentCompanyOwnershipAssociations(input: CompanyOwnershipMaps | undefined) {
  return input?.recentAssociations ?? [];
}

function expandCompanyOverviewsForRecentOwnership(companies: PetyrCompanyOverview[], ownershipMaps: CompanyOwnershipMaps | undefined) {
  const overviewByCompany = new Map(companies.map((company) => [normalizeKey(company.companyName), company]));
  const expanded: PetyrCompanyOverview[] = [];
  const expandedKeys = new Set<string>();

  for (const ownership of recentCompanyOwnershipAssociations(ownershipMaps)) {
    const overview = overviewByCompany.get(normalizeKey(ownership.companyName));
    if (!overview) continue;

    const key = [normalizeKey(ownership.companyName), normalizeKey(ownership.csmName || "Unassigned")].join("\u0000");
    if (expandedKeys.has(key)) continue;
    expandedKeys.add(key);
    expanded.push({
      ...overview,
      companyName: ownership.companyName,
      csmName: ownership.csmName || "Unassigned"
    });
  }

  return expanded.length > 0 ? expanded : companies;
}

function decimalToNumber(value: Prisma.Decimal | null | undefined) {
  return value ? Number(value.toString()) : null;
}

function addCsm(accumulator: CompanyAccumulator, csmName: string | null | undefined) {
  const normalized = normalizeCellValue(csmName);
  if (!normalized) return;

  accumulator.csmCounts.set(normalized, (accumulator.csmCounts.get(normalized) ?? 0) + 1);
}

function mostCommonCsm(accumulator: CompanyAccumulator) {
  let selected = "";
  let selectedCount = 0;

  for (const [csmName, count] of accumulator.csmCounts.entries()) {
    if (count > selectedCount || (count === selectedCount && csmName.localeCompare(selected) < 0)) {
      selected = csmName;
      selectedCount = count;
    }
  }

  return selected || "Unassigned";
}

function ensureCompany(companies: Map<string, CompanyAccumulator>, companyName: string) {
  const normalizedKey = normalizeKey(companyName);
  const existing = companies.get(normalizedKey);
  if (existing) return existing;

  const created: CompanyAccumulator = {
    companyName,
    csmCounts: new Map(),
    campaignsCount: 0,
    agreementsCount: 0,
    activeAgreementsCount: 0,
    currentYearRevenue: 0,
    totalAgreementValue: 0,
    residualAgreementValue: 0,
    activeTotalAgreementValue: 0,
    activeResidualAgreementValue: 0,
    lastCampaignEndDate: null,
    primaryAgreementName: null,
    primaryAgreementExpiry: null,
    primaryAgreementActiveRank: Number.POSITIVE_INFINITY,
    primaryAgreementExpirySortValue: Number.POSITIVE_INFINITY,
    primaryAgreementResidualValue: Number.NEGATIVE_INFINITY,
    primaryAgreementTotalValue: Number.NEGATIVE_INFINITY,
    primaryAgreementNameSortValue: "",
    previousMonthForecast: 0,
    ongoingForecast: 0,
    annualForecast: 0,
    aiForecast: 0,
    forecastStatus: null
  };

  companies.set(normalizedKey, created);
  return created;
}

function normalizeBusinessUnit(value: string | null | undefined) {
  return normalizePetyrBusinessUnit(value).businessUnit;
}

function incrementCount(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function countMapTotal(map: Map<string, number>) {
  return [...map.values()].reduce((sum, value) => sum + value, 0);
}

function formatCountMap(map: Map<string, number>) {
  const sorted = [...map.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const visible = sorted.slice(0, 8).map(([value, count]) => `${value} (${count})`);
  const suffix = sorted.length > visible.length ? `, and ${sorted.length - visible.length} more` : "";

  return `${visible.join(", ")}${suffix}`;
}

function addBusinessUnitFallbackDiagnostics(input: {
  diagnostics: string[];
  campaignContext: SourceContext<CampaignColumns>;
  campaignRows: MaterializedCampaignRow[];
  label: string;
}) {
  if (!input.campaignContext.columns.businessUnit) {
    if (input.campaignRows.length > 0) {
      input.diagnostics.push(
        `${input.label}: Master campaigns has no mapped Business Unit column, so Petyr normalizes ${input.campaignRows.length} campaign row(s) to Other.`
      );
    }

    return;
  }

  let missingCount = 0;
  const unknownCounts = new Map<string, number>();
  const unofficialCounts = new Map<string, number>();

  for (const row of input.campaignRows) {
    const result = normalizePetyrBusinessUnit(row.business_unit);

    if (result.reason === "missing") {
      missingCount += 1;
    } else if (result.reason === "unknown") {
      incrementCount(unknownCounts, result.originalValue || "Unknown");
    } else if (result.reason === "unofficial") {
      incrementCount(unofficialCounts, result.originalValue);
    }
  }

  const unknownCount = countMapTotal(unknownCounts);
  const unofficialCount = countMapTotal(unofficialCounts);
  const fallbackCount = missingCount + unknownCount + unofficialCount;

  if (missingCount > 0) {
    input.diagnostics.push(
      `${input.label}: ${missingCount} campaign row(s) have missing Business Unit and are normalized to Other.`
    );
  }

  if (unknownCount > 0) {
    input.diagnostics.push(
      `${input.label}: ${unknownCount} campaign row(s) have unknown Business Unit values (${formatCountMap(unknownCounts)}) and are normalized to Other.`
    );
  }

  if (unofficialCount > 0) {
    input.diagnostics.push(
      `${input.label}: ${unofficialCount} campaign row(s) have Business Unit values outside the official list (${formatCountMap(unofficialCounts)}) and are normalized to Other.`
    );
  }

  if (fallbackCount > 0) {
    input.diagnostics.push(
      `${input.label}: Business Unit fallback to Other is active for ${fallbackCount} campaign row(s). Official Business Units are ${PETYR_BUSINESS_UNITS.join(", ")}.`
    );
  }
}

function isAgreementActive(row: MaterializedAgreementRow, today: Date) {
  const status = normalizeCellValue(row.agreement_status).toLowerCase();
  const expiryDate = parseDate(row.expiry_date);

  if (expiryDate && daysUntil(expiryDate, today) < 0) return false;

  if (status) {
    if (["cancel", "closed", "expired", "completed", "lost", "inactive", "terminat"].some((token) => status.includes(token))) return false;
    if (["active", "confirmed", "open", "ongoing", "signed", "in corso", "aperto"].some((token) => status.includes(token))) return true;
  }

  if (expiryDate) return true;

  return true;
}

type AgreementOrderingValues = {
  activeRank: number;
  expirySortValue: number;
  residualValue: number;
  totalValue: number;
  nameSortValue: string;
};

type AgreementEvidence = {
  agreementName: string;
  agreementExpiry: string | null;
  agreementDealLink: string | null;
  residualAgreementValue: number;
  totalAgreementValue: number;
};

function agreementOrderingValues(row: MaterializedAgreementRow, today: Date): AgreementOrderingValues {
  return {
    activeRank: isAgreementActive(row, today) ? 0 : 1,
    expirySortValue: parseDate(row.expiry_date)?.getTime() ?? Number.POSITIVE_INFINITY,
    residualValue: parseNumber(row.residual_value),
    totalValue: parseNumber(row.total_value),
    nameSortValue: normalizeCellValue(row.agreement_name) || "Unnamed agreement"
  };
}

function compareAgreementOrderingValues(left: AgreementOrderingValues, right: AgreementOrderingValues) {
  return (
    left.activeRank - right.activeRank ||
    left.expirySortValue - right.expirySortValue ||
    right.residualValue - left.residualValue ||
    right.totalValue - left.totalValue ||
    left.nameSortValue.localeCompare(right.nameSortValue)
  );
}

function compareMaterializedAgreementRows(left: MaterializedAgreementRow, right: MaterializedAgreementRow, today: Date) {
  return compareAgreementOrderingValues(agreementOrderingValues(left, today), agreementOrderingValues(right, today));
}

function agreementEvidenceFromRow(row: MaterializedAgreementRow, agreementDealLinks: Map<string, string>): AgreementEvidence {
  const agreementName = normalizeCellValue(row.agreement_name) || "Unnamed agreement";

  return {
    agreementName,
    agreementExpiry: toIsoDate(parseDate(row.expiry_date)),
    agreementDealLink: agreementDealLinks.get(agreementDetailKey(row.company_name, agreementName)) ?? null,
    residualAgreementValue: roundMoney(parseNumber(row.residual_value)),
    totalAgreementValue: roundMoney(parseNumber(row.total_value))
  };
}

function buildNearestActiveResidualAgreementByCompany(input: {
  agreementRows: MaterializedAgreementRow[];
  campaignRows: MaterializedCampaignRow[];
  today: Date;
}) {
  const agreementDealLinks = buildAgreementDealLinkMap(input.campaignRows);
  const byCompany = new Map<string, AgreementEvidence>();

  const rows = input.agreementRows
    .filter((row) => normalizeCellValue(row.company_name) && isAgreementActive(row, input.today) && parseNumber(row.residual_value) > 0)
    .sort((left, right) => compareMaterializedAgreementRows(left, right, input.today));

  for (const row of rows) {
    const companyKey = normalizeKey(normalizeCellValue(row.company_name));
    if (!companyKey || byCompany.has(companyKey)) continue;

    byCompany.set(companyKey, agreementEvidenceFromRow(row, agreementDealLinks));
  }

  return byCompany;
}

function buildAccuracyLabel(forecast: number, actual: number) {
  if (forecast <= 0 || actual <= 0) return "n/a";

  const accuracy = Math.max(0, 100 - Math.abs(forecast - actual) / actual * 100);
  return formatPetyrPercent(accuracy);
}

function buildDataQualityStatus(accumulator: CompanyAccumulator, csmName: string) {
  if (accumulator.forecastStatus?.isActive === false) {
    return accumulator.forecastStatus.reason ? `Inactive: ${accumulator.forecastStatus.reason}` : "Inactive for forecasting";
  }

  const gaps = [];
  if (accumulator.campaignsCount === 0) gaps.push("no campaigns");
  if (accumulator.agreementsCount === 0) gaps.push("no agreements");
  if (csmName === "Unassigned") gaps.push("missing CSM");

  return gaps.length > 0 ? `Data gaps: ${gaps.join(", ")}` : "Ready";
}

async function readForecastMonthlyRows(diagnostics: string[], where?: Prisma.ForecastMonthlyWhereInput) {
  if (!(await relationExists("forecast_monthly"))) {
    diagnostics.push("forecast_monthly is missing. Apply the forecasting app Prisma schema before Petyr can read CSM monthly forecasts.");
    return [];
  }

  const rows = await prisma.forecastMonthly.findMany({ where });
  logPetyrPerformance("readForecastMonthlyRows", {
    tableName: "forecast_monthly",
    rowCount: rows.length,
    hasFilter: Boolean(where)
  });

  return rows;
}

async function readForecastAnnualRows(diagnostics: string[], where?: Prisma.ForecastAnnualWhereInput) {
  if (!(await relationExists("forecast_annual"))) {
    diagnostics.push("forecast_annual is missing. Apply the forecasting app Prisma schema before Petyr can read annual forecasts.");
    return [];
  }

  const rows = await prisma.forecastAnnual.findMany({ where });
  logPetyrPerformance("readForecastAnnualRows", {
    tableName: "forecast_annual",
    rowCount: rows.length,
    hasFilter: Boolean(where)
  });

  return rows;
}

async function readCompanyForecastStatuses(diagnostics: string[], where?: Prisma.CompanyForecastStatusWhereInput) {
  if (!(await relationExists("company_forecast_status"))) {
    diagnostics.push("company_forecast_status is missing. Apply the forecasting app Prisma schema before Petyr can read company active states.");
    return [];
  }

  return prisma.companyForecastStatus.findMany({ where });
}

async function readAiForecastCacheRows(diagnostics: string[], filter: PetyrAiForecastCacheReadFilter = {}) {
  try {
    if (!(await relationExists("ai_forecast_cache"))) {
      diagnostics.push("ai_forecast_cache is missing. Apply the forecasting app Prisma schema before Petyr can read cached AI forecasts.");
      return [];
    }

    const companyNames = [...new Set((filter.companyNames ?? []).map((name) => name.trim()).filter(Boolean))];
    if (filter.companyNames && companyNames.length === 0) return [];

    const conditions = [
      Prisma.sql`status = 'success'`,
      Prisma.sql`month BETWEEN 1 AND 12`,
      Prisma.sql`business_unit <> ${PETYR_FORECAST_INTELLIGENCE_CACHE_BUSINESS_UNIT}`
    ];

    if (filter.year !== undefined) conditions.push(Prisma.sql`year = ${filter.year}`);
    if (filter.month !== undefined) conditions.push(Prisma.sql`month = ${filter.month}`);
    if (companyNames.length > 0) conditions.push(Prisma.sql`company_name IN (${Prisma.join(companyNames)})`);

    const limit = filter.limit ?? MAX_AI_FORECAST_CACHE_READ_ROWS;
    const rows = await prisma.$queryRaw<PetyrNumericAiForecastCacheRow[]>(Prisma.sql`
      SELECT
        id AS "id",
        company_name AS "companyName",
        business_unit AS "businessUnit",
        year AS "year",
        month AS "month",
        forecast_value AS "forecastValue",
        confidence_score AS "confidenceScore",
        model_version AS "modelVersion",
        generated_at AS "generatedAt"
      FROM (
        SELECT
          id,
          company_name,
          business_unit,
          year,
          month,
          forecast_value,
          confidence_score,
          model_version,
          generated_at,
          ROW_NUMBER() OVER (
            PARTITION BY company_name, business_unit, year, month
            ORDER BY generated_at DESC, updated_at DESC, id DESC
          ) AS row_number
        FROM ai_forecast_cache
        WHERE ${Prisma.join(conditions, " AND ")}
      ) latest_numeric_ai_forecasts
      WHERE row_number = 1
      ORDER BY "generatedAt" DESC, "id" DESC
      LIMIT ${limit}
    `);

    logPetyrPerformance("readAiForecastCacheRows", {
      tableName: "ai_forecast_cache",
      rowCount: rows.length,
      hasFilter: Boolean(filter.year !== undefined || filter.month !== undefined || companyNames.length > 0)
    });

    return rows;
  } catch (error) {
    diagnostics.push(`Unable to read numeric ai_forecast_cache rows from PostgreSQL: ${errorMessage(error)}. Petyr will continue without cached AI Forecast values.`);
    logPetyrPerformance("readAiForecastCacheRows", {
      tableName: "ai_forecast_cache",
      rowCount: 0,
      hasFilter: Boolean(filter.year !== undefined || filter.month !== undefined || (filter.companyNames?.length ?? 0) > 0),
      status: "error"
    });

    return [];
  }
}

function latestAiForecasts(rows: PetyrNumericAiForecastCacheRow[]) {
  const latestByKey = new Map<string, PetyrNumericAiForecastCacheRow>();

  for (const row of rows) {
    const key = [normalizeKey(row.companyName), normalizeKey(row.businessUnit), row.year, row.month].join("\u0000");
    const existing = latestByKey.get(key);

    if (!existing || row.generatedAt.getTime() > existing.generatedAt.getTime()) {
      latestByKey.set(key, row);
    }
  }

  return [...latestByKey.values()];
}

async function loadOverviewInputsUncached(year: number, month: number, diagnostics: string[]) {
  const [campaignContext, agreementContext, ownershipContext] = await Promise.all([
    buildCampaignContext(diagnostics),
    buildAgreementContext(diagnostics),
    buildOwnershipContext(diagnostics)
  ]);

  const [campaignRows, agreementRows, ownershipRows, monthlyRows, annualRows, companyStatuses, aiRows] = await Promise.all([
    queryCampaignRows(campaignContext),
    queryAgreementRows(agreementContext),
    queryOwnershipRows(ownershipContext),
    readForecastMonthlyRows(diagnostics, { year }),
    readForecastAnnualRows(diagnostics, { year }),
    readCompanyForecastStatuses(diagnostics),
    readAiForecastCacheRows(diagnostics, { year })
  ]);
  const ownershipMaps = buildCompanyOwnershipMaps(ownershipRows);
  const latestAiRows = latestAiForecasts(aiRows);

  logPetyrPerformance("loadOverviewInputs rows loaded", {
    year,
    month,
    campaignRows: campaignRows.length,
    agreementRows: agreementRows.length,
    ownershipRows: ownershipRows.length,
    forecastMonthlyRows: monthlyRows.length,
    forecastAnnualRows: annualRows.length,
    aiForecastCacheRows: aiRows.length,
    latestAiForecastCacheRows: latestAiRows.length
  });

  if (ownershipContext.exists && ownershipContext.columns.company && ownershipRows.length === 0) {
    diagnostics.push(`company_ownership is materialized but has no usable company owner rows. Petyr falls back to campaign/agreement CSM where available and groups Branch as "${UNASSIGNED_BRANCH}".`);
  }

  if (!ownershipMaps.hasRows) {
    diagnostics.push(`Company ownership fallback is active: Petyr infers CSM from campaign/agreement/Petyr rows where available and groups Branch as "${UNASSIGNED_BRANCH}" because canonical company ownership is unavailable.`);
  } else {
    if (!ownershipContext.columns.csm) {
      diagnostics.push("company_ownership has usable company rows but no CSM column. Petyr marks owners as Unassigned instead of inventing a CSM owner.");
    }

    if (!ownershipContext.columns.branch) {
      diagnostics.push(`company_ownership has usable company rows but no branch column. Petyr marks branches as "${UNASSIGNED_BRANCH}" instead of inventing branch ownership.`);
    }

    const companiesMissingOwnership = new Set<string>();
    for (const row of [...campaignRows, ...agreementRows]) {
      const companyName = normalizeCellValue(row.company_name);
      if (companyName && !companyOwnership(ownershipMaps, companyName)) {
        companiesMissingOwnership.add(normalizeKey(companyName));
      }
    }

    if (companiesMissingOwnership.size > 0) {
      diagnostics.push(`${companiesMissingOwnership.size} companies were not found in company_ownership. Petyr falls back to campaign/agreement CSM where available and groups Branch as "${UNASSIGNED_BRANCH}" for those companies only.`);
    }
  }

  addBusinessUnitFallbackDiagnostics({
    diagnostics,
    campaignContext,
    campaignRows,
    label: "Master campaigns Business Unit diagnostics"
  });

  return {
    campaignContext,
    agreementContext,
    ownershipContext,
    campaignRows,
    agreementRows,
    ownershipRows,
    ownershipMaps,
    monthlyRows,
    annualRows,
    companyStatuses,
    aiRows: latestAiRows
  };
}

function buildOverviewRows(input: {
  year: number;
  month: number;
  today: Date;
  campaignDateColumnExists: boolean;
  campaignRows: MaterializedCampaignRow[];
  agreementRows: MaterializedAgreementRow[];
  ownershipMaps?: CompanyOwnershipMaps;
  monthlyRows: ForecastMonthly[];
  annualRows: ForecastAnnual[];
  companyStatuses: CompanyForecastStatus[];
  aiRows: PetyrNumericAiForecastCacheRow[];
}) {
  const companies = new Map<string, CompanyAccumulator>();
  const aiCacheKeys = new Set(
    input.aiRows
      .filter((row) => row.month === input.month)
      .map((row) => [normalizeKey(row.companyName), normalizeKey(row.businessUnit), row.month].join("\u0000"))
  );

  if (input.ownershipMaps?.hasRows) {
    for (const ownership of input.ownershipMaps.byCompany.values()) {
      ensureCompany(companies, ownership.companyName);
    }
  }

  for (const row of input.campaignRows) {
    const companyName = normalizeCellValue(row.company_name);
    if (!companyName) continue;

    const accumulator = ensureCompany(companies, companyName);
    const campaignDate = parseDate(row.end_date);
    const revenue = parseNumber(row.revenue_value);

    accumulator.campaignsCount += 1;
    addCsm(accumulator, row.csm_name);

    if (isWorkedCampaign({
      row,
      campaignDate,
      year: input.year,
      today: input.today,
      campaignDateColumnExists: input.campaignDateColumnExists
    })) {
      accumulator.currentYearRevenue += revenue;
    }

    if (campaignDate && (!accumulator.lastCampaignEndDate || campaignDate > accumulator.lastCampaignEndDate)) {
      accumulator.lastCampaignEndDate = campaignDate;
    }
  }

  for (const row of input.agreementRows) {
    const companyName = normalizeCellValue(row.company_name);
    if (!companyName) continue;

    const accumulator = ensureCompany(companies, companyName);
    const totalValue = parseNumber(row.total_value);
    const residualValue = parseNumber(row.residual_value);
    const expiryDate = parseDate(row.expiry_date);
    const agreementName = normalizeCellValue(row.agreement_name);
    const orderingValues = agreementOrderingValues(row, input.today);
    const currentPrimaryOrdering: AgreementOrderingValues = {
      activeRank: accumulator.primaryAgreementActiveRank,
      expirySortValue: accumulator.primaryAgreementExpirySortValue,
      residualValue: accumulator.primaryAgreementResidualValue,
      totalValue: accumulator.primaryAgreementTotalValue,
      nameSortValue: accumulator.primaryAgreementNameSortValue
    };

    accumulator.agreementsCount += 1;
    accumulator.totalAgreementValue += totalValue;
    accumulator.residualAgreementValue += residualValue;
    addCsm(accumulator, row.csm_name);

    if (isAgreementActive(row, input.today)) {
      accumulator.activeAgreementsCount += 1;
      accumulator.activeTotalAgreementValue += totalValue;
      accumulator.activeResidualAgreementValue += residualValue;
    }

    if (compareAgreementOrderingValues(orderingValues, currentPrimaryOrdering) < 0) {
      accumulator.primaryAgreementName = agreementName || null;
      accumulator.primaryAgreementExpiry = expiryDate;
      accumulator.primaryAgreementActiveRank = orderingValues.activeRank;
      accumulator.primaryAgreementExpirySortValue = orderingValues.expirySortValue;
      accumulator.primaryAgreementResidualValue = orderingValues.residualValue;
      accumulator.primaryAgreementTotalValue = orderingValues.totalValue;
      accumulator.primaryAgreementNameSortValue = orderingValues.nameSortValue;
    }
  }

  for (const row of input.monthlyRows) {
    const accumulator = ensureCompany(companies, row.companyName);
    const value = decimalToNumber(row.value) ?? 0;

    addCsm(accumulator, row.csmName);

    if (row.month === input.month && row.forecastType === "previous_month") {
      accumulator.previousMonthForecast += value;
    }

    if (row.month === input.month && row.forecastType === "ongoing") {
      accumulator.ongoingForecast += value;
    }

    if (
      row.month === input.month &&
      row.aiForecastValue &&
      !aiCacheKeys.has([normalizeKey(row.companyName), normalizeKey(row.businessUnit), row.month].join("\u0000"))
    ) {
      accumulator.aiForecast += decimalToNumber(row.aiForecastValue) ?? 0;
    }
  }

  for (const row of input.annualRows) {
    const accumulator = ensureCompany(companies, row.companyName);
    accumulator.annualForecast += decimalToNumber(row.value) ?? 0;
    addCsm(accumulator, row.csmName);
  }

  for (const row of input.companyStatuses) {
    ensureCompany(companies, row.companyName).forecastStatus = row;
  }

  for (const row of input.aiRows) {
    if (row.month !== input.month) continue;

    const accumulator = ensureCompany(companies, row.companyName);
    accumulator.aiForecast += decimalToNumber(row.forecastValue) ?? 0;
  }

  return [...companies.values()]
    .map<PetyrCompanyOverview>((accumulator) => {
      const ownership = companyOwnership(input.ownershipMaps, accumulator.companyName);
      const csmName = ownership?.csmName ?? mostCommonCsm(accumulator);

      return {
        companyName: accumulator.companyName,
        csmName,
        campaignsCount: accumulator.campaignsCount,
        agreementsCount: accumulator.agreementsCount,
        currentYearRevenue: Math.round(accumulator.currentYearRevenue * 100) / 100,
        activeAgreementsCount: accumulator.activeAgreementsCount,
        residualAgreementValue: Math.round(accumulator.residualAgreementValue * 100) / 100,
        totalAgreementValue: Math.round(accumulator.totalAgreementValue * 100) / 100,
        activeResidualAgreementValue: Math.round(accumulator.activeResidualAgreementValue * 100) / 100,
        activeTotalAgreementValue: Math.round(accumulator.activeTotalAgreementValue * 100) / 100,
        lastCampaignEndDate: toIsoDate(accumulator.lastCampaignEndDate),
        dataQualityStatus: buildDataQualityStatus(accumulator, csmName),
        primaryAgreementName: accumulator.primaryAgreementName,
        primaryAgreementExpiry: toIsoDate(accumulator.primaryAgreementExpiry),
        previousMonthForecast: Math.round(accumulator.previousMonthForecast * 100) / 100,
        ongoingForecast: Math.round(accumulator.ongoingForecast * 100) / 100,
        annualForecast: Math.round(accumulator.annualForecast * 100) / 100,
        aiForecast: Math.round(accumulator.aiForecast * 100) / 100,
        forecastAccuracyLabel: buildAccuracyLabel(accumulator.previousMonthForecast, accumulator.currentYearRevenue),
        aiAccuracyLabel: buildAccuracyLabel(accumulator.aiForecast, accumulator.currentYearRevenue),
        isForecastActive: accumulator.forecastStatus?.isActive ?? null
      };
    })
    .sort((left, right) => {
      const residualComparison = right.residualAgreementValue - left.residualAgreementValue;
      return residualComparison || left.companyName.localeCompare(right.companyName);
    });
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function getReportingMonth(year: number, today: Date) {
  const currentYear = today.getFullYear();

  if (year < currentYear) return 12;
  if (year > currentYear) return 1;

  return today.getMonth() + 1;
}

function resolveYear(value: number, diagnostics: string[]) {
  if (Number.isInteger(value) && value >= 2000 && value <= 2100) return value;

  const fallbackYear = new Date().getFullYear();
  diagnostics.push(`Invalid Petyr year "${value}". Falling back to ${fallbackYear}.`);
  return fallbackYear;
}

function resolveMonth(value: number, diagnostics: string[]) {
  if (Number.isInteger(value) && value >= 1 && value <= 12) return value;

  const fallbackMonth = new Date().getMonth() + 1;
  diagnostics.push(`Invalid Petyr month "${value}". Falling back to ${fallbackMonth}.`);
  return fallbackMonth;
}

function createEmptyMonthlyTrend() {
  return Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    actualRevenue: 0,
    previousMonthForecast: 0,
    ongoingForecast: 0,
    aiForecast: 0
  }));
}

function buildAiCacheKey(row: Pick<PetyrNumericAiForecastCacheRow, "companyName" | "businessUnit" | "year" | "month">) {
  return [normalizeKey(row.companyName), normalizeKey(row.businessUnit), row.year, row.month].join("\u0000");
}

function buildMonthlyTrend(input: {
  year: number;
  today: Date;
  campaignDateColumnExists: boolean;
  campaignRows: MaterializedCampaignRow[];
  monthlyRows: ForecastMonthly[];
  aiRows: PetyrNumericAiForecastCacheRow[];
}) {
  const monthlyTrend = createEmptyMonthlyTrend();
  const latestAiRows = latestAiForecasts(input.aiRows);
  const aiCacheKeys = new Set(latestAiRows.map(buildAiCacheKey));

  for (const row of input.campaignRows) {
    if (!input.campaignDateColumnExists) continue;

    const campaignDate = parseDate(row.end_date);
    if (!isWorkedCampaign({
      row,
      campaignDate,
      year: input.year,
      today: input.today,
      campaignDateColumnExists: input.campaignDateColumnExists
    }) || !campaignDate) {
      continue;
    }

    const month = campaignDate.getMonth() + 1;
    monthlyTrend[month - 1].actualRevenue += parseNumber(row.revenue_value);
  }

  for (const row of input.monthlyRows) {
    if (row.year !== input.year || row.month < 1 || row.month > 12) continue;

    const month = monthlyTrend[row.month - 1];
    const value = decimalToNumber(row.value) ?? 0;

    if (row.forecastType === "previous_month") month.previousMonthForecast += value;
    if (row.forecastType === "ongoing") month.ongoingForecast += value;

    if (row.aiForecastValue && !aiCacheKeys.has(buildAiCacheKey(row))) {
      month.aiForecast += decimalToNumber(row.aiForecastValue) ?? 0;
    }
  }

  for (const row of latestAiRows) {
    if (row.year !== input.year || row.month < 1 || row.month > 12) continue;

    monthlyTrend[row.month - 1].aiForecast += decimalToNumber(row.forecastValue) ?? 0;
  }

  return monthlyTrend.map((row) => ({
    ...row,
    actualRevenue: roundMoney(row.actualRevenue),
    previousMonthForecast: roundMoney(row.previousMonthForecast),
    ongoingForecast: roundMoney(row.ongoingForecast),
    aiForecast: roundMoney(row.aiForecast)
  }));
}

function createEmptyCompanyBusinessUnitMonths(): PetyrCompanyBusinessUnitMonth[] {
  return Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    actualRevenue: 0,
    previousMonthForecast: 0,
    ongoingForecast: 0,
    aiForecast: 0
  }));
}

function buildCompanyBusinessUnitMonthlyView(input: {
  year: number;
  today: Date;
  campaignDateColumnExists: boolean;
  campaignRows: MaterializedCampaignRow[];
  monthlyRows: ForecastMonthly[];
  aiRows: PetyrNumericAiForecastCacheRow[];
}) {
  const byBusinessUnit = new Map<string, PetyrCompanyBusinessUnitMonth[]>();
  const latestAiRows = latestAiForecasts(input.aiRows);
  const aiCacheKeys = new Set(latestAiRows.map(buildAiCacheKey));

  function ensureBusinessUnit(businessUnit: string | null | undefined) {
    const normalizedBusinessUnit = normalizeBusinessUnit(businessUnit);
    const existing = byBusinessUnit.get(normalizedBusinessUnit);
    if (existing) return existing;

    const created = createEmptyCompanyBusinessUnitMonths();
    byBusinessUnit.set(normalizedBusinessUnit, created);
    return created;
  }

  for (const businessUnit of PETYR_BUSINESS_UNITS) ensureBusinessUnit(businessUnit);

  for (const row of input.campaignRows) {
    if (!input.campaignDateColumnExists) continue;

    const campaignDate = parseDate(row.end_date);
    const isClosedRevenue = isWorkedCampaign({
      row,
      campaignDate,
      year: input.year,
      today: input.today,
      campaignDateColumnExists: input.campaignDateColumnExists
    });

    if (!isClosedRevenue || !campaignDate) continue;

    const month = ensureBusinessUnit(row.business_unit)[campaignDate.getMonth()];
    if (month) month.actualRevenue += parseNumber(row.revenue_value);
  }

  for (const row of input.monthlyRows) {
    if (row.year !== input.year || row.month < 1 || row.month > 12) continue;

    const month = ensureBusinessUnit(row.businessUnit)[row.month - 1];
    if (!month) continue;

    const value = decimalToNumber(row.value) ?? 0;

    if (row.forecastType === "previous_month") month.previousMonthForecast += value;
    if (row.forecastType === "ongoing") month.ongoingForecast += value;

    if (row.aiForecastValue && !aiCacheKeys.has(buildAiCacheKey(row))) {
      month.aiForecast += decimalToNumber(row.aiForecastValue) ?? 0;
    }
  }

  for (const row of latestAiRows) {
    if (row.year !== input.year || row.month < 1 || row.month > 12) continue;

    const month = ensureBusinessUnit(row.businessUnit)[row.month - 1];
    if (month) month.aiForecast += decimalToNumber(row.forecastValue) ?? 0;
  }

  return PETYR_BUSINESS_UNITS.map((businessUnit) => ({
    businessUnit,
    months: (byBusinessUnit.get(businessUnit) ?? createEmptyCompanyBusinessUnitMonths()).map((row) => ({
      ...row,
      actualRevenue: roundMoney(row.actualRevenue),
      previousMonthForecast: roundMoney(row.previousMonthForecast),
      ongoingForecast: roundMoney(row.ongoingForecast),
      aiForecast: roundMoney(row.aiForecast)
    }))
  }));
}

function buildCsmOverviewCompanies(input: {
  year: number;
  today: Date;
  campaignDateColumnExists: boolean;
  companies: PetyrCompanyOverview[];
  campaignRows: MaterializedCampaignRow[];
  monthlyRows: ForecastMonthly[];
  aiRows: PetyrNumericAiForecastCacheRow[];
}) {
  const companyByKey = new Map(input.companies.map((company) => [normalizeKey(company.companyName), company]));
  const latestAiRows = latestAiForecasts(input.aiRows);
  const aiCacheKeys = new Set(latestAiRows.map(buildAiCacheKey));
  const cells = new Map<string, PetyrCsmOverviewBusinessUnitForecast>();

  function cell(companyKey: string, month: number, businessUnit: string) {
    const key = [companyKey, month, businessUnit].join("\u0000");
    const existing = cells.get(key);
    if (existing) return existing;

    const created = {
      businessUnit,
      actualRevenue: 0,
      previousMonthForecast: 0,
      ongoingForecast: 0,
      aiForecast: 0
    };
    cells.set(key, created);
    return created;
  }

  for (const row of input.campaignRows) {
    const companyKey = normalizeKey(normalizeCellValue(row.company_name));
    if (!companyByKey.has(companyKey)) continue;

    const campaignDate = parseDate(row.end_date);
    if (!isWorkedCampaign({
      row,
      campaignDate,
      year: input.year,
      today: input.today,
      campaignDateColumnExists: input.campaignDateColumnExists
    })) {
      continue;
    }

    const month = input.campaignDateColumnExists && campaignDate ? campaignDate.getMonth() + 1 : 1;
    if (month < 1 || month > 12) continue;

    const businessUnit = normalizeBusinessUnit(row.business_unit);
    cell(companyKey, month, businessUnit).actualRevenue += parseNumber(row.revenue_value);
  }

  for (const row of input.monthlyRows) {
    const companyKey = normalizeKey(row.companyName);
    if (!companyByKey.has(companyKey) || row.year !== input.year || row.month < 1 || row.month > 12) continue;

    const businessUnit = normalizeBusinessUnit(row.businessUnit);
    const monthCell = cell(companyKey, row.month, businessUnit);
    const value = decimalToNumber(row.value) ?? 0;

    if (row.forecastType === "previous_month") monthCell.previousMonthForecast += value;
    if (row.forecastType === "ongoing") monthCell.ongoingForecast += value;

    if (row.aiForecastValue && !aiCacheKeys.has(buildAiCacheKey(row))) {
      monthCell.aiForecast += decimalToNumber(row.aiForecastValue) ?? 0;
    }
  }

  for (const row of latestAiRows) {
    const companyKey = normalizeKey(row.companyName);
    if (!companyByKey.has(companyKey) || row.year !== input.year || row.month < 1 || row.month > 12) continue;

    const businessUnit = normalizeBusinessUnit(row.businessUnit);
    cell(companyKey, row.month, businessUnit).aiForecast += decimalToNumber(row.forecastValue) ?? 0;
  }

  return input.companies.map<PetyrCsmOverviewCompany>((company) => {
    const companyKey = normalizeKey(company.companyName);

    return {
      ...company,
      months: Array.from({ length: 12 }, (_, monthIndex) => {
        const month = monthIndex + 1;

        return {
          year: input.year,
          month,
          businessUnits: PETYR_BUSINESS_UNITS.map((businessUnit) => {
            const monthCell = cell(companyKey, month, businessUnit);

            return {
              businessUnit,
              actualRevenue: roundMoney(monthCell.actualRevenue),
              previousMonthForecast: roundMoney(monthCell.previousMonthForecast),
              ongoingForecast: roundMoney(monthCell.ongoingForecast),
              aiForecast: roundMoney(monthCell.aiForecast)
            };
          })
        };
      })
    };
  });
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysUntil(date: Date, today: Date) {
  return Math.ceil((startOfLocalDay(date).getTime() - startOfLocalDay(today).getTime()) / ONE_DAY_MS);
}

function actionCompany(input: {
  company: PetyrCsmOverviewCompany;
  reason: string;
  detail: string;
  target: PetyrCsmUrgentActionTarget;
  year: number;
  month: number;
  businessUnit?: string | null;
  agreementName?: string | null;
  agreementExpiry?: string | null;
  agreementDealLink?: string | null;
  residualAgreementValue?: number;
  totalAgreementValue?: number;
}): PetyrCsmUrgentActionCompany {
  return {
    companyName: input.company.companyName,
    csmName: input.company.csmName,
    reason: input.reason,
    detail: input.detail,
    target: input.target,
    year: input.year,
    month: input.month,
    businessUnit: input.businessUnit ?? null,
    agreementName: input.agreementName ?? null,
    agreementExpiry: input.agreementExpiry ?? null,
    agreementDealLink: input.agreementDealLink ?? null,
    residualAgreementValue: roundMoney(input.residualAgreementValue ?? input.company.residualAgreementValue),
    totalAgreementValue: roundMoney(input.totalAgreementValue ?? input.company.totalAgreementValue)
  };
}

function currentForecastValue(
  businessUnit: PetyrCsmOverviewBusinessUnitForecast,
  editableForecastType: ForecastEntryMode["editableForecastType"]
) {
  return editableForecastType === "ongoing"
    ? businessUnit.ongoingForecast
    : businessUnit.previousMonthForecast;
}

function buildForecastUpdateActions(input: {
  companies: PetyrCsmOverviewCompany[];
  year: number;
  month: number;
  today: Date;
}) {
  const mode = getForecastEntryMode({ year: input.year, month: input.month, currentDate: input.today });
  const forecastLabel = mode.editableForecastType === "ongoing" ? "ongoing forecast" : "previous-month forecast";

  return input.companies
    .filter((company) => company.isForecastActive !== false)
    .map((company) => {
      const month = company.months.find((item) => item.month === input.month);
      const forecastTotal = month?.businessUnits.reduce((sum, businessUnit) => sum + currentForecastValue(businessUnit, mode.editableForecastType), 0) ?? 0;
      const missingBusinessUnits = month?.businessUnits.filter((businessUnit) => currentForecastValue(businessUnit, mode.editableForecastType) <= 0).length ?? PETYR_BUSINESS_UNITS.length;
      const reason = forecastTotal > 0
        ? `${missingBusinessUnits} Business Unit(s) still have no ${forecastLabel} value.`
        : `No ${forecastLabel} value saved for the current month.`;

      return actionCompany({
        company,
        reason,
        detail: mode.reason,
        target: "forecast-entry",
        year: input.year,
        month: input.month
      });
    })
    .sort((left, right) => {
      const leftMissing = left.reason.startsWith("No ") ? 1 : 0;
      const rightMissing = right.reason.startsWith("No ") ? 1 : 0;
      return rightMissing - leftMissing || right.residualAgreementValue - left.residualAgreementValue || left.companyName.localeCompare(right.companyName);
    });
}

function buildExpiringAgreementActions(input: {
  companies: PetyrCsmOverviewCompany[];
  agreementRows: MaterializedAgreementRow[];
  campaignRows: MaterializedCampaignRow[];
  year: number;
  month: number;
  today: Date;
}) {
  const companyByKey = new Map(input.companies.map((company) => [normalizeKey(company.companyName), company]));
  const earliestByCompany = new Map<string, PetyrCsmUrgentActionCompany>();
  const agreementDealLinks = buildAgreementDealLinkMap(input.campaignRows);

  for (const row of input.agreementRows) {
    const companyKey = normalizeKey(normalizeCellValue(row.company_name));
    const company = companyByKey.get(companyKey);
    if (!company) continue;

    const expiryDate = parseDate(row.expiry_date);
    if (!expiryDate || !isAgreementActive(row, input.today)) continue;

    const remainingDays = daysUntil(expiryDate, input.today);
    if (remainingDays < 0 || remainingDays > 60) continue;

    const residualValue = parseNumber(row.residual_value);
    const agreementName = normalizeCellValue(row.agreement_name) || "Unnamed agreement";
    const existing = earliestByCompany.get(companyKey);
    const existingDays = existing?.agreementExpiry ? daysUntil(parseDate(existing.agreementExpiry) ?? expiryDate, input.today) : Number.POSITIVE_INFINITY;

    if (existing && existingDays <= remainingDays) continue;

    earliestByCompany.set(
      companyKey,
      actionCompany({
        company,
        reason: `${agreementName} expires in ${remainingDays} day(s).`,
        detail: "Agreement expiry is inside the next 60 days.",
        target: "company",
        year: input.year,
        month: input.month,
        agreementName,
        agreementExpiry: toIsoDate(expiryDate),
        agreementDealLink: agreementDealLinks.get(agreementDetailKey(row.company_name, agreementName)) ?? null,
        residualAgreementValue: residualValue,
        totalAgreementValue: parseNumber(row.total_value)
      })
    );
  }

  return [...earliestByCompany.values()].sort((left, right) => {
    const leftDate = parseDate(left.agreementExpiry)?.getTime() ?? Number.POSITIVE_INFINITY;
    const rightDate = parseDate(right.agreementExpiry)?.getTime() ?? Number.POSITIVE_INFINITY;
    return leftDate - rightDate || right.residualAgreementValue - left.residualAgreementValue;
  });
}

function buildExpiredAgreementResidualActions(input: {
  companies: PetyrCsmOverviewCompany[];
  agreementRows: MaterializedAgreementRow[];
  campaignRows: MaterializedCampaignRow[];
  year: number;
  month: number;
  today: Date;
}) {
  const companyByKey = new Map(input.companies.map((company) => [normalizeKey(company.companyName), company]));
  const agreementDealLinks = buildAgreementDealLinkMap(input.campaignRows);

  return input.agreementRows
    .flatMap((row) => {
      const companyKey = normalizeKey(normalizeCellValue(row.company_name));
      const company = companyByKey.get(companyKey);
      if (!company) return [];

      const expiryDate = parseDate(row.expiry_date);
      const residualValue = parseNumber(row.residual_value);
      if (!expiryDate || daysUntil(expiryDate, input.today) >= 0 || residualValue <= 0) return [];

      const agreementName = normalizeCellValue(row.agreement_name) || "Unnamed agreement";

      return [
        actionCompany({
          company,
          reason: `${agreementName} expired with residual ${formatPetyrCurrency(residualValue)}.`,
          detail: `Expiry date is ${toIsoDate(expiryDate) ?? "n/a"}; residual amount is still positive.`,
          target: "company",
          year: input.year,
          month: input.month,
          agreementName,
          agreementExpiry: toIsoDate(expiryDate),
          agreementDealLink: agreementDealLinks.get(agreementDetailKey(row.company_name, agreementName)) ?? null,
          residualAgreementValue: residualValue,
          totalAgreementValue: parseNumber(row.total_value)
        })
      ];
    })
    .sort((left, right) => {
      const leftExpiry = parseDate(left.agreementExpiry)?.getTime() ?? Number.POSITIVE_INFINITY;
      const rightExpiry = parseDate(right.agreementExpiry)?.getTime() ?? Number.POSITIVE_INFINITY;

      return (
        right.residualAgreementValue - left.residualAgreementValue ||
        leftExpiry - rightExpiry ||
        left.companyName.localeCompare(right.companyName) ||
        (left.agreementName ?? "").localeCompare(right.agreementName ?? "")
      );
    });
}

function buildHighResidualActions(input: {
  companies: PetyrCsmOverviewCompany[];
  agreementRows: MaterializedAgreementRow[];
  campaignRows: MaterializedCampaignRow[];
  year: number;
  month: number;
  today: Date;
}) {
  const nearestResidualAgreementByCompany = buildNearestActiveResidualAgreementByCompany({
    agreementRows: input.agreementRows,
    campaignRows: input.campaignRows,
    today: input.today
  });
  const residualCompanies = input.companies
    .map((company) => ({
      company,
      residualValue: company.activeResidualAgreementValue,
      totalValue: company.activeTotalAgreementValue,
      agreement: nearestResidualAgreementByCompany.get(normalizeKey(company.companyName)) ?? null
    }))
    .filter((item) => item.company.isForecastActive !== false && item.residualValue > 0)
    .sort((left, right) => right.residualValue - left.residualValue);

  const thresholdCompanies = residualCompanies.filter((item) => {
    const residualRatio = item.totalValue > 0 ? item.residualValue / item.totalValue : 0;
    return item.residualValue >= HIGH_RESIDUAL_ABSOLUTE_THRESHOLD || residualRatio >= HIGH_RESIDUAL_RATIO_THRESHOLD;
  });
  const selectedCompanies = thresholdCompanies.length > 0 ? thresholdCompanies : residualCompanies.slice(0, 5);

  return selectedCompanies
    .sort((left, right) => {
      const leftExpiry = parseDate(left.agreement?.agreementExpiry)?.getTime() ?? Number.POSITIVE_INFINITY;
      const rightExpiry = parseDate(right.agreement?.agreementExpiry)?.getTime() ?? Number.POSITIVE_INFINITY;

      return leftExpiry - rightExpiry || right.residualValue - left.residualValue || left.company.companyName.localeCompare(right.company.companyName);
    })
    .map(({ company, residualValue, totalValue, agreement }) => {
      const residualRatio = totalValue > 0 ? residualValue / totalValue * 100 : null;
      const actionResidual = agreement?.residualAgreementValue ?? residualValue;
      const actionTotal = agreement?.totalAgreementValue ?? totalValue;

      return actionCompany({
        company,
        reason: agreement
          ? `${agreement.agreementName} has residual ${formatPetyrCurrency(actionResidual)}.`
          : residualRatio === null
            ? "Agreement residual needs coverage review."
            : `Agreement residual is ${formatPetyrPercent(residualRatio)} of active agreement value.`,
        detail: agreement?.agreementExpiry
          ? `Nearest active residual agreement expires on ${agreement.agreementExpiry}. Compare residual coverage with current and next-month forecast before the next account review.`
          : "Compare residual coverage with current and next-month forecast before the next account review.",
        target: "company",
        year: input.year,
        month: input.month,
        agreementName: agreement?.agreementName ?? null,
        agreementExpiry: agreement?.agreementExpiry ?? null,
        agreementDealLink: agreement?.agreementDealLink ?? null,
        residualAgreementValue: actionResidual,
        totalAgreementValue: actionTotal
      });
    });
}

function buildBusinessUnitHistoryActions(input: {
  companies: PetyrCsmOverviewCompany[];
  campaignRows: MaterializedCampaignRow[];
  campaignDateColumnExists: boolean;
  year: number;
  month: number;
}) {
  if (!input.campaignDateColumnExists) return [];

  const companyByKey = new Map(input.companies.map((company) => [normalizeKey(company.companyName), company]));
  const currentByCompanyBusinessUnit = new Map<string, number>();
  const historyByCompanyBusinessUnit = new Map<string, Map<number, number>>();

  for (const row of input.campaignRows) {
    const companyKey = normalizeKey(normalizeCellValue(row.company_name));
    if (!companyByKey.has(companyKey)) continue;

    const campaignDate = parseDate(row.end_date);
    if (!campaignDate || campaignDate.getMonth() + 1 > input.month) continue;

    const campaignYear = campaignDate.getFullYear();
    const businessUnit = normalizeBusinessUnit(row.business_unit);
    const key = [companyKey, businessUnit].join("\u0000");
    const revenue = parseNumber(row.revenue_value);

    if (campaignYear === input.year) {
      currentByCompanyBusinessUnit.set(key, (currentByCompanyBusinessUnit.get(key) ?? 0) + revenue);
    } else if (campaignYear < input.year && campaignYear >= input.year - 3) {
      const byYear = historyByCompanyBusinessUnit.get(key) ?? new Map<number, number>();
      byYear.set(campaignYear, (byYear.get(campaignYear) ?? 0) + revenue);
      historyByCompanyBusinessUnit.set(key, byYear);
    }
  }

  return [...historyByCompanyBusinessUnit.entries()]
    .flatMap(([key, byYear]) => {
      const [companyKey, businessUnit] = key.split("\u0000");
      const company = companyByKey.get(companyKey);
      if (!company) return [];

      const historyValues = [...byYear.values()].filter((value) => value > 0);
      if (historyValues.length === 0) return [];

      const baseline = historyValues.reduce((sum, value) => sum + value, 0) / historyValues.length;
      const current = currentByCompanyBusinessUnit.get(key) ?? 0;
      if (baseline <= 0 || current >= baseline * BUSINESS_UNIT_HISTORY_RATIO_THRESHOLD) return [];

      const gap = baseline - current;

      return [
        {
          gap,
          action: actionCompany({
            company,
            reason: `${businessUnit} is below the last ${historyValues.length} year(s) pace.`,
            detail: `Current year-to-date revenue is ${formatPetyrPercent(current / baseline * 100)} of comparable history.`,
            target: "forecast-entry",
            year: input.year,
            month: input.month,
            businessUnit
          })
        }
      ];
    })
    .sort((left, right) => right.gap - left.gap)
    .map((item) => item.action);
}

function buildCsmUrgentActions(input: {
  companies: PetyrCsmOverviewCompany[];
  agreementRows: MaterializedAgreementRow[];
  campaignRows: MaterializedCampaignRow[];
  campaignDateColumnExists: boolean;
  year: number;
  month: number;
  today: Date;
}): PetyrCsmUrgentAction[] {
  return [
    {
      id: "forecast-update",
      title: "Forecast update reminder",
      description: "Companies that should review the current-month Forecast Entry.",
      companies: buildForecastUpdateActions({
        companies: input.companies,
        year: input.year,
        month: input.month,
        today: input.today
      })
    },
    {
      id: "expiring-agreements",
      title: "Agreements expiring within 60 days",
      description: "Active agreements whose expiry date is inside the next 60 days.",
      companies: buildExpiringAgreementActions({
        companies: input.companies,
        agreementRows: input.agreementRows,
        campaignRows: input.campaignRows,
        year: input.year,
        month: input.month,
        today: input.today
      })
    },
    {
      id: "expired-agreement-residual",
      title: "Expired agreement with residual",
      description: "Expired agreements whose residual value is still positive.",
      companies: buildExpiredAgreementResidualActions({
        companies: input.companies,
        agreementRows: input.agreementRows,
        campaignRows: input.campaignRows,
        year: input.year,
        month: input.month,
        today: input.today
      })
    },
    {
      id: "high-residual",
      title: "High agreement residuals",
      description: "Companies with high residual value or the highest residuals in the selected portfolio.",
      companies: buildHighResidualActions({
        companies: input.companies,
        agreementRows: input.agreementRows,
        campaignRows: input.campaignRows,
        year: input.year,
        month: input.month,
        today: input.today
      })
    },
    {
      id: "business-unit-gap",
      title: "Business Unit below history",
      description: "Company and Business Unit pairs under comparable historical pace.",
      companies: buildBusinessUnitHistoryActions({
        companies: input.companies,
        campaignRows: input.campaignRows,
        campaignDateColumnExists: input.campaignDateColumnExists,
        year: input.year,
        month: input.month
      })
    }
  ];
}

type BusinessUnitRevenueAccumulator = Omit<PetyrBusinessUnitRevenueSummary, "initialForecast"> & {
  initialForecast: number;
  previousMonthForecastByMonth: number[];
  ongoingForecastByMonth: number[];
  previousMonthForecastRowsByMonth: number[];
  ongoingForecastRowsByMonth: number[];
};

function buildBusinessUnitSummaryRows(input: {
  year: number;
  today: Date;
  campaignDateColumnExists: boolean;
  campaignRows: MaterializedCampaignRow[];
  monthlyRows: ForecastMonthly[];
  annualRows: ForecastAnnual[];
  aiRows: PetyrNumericAiForecastCacheRow[];
  diagnostics?: PlannedFutureCampaignDiagnostics;
}) {
  const byBusinessUnit = new Map<string, BusinessUnitRevenueAccumulator>();
  const latestAiRows = latestAiForecasts(input.aiRows);
  const aiCacheKeys = new Set(latestAiRows.map(buildAiCacheKey));
  const reportingMonth = getReportingMonth(input.year, input.today);

  function ensureBusinessUnit(businessUnit: string | null | undefined) {
    const normalizedBusinessUnit = normalizeBusinessUnit(businessUnit);
    const existing = byBusinessUnit.get(normalizedBusinessUnit);
    if (existing) return existing;

    const created = {
      businessUnit: normalizedBusinessUnit,
      actualRevenue: 0,
      plannedFuture: 0,
      initialForecast: 0,
      forecast: null,
      forecastSource: null,
      previousMonthForecast: 0,
      ongoingForecast: 0,
      annualForecast: 0,
      aiForecast: 0,
      closedRevenueCampaignsCount: 0,
      plannedFutureCampaignsCount: 0,
      monthlyForecastRowsCount: 0,
      previousMonthForecastRowsCount: 0,
      initialForecastRowsCount: 0,
      annualForecastRowsCount: 0,
      aiForecastRowsCount: 0,
      normalizedToOtherCount: 0,
      previousMonthForecastByMonth: createManagementMonthValues(),
      ongoingForecastByMonth: createManagementMonthValues(),
      previousMonthForecastRowsByMonth: createManagementMonthValues(),
      ongoingForecastRowsByMonth: createManagementMonthValues()
    };
    byBusinessUnit.set(normalizedBusinessUnit, created);
    return created;
  }

  for (const businessUnit of PETYR_BUSINESS_UNITS) ensureBusinessUnit(businessUnit);

  for (const row of input.campaignRows) {
    const campaignDate = parseDate(row.end_date);
    const summary = ensureBusinessUnit(row.business_unit);

    if (normalizePetyrBusinessUnit(row.business_unit).mappedToOtherFallback) {
      summary.normalizedToOtherCount += 1;
    }

    if (!isWorkedCampaign({
      row,
      campaignDate,
      year: input.year,
      today: input.today,
      campaignDateColumnExists: input.campaignDateColumnExists
    })) {
      const plannedFuture = isValidPlannedFutureCampaign({
        row,
        campaignDate,
        year: input.year,
        today: input.today,
        campaignDateColumnExists: input.campaignDateColumnExists,
        diagnostics: input.diagnostics
      });

      if (plannedFuture) {
        summary.plannedFuture += parseNumber(row.revenue_value);
        summary.plannedFutureCampaignsCount += 1;
      }

      continue;
    }

    summary.actualRevenue += parseNumber(row.revenue_value);
    summary.closedRevenueCampaignsCount += 1;
  }

  for (const row of input.monthlyRows) {
    if (row.year !== input.year || row.month < 1 || row.month > 12) continue;

    const summary = ensureBusinessUnit(row.businessUnit);
    const value = decimalToNumber(row.value) ?? 0;
    const monthIndex = row.month - 1;

    summary.monthlyForecastRowsCount += 1;

    if (row.forecastType === "previous_month") {
      summary.previousMonthForecast += value;
      summary.previousMonthForecastRowsCount += 1;
      summary.previousMonthForecastByMonth[monthIndex] += value;
      summary.previousMonthForecastRowsByMonth[monthIndex] += 1;
    }

    if (row.forecastType === "ongoing") {
      summary.ongoingForecast += value;
      summary.ongoingForecastByMonth[monthIndex] += value;
      summary.ongoingForecastRowsByMonth[monthIndex] += 1;
    }

    if (row.aiForecastValue && !aiCacheKeys.has(buildAiCacheKey(row))) {
      summary.aiForecast += decimalToNumber(row.aiForecastValue) ?? 0;
    }
  }

  for (const row of input.annualRows) {
    if (row.year === input.year && row.initialForecast) {
      const summary = ensureBusinessUnit(row.businessUnit);
      summary.initialForecast += decimalToNumber(row.initialForecast) || 0;
      summary.initialForecastRowsCount += 1;
    }
  }

  for (const row of input.annualRows) {
    if (row.year === input.year) {
      const summary = ensureBusinessUnit(row.businessUnit);
      summary.annualForecast += decimalToNumber(row.value) ?? 0;
      summary.annualForecastRowsCount += 1;
    }
  }

  for (const row of latestAiRows) {
    if (row.year === input.year) {
      const summary = ensureBusinessUnit(row.businessUnit);
      summary.aiForecast += decimalToNumber(row.forecastValue) ?? 0;
      summary.aiForecastRowsCount += 1;
    }
  }

  return [...byBusinessUnit.values()]
    .map<PetyrBusinessUnitRevenueSummary>((row) => {
      const monthlyForecast = row.previousMonthForecastByMonth.reduce((sum, previousValue, index) => {
        const ongoingValue = row.ongoingForecastByMonth[index];

        if (index + 1 <= reportingMonth && row.ongoingForecastRowsByMonth[index] > 0) return sum + ongoingValue;
        if (row.previousMonthForecastRowsByMonth[index] > 0) return sum + previousValue;
        if (row.ongoingForecastRowsByMonth[index] > 0) return sum + ongoingValue;

        return sum;
      }, 0);
      const forecast = row.annualForecastRowsCount > 0
        ? row.annualForecast
        : row.monthlyForecastRowsCount > 0
          ? monthlyForecast
          : null;
      const forecastSource: PetyrBusinessUnitRevenueSummary["forecastSource"] = row.annualForecastRowsCount > 0
        ? "annual"
        : row.monthlyForecastRowsCount > 0
          ? "monthly"
          : null;

      return {
        businessUnit: row.businessUnit,
        actualRevenue: roundMoney(row.actualRevenue),
        plannedFuture: roundMoney(row.plannedFuture),
        initialForecast: row.initialForecastRowsCount > 0 ? roundMoney(row.initialForecast) : null,
        forecast: forecast === null ? null : roundMoney(forecast),
        forecastSource,
        previousMonthForecast: roundMoney(row.previousMonthForecast),
        ongoingForecast: roundMoney(row.ongoingForecast),
        annualForecast: roundMoney(row.annualForecast),
        aiForecast: roundMoney(row.aiForecast),
        closedRevenueCampaignsCount: row.closedRevenueCampaignsCount,
        plannedFutureCampaignsCount: row.plannedFutureCampaignsCount,
        monthlyForecastRowsCount: row.monthlyForecastRowsCount,
        previousMonthForecastRowsCount: row.previousMonthForecastRowsCount,
        initialForecastRowsCount: row.initialForecastRowsCount,
        annualForecastRowsCount: row.annualForecastRowsCount,
        aiForecastRowsCount: row.aiForecastRowsCount,
        normalizedToOtherCount: row.normalizedToOtherCount
      };
    })
    .sort((left, right) => PETYR_BUSINESS_UNITS.indexOf(left.businessUnit as (typeof PETYR_BUSINESS_UNITS)[number]) - PETYR_BUSINESS_UNITS.indexOf(right.businessUnit as (typeof PETYR_BUSINESS_UNITS)[number]));
}

type ManagementAggregateBucket = {
  kind: PetyrManagementAggregateKind;
  key: string;
  label: string;
  initialForecast: number;
  initialForecastRows: number;
  annualForecast: number;
  annualForecastRows: number;
  previousMonthForecast: number[];
  ongoingForecast: number[];
  previousMonthForecastRows: number[];
  ongoingForecastRows: number[];
  worked: number[];
  planned: number[];
};

const UNASSIGNED_BRANCH = "Unassigned Branch";
const UNASSIGNED_CSM = "Unassigned";

function createManagementMonthValues() {
  return Array.from({ length: 12 }, () => 0);
}

function normalizeBranch(value: string | null | undefined) {
  return normalizeCellValue(value) || UNASSIGNED_BRANCH;
}

function normalizeCsm(value: string | null | undefined) {
  return normalizeCellValue(value) || UNASSIGNED_CSM;
}

function createManagementAggregateBucket(
  kind: PetyrManagementAggregateKind,
  label: string
): ManagementAggregateBucket {
  return {
    kind,
    key: normalizeKey(label),
    label,
    initialForecast: 0,
    initialForecastRows: 0,
    annualForecast: 0,
    annualForecastRows: 0,
    previousMonthForecast: createManagementMonthValues(),
    ongoingForecast: createManagementMonthValues(),
    previousMonthForecastRows: createManagementMonthValues(),
    ongoingForecastRows: createManagementMonthValues(),
    worked: createManagementMonthValues(),
    planned: createManagementMonthValues()
  };
}

function ensureManagementBucket(
  buckets: Map<string, ManagementAggregateBucket>,
  kind: PetyrManagementAggregateKind,
  label: string
) {
  const normalizedLabel = label || (kind === "branch" ? UNASSIGNED_BRANCH : kind === "csm" ? UNASSIGNED_CSM : "Other");
  const key = normalizeKey(normalizedLabel);
  const existing = buckets.get(key);
  if (existing) return existing;

  const created = createManagementAggregateBucket(kind, normalizedLabel);
  buckets.set(key, created);
  return created;
}

function campaignStatusText(row: MaterializedCampaignRow) {
  return normalizeCellValue(row.campaign_status).toLowerCase();
}

function isInvalidCampaignStatus(status: string) {
  return INVALID_CAMPAIGN_STATUS_TOKENS.some((token) => status.includes(token));
}

function isPlanningOnlyCampaignStatus(status: string) {
  return ["draft", "planned", "planning", "pipeline", "tentative", "proposed", "setup", "recruiting"].some((token) => status.includes(token));
}

function classifyPlannedFutureCampaignStatus(row: MaterializedCampaignRow): {
  classification: PlannedFutureStatusClassification;
  rawStatus: string;
} {
  const rawStatus = normalizeCellValue(row.campaign_status);
  const status = rawStatus.toLowerCase();

  if (!status) return { classification: "missing", rawStatus };
  if (PLANNED_FUTURE_INCLUDED_STATUSES.has(status)) return { classification: "planned", rawStatus };
  if (PLANNED_FUTURE_EXCLUDED_STATUSES.has(status) || isInvalidCampaignStatus(status)) {
    return { classification: "excluded", rawStatus };
  }

  return { classification: "unrecognized", rawStatus };
}

function createPlannedFutureCampaignDiagnostics(): PlannedFutureCampaignDiagnostics {
  return {
    missingStatusCount: 0,
    missingStatusExamples: [],
    unrecognizedStatusCounts: new Map(),
    unrecognizedStatusExamples: [],
    excludedStatusCounts: new Map(),
    excludedStatusExamples: []
  };
}

function describeCampaignForDiagnostics(row: MaterializedCampaignRow) {
  const campaignName = normalizeCellValue(row.campaign_name) || "Unnamed campaign";
  const companyName = normalizeCellValue(row.company_name);

  return companyName ? `${campaignName} / ${companyName}` : campaignName;
}

function addLimitedExample(examples: string[], example: string) {
  if (examples.length < 5 && !examples.includes(example)) {
    examples.push(example);
  }
}

function recordPlannedFutureStatusDiagnostic(
  collector: PlannedFutureCampaignDiagnostics | undefined,
  classification: PlannedFutureStatusClassification,
  rawStatus: string,
  row: MaterializedCampaignRow
) {
  if (!collector) return;

  const example = describeCampaignForDiagnostics(row);

  if (classification === "excluded") {
    incrementCount(collector.excludedStatusCounts, rawStatus || "Missing status");
    addLimitedExample(collector.excludedStatusExamples, example);
    return;
  }

  if (classification === "missing") {
    collector.missingStatusCount += 1;
    addLimitedExample(collector.missingStatusExamples, example);
    return;
  }

  if (classification === "unrecognized") {
    incrementCount(collector.unrecognizedStatusCounts, rawStatus || "Unknown status");
    addLimitedExample(collector.unrecognizedStatusExamples, example);
  }
}

function flushPlannedFutureCampaignDiagnostics(
  diagnostics: string[],
  collector: PlannedFutureCampaignDiagnostics
) {
  const excludedCount = countMapTotal(collector.excludedStatusCounts);
  const unrecognizedCount = countMapTotal(collector.unrecognizedStatusCounts);

  if (collector.missingStatusCount > 0) {
    diagnostics.push(
      `Planned future campaign status is missing for ${collector.missingStatusCount} future campaign row(s). Petyr excludes them from Planned through year end until business confirms the status. Examples: ${diagnosticList(collector.missingStatusExamples)}.`
    );
  }

  if (unrecognizedCount > 0) {
    diagnostics.push(
      `Planned future campaign status is not recognized for ${unrecognizedCount} future campaign row(s): ${formatCountMap(collector.unrecognizedStatusCounts)}. Petyr excludes them from Planned through year end until business confirms the status. Examples: ${diagnosticList(collector.unrecognizedStatusExamples)}.`
    );
  }

  if (excludedCount > 0) {
    diagnostics.push(
      `Planned future campaign revenue excluded ${excludedCount} future campaign row(s) with non-planned status (${formatCountMap(collector.excludedStatusCounts)}). Planned future includes only Setup and Recruiting. Examples: ${diagnosticList(collector.excludedStatusExamples)}.`
    );
  }
}

function isWorkedCampaign(input: {
  row: MaterializedCampaignRow;
  campaignDate: Date | null;
  year: number;
  today: Date;
  campaignDateColumnExists: boolean;
}) {
  const status = campaignStatusText(input.row);
  if (isInvalidCampaignStatus(status)) return false;

  if (!input.campaignDateColumnExists) {
    return !isPlanningOnlyCampaignStatus(status);
  }

  if (!input.campaignDate || input.campaignDate.getFullYear() !== input.year) return false;
  if (input.campaignDate.getTime() > input.today.getTime()) return false;

  return !isPlanningOnlyCampaignStatus(status);
}

function isValidPlannedFutureCampaign(input: {
  row: MaterializedCampaignRow;
  campaignDate: Date | null;
  year: number;
  today: Date;
  campaignDateColumnExists: boolean;
  diagnostics?: PlannedFutureCampaignDiagnostics;
}) {
  if (!input.campaignDateColumnExists || !input.campaignDate) return false;

  const campaignDate = startOfLocalDay(input.campaignDate);
  const tomorrow = startOfLocalDay(input.today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const yearEnd = new Date(input.year, 11, 31);

  if (campaignDate.getTime() < tomorrow.getTime()) return false;
  if (campaignDate.getTime() > yearEnd.getTime()) return false;

  const { classification, rawStatus } = classifyPlannedFutureCampaignStatus(input.row);
  recordPlannedFutureStatusDiagnostic(input.diagnostics, classification, rawStatus, input.row);

  return classification === "planned";
}

function managementCampaignMonth(campaignDate: Date | null, fallbackMonth: number) {
  const month = campaignDate ? campaignDate.getMonth() + 1 : fallbackMonth;
  return month >= 1 && month <= 12 ? month : fallbackMonth;
}

function addManagementForecastValue(bucket: ManagementAggregateBucket, row: ForecastMonthly) {
  if (row.month < 1 || row.month > 12) return;

  const value = decimalToNumber(row.value) ?? 0;
  const index = row.month - 1;

  if (row.forecastType === "previous_month") {
    bucket.previousMonthForecast[index] += value;
    bucket.previousMonthForecastRows[index] += 1;
  }

  if (row.forecastType === "ongoing") {
    bucket.ongoingForecast[index] += value;
    bucket.ongoingForecastRows[index] += 1;
  }
}

function addManagementAnnualForecastValue(bucket: ManagementAggregateBucket, row: ForecastAnnual) {
  bucket.annualForecast += decimalToNumber(row.value) ?? 0;
  bucket.annualForecastRows += 1;
}

function addManagementInitialForecastValue(bucket: ManagementAggregateBucket, row: ForecastAnnual) {
  bucket.initialForecast += decimalToNumber(row.initialForecast) ?? 0;
  bucket.initialForecastRows += 1;
}

function selectedManagementForecast(bucket: ManagementAggregateBucket, month: number, reportingMonth: number) {
  const index = month - 1;
  const preferOngoing = month <= reportingMonth;

  if (preferOngoing && bucket.ongoingForecastRows[index] > 0) return bucket.ongoingForecast[index];
  if (bucket.previousMonthForecastRows[index] > 0) return bucket.previousMonthForecast[index];
  if (bucket.ongoingForecastRows[index] > 0) return bucket.ongoingForecast[index];

  return 0;
}

function buildCompanyBranchMap(ownershipMaps?: CompanyOwnershipMaps) {
  if (ownershipMaps?.hasRows) {
    return new Map(
      [...ownershipMaps.byCompany.entries()].map(([companyKey, ownership]) => [companyKey, normalizeBranch(ownership.branchName)])
    );
  }

  return new Map<string, string>();
}

function companyBranch(companyBranchMap: Map<string, string>, companyName: string) {
  return companyBranchMap.get(normalizeKey(companyName)) ?? UNASSIGNED_BRANCH;
}

function yearlyObjectiveForBucket(bucket: ManagementAggregateBucket, objectiveMaps?: ManagementObjectiveMaps) {
  if (bucket.kind === "branch") return objectiveMaps ? getManagementObjectiveMapValue(objectiveMaps.branches, bucket.label) : null;
  if (bucket.kind === "business_unit") {
    return objectiveMaps ? getManagementObjectiveMapValue(objectiveMaps.businessUnits, bucket.label) : null;
  }

  return null;
}

function denominatorNote(kind: PetyrManagementAggregateKind, hasYearlyObjective: boolean, yearlyObjective: number | null) {
  if (hasYearlyObjective && yearlyObjective && yearlyObjective > 0) {
    return "Percentages use management-entered yearly objectives as the denominator.";
  }

  if (hasYearlyObjective) {
    return "A management-entered yearly objective is configured, but its value is zero, so percentages are not calculated.";
  }

  if (kind === "csm") {
    return "No CSM yearly objective is configured, so percentages are not calculated.";
  }

  return "No yearly objective is configured for this aggregate, so percentages are not calculated.";
}

function finalizeManagementBucket(
  bucket: ManagementAggregateBucket,
  reportingMonth: number,
  year: number,
  objectiveMaps?: ManagementObjectiveMaps
): PetyrManagementAggregateRow {
  const monthly = Array.from({ length: 12 }, (_, monthIndex) => {
    const month = monthIndex + 1;
    const forecast = selectedManagementForecast(bucket, month, reportingMonth);
    const worked = bucket.worked[monthIndex];
    const planned = bucket.planned[monthIndex];

    return {
      month,
      forecast: roundMoney(forecast),
      worked: roundMoney(worked),
      planned: roundMoney(planned),
      workedAndPlanned: roundMoney(worked + planned)
    };
  });
  const configuredYearlyObjective = yearlyObjectiveForBucket(bucket, objectiveMaps);
  const hasYearlyObjective = configuredYearlyObjective !== null;
  const yearlyObjective = hasYearlyObjective ? roundMoney(configuredYearlyObjective) : null;
  const workedYtd = roundMoney(monthly.reduce((sum, row) => sum + row.worked, 0));
  const plannedFuture = roundMoney(monthly.reduce((sum, row) => sum + row.planned, 0));
  const workedAndPlanned = roundMoney(workedYtd + plannedFuture);
  const monthlyForecast = monthly.reduce((sum, row) => sum + row.forecast, 0);
  const initialForecast = bucket.initialForecastRows > 0 ? roundMoney(bucket.initialForecast) : null;
  const ongoingForecast = bucket.annualForecastRows > 0 ? roundMoney(bucket.annualForecast) : null;
  const forecast = roundMoney(ongoingForecast ?? monthlyForecast);
  const denominator = yearlyObjective && yearlyObjective > 0 ? yearlyObjective : null;

  return {
    kind: bucket.kind,
    key: bucket.key,
    label: bucket.label,
    yearlyObjective,
    hasYearlyObjective,
    initialForecast,
    ongoingForecast,
    forecast,
    workedYtd,
    workedYtdPct: denominator ? roundMoney(workedYtd / denominator * 100) : null,
    plannedFuture,
    workedAndPlanned,
    workedAndPlannedPct: denominator ? roundMoney(workedAndPlanned / denominator * 100) : null,
    denominatorNote: denominatorNote(bucket.kind, hasYearlyObjective, yearlyObjective),
    monthly
  };
}

function buildManagementAggregateRows(input: {
  year: number;
  reportingMonth: number;
  today: Date;
  diagnostics: string[];
  campaignDateColumnExists: boolean;
  campaignRows: MaterializedCampaignRow[];
  ownershipMaps?: CompanyOwnershipMaps;
  monthlyRows: ForecastMonthly[];
  annualRows: ForecastAnnual[];
  objectiveMaps?: ManagementObjectiveMaps;
}) {
  const branchBuckets = new Map<string, ManagementAggregateBucket>();
  const businessUnitBuckets = new Map<string, ManagementAggregateBucket>();
  const csmBuckets = new Map<string, ManagementAggregateBucket>();
  const totalBucket = createManagementAggregateBucket("branch", "Total");
  const companyBranchMap = buildCompanyBranchMap(input.ownershipMaps);
  const plannedFutureDiagnostics = createPlannedFutureCampaignDiagnostics();

  if (input.ownershipMaps?.hasRows) {
    const ownershipBranches = new Set<string>();

    for (const ownership of input.ownershipMaps.byCompany.values()) {
      ownershipBranches.add(normalizeBranch(ownership.branchName));
    }

    for (const branch of ownershipBranches) {
      ensureManagementBucket(branchBuckets, "branch", branch);
    }
  }

  for (const businessUnit of PETYR_BUSINESS_UNITS) {
    ensureManagementBucket(businessUnitBuckets, "business_unit", businessUnit);
  }

  function targetBuckets(companyName: string, businessUnit: string, csmName: string) {
    return [
      totalBucket,
      ensureManagementBucket(branchBuckets, "branch", companyBranch(companyBranchMap, companyName)),
      ensureManagementBucket(businessUnitBuckets, "business_unit", businessUnit),
      ensureManagementBucket(csmBuckets, "csm", csmName)
    ];
  }

  for (const row of input.campaignRows) {
    const companyName = normalizeCellValue(row.company_name);
    if (!companyName) continue;

    const campaignDate = parseDate(row.end_date);
    const worked = isWorkedCampaign({
      row,
      campaignDate,
      year: input.year,
      today: input.today,
      campaignDateColumnExists: input.campaignDateColumnExists
    });
    const plannedFuture = isValidPlannedFutureCampaign({
      row,
      campaignDate,
      year: input.year,
      today: input.today,
      campaignDateColumnExists: input.campaignDateColumnExists,
      diagnostics: plannedFutureDiagnostics
    });

    if (!worked && !plannedFuture) continue;

    const value = parseNumber(row.revenue_value);
    const businessUnit = normalizeBusinessUnit(row.business_unit);
    const csmName = normalizeCsm(companyOwnership(input.ownershipMaps, companyName)?.csmName ?? row.csm_name);

    for (const bucket of targetBuckets(companyName, businessUnit, csmName)) {
      if (worked) {
        const workedMonth = managementCampaignMonth(campaignDate, input.reportingMonth);
        bucket.worked[workedMonth - 1] += value;
      }

      if (plannedFuture) {
        const plannedMonth = managementCampaignMonth(campaignDate, input.reportingMonth);
        bucket.planned[plannedMonth - 1] += value;
      }
    }
  }

  for (const row of input.monthlyRows) {
    if (row.year !== input.year || row.month < 1 || row.month > 12) continue;

    const businessUnit = normalizeBusinessUnit(row.businessUnit);
    const csmName = normalizeCsm(companyOwnership(input.ownershipMaps, row.companyName)?.csmName ?? row.csmName);

    for (const bucket of targetBuckets(row.companyName, businessUnit, csmName)) {
      addManagementForecastValue(bucket, row);
    }
  }

  for (const row of input.annualRows) {
    if (row.year !== input.year || !row.initialForecast) continue;

    const businessUnit = normalizeBusinessUnit(row.businessUnit);
    const csmName = normalizeCsm(companyOwnership(input.ownershipMaps, row.companyName)?.csmName ?? row.csmName);

    for (const bucket of targetBuckets(row.companyName, businessUnit, csmName)) {
      addManagementInitialForecastValue(bucket, row);
    }
  }

  for (const row of input.annualRows) {
    if (row.year !== input.year) continue;

    const businessUnit = normalizeBusinessUnit(row.businessUnit);
    const csmName = normalizeCsm(companyOwnership(input.ownershipMaps, row.companyName)?.csmName ?? row.csmName);

    for (const bucket of targetBuckets(row.companyName, businessUnit, csmName)) {
      addManagementAnnualForecastValue(bucket, row);
    }
  }

  const branchAggregates = [...branchBuckets.values()]
    .map((bucket) => finalizeManagementBucket(bucket, input.reportingMonth, input.year, input.objectiveMaps))
    .sort((left, right) => {
      if (left.label === UNASSIGNED_BRANCH) return 1;
      if (right.label === UNASSIGNED_BRANCH) return -1;
      return right.workedAndPlanned - left.workedAndPlanned || left.label.localeCompare(right.label);
    });
  const businessUnitAggregates = [...businessUnitBuckets.values()]
    .map((bucket) => finalizeManagementBucket(bucket, input.reportingMonth, input.year, input.objectiveMaps))
    .sort((left, right) => PETYR_BUSINESS_UNITS.indexOf(left.label as (typeof PETYR_BUSINESS_UNITS)[number]) - PETYR_BUSINESS_UNITS.indexOf(right.label as (typeof PETYR_BUSINESS_UNITS)[number]));
  const csmAggregates = [...csmBuckets.values()]
    .map((bucket) => finalizeManagementBucket(bucket, input.reportingMonth, input.year, input.objectiveMaps))
    .sort((left, right) => {
      if (left.label === UNASSIGNED_CSM) return 1;
      if (right.label === UNASSIGNED_CSM) return -1;
      return right.workedAndPlanned - left.workedAndPlanned || left.label.localeCompare(right.label);
    });

  flushPlannedFutureCampaignDiagnostics(input.diagnostics, plannedFutureDiagnostics);

  return {
    monthlyTotals: finalizeManagementBucket(totalBucket, input.reportingMonth, input.year, input.objectiveMaps).monthly,
    branchAggregates,
    businessUnitAggregates,
    csmAggregates
  };
}

function diagnosticList(items: string[]) {
  const sorted = [...new Set(items)].sort((left, right) => left.localeCompare(right));
  const visible = sorted.slice(0, 8);
  const suffix = sorted.length > visible.length ? `, and ${sorted.length - visible.length} more` : "";

  return `${visible.join(", ")}${suffix}`;
}

function addMissingManagementObjectiveDiagnostics(input: {
  diagnostics: string[];
  year: number;
  branchAggregates: PetyrManagementAggregateRow[];
  businessUnitAggregates: PetyrManagementAggregateRow[];
}) {
  const missingBranches = input.branchAggregates
    .filter((row) => !row.hasYearlyObjective)
    .map((row) => row.label);
  const missingBusinessUnits = input.businessUnitAggregates
    .filter((row) => !row.hasYearlyObjective)
    .map((row) => row.label);

  if (missingBranches.length > 0) {
    input.diagnostics.push(
      `Missing Branch yearly objectives for ${input.year}: ${diagnosticList(missingBranches)}. Non-blocking: Management View shows n/a and skips objective percentages for those Branches. Configure them in Management Objectives at the bottom of Management View.`
    );
  }

  if (missingBusinessUnits.length > 0) {
    input.diagnostics.push(
      `Missing Business Unit yearly objectives for ${input.year}: ${diagnosticList(missingBusinessUnits)}. Non-blocking: Management View shows n/a and skips objective percentages for those Business Units. Configure them in Management Objectives at the bottom of Management View.`
    );
  }
}

function addCampaignActualDiagnostics(input: {
  campaignContext: SourceContext<CampaignColumns>;
  diagnostics: string[];
  label: string;
  year: number;
}) {
  if (!input.campaignContext.columns.businessUnit) {
    input.diagnostics.push(`${input.label} cannot group closed revenue by Business Unit because no campaign Business Unit column could be resolved.`);
  }

  if (!input.campaignContext.columns.revenue) {
    input.diagnostics.push(`${input.label} cannot use Redash campaign revenue values because no campaign value column could be resolved.`);
  }

  if (!input.campaignContext.columns.endDate) {
    input.diagnostics.push(`${input.label} for ${input.year} cannot split closed revenue by month because no campaign end date column could be resolved.`);
  }

  if (!input.campaignContext.columns.endDate) {
    input.diagnostics.push(`${input.label} for ${input.year} cannot calculate planned future campaign revenue because no campaign end date column could be resolved.`);
  }
}

function buildManagementTotals(companies: PetyrCompanyOverview[], monthlyTrend: PetyrMonthlyRevenueTrend[]) {
  return {
    companiesCount: companies.length,
    activeCompaniesCount: companies.filter((company) => company.isForecastActive !== false).length,
    actualRevenue: roundMoney(monthlyTrend.reduce((sum, row) => sum + row.actualRevenue, 0) || companies.reduce((sum, company) => sum + company.currentYearRevenue, 0)),
    previousMonthForecast: roundMoney(monthlyTrend.reduce((sum, row) => sum + row.previousMonthForecast, 0)),
    ongoingForecast: roundMoney(monthlyTrend.reduce((sum, row) => sum + row.ongoingForecast, 0)),
    annualForecast: roundMoney(companies.reduce((sum, company) => sum + company.annualForecast, 0)),
    aiForecast: roundMoney(monthlyTrend.reduce((sum, row) => sum + row.aiForecast, 0)),
    residualAgreementValue: roundMoney(companies.reduce((sum, company) => sum + company.residualAgreementValue, 0)),
    totalAgreementValue: roundMoney(companies.reduce((sum, company) => sum + company.totalAgreementValue, 0))
  } satisfies PetyrManagementTotals;
}

function buildRiskBreakdown(companies: PetyrCompanyOverview[]) {
  const byStatus = new Map<string, number>();

  for (const company of companies) {
    byStatus.set(company.dataQualityStatus, (byStatus.get(company.dataQualityStatus) ?? 0) + 1);
  }

  return [...byStatus.entries()]
    .map(([status, companiesCount]) => ({ status, companiesCount }))
    .sort((left, right) => right.companiesCount - left.companiesCount || left.status.localeCompare(right.status));
}

function companyKeySet(companies: PetyrCompanyOverview[]) {
  return new Set(companies.map((company) => normalizeKey(company.companyName)));
}

function filterCampaignRowsByCompanies(rows: MaterializedCampaignRow[], companies: Set<string>) {
  return rows.filter((row) => companies.has(normalizeKey(normalizeCellValue(row.company_name))));
}

function filterCampaignRowsByYear(input: {
  rows: MaterializedCampaignRow[];
  campaignDateColumnExists: boolean;
  year: number;
}) {
  if (!input.campaignDateColumnExists) return input.rows;

  return input.rows.filter((row) => parseDate(row.end_date)?.getFullYear() === input.year);
}

function addCompanyCampaignYearFilterDiagnostics(input: {
  rows: MaterializedCampaignRow[];
  campaignDateColumnExists: boolean;
  diagnostics: string[];
  companyName: string;
  year: number;
}) {
  if (!input.campaignDateColumnExists) return;

  const rowsWithoutEndDate = input.rows.filter((row) => !parseDate(row.end_date)).length;

  if (rowsWithoutEndDate > 0) {
    input.diagnostics.push(
      `Company Campaigns for ${input.companyName || "unknown company"} exclude ${rowsWithoutEndDate} campaign row(s) from ${input.year} filtering because they have no campaign end date. Selected-year filtering uses the mapped campaign end date.`
    );
  }
}

function filterAgreementRowsByCompanies(rows: MaterializedAgreementRow[], companies: Set<string>) {
  return rows.filter((row) => companies.has(normalizeKey(normalizeCellValue(row.company_name))));
}

function filterMonthlyRowsByCompanies(rows: ForecastMonthly[], companies: Set<string>) {
  return rows.filter((row) => companies.has(normalizeKey(row.companyName)));
}

function filterAnnualRowsByCompanies(rows: ForecastAnnual[], companies: Set<string>) {
  return rows.filter((row) => companies.has(normalizeKey(row.companyName)));
}

function filterAiRowsByCompanies(rows: PetyrNumericAiForecastCacheRow[], companies: Set<string>) {
  return rows.filter((row) => companies.has(normalizeKey(row.companyName)));
}

function buildCsmSummaries(input: {
  year: number;
  today: Date;
  campaignDateColumnExists: boolean;
  companies: PetyrCompanyOverview[];
  campaignRows: MaterializedCampaignRow[];
  monthlyRows: ForecastMonthly[];
  aiRows: PetyrNumericAiForecastCacheRow[];
}) {
  const byCsm = new Map<string, PetyrCompanyOverview[]>();

  for (const company of input.companies) {
    byCsm.set(company.csmName, [...(byCsm.get(company.csmName) ?? []), company]);
  }

  return [...byCsm.entries()]
    .map(([csmName, companies]) => {
      const keys = companyKeySet(companies);
      const monthlyTrend = buildMonthlyTrend({
        year: input.year,
        today: input.today,
        campaignDateColumnExists: input.campaignDateColumnExists,
        campaignRows: filterCampaignRowsByCompanies(input.campaignRows, keys),
        monthlyRows: filterMonthlyRowsByCompanies(input.monthlyRows, keys),
        aiRows: filterAiRowsByCompanies(input.aiRows, keys)
      });

      return {
        ...buildManagementTotals(companies, monthlyTrend),
        csmName,
        dataQualityIssuesCount: companies.filter((company) => company.dataQualityStatus !== "Ready").length
      };
    })
    .sort((left, right) => right.residualAgreementValue - left.residualAgreementValue || left.csmName.localeCompare(right.csmName));
}

function agreementDetailKey(companyName: string | null | undefined, agreementName: string | null | undefined) {
  return [normalizeKey(normalizeCellValue(companyName)), normalizeKey(normalizeCellValue(agreementName))].join("\u0000");
}

function campaignDealLinkDateSortValue(value: string | null | undefined) {
  return parseDate(value)?.getTime() ?? Number.MAX_SAFE_INTEGER;
}

function compareCampaignRowsForAgreementDealLink(left: MaterializedCampaignRow, right: MaterializedCampaignRow) {
  return (
    campaignDealLinkDateSortValue(left.end_date) - campaignDealLinkDateSortValue(right.end_date) ||
    campaignDealLinkDateSortValue(left.start_date) - campaignDealLinkDateSortValue(right.start_date) ||
    normalizeCellValue(left.campaign_name).localeCompare(normalizeCellValue(right.campaign_name)) ||
    normalizeCellValue(left.campaign_link).localeCompare(normalizeCellValue(right.campaign_link)) ||
    (left.row_index ?? Number.MAX_SAFE_INTEGER) - (right.row_index ?? Number.MAX_SAFE_INTEGER)
  );
}

function buildAgreementDealLinkMap(rows: MaterializedCampaignRow[]) {
  const byCompanyAndAgreement = new Map<string, string>();

  const linkedCampaignRows = rows
    .filter((row) => normalizeCellValue(row.agreement_name) && normalizeCellValue(row.campaign_link))
    .sort(compareCampaignRowsForAgreementDealLink);

  for (const row of linkedCampaignRows) {
    const agreementName = normalizeCellValue(row.agreement_name);
    const agreementDealLink = normalizeCellValue(row.campaign_link);

    if (!agreementName || !agreementDealLink) continue;

    const key = agreementDetailKey(row.company_name, agreementName);
    if (!byCompanyAndAgreement.has(key)) {
      byCompanyAndAgreement.set(key, agreementDealLink);
    }
  }

  return byCompanyAndAgreement;
}

function buildCampaignDetails(rows: MaterializedCampaignRow[], agreementDealLinkRows: MaterializedCampaignRow[] = rows) {
  const agreementDealLinks = buildAgreementDealLinkMap(agreementDealLinkRows);

  return rows.map<PetyrCampaignDetail>((row) => {
    const value = parseNumber(row.revenue_value);
    const agreementName = normalizeCellValue(row.agreement_name);

    return {
      name: normalizeCellValue(row.campaign_name) || "Unnamed campaign",
      status: normalizeCellValue(row.campaign_status) || "Unknown",
      businessUnit: normalizeBusinessUnit(row.business_unit),
      agreementName,
      agreementLink: agreementName ? agreementDealLinks.get(agreementDetailKey(row.company_name, agreementName)) ?? "" : "",
      value,
      revenue: value,
      costs: parseNumber(row.cost_value),
      grossMarginPct: parseOptionalNumber(row.gross_margin_pct),
      startDate: toIsoDate(parseDate(row.start_date)),
      endDate: toIsoDate(parseDate(row.end_date)),
      link: normalizeCellValue(row.campaign_link)
    };
  });
}

function agreementDisplayStatus(row: MaterializedAgreementRow, today: Date) {
  const expiryDate = parseDate(row.expiry_date);

  if (expiryDate && daysUntil(expiryDate, today) < 0) return "Expired";

  return normalizeCellValue(row.agreement_status) || "Unknown";
}

function buildAgreementDetails(rows: MaterializedAgreementRow[], campaignRows: MaterializedCampaignRow[] = [], today = new Date()) {
  const agreementDealLinks = buildAgreementDealLinkMap(campaignRows);

  return [...rows]
    .sort((left, right) => compareMaterializedAgreementRows(left, right, today))
    .map<PetyrAgreementDetail>((row) => {
      const agreementName = normalizeCellValue(row.agreement_name) || "Unnamed agreement";
      const agreementDealLink = agreementDealLinks.get(agreementDetailKey(row.company_name, agreementName)) ?? "";

      return {
        name: agreementName,
        status: agreementDisplayStatus(row, today),
        totalValue: parseNumber(row.total_value),
        residualValue: parseNumber(row.residual_value),
        expiryDate: toIsoDate(parseDate(row.expiry_date)),
        agreementDealLink,
        link: agreementDealLink
      };
    });
}

function companyStatusToContext(row: CompanyForecastStatus | undefined) {
  return row
    ? {
        isActive: row.isActive,
        reason: row.reason,
        updatedAt: row.updatedAt.toISOString()
      }
    : null;
}

async function readCompanyChangeHistory(companyName: string, diagnostics: string[]) {
  const resolvedCompanyName = companyName.trim();
  if (!resolvedCompanyName) return [];

  const [saveSessionExists, changeLogExists] = await Promise.all([
    relationExists("forecast_save_session"),
    relationExists("forecast_change_log")
  ]);

  if (!saveSessionExists || !changeLogExists) {
    diagnostics.push("Forecast change history is unavailable because forecast_save_session or forecast_change_log is missing.");
    return [];
  }

  try {
    const sessions = await prisma.forecastSaveSession.findMany({
      where: {
        companyName: {
          equals: resolvedCompanyName,
          mode: "insensitive"
        }
      },
      include: {
        changeLogs: {
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 12
    });

    return sessions.map<PetyrForecastChangeHistorySession>((session) => ({
      id: session.id,
      source: session.source,
      year: session.year,
      month: session.month,
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
    diagnostics.push(`Unable to read Petyr forecast change history from PostgreSQL: ${errorMessage(error)}`);
    return [];
  }
}

export async function getCompaniesOverview(year?: number, month?: number) {
  const diagnostics: string[] = [];

  try {
    const today = new Date();
    const resolvedYear = year === undefined ? today.getFullYear() : resolveYear(year, diagnostics);
    const resolvedMonth = month === undefined ? getReportingMonth(resolvedYear, today) : resolveMonth(month, diagnostics);
    const inputs = await loadOverviewInputs(resolvedYear, resolvedMonth, diagnostics);

    if (!inputs.campaignContext.columns.endDate) {
      diagnostics.push("Campaign current-year revenue is using all materialized campaign rows because no campaign date column could be resolved.");
    }

    return createResult(
      buildOverviewRows({
        year: resolvedYear,
        month: resolvedMonth,
        today,
        campaignDateColumnExists: Boolean(inputs.campaignContext.columns.endDate),
        campaignRows: inputs.campaignRows,
        agreementRows: inputs.agreementRows,
        ownershipMaps: inputs.ownershipMaps,
        monthlyRows: inputs.monthlyRows,
        annualRows: inputs.annualRows,
        companyStatuses: inputs.companyStatuses,
        aiRows: inputs.aiRows
      }),
      diagnostics
    );
  } catch (error) {
    diagnostics.push(`Unable to read Petyr company overview from PostgreSQL: ${errorMessage(error)}`);
    return createResult([], diagnostics);
  }
}

export async function getManagementView(year: number) {
  const diagnostics: string[] = [];
  const today = new Date();
  const resolvedYear = resolveYear(year, diagnostics);
  const reportingMonth = getReportingMonth(resolvedYear, today);
  const finishPerformance = startPetyrPerformanceTimer("getManagementView", {
    year: resolvedYear,
    reportingMonth
  });

  try {
    const [inputs, objectiveMaps] = await Promise.all([
      loadOverviewInputs(resolvedYear, reportingMonth, diagnostics),
      getManagementObjectiveMaps(resolvedYear)
    ]);
    diagnostics.push(...objectiveMaps.diagnostics);
    if (!inputs.annualRows.some((row) => row.year === resolvedYear && row.initialForecast)) {
      diagnostics.push(
        `Initial Forecast is missing for ${resolvedYear}. Management View shows Initial Forecast as n/a until Annual Forecast Entry saves per-Business Unit Initial values during the December 10-January 10 window.`
      );
    }
    addCampaignActualDiagnostics({
      campaignContext: inputs.campaignContext,
      diagnostics,
      label: "Management view closed revenue",
      year: resolvedYear
    });

    const companies = buildOverviewRows({
      year: resolvedYear,
      month: reportingMonth,
      today,
      campaignDateColumnExists: Boolean(inputs.campaignContext.columns.endDate),
      campaignRows: inputs.campaignRows,
      agreementRows: inputs.agreementRows,
      ownershipMaps: inputs.ownershipMaps,
      monthlyRows: inputs.monthlyRows,
      annualRows: inputs.annualRows,
      companyStatuses: inputs.companyStatuses,
      aiRows: inputs.aiRows
    });
    const monthlyTrend = buildMonthlyTrend({
      year: resolvedYear,
      today,
      campaignDateColumnExists: Boolean(inputs.campaignContext.columns.endDate),
      campaignRows: inputs.campaignRows,
      monthlyRows: inputs.monthlyRows,
      aiRows: inputs.aiRows
    });
    const businessUnits = buildBusinessUnitSummaryRows({
      year: resolvedYear,
      today,
      campaignDateColumnExists: Boolean(inputs.campaignContext.columns.endDate),
      campaignRows: inputs.campaignRows,
      monthlyRows: inputs.monthlyRows,
      annualRows: inputs.annualRows,
      aiRows: inputs.aiRows
    });
    const managementAggregates = buildManagementAggregateRows({
      year: resolvedYear,
      reportingMonth,
      today,
      diagnostics,
      campaignDateColumnExists: Boolean(inputs.campaignContext.columns.endDate),
      campaignRows: inputs.campaignRows,
      ownershipMaps: inputs.ownershipMaps,
      monthlyRows: inputs.monthlyRows,
      annualRows: inputs.annualRows,
      objectiveMaps
    });
    addMissingManagementObjectiveDiagnostics({
      diagnostics,
      year: resolvedYear,
      branchAggregates: managementAggregates.branchAggregates,
      businessUnitAggregates: managementAggregates.businessUnitAggregates
    });

    return createResult<PetyrManagementView>(
      {
        year: resolvedYear,
        reportingMonth,
        totals: buildManagementTotals(companies, monthlyTrend),
        monthlyTotals: managementAggregates.monthlyTotals,
        branchAggregates: managementAggregates.branchAggregates,
        businessUnitAggregates: managementAggregates.businessUnitAggregates,
        csmAggregates: managementAggregates.csmAggregates,
        csmDenominatorNote: "CSM percentages require a dedicated CSM yearly objective. No CSM target is configured by default, so Petyr shows n/a and does not create a fallback target.",
        plannedSourceNote: "Closed revenue + planned uses Redash closed campaign revenue through today plus future Redash campaign revenue through year end only when campaign status is Setup or Recruiting. Ongoing Forecast shows current latest annual forecast rows when available, but forecast values are not used in planned-through-year-end.",
        monthlyTrend,
        companies,
        csmSummaries: buildCsmSummaries({
          year: resolvedYear,
          today,
          campaignDateColumnExists: Boolean(inputs.campaignContext.columns.endDate),
          companies,
          campaignRows: inputs.campaignRows,
          monthlyRows: inputs.monthlyRows,
          aiRows: inputs.aiRows
        }),
        businessUnits,
        riskBreakdown: buildRiskBreakdown(companies)
      },
      diagnostics
    );
  } catch (error) {
    diagnostics.push(`Unable to read Petyr management view from PostgreSQL: ${errorMessage(error)}`);
    const monthlyTrend = createEmptyMonthlyTrend();
    const managementAggregates = buildManagementAggregateRows({
      year: resolvedYear,
      reportingMonth,
      today,
      diagnostics,
      campaignDateColumnExists: true,
      campaignRows: [],
      monthlyRows: [],
      annualRows: []
    });

    return createResult<PetyrManagementView>(
      {
        year: resolvedYear,
        reportingMonth,
        totals: buildManagementTotals([], monthlyTrend),
        monthlyTotals: managementAggregates.monthlyTotals,
        branchAggregates: managementAggregates.branchAggregates,
        businessUnitAggregates: managementAggregates.businessUnitAggregates,
        csmAggregates: managementAggregates.csmAggregates,
        csmDenominatorNote: "CSM percentages require a dedicated CSM yearly objective. No CSM target is configured by default, so Petyr shows n/a and does not create a fallback target.",
        plannedSourceNote: "Closed revenue + planned uses Redash closed campaign revenue through today plus future Redash campaign revenue through year end only when campaign status is Setup or Recruiting. Ongoing Forecast shows current latest annual forecast rows when available, but forecast values are not used in planned-through-year-end.",
        monthlyTrend,
        companies: [],
        csmSummaries: [],
        businessUnits: buildBusinessUnitSummaryRows({
          year: resolvedYear,
          today,
          campaignDateColumnExists: true,
          campaignRows: [],
          monthlyRows: [],
          annualRows: [],
          aiRows: []
        }),
        riskBreakdown: []
      },
      diagnostics
    );
  } finally {
    finishPerformance();
  }
}

export async function getCsmOverviewWorkspace(year?: number) {
  const diagnostics: string[] = [];
  const today = new Date();
  const resolvedYear = year === undefined ? today.getFullYear() : resolveYear(year, diagnostics);
  const currentMonth = getReportingMonth(resolvedYear, today);
  const nextMonth = Math.min(currentMonth + 1, 12);
  const finishPerformance = startPetyrPerformanceTimer("getCsmOverviewWorkspace", {
    year: resolvedYear,
    currentMonth,
    nextMonth
  });

  try {
    const inputs = await loadOverviewInputs(resolvedYear, currentMonth, diagnostics);
    addCampaignActualDiagnostics({
      campaignContext: inputs.campaignContext,
      diagnostics,
      label: "CSM overview closed revenue",
      year: resolvedYear
    });

    const overviewRows = buildOverviewRows({
      year: resolvedYear,
      month: currentMonth,
      today,
      campaignDateColumnExists: Boolean(inputs.campaignContext.columns.endDate),
      campaignRows: inputs.campaignRows,
      agreementRows: inputs.agreementRows,
      ownershipMaps: inputs.ownershipMaps,
      monthlyRows: inputs.monthlyRows,
      annualRows: inputs.annualRows,
      companyStatuses: inputs.companyStatuses,
      aiRows: inputs.aiRows
    });
    const csmOverviewRows = expandCompanyOverviewsForRecentOwnership(overviewRows, inputs.ownershipMaps);
    const companies = buildCsmOverviewCompanies({
      year: resolvedYear,
      today,
      campaignDateColumnExists: Boolean(inputs.campaignContext.columns.endDate),
      companies: csmOverviewRows,
      campaignRows: inputs.campaignRows,
      monthlyRows: inputs.monthlyRows,
      aiRows: inputs.aiRows
    });

    return createResult<PetyrCsmOverviewWorkspace>(
      {
        year: resolvedYear,
        currentMonth,
        nextMonth,
        csmNames: [...new Set(companies.map((company) => company.csmName))].sort((left, right) => left.localeCompare(right)),
        companies,
        urgentActions: buildCsmUrgentActions({
          companies,
          agreementRows: inputs.agreementRows,
          campaignRows: inputs.campaignRows,
          campaignDateColumnExists: Boolean(inputs.campaignContext.columns.endDate),
          year: resolvedYear,
          month: currentMonth,
          today
        })
      },
      diagnostics
    );
  } catch (error) {
    diagnostics.push(`Unable to read Petyr CSM overview workspace from PostgreSQL: ${errorMessage(error)}`);

    return createResult<PetyrCsmOverviewWorkspace>(
      {
        year: resolvedYear,
        currentMonth,
        nextMonth,
        csmNames: [],
        companies: [],
        urgentActions: buildCsmUrgentActions({
          companies: [],
          agreementRows: [],
          campaignRows: [],
          campaignDateColumnExists: true,
          year: resolvedYear,
          month: currentMonth,
          today
        })
      },
      diagnostics
    );
  } finally {
    finishPerformance();
  }
}

export async function getCsmOverview(csmName: string, year: number) {
  const diagnostics: string[] = [];
  const today = new Date();
  const resolvedYear = resolveYear(year, diagnostics);
  const reportingMonth = getReportingMonth(resolvedYear, today);
  const normalizedCsm = normalizeKey(csmName);

  if (!normalizedCsm) {
    diagnostics.push("Missing CSM name for Petyr CSM overview.");
  }

  try {
    const inputs = await loadOverviewInputs(resolvedYear, reportingMonth, diagnostics);
    addCampaignActualDiagnostics({
      campaignContext: inputs.campaignContext,
      diagnostics,
      label: `CSM overview closed revenue for ${csmName || "unknown CSM"}`,
      year: resolvedYear
    });

    const overviewRows = buildOverviewRows({
      year: resolvedYear,
      month: reportingMonth,
      today,
      campaignDateColumnExists: Boolean(inputs.campaignContext.columns.endDate),
      campaignRows: inputs.campaignRows,
      agreementRows: inputs.agreementRows,
      ownershipMaps: inputs.ownershipMaps,
      monthlyRows: inputs.monthlyRows,
      annualRows: inputs.annualRows,
      companyStatuses: inputs.companyStatuses,
      aiRows: inputs.aiRows
    });
    const companies = expandCompanyOverviewsForRecentOwnership(overviewRows, inputs.ownershipMaps).filter(
      (company) => normalizeKey(company.csmName) === normalizedCsm
    );
    const keys = companyKeySet(companies);
    const campaignRows = filterCampaignRowsByCompanies(inputs.campaignRows, keys);
    const monthlyRows = filterMonthlyRowsByCompanies(inputs.monthlyRows, keys);
    const annualRows = filterAnnualRowsByCompanies(inputs.annualRows, keys);
    const aiRows = filterAiRowsByCompanies(inputs.aiRows, keys);
    const monthlyTrend = buildMonthlyTrend({
      year: resolvedYear,
      today,
      campaignDateColumnExists: Boolean(inputs.campaignContext.columns.endDate),
      campaignRows,
      monthlyRows,
      aiRows
    });

    if (normalizedCsm && companies.length === 0) {
      diagnostics.push(`No Petyr PostgreSQL data found for CSM "${csmName}" in ${resolvedYear}.`);
    }

    return createResult<PetyrCsmOverview>(
      {
        csmName,
        year: resolvedYear,
        reportingMonth,
        totals: buildManagementTotals(companies, monthlyTrend),
        monthlyTrend,
        companies,
        businessUnits: buildBusinessUnitSummaryRows({
          year: resolvedYear,
          today,
          campaignDateColumnExists: Boolean(inputs.campaignContext.columns.endDate),
          campaignRows,
          monthlyRows,
          annualRows,
          aiRows
        })
      },
      diagnostics
    );
  } catch (error) {
    diagnostics.push(`Unable to read Petyr CSM overview from PostgreSQL: ${errorMessage(error)}`);
    const monthlyTrend = createEmptyMonthlyTrend();

    return createResult<PetyrCsmOverview>(
      {
        csmName,
        year: resolvedYear,
        reportingMonth,
        totals: buildManagementTotals([], monthlyTrend),
        monthlyTrend,
        companies: [],
        businessUnits: buildBusinessUnitSummaryRows({
          year: resolvedYear,
          today,
          campaignDateColumnExists: true,
          campaignRows: [],
          monthlyRows: [],
          annualRows: [],
          aiRows: []
        })
      },
      diagnostics
    );
  }
}

export async function getCompanyDetail(companyName: string, year?: number) {
  const diagnostics: string[] = [];
  const normalizedCompany = normalizeKey(companyName);
  const today = new Date();
  const resolvedYear = year === undefined ? today.getFullYear() : resolveYear(year, diagnostics);
  const month = getReportingMonth(resolvedYear, today);
  const finishPerformance = startPetyrPerformanceTimer("getCompanyDetail", {
    year: resolvedYear,
    reportingMonth: month,
    hasCompanyName: Boolean(normalizedCompany)
  });

  try {
    const [campaignContext, agreementContext, ownershipContext] = await Promise.all([
      buildCampaignContext(diagnostics),
      buildAgreementContext(diagnostics),
      buildOwnershipContext(diagnostics)
    ]);
    const ownershipRows = await queryOwnershipRows(ownershipContext);
    const allOwnershipMaps = buildCompanyOwnershipMaps(ownershipRows);
    const ownedCompany = companyOwnership(allOwnershipMaps, companyName);
    const requestedCompanyNames = [...new Set([companyName, ownedCompany?.companyName].filter((value): value is string => Boolean(value)))];
    const requestedCompanyKeys = new Set(requestedCompanyNames.map(normalizeKey));
    const scopedOwnershipRows = ownershipRows.filter((row) => requestedCompanyKeys.has(normalizeKey(normalizeCellValue(row.company_name))));
    const ownershipMaps = buildCompanyOwnershipMaps(scopedOwnershipRows);
    const [campaignRows, agreementRows, monthlyRows, annualRows, companyStatuses, aiRows] = await Promise.all([
      queryCampaignRowsForCompanies(campaignContext, requestedCompanyNames),
      queryAgreementRowsForCompanies(agreementContext, requestedCompanyNames),
      readForecastMonthlyRows(diagnostics, { companyName: { in: requestedCompanyNames }, year: resolvedYear }),
      readForecastAnnualRows(diagnostics, { companyName: { in: requestedCompanyNames }, year: resolvedYear }),
      readCompanyForecastStatuses(diagnostics, { companyName: { in: requestedCompanyNames } }),
      readAiForecastCacheRows(diagnostics, { companyNames: requestedCompanyNames, year: resolvedYear })
    ]);
    const latestAiRows = latestAiForecasts(aiRows);

    if (ownershipContext.exists && ownershipContext.columns.company && ownershipRows.length === 0) {
      diagnostics.push(`company_ownership is materialized but has no usable company owner rows. Petyr falls back to campaign/agreement CSM where available and groups Branch as "${UNASSIGNED_BRANCH}".`);
    }

    if (!ownershipMaps.hasRows) {
      diagnostics.push(`Company Detail ownership fallback is active for "${companyName}": Petyr infers CSM from company rows where available and groups Branch as "${UNASSIGNED_BRANCH}" because canonical company ownership is unavailable for this company.`);
    }

    const overviewRows = buildOverviewRows({
      year: resolvedYear,
      month,
      today,
      campaignDateColumnExists: Boolean(campaignContext.columns.endDate),
      campaignRows,
      agreementRows,
      ownershipMaps,
      monthlyRows,
      annualRows,
      companyStatuses,
      aiRows: latestAiRows
    });
    const overview = overviewRows.find((row) => normalizeKey(row.companyName) === normalizedCompany) ?? null;
    const companyKey = normalizeKey(overview?.companyName ?? companyName);
    const companyKeys = new Set([companyKey]);
    const campaignDateColumnExists = Boolean(campaignContext.columns.endDate);
    const monthlyForecasts = filterMonthlyRowsByCompanies(monthlyRows, companyKeys);
    const annualForecasts = filterAnnualRowsByCompanies(annualRows, companyKeys);
    const selectedCompanyStatuses = companyStatuses.filter((row) => normalizeKey(row.companyName) === companyKey);
    const aiForecastRows = filterAiRowsByCompanies(latestAiRows, companyKeys);
    const allCompanyCampaignRows = filterCampaignRowsByCompanies(campaignRows, companyKeys);
    const companyCampaignRows = filterCampaignRowsByYear({
      rows: allCompanyCampaignRows,
      campaignDateColumnExists,
      year: resolvedYear
    });
    const companyAgreementRows = filterAgreementRowsByCompanies(agreementRows, companyKeys);
    const companyMonthlyTrend = buildMonthlyTrend({
      year: resolvedYear,
      today,
      campaignDateColumnExists,
      campaignRows: allCompanyCampaignRows,
      monthlyRows: monthlyForecasts,
      aiRows: aiForecastRows
    });
    const companyMonthlyBusinessUnitView = buildCompanyBusinessUnitMonthlyView({
      year: resolvedYear,
      today,
      campaignDateColumnExists,
      campaignRows: allCompanyCampaignRows,
      monthlyRows: monthlyForecasts,
      aiRows: aiForecastRows
    });
    const plannedFutureDiagnostics = createPlannedFutureCampaignDiagnostics();
    const businessUnitSummary = buildBusinessUnitSummaryRows({
      year: resolvedYear,
      today,
      campaignDateColumnExists,
      campaignRows: allCompanyCampaignRows,
      monthlyRows: monthlyForecasts,
      annualRows: annualForecasts,
      aiRows: aiForecastRows,
      diagnostics: plannedFutureDiagnostics
    });

    addCampaignActualDiagnostics({
      campaignContext,
      diagnostics,
      label: `Company Detail closed revenue for ${overview?.companyName ?? (companyName || "unknown company")}`,
      year: resolvedYear
    });
    addCompanyCampaignYearFilterDiagnostics({
      rows: allCompanyCampaignRows,
      campaignDateColumnExists,
      diagnostics,
      companyName: overview?.companyName ?? companyName,
      year: resolvedYear
    });
    flushPlannedFutureCampaignDiagnostics(diagnostics, plannedFutureDiagnostics);

    const campaigns = buildCampaignDetails(companyCampaignRows, allCompanyCampaignRows);
    const agreements = buildAgreementDetails(companyAgreementRows, allCompanyCampaignRows, today);
    const changeHistory = await readCompanyChangeHistory(overview?.companyName ?? companyName, diagnostics);

    if (!overview && campaigns.length === 0 && agreements.length === 0 && monthlyForecasts.length === 0 && annualForecasts.length === 0) {
      diagnostics.push(`No Petyr PostgreSQL data found for company "${companyName}".`);
    }

    return createResult<PetyrCompanyDetail>(
      {
        overview,
        campaigns,
        agreements,
        monthlyForecasts: monthlyForecasts.map((row) => ({
          businessUnit: row.businessUnit,
          year: row.year,
          month: row.month,
          forecastType: row.forecastType,
          value: decimalToNumber(row.value) ?? 0,
          aiForecastValue: decimalToNumber(row.aiForecastValue),
          status: row.status
        })),
        annualForecasts: annualForecasts.map((row) => ({
          businessUnit: row.businessUnit,
          year: row.year,
          value: decimalToNumber(row.value) ?? 0,
          aiForecastValue: decimalToNumber(row.aiForecastValue),
          status: row.status,
          note: row.note
        })),
        companyStatus: companyStatusToContext(selectedCompanyStatuses[0]),
        aiForecasts: latestAiForecasts(aiForecastRows).map((row) => ({
          businessUnit: row.businessUnit,
          year: row.year,
          month: row.month,
          forecastValue: decimalToNumber(row.forecastValue) ?? 0,
          confidenceScore: decimalToNumber(row.confidenceScore),
          modelVersion: row.modelVersion,
          explanation: null,
          generatedAt: row.generatedAt.toISOString()
        })),
        monthlyTrend: companyMonthlyTrend,
        monthlyBusinessUnitView: companyMonthlyBusinessUnitView,
        businessUnitSummary,
        changeHistory
      },
      diagnostics
    );
  } catch (error) {
    diagnostics.push(`Unable to read Petyr company detail from PostgreSQL: ${errorMessage(error)}`);
    return createResult<PetyrCompanyDetail>(
      {
        overview: null,
        campaigns: [],
        agreements: [],
        monthlyForecasts: [],
        annualForecasts: [],
        companyStatus: null,
        aiForecasts: [],
        monthlyTrend: [],
        monthlyBusinessUnitView: [],
        businessUnitSummary: [],
        changeHistory: []
      },
      diagnostics
    );
  } finally {
    finishPerformance();
  }
}

export async function getForecastEntryCompanies() {
  const finishPerformance = startPetyrPerformanceTimer("getForecastEntryCompanies");

  try {
    const overview = await getCompaniesOverview();
    const rows = overview.data.map<PetyrForecastEntryCompany>((company) => {
      const activeScore = company.isForecastActive === false ? -100000 : 10000;
      const dataGapScore = company.dataQualityStatus === "Ready" ? 5000 : 0;
      const forecastGapScore = company.previousMonthForecast <= 0 && company.ongoingForecast <= 0 ? 15000 : 0;

      return {
        ...company,
        priorityScore: activeScore + dataGapScore + forecastGapScore + company.residualAgreementValue
      };
    });

    return createResult(
      rows.sort((left, right) => right.priorityScore - left.priorityScore || left.companyName.localeCompare(right.companyName)),
      overview.diagnostics
    );
  } finally {
    finishPerformance();
  }
}

export async function getCompanyDetailNavigationCompanies() {
  const diagnostics: string[] = [];
  const finishPerformance = startPetyrPerformanceTimer("getForecastEntryCompanies");

  try {
    const ownershipContext = await buildOwnershipContext(diagnostics);
    const [ownershipRows, companyStatuses] = await Promise.all([
      queryOwnershipRows(ownershipContext),
      readCompanyForecastStatuses(diagnostics)
    ]);
    const ownershipMaps = buildCompanyOwnershipMaps(ownershipRows);
    const statusByKey = new Map(companyStatuses.map((row) => [normalizeKey(row.companyName), row]));
    const rowsByKey = new Map<string, PetyrCompanyNavigationOption>();

    if (ownershipContext.exists && ownershipContext.columns.company && ownershipRows.length === 0) {
      diagnostics.push("company_ownership is materialized but has no usable company owner rows. Company Detail navigation is using minimal forecast-status fallback rows when available.");
    }

    if (ownershipMaps.hasRows) {
      for (const ownership of ownershipMaps.byCompany.values()) {
        const status = statusByKey.get(normalizeKey(ownership.companyName));
        rowsByKey.set(normalizeKey(ownership.companyName), {
          companyName: ownership.companyName,
          csmName: ownership.csmName || "Unassigned",
          isForecastActive: status?.isActive ?? null,
          priorityScore: status?.isActive === false ? -100000 : 10000
        });
      }
    } else {
      diagnostics.push(`Company Detail navigation ownership fallback is active: canonical company ownership is unavailable, so CSM filters may be limited until company_ownership is synced.`);
    }

    for (const status of companyStatuses) {
      const key = normalizeKey(status.companyName);
      if (rowsByKey.has(key)) continue;

      rowsByKey.set(key, {
        companyName: status.companyName,
        csmName: "Unassigned",
        isForecastActive: status.isActive,
        priorityScore: status.isActive === false ? -100000 : 10000
      });
    }

    return createResult(
      [...rowsByKey.values()].sort((left, right) => right.priorityScore - left.priorityScore || left.companyName.localeCompare(right.companyName)),
      diagnostics
    );
  } catch (error) {
    diagnostics.push(`Unable to read lightweight Company Detail navigation from PostgreSQL: ${errorMessage(error)}`);
    return createResult<PetyrCompanyNavigationOption[]>([], diagnostics);
  } finally {
    finishPerformance();
  }
}

export type PetyrForecastEntryScopedCompany = {
  companyName: string;
  csmName: string;
  isForecastActive: boolean | null;
  priorityScore: number;
};

export type PetyrForecastEntryScopedBatch = {
  selectedCsm: string;
  csmOptions: string[];
  companies: PetyrForecastEntryScopedCompany[];
  contexts: PetyrForecastEntryContext[];
  diagnostics: string[];
  usedFallback: boolean;
  scopedRowsCount: number;
};

export type PetyrAnnualForecastEntryScopedPortfolio = {
  selectedCsm: string;
  csmOptions: string[];
  companies: PetyrForecastEntryScopedCompany[];
  portfolio: Map<string, PetyrAnnualForecastEntryPortfolioCompany>;
  diagnostics: string[];
  usedFallback: boolean;
  scopedRowsCount: number;
};

function selectScopedCsm(input: { csmName?: unknown; preferredCsmName?: unknown }, csmOptions: string[]) {
  const requestedCsm = typeof input.csmName === "string" ? input.csmName.trim() : "";
  const preferredCsm = requestedCsm ? null : resolvePreferredCsmName(input.preferredCsmName, csmOptions);
  const selected = requestedCsm || preferredCsm || csmOptions[0] || "Unassigned";

  return {
    selectedCsm: selected,
    csmOptions: selected && !csmOptions.includes(selected) ? [selected, ...csmOptions] : csmOptions
  };
}

async function loadOverviewInputs(year: number, month: number, diagnostics: string[]) {
  const cached = await getPetyrCachedRead(`overview:${year}:${month}`, async () => {
    const scopedDiagnostics: string[] = [];
    const inputs = await loadOverviewInputsUncached(year, month, scopedDiagnostics);

    return {
      inputs,
      diagnostics: scopedDiagnostics
    };
  });

  diagnostics.push(...cached.value.diagnostics);
  return cached.value.inputs;
}

async function getScopedOwnershipSelection(input: {
  csmName?: unknown;
  preferredCsmName?: unknown;
  diagnostics: string[];
}) {
  const ownershipContext = await buildOwnershipContext(input.diagnostics);
  const ownershipRows = await queryOwnershipRows(ownershipContext);
  const ownershipMaps = buildCompanyOwnershipMaps(ownershipRows);

  if (!ownershipMaps.hasRows) {
    input.diagnostics.push("Forecast Entry scoped read fell back because company_ownership has no usable company rows.");
    return null;
  }

  const recentAssociations = recentCompanyOwnershipAssociations(ownershipMaps);
  if (recentAssociations.length === 0) {
    input.diagnostics.push(
      `No company_ownership workspace association has workspace_updated_on within the last ${RECENT_WORKSPACE_ASSOCIATION_MONTHS} months. Forecast Entry scoped read uses the latest owner per company until fresh workspace associations are synced.`
    );
  }

  const allCompanies = recentAssociations.length > 0 ? recentAssociations : [...ownershipMaps.byCompany.values()];
  const csmOptions = [...new Set(allCompanies.map((company) => company.csmName || "Unassigned"))].sort((left, right) =>
    left.localeCompare(right)
  );
  const selection = selectScopedCsm(input, csmOptions);
  const selectedCsmKey = normalizeKey(selection.selectedCsm);
  const companies = allCompanies
    .filter((company) => normalizeKey(company.csmName || "Unassigned") === selectedCsmKey)
    .map<PetyrForecastEntryScopedCompany>((company) => ({
      companyName: company.companyName,
      csmName: company.csmName || "Unassigned",
      isForecastActive: null,
      priorityScore: 0
    }));

  return {
    ...selection,
    ownershipMaps,
    companies
  };
}

function priorityScoreFromOverview(company: PetyrCompanyOverview | null, fallbackActiveStatus: boolean | null) {
  const isActive = company?.isForecastActive ?? fallbackActiveStatus;
  const activeScore = isActive === false ? -100000 : 10000;
  const dataGapScore = company?.dataQualityStatus === "Ready" ? 5000 : 0;
  const forecastGapScore = (company?.previousMonthForecast ?? 0) <= 0 && (company?.ongoingForecast ?? 0) <= 0 ? 15000 : 0;

  return activeScore + dataGapScore + forecastGapScore + (company?.residualAgreementValue ?? 0);
}

export async function getForecastEntryScopedBatch(input: {
  csmName?: unknown;
  preferredCsmName?: unknown;
  year: number;
  month: number;
}): Promise<PetyrForecastEntryScopedBatch | null> {
  const diagnostics: string[] = [];
  const today = new Date();
  const resolvedYear = resolveYear(input.year, diagnostics);
  const resolvedMonth = resolveMonth(input.month, diagnostics);
  const ownershipSelection = await getScopedOwnershipSelection({ ...input, diagnostics });

  if (!ownershipSelection) return null;
  if (ownershipSelection.companies.length === 0) {
    return {
      selectedCsm: ownershipSelection.selectedCsm,
      csmOptions: ownershipSelection.csmOptions,
      companies: [],
      contexts: [],
      diagnostics,
      usedFallback: false,
      scopedRowsCount: 0
    };
  }

  try {
    const selection = ownershipSelection;
    const companyNames = selection.companies.map((company) => company.companyName);
    const companyKeys = new Set(companyNames.map(normalizeKey));
    const [campaignContext, agreementContext] = await Promise.all([
      buildCampaignContext(diagnostics),
      buildAgreementContext(diagnostics)
    ]);
    const [campaignRows, agreementRows, monthlyRows, companyStatuses, aiRows] = await Promise.all([
      queryCampaignRowsForCompanies(campaignContext, companyNames),
      queryAgreementRowsForCompanies(agreementContext, companyNames),
      readForecastMonthlyRows(diagnostics, {
        companyName: { in: companyNames },
        year: resolvedYear,
        month: resolvedMonth
      }),
      readCompanyForecastStatuses(diagnostics, { companyName: { in: companyNames } }),
      readAiForecastCacheRows(diagnostics, {
        companyNames,
        year: resolvedYear,
        month: resolvedMonth
      })
    ]);
    const latestAiRows = latestAiForecasts(aiRows);
    const overviewRows = buildOverviewRows({
      year: resolvedYear,
      month: resolvedMonth,
      today,
      campaignDateColumnExists: Boolean(campaignContext.columns.endDate),
      campaignRows,
      agreementRows,
      ownershipMaps: ownershipSelection.ownershipMaps,
      monthlyRows,
      annualRows: [],
      companyStatuses,
      aiRows: latestAiRows
    });
    const overviewByKey = new Map(overviewRows.map((row) => [normalizeKey(row.companyName), row]));
    const statusByKey = new Map(companyStatuses.map((row) => [normalizeKey(row.companyName), row]));
    const monthlyByKey = new Map<string, ForecastMonthly>();
    const aiByKey = new Map<string, PetyrNumericAiForecastCacheRow>();
    const revenueByKey = new Map<string, number>();

    for (const row of monthlyRows) {
      monthlyByKey.set(forecastEntryCellKey(row.companyName, row.businessUnit, row.forecastType), row);
    }

    for (const row of latestAiRows) {
      aiByKey.set(forecastEntryCellKey(row.companyName, row.businessUnit, "ai"), row);
    }

    for (const row of campaignRows) {
      const companyName = normalizeCellValue(row.company_name);
      const companyKey = normalizeKey(companyName);
      if (!companyKeys.has(companyKey)) continue;

      const campaignDate = parseDate(row.end_date);
      const inSelectedMonth = campaignContext.columns.endDate
        ? campaignDate?.getFullYear() === resolvedYear && campaignDate.getMonth() + 1 === resolvedMonth
        : true;
      if (!inSelectedMonth) continue;
      if (!isWorkedCampaign({
        row,
        campaignDate,
        year: resolvedYear,
        today,
        campaignDateColumnExists: Boolean(campaignContext.columns.endDate)
      })) {
        continue;
      }

      const businessUnit = normalizeBusinessUnit(row.business_unit);
      const key = forecastEntryCellKey(companyName, businessUnit, "revenue");
      revenueByKey.set(key, (revenueByKey.get(key) ?? 0) + parseNumber(row.revenue_value));
    }

    addCampaignActualDiagnostics({
      campaignContext,
      diagnostics,
      label: "Forecast Entry batch closed revenue",
      year: resolvedYear
    });
    addBusinessUnitFallbackDiagnostics({
      diagnostics,
      campaignContext,
      campaignRows,
      label: "Forecast Entry batch Business Unit diagnostics"
    });

    const companies = ownershipSelection.companies
      .map<PetyrForecastEntryScopedCompany>((company) => {
        const overview = overviewByKey.get(normalizeKey(company.companyName)) ?? null;
        const status = statusByKey.get(normalizeKey(company.companyName));

        return {
          ...company,
          companyName: overview?.companyName ?? company.companyName,
          csmName: company.csmName ?? overview?.csmName ?? "Unassigned",
          isForecastActive: status?.isActive ?? overview?.isForecastActive ?? company.isForecastActive,
          priorityScore: priorityScoreFromOverview(overview, status?.isActive ?? company.isForecastActive)
        };
      })
      .sort((left, right) => right.priorityScore - left.priorityScore || left.companyName.localeCompare(right.companyName));

    const contexts = companies.map<PetyrForecastEntryContext>((companyInput) => {
      const company = overviewByKey.get(normalizeKey(companyInput.companyName)) ?? null;
      const resolvedCompanyName = company?.companyName ?? companyInput.companyName;
      const businessUnits = PETYR_BUSINESS_UNITS.map<PetyrForecastEntryBusinessUnitContext>((businessUnit) => {
        const previousMonthForecast = monthlyByKey.get(forecastEntryCellKey(resolvedCompanyName, businessUnit, "previous_month"));
        const ongoingForecast = monthlyByKey.get(forecastEntryCellKey(resolvedCompanyName, businessUnit, "ongoing"));
        const aiForecast = aiByKey.get(forecastEntryCellKey(resolvedCompanyName, businessUnit, "ai"));

        return {
          businessUnit,
          actualRevenue: roundMoney(revenueByKey.get(forecastEntryCellKey(resolvedCompanyName, businessUnit, "revenue")) ?? 0),
          previousMonthForecast: monthlyForecastValueContext(previousMonthForecast),
          ongoingForecast: monthlyForecastValueContext(ongoingForecast),
          annualForecast: annualForecastValueContext(undefined),
          aiForecast: {
            value: decimalToNumber(aiForecast?.forecastValue),
            confidenceScore: decimalToNumber(aiForecast?.confidenceScore),
            modelVersion: aiForecast?.modelVersion ?? null,
            explanation: null,
            generatedAt: aiForecast?.generatedAt.toISOString() ?? null
          }
        };
      });

      return {
        csmName: ownershipSelection.selectedCsm,
        companyName: resolvedCompanyName,
        year: resolvedYear,
        month: resolvedMonth,
        entryMode: getForecastEntryMode({ year: resolvedYear, month: resolvedMonth }),
        company,
        companyStatus: companyStatusToContext(statusByKey.get(normalizeKey(resolvedCompanyName))),
        businessUnits,
        campaigns: [],
        agreements: []
      };
    });

    return {
      selectedCsm: ownershipSelection.selectedCsm,
      csmOptions: ownershipSelection.csmOptions,
      companies,
      contexts,
      diagnostics,
      usedFallback: false,
      scopedRowsCount: campaignRows.length + agreementRows.length + monthlyRows.length + companyStatuses.length + aiRows.length
    };
  } catch (error) {
    diagnostics.push(`Forecast Entry scoped read fell back after PostgreSQL error: ${errorMessage(error)}`);
    return null;
  }
}

export async function getAnnualForecastEntryScopedPortfolio(input: {
  csmName?: unknown;
  preferredCsmName?: unknown;
  year: number;
}): Promise<PetyrAnnualForecastEntryScopedPortfolio | null> {
  const diagnostics: string[] = [];
  const today = new Date();
  const resolvedYear = resolveYear(input.year, diagnostics);
  const ownershipSelection = await getScopedOwnershipSelection({ ...input, diagnostics });

  if (!ownershipSelection) return null;
  if (ownershipSelection.companies.length === 0) {
    return {
      selectedCsm: ownershipSelection.selectedCsm,
      csmOptions: ownershipSelection.csmOptions,
      companies: [],
      portfolio: new Map(),
      diagnostics,
      usedFallback: false,
      scopedRowsCount: 0
    };
  }

  try {
    const selection = ownershipSelection;
    const companyNames = selection.companies.map((company) => company.companyName);
    const companyKeys = new Set(companyNames.map(normalizeKey));
    const campaignContext = await buildCampaignContext(diagnostics);
    const [campaignRows, companyStatuses, aiRows] = await Promise.all([
      queryCampaignRowsForCompanies(campaignContext, companyNames),
      readCompanyForecastStatuses(diagnostics, { companyName: { in: companyNames } }),
      readAiForecastCacheRows(diagnostics, {
        companyNames,
        year: resolvedYear
      })
    ]);
    const statusByKey = new Map(companyStatuses.map((row) => [normalizeKey(row.companyName), row]));
    const byCompany = new Map<string, PetyrAnnualForecastEntryPortfolioCompany>();

    function ensure(companyName: string, fallbackCsmName = "Unassigned") {
      const companyKey = normalizeKey(companyName);
      const ownership = selection.ownershipMaps.byCompany.get(companyKey);
      const resolvedCompanyName = ownership?.companyName ?? companyName;
      const resolvedKey = normalizeKey(resolvedCompanyName);
      const existing = byCompany.get(resolvedKey);
      if (existing) return existing;

      const created: PetyrAnnualForecastEntryPortfolioCompany = {
        companyName: resolvedCompanyName,
        csmName: fallbackCsmName || ownership?.csmName || "Unassigned",
        companyStatus: companyStatusToContext(statusByKey.get(resolvedKey)),
        revenueByBusinessUnit: new Map<string, number>(PETYR_BUSINESS_UNITS.map((businessUnit) => [businessUnit, 0])),
        plannedByBusinessUnit: new Map<string, number>(PETYR_BUSINESS_UNITS.map((businessUnit) => [businessUnit, 0])),
        annualAiForecastsByBusinessUnit: new Map<string, { value: number; confidenceScores: number[]; modelVersion: string | null; generatedAt: string | null }>(
          PETYR_BUSINESS_UNITS.map((businessUnit) => [
            businessUnit,
            { value: 0, confidenceScores: [], modelVersion: null, generatedAt: null }
          ])
        )
      };
      byCompany.set(resolvedKey, created);
      return created;
    }

    for (const company of selection.companies) ensure(company.companyName, company.csmName || "Unassigned");

    for (const row of campaignRows) {
      const companyName = normalizeCellValue(row.company_name);
      const companyKey = normalizeKey(companyName);
      if (!companyKeys.has(companyKey)) continue;

      const bucket = ensure(companyName);
      const businessUnit = normalizeBusinessUnit(row.business_unit);

      if (isAnnualEntryRevenueCampaign(row, resolvedYear, today)) {
        bucket.revenueByBusinessUnit.set(
          businessUnit,
          (bucket.revenueByBusinessUnit.get(businessUnit) ?? 0) + parseNumber(row.revenue_value)
        );
      } else if (isAnnualEntryPlannedCampaign(row, resolvedYear, today)) {
        bucket.plannedByBusinessUnit.set(
          businessUnit,
          (bucket.plannedByBusinessUnit.get(businessUnit) ?? 0) + parseNumber(row.revenue_value)
        );
      }
    }

    for (const row of latestAiForecasts(aiRows)) {
      const companyKey = normalizeKey(row.companyName);
      if (!companyKeys.has(companyKey) || row.year !== resolvedYear || row.month < 1 || row.month > 12) continue;

      const bucket = ensure(row.companyName);
      const businessUnit = normalizeBusinessUnit(row.businessUnit);
      const ai = bucket.annualAiForecastsByBusinessUnit.get(businessUnit);
      if (!ai) continue;

      ai.value += decimalToNumber(row.forecastValue) ?? 0;
      const confidence = decimalToNumber(row.confidenceScore);
      if (confidence !== null) ai.confidenceScores.push(confidence);
      ai.modelVersion = row.modelVersion;
      ai.generatedAt = row.generatedAt.toISOString();
    }

    addCampaignActualDiagnostics({
      campaignContext,
      diagnostics,
      label: "Annual Forecast Entry revenue",
      year: resolvedYear
    });
    addBusinessUnitFallbackDiagnostics({
      diagnostics,
      campaignContext,
      campaignRows,
      label: "Annual Forecast Entry Business Unit diagnostics"
    });

    const companies = selection.companies
      .map<PetyrForecastEntryScopedCompany>((company) => {
        const status = statusByKey.get(normalizeKey(company.companyName));

        return {
          ...company,
          isForecastActive: status?.isActive ?? company.isForecastActive,
          priorityScore: priorityScoreFromOverview(null, status?.isActive ?? company.isForecastActive)
        };
      })
      .sort((left, right) => left.companyName.localeCompare(right.companyName));

    return {
      selectedCsm: selection.selectedCsm,
      csmOptions: selection.csmOptions,
      companies,
      portfolio: byCompany,
      diagnostics,
      usedFallback: false,
      scopedRowsCount: campaignRows.length + companyStatuses.length + aiRows.length
    };
  } catch (error) {
    diagnostics.push(`Annual Forecast Entry scoped read fell back after PostgreSQL error: ${errorMessage(error)}`);
    return null;
  }
}

function monthlyForecastValueContext(row: ForecastMonthly | undefined): PetyrForecastValueContext {
  return {
    value: decimalToNumber(row?.value) ?? 0,
    status: row?.status ?? null,
    updatedAt: row?.updatedAt.toISOString() ?? null
  };
}

function annualForecastValueContext(row: ForecastAnnual | undefined): PetyrForecastValueContext {
  return {
    value: decimalToNumber(row?.value) ?? 0,
    status: row?.status ?? null,
    updatedAt: row?.updatedAt.toISOString() ?? null
  };
}

function filterCampaignRowsByYearMonth(input: {
  rows: MaterializedCampaignRow[];
  campaignDateColumnExists: boolean;
  year: number;
  month: number;
}) {
  if (!input.campaignDateColumnExists) return input.rows;

  return input.rows.filter((row) => {
    const campaignDate = parseDate(row.end_date);
    return campaignDate?.getFullYear() === input.year && campaignDate.getMonth() + 1 === input.month;
  });
}

type PetyrForecastEntryBatchCompanyInput = {
  companyName: string;
  csmName: string;
};

function forecastEntryCellKey(companyName: string, businessUnit: string, suffix: string) {
  return [normalizeKey(companyName), normalizeKey(businessUnit), suffix].join("\u0000");
}

export async function getForecastEntryContextsBatch(input: {
  csmName: string;
  companies: PetyrForecastEntryBatchCompanyInput[];
  year: number;
  month: number;
}) {
  const diagnostics: string[] = [];
  const today = new Date();
  const resolvedYear = resolveYear(input.year, diagnostics);
  const resolvedMonth = resolveMonth(input.month, diagnostics);

  if (input.companies.length === 0) {
    return createResult<PetyrForecastEntryContext[]>([], diagnostics);
  }

  try {
    const inputs = await loadOverviewInputs(resolvedYear, resolvedMonth, diagnostics);
    const overviewRows = buildOverviewRows({
      year: resolvedYear,
      month: resolvedMonth,
      today,
      campaignDateColumnExists: Boolean(inputs.campaignContext.columns.endDate),
      campaignRows: inputs.campaignRows,
      agreementRows: inputs.agreementRows,
      ownershipMaps: inputs.ownershipMaps,
      monthlyRows: inputs.monthlyRows,
      annualRows: inputs.annualRows,
      companyStatuses: inputs.companyStatuses,
      aiRows: inputs.aiRows
    });
    const requestedKeys = new Set(input.companies.map((company) => normalizeKey(company.companyName)));
    const overviewByKey = new Map(overviewRows.map((row) => [normalizeKey(row.companyName), row]));
    const statusByKey = new Map(inputs.companyStatuses.map((row) => [normalizeKey(row.companyName), row]));
    const monthlyByKey = new Map<string, ForecastMonthly>();
    const annualByKey = new Map<string, ForecastAnnual>();
    const aiByKey = new Map<string, PetyrNumericAiForecastCacheRow>();
    const revenueByKey = new Map<string, number>();

    for (const row of inputs.monthlyRows) {
      const companyKey = normalizeKey(row.companyName);
      if (!requestedKeys.has(companyKey) || row.year !== resolvedYear || row.month !== resolvedMonth) continue;
      monthlyByKey.set(forecastEntryCellKey(row.companyName, row.businessUnit, row.forecastType), row);
    }

    for (const row of inputs.annualRows) {
      const companyKey = normalizeKey(row.companyName);
      if (!requestedKeys.has(companyKey) || row.year !== resolvedYear) continue;
      annualByKey.set(forecastEntryCellKey(row.companyName, row.businessUnit, "annual"), row);
    }

    for (const row of latestAiForecasts(inputs.aiRows)) {
      const companyKey = normalizeKey(row.companyName);
      if (!requestedKeys.has(companyKey) || row.year !== resolvedYear || row.month !== resolvedMonth) continue;
      aiByKey.set(forecastEntryCellKey(row.companyName, row.businessUnit, "ai"), row);
    }

    for (const row of inputs.campaignRows) {
      const companyName = normalizeCellValue(row.company_name);
      const companyKey = normalizeKey(companyName);
      if (!requestedKeys.has(companyKey)) continue;

      const campaignDate = parseDate(row.end_date);
      const inSelectedMonth = inputs.campaignContext.columns.endDate
        ? campaignDate?.getFullYear() === resolvedYear && campaignDate.getMonth() + 1 === resolvedMonth
        : true;
      if (!inSelectedMonth) continue;
      if (!isWorkedCampaign({
        row,
        campaignDate,
        year: resolvedYear,
        today,
        campaignDateColumnExists: Boolean(inputs.campaignContext.columns.endDate)
      })) {
        continue;
      }

      const businessUnit = normalizeBusinessUnit(row.business_unit);
      const key = forecastEntryCellKey(companyName, businessUnit, "revenue");
      revenueByKey.set(key, (revenueByKey.get(key) ?? 0) + parseNumber(row.revenue_value));
    }

    addCampaignActualDiagnostics({
      campaignContext: inputs.campaignContext,
      diagnostics,
      label: "Forecast Entry batch closed revenue",
      year: resolvedYear
    });

    const contexts = input.companies.map<PetyrForecastEntryContext>((companyInput) => {
      const company = overviewByKey.get(normalizeKey(companyInput.companyName)) ?? null;
      const resolvedCompanyName = company?.companyName ?? companyInput.companyName;
      const businessUnits = PETYR_BUSINESS_UNITS.map<PetyrForecastEntryBusinessUnitContext>((businessUnit) => {
        const previousMonthForecast = monthlyByKey.get(forecastEntryCellKey(resolvedCompanyName, businessUnit, "previous_month"));
        const ongoingForecast = monthlyByKey.get(forecastEntryCellKey(resolvedCompanyName, businessUnit, "ongoing"));
        const annualForecast = annualByKey.get(forecastEntryCellKey(resolvedCompanyName, businessUnit, "annual"));
        const aiForecast = aiByKey.get(forecastEntryCellKey(resolvedCompanyName, businessUnit, "ai"));

        return {
          businessUnit,
          actualRevenue: roundMoney(revenueByKey.get(forecastEntryCellKey(resolvedCompanyName, businessUnit, "revenue")) ?? 0),
          previousMonthForecast: monthlyForecastValueContext(previousMonthForecast),
          ongoingForecast: monthlyForecastValueContext(ongoingForecast),
          annualForecast: annualForecastValueContext(annualForecast),
          aiForecast: {
            value: decimalToNumber(aiForecast?.forecastValue),
            confidenceScore: decimalToNumber(aiForecast?.confidenceScore),
            modelVersion: aiForecast?.modelVersion ?? null,
            explanation: null,
            generatedAt: aiForecast?.generatedAt.toISOString() ?? null
          }
        };
      });

      return {
        csmName: input.csmName,
        companyName: resolvedCompanyName,
        year: resolvedYear,
        month: resolvedMonth,
        entryMode: getForecastEntryMode({ year: resolvedYear, month: resolvedMonth }),
        company,
        companyStatus: companyStatusToContext(statusByKey.get(normalizeKey(resolvedCompanyName))),
        businessUnits,
        campaigns: [],
        agreements: []
      };
    });

    return createResult(contexts, diagnostics);
  } catch (error) {
    diagnostics.push(`Unable to read Petyr Forecast Entry batch contexts from PostgreSQL: ${errorMessage(error)}`);
    return createResult<PetyrForecastEntryContext[]>([], diagnostics);
  }
}

function annualEntryStatusKey(value: string) {
  return value.trim().toLowerCase();
}

function isAnnualEntryRevenueCampaign(row: MaterializedCampaignRow, year: number, today: Date) {
  const endDate = parseDate(row.end_date);
  if (!endDate || endDate.getFullYear() !== year || startOfLocalDay(endDate).getTime() > startOfLocalDay(today).getTime()) {
    return false;
  }

  const status = annualEntryStatusKey(normalizeCellValue(row.campaign_status));
  return !isInvalidCampaignStatus(status) && !isPlanningOnlyCampaignStatus(status);
}


function isAnnualEntryPlannedCampaign(row: MaterializedCampaignRow, year: number, today: Date) {
  const endDate = parseDate(row.end_date);
  if (!endDate || endDate.getFullYear() !== year) return false;

  const campaignDate = startOfLocalDay(endDate);
  const tomorrow = startOfLocalDay(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yearEnd = new Date(year, 11, 31);
  if (campaignDate.getTime() < tomorrow.getTime() || campaignDate.getTime() > yearEnd.getTime()) return false;

  return ["setup", "recruiting", "running"].includes(annualEntryStatusKey(normalizeCellValue(row.campaign_status)));
}

export async function getAnnualForecastEntryPortfolioCompanies(input: {
  companies: PetyrForecastEntryBatchCompanyInput[];
  year: number;
}) {
  const diagnostics: string[] = [];
  const today = new Date();
  const resolvedYear = resolveYear(input.year, diagnostics);
  const reportingMonth = getReportingMonth(resolvedYear, today);

  if (input.companies.length === 0) {
    return createResult<Map<string, PetyrAnnualForecastEntryPortfolioCompany>>(new Map(), diagnostics);
  }

  try {
    const inputs = await loadOverviewInputs(resolvedYear, reportingMonth, diagnostics);
    const overviewRows = buildOverviewRows({
      year: resolvedYear,
      month: reportingMonth,
      today,
      campaignDateColumnExists: Boolean(inputs.campaignContext.columns.endDate),
      campaignRows: inputs.campaignRows,
      agreementRows: inputs.agreementRows,
      ownershipMaps: inputs.ownershipMaps,
      monthlyRows: inputs.monthlyRows,
      annualRows: inputs.annualRows,
      companyStatuses: inputs.companyStatuses,
      aiRows: inputs.aiRows
    });
    const requestedKeys = new Set(input.companies.map((company) => normalizeKey(company.companyName)));
    const overviewByKey = new Map(overviewRows.map((row) => [normalizeKey(row.companyName), row]));
    const statusByKey = new Map(inputs.companyStatuses.map((row) => [normalizeKey(row.companyName), row]));
    const byCompany = new Map<string, PetyrAnnualForecastEntryPortfolioCompany>();

    function ensure(companyName: string, fallbackCsmName = "Unassigned") {
      const overview = overviewByKey.get(normalizeKey(companyName));
      const resolvedCompanyName = overview?.companyName ?? companyName;
      const companyKey = normalizeKey(resolvedCompanyName);
      const existing = byCompany.get(companyKey);
      if (existing) return existing;

      const created: PetyrAnnualForecastEntryPortfolioCompany = {
        companyName: resolvedCompanyName,
        csmName: overview?.csmName ?? fallbackCsmName,
        companyStatus: companyStatusToContext(statusByKey.get(companyKey)),
        revenueByBusinessUnit: new Map<string, number>(PETYR_BUSINESS_UNITS.map((businessUnit) => [businessUnit, 0])),
        plannedByBusinessUnit: new Map<string, number>(PETYR_BUSINESS_UNITS.map((businessUnit) => [businessUnit, 0])),
        annualAiForecastsByBusinessUnit: new Map<string, { value: number; confidenceScores: number[]; modelVersion: string | null; generatedAt: string | null }>(
          PETYR_BUSINESS_UNITS.map((businessUnit) => [
            businessUnit,
            { value: 0, confidenceScores: [], modelVersion: null, generatedAt: null }
          ])
        )
      };
      byCompany.set(companyKey, created);
      return created;
    }

    for (const company of input.companies) ensure(company.companyName, company.csmName || "Unassigned");

    for (const row of inputs.campaignRows) {
      const companyName = normalizeCellValue(row.company_name);
      const companyKey = normalizeKey(companyName);
      if (!requestedKeys.has(companyKey)) continue;

      const bucket = ensure(companyName);
      const businessUnit = normalizeBusinessUnit(row.business_unit);
      const campaignDate = parseDate(row.end_date);

      if (isAnnualEntryRevenueCampaign(row, resolvedYear, today)) {
        bucket.revenueByBusinessUnit.set(
          businessUnit,
          (bucket.revenueByBusinessUnit.get(businessUnit) ?? 0) + parseNumber(row.revenue_value)
        );
      } else if (isAnnualEntryPlannedCampaign(row, resolvedYear, today)) {
        bucket.plannedByBusinessUnit.set(
          businessUnit,
          (bucket.plannedByBusinessUnit.get(businessUnit) ?? 0) + parseNumber(row.revenue_value)
        );
      }
    }

    for (const row of latestAiForecasts(inputs.aiRows)) {
      const companyKey = normalizeKey(row.companyName);
      if (!requestedKeys.has(companyKey) || row.year !== resolvedYear || row.month < 1 || row.month > 12) continue;

      const bucket = ensure(row.companyName);
      const businessUnit = normalizeBusinessUnit(row.businessUnit);
      const ai = bucket.annualAiForecastsByBusinessUnit.get(businessUnit);
      if (!ai) continue;

      ai.value += decimalToNumber(row.forecastValue) ?? 0;
      const confidence = decimalToNumber(row.confidenceScore);
      if (confidence !== null) ai.confidenceScores.push(confidence);
      ai.modelVersion = row.modelVersion;
      ai.generatedAt = row.generatedAt.toISOString();
    }

    addCampaignActualDiagnostics({
      campaignContext: inputs.campaignContext,
      diagnostics,
      label: "Annual Forecast Entry revenue",
      year: resolvedYear
    });

    return createResult(byCompany, diagnostics);
  } catch (error) {
    diagnostics.push(`Unable to read Annual Forecast Entry portfolio data from PostgreSQL: ${errorMessage(error)}`);
    return createResult<Map<string, PetyrAnnualForecastEntryPortfolioCompany>>(new Map(), diagnostics);
  }
}


export async function getForecastEntryContext(csmName: string, companyName: string, year: number, month: number) {
  const diagnostics: string[] = [];
  const today = new Date();
  const resolvedYear = resolveYear(year, diagnostics);
  const resolvedMonth = resolveMonth(month, diagnostics);
  const normalizedCompany = normalizeKey(companyName);
  const finishPerformance = startPetyrPerformanceTimer("getForecastEntryContext", {
    year: resolvedYear,
    month: resolvedMonth,
    hasCompanyName: Boolean(normalizedCompany),
    hasCsmName: Boolean(normalizeKey(csmName))
  });

  if (!normalizedCompany) {
    diagnostics.push("Missing company name for Petyr forecast entry context.");
  }

  try {
    const inputs = await loadOverviewInputs(resolvedYear, resolvedMonth, diagnostics);
    const overviewRows = buildOverviewRows({
      year: resolvedYear,
      month: resolvedMonth,
      today,
      campaignDateColumnExists: Boolean(inputs.campaignContext.columns.endDate),
      campaignRows: inputs.campaignRows,
      agreementRows: inputs.agreementRows,
      ownershipMaps: inputs.ownershipMaps,
      monthlyRows: inputs.monthlyRows,
      annualRows: inputs.annualRows,
      companyStatuses: inputs.companyStatuses,
      aiRows: inputs.aiRows
    });
    const company = overviewRows.find((row) => normalizeKey(row.companyName) === normalizedCompany) ?? null;
    const companyKey = normalizeKey(company?.companyName ?? companyName);
    const companyKeys = new Set([companyKey]);
    const companyCampaignRows = filterCampaignRowsByCompanies(inputs.campaignRows, companyKeys);
    const campaignRowsForMonth = filterCampaignRowsByYearMonth({
      rows: companyCampaignRows,
      campaignDateColumnExists: Boolean(inputs.campaignContext.columns.endDate),
      year: resolvedYear,
      month: resolvedMonth
    });
    const companyMonthlyRows = filterMonthlyRowsByCompanies(inputs.monthlyRows, companyKeys).filter((row) => row.month === resolvedMonth);
    const companyAnnualRows = filterAnnualRowsByCompanies(inputs.annualRows, companyKeys);
    const companyAiRows = latestAiForecasts(filterAiRowsByCompanies(inputs.aiRows, companyKeys)).filter(
      (row) => row.year === resolvedYear && row.month === resolvedMonth
    );
    const companyStatus = inputs.companyStatuses.find((row) => normalizeKey(row.companyName) === companyKey);

    addCampaignActualDiagnostics({
      campaignContext: inputs.campaignContext,
      diagnostics,
      label: `Forecast entry closed revenue for ${companyName || "unknown company"}`,
      year: resolvedYear
    });

    if (!company && companyCampaignRows.length === 0 && companyMonthlyRows.length === 0 && companyAnnualRows.length === 0) {
      diagnostics.push(`No Petyr PostgreSQL data found for forecast entry company "${companyName}" in ${resolvedYear}.`);
    }

    const businessUnits = PETYR_BUSINESS_UNITS.map<PetyrForecastEntryBusinessUnitContext>((businessUnit) => {
      const previousMonthForecast = companyMonthlyRows.find(
        (row) => normalizeBusinessUnit(row.businessUnit) === businessUnit && row.forecastType === "previous_month"
      );
      const ongoingForecast = companyMonthlyRows.find(
        (row) => normalizeBusinessUnit(row.businessUnit) === businessUnit && row.forecastType === "ongoing"
      );
      const annualForecast = companyAnnualRows.find((row) => normalizeBusinessUnit(row.businessUnit) === businessUnit);
      const aiForecast = companyAiRows.find((row) => normalizeBusinessUnit(row.businessUnit) === businessUnit);
      const actualRevenue = campaignRowsForMonth
        .filter((row) => normalizeBusinessUnit(row.business_unit) === businessUnit)
        .reduce((sum, row) => sum + parseNumber(row.revenue_value), 0);

      return {
        businessUnit,
        actualRevenue: roundMoney(actualRevenue),
        previousMonthForecast: monthlyForecastValueContext(previousMonthForecast),
        ongoingForecast: monthlyForecastValueContext(ongoingForecast),
        annualForecast: annualForecastValueContext(annualForecast),
        aiForecast: {
          value: decimalToNumber(aiForecast?.forecastValue),
          confidenceScore: decimalToNumber(aiForecast?.confidenceScore),
          modelVersion: aiForecast?.modelVersion ?? null,
          explanation: null,
          generatedAt: aiForecast?.generatedAt.toISOString() ?? null
        }
      };
    });

    return createResult<PetyrForecastEntryContext>(
      {
        csmName,
        companyName: company?.companyName ?? companyName,
        year: resolvedYear,
        month: resolvedMonth,
        entryMode: getForecastEntryMode({ year: resolvedYear, month: resolvedMonth }),
        company,
        companyStatus: companyStatusToContext(companyStatus),
        businessUnits,
        campaigns: buildCampaignDetails(campaignRowsForMonth, companyCampaignRows),
        agreements: buildAgreementDetails(filterAgreementRowsByCompanies(inputs.agreementRows, companyKeys), companyCampaignRows, today)
      },
      diagnostics
    );
  } catch (error) {
    diagnostics.push(`Unable to read Petyr forecast entry context from PostgreSQL: ${errorMessage(error)}`);

    return createResult<PetyrForecastEntryContext>(
      {
        csmName,
        companyName,
        year: resolvedYear,
        month: resolvedMonth,
        entryMode: getForecastEntryMode({ year: resolvedYear, month: resolvedMonth }),
        company: null,
        companyStatus: null,
        businessUnits: PETYR_BUSINESS_UNITS.map((businessUnit) => ({
          businessUnit,
          actualRevenue: 0,
          previousMonthForecast: monthlyForecastValueContext(undefined),
          ongoingForecast: monthlyForecastValueContext(undefined),
          annualForecast: annualForecastValueContext(undefined),
          aiForecast: {
            value: null,
            confidenceScore: null,
            modelVersion: null,
            explanation: null,
            generatedAt: null
          }
        })),
        campaigns: [],
        agreements: []
      },
      diagnostics
    );
  } finally {
    finishPerformance();
  }
}

export async function getBusinessUnitSummary(year: number) {
  const diagnostics: string[] = [];
  const today = new Date();
  const resolvedYear = resolveYear(year, diagnostics);

  try {
    const [campaignContext, monthlyRows, annualRows, aiRows] = await Promise.all([
      buildCampaignContext(diagnostics),
      readForecastMonthlyRows(diagnostics, { year: resolvedYear }),
      readForecastAnnualRows(diagnostics, { year: resolvedYear }),
      readAiForecastCacheRows(diagnostics, { year: resolvedYear })
    ]);
    const campaignRows = await queryCampaignRows(campaignContext);

    addCampaignActualDiagnostics({
      campaignContext,
      diagnostics,
      label: "Business Unit closed revenue summary",
      year: resolvedYear
    });
    const plannedFutureDiagnostics = createPlannedFutureCampaignDiagnostics();
    const businessUnits = buildBusinessUnitSummaryRows({
      year: resolvedYear,
      today,
      campaignDateColumnExists: Boolean(campaignContext.columns.endDate),
      campaignRows,
      monthlyRows,
      annualRows,
      aiRows,
      diagnostics: plannedFutureDiagnostics
    });
    flushPlannedFutureCampaignDiagnostics(diagnostics, plannedFutureDiagnostics);

    return createResult(
      businessUnits,
      diagnostics
    );
  } catch (error) {
    diagnostics.push(`Unable to read Petyr Business Unit revenue summary from PostgreSQL: ${errorMessage(error)}`);
    return createResult([], diagnostics);
  }
}

export async function getBusinessUnitRevenueSummary(year: number) {
  return getBusinessUnitSummary(year);
}
