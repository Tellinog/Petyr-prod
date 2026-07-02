import { Prisma } from "@prisma/client";
import {
  getRedashPetyrSourceMappings,
  type PetyrLogicalField,
  type RedashPetyrSourceKey
} from "@/config/redashFieldMapping";
import { prisma } from "@/lib/db";
import { PETYR_BUSINESS_UNITS, normalizePetyrBusinessUnit } from "@/lib/petyr/constants";
import { startPetyrPerformanceTimer } from "@/lib/petyr/performance";
import { getCanonicalCompanyOwnershipBranches } from "@/services/petyrCompanyOwnershipService";
import {
  getRedashFieldMappingDiagnostics,
  type RedashFieldMappingDiagnosticSource
} from "@/services/redashFieldMappingDiagnosticsService";

const SAFE_IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;

const EXPECTED_REDASH_QUERY_IDS: Record<RedashPetyrSourceKey, number> = {
  master_campaigns: 1465,
  master_agreements: 1572,
  company_ownership: 1685
};

const MATERIALIZED_TABLES = [
  {
    tableName: "redash_raw_master_campaigns_latest",
    sourceKey: "master_campaigns",
    label: "Master campaigns"
  },
  {
    tableName: "redash_raw_master_agreements_latest",
    sourceKey: "master_agreements",
    label: "Master agreements"
  },
  {
    tableName: "redash_raw_company_ownership_latest",
    sourceKey: "company_ownership",
    label: "Company ownership"
  },
  {
    tableName: "redash_column_mapping",
    sourceKey: null,
    label: "Redash column mapping"
  }
] as const;

type MaterializedTableName = (typeof MATERIALIZED_TABLES)[number]["tableName"];

type RelationExistsRow = {
  exists: boolean;
};

type TableColumnRow = {
  columnName: string;
  ordinalPosition: number;
};

type RowCountRow = {
  rowCount: string;
};

type ManagementObjectiveCountRow = {
  year: number;
  scopeType: string;
  rowCount: string;
};

type ManagementObjectiveConfiguredKeyRow = {
  scopeType: string;
  scopeKey: string | null;
};

type InitialForecastCountRow = {
  rowCount: string;
};

type BusinessUnitValueRow = {
  originalValue: string | null;
  rowCount: string;
};

type RedashSourceRecord = {
  key: string;
  name: string;
  redashQueryId: number;
  enabled: boolean;
  updatedAt: Date;
  runs: Array<{
    status: string;
    triggeredBy: string;
    startedAt: Date;
    finishedAt: Date | null;
    rowsCount: number | null;
    queryResultId: number | null;
    errorMessage: string | null;
  }>;
  snapshots: Array<{
    fetchedAt: Date;
    rowsCount: number | null;
    queryResultId: number | null;
    payloadHash: string;
  }>;
};

export type PetyrDataHealthIssue = {
  code: string;
  message: string;
  tableName?: string;
  sourceKey?: string;
  logicalField?: PetyrLogicalField;
  dbColumnName?: string;
  detail?: string;
};

export type PetyrDataHealthColumn = {
  name: string;
  position: number;
};

export type PetyrDataHealthTable = {
  tableName: MaterializedTableName;
  label: string;
  sourceKey: RedashPetyrSourceKey | null;
  exists: boolean;
  rowCount: number | null;
  columnCount: number;
  columns: PetyrDataHealthColumn[];
  inspectionError: string | null;
};

export type PetyrDataHealthColumnCheck = {
  logicalField: PetyrLogicalField;
  dbColumnName: string | null;
  available: boolean;
};

export type PetyrDataHealthOwnershipDiagnostics = {
  tableName: "redash_raw_company_ownership_latest";
  available: boolean;
  rowCount: number | null;
  companyColumn: PetyrDataHealthColumnCheck;
  branchColumn: PetyrDataHealthColumnCheck;
  csmColumn: PetyrDataHealthColumnCheck;
  rowsWithCompany: number | null;
  rowsWithBranch: number | null;
  rowsWithCsm: number | null;
};

export type PetyrDataHealthManagementObjectiveYearCount = {
  year: number;
  total: number;
  branch: number;
  businessUnit: number;
};

export type PetyrDataHealthManagementObjectives = {
  currentYear: number;
  tableExists: boolean;
  missingTables: string[];
  configuredByYear: PetyrDataHealthManagementObjectiveYearCount[];
  currentYearConfiguredCount: number;
  currentYearBranchConfiguredCount: number;
  currentYearBusinessUnitConfiguredCount: number;
  branchesWithoutObjective: string[];
  businessUnitsWithoutObjective: string[];
  diagnostics: string[];
  inspectionError: string | null;
};

export type PetyrDataHealthResult = {
  ok: boolean;
  sources: {
    redashSourceModel: {
      relationName: "RedashSource";
      exists: boolean;
      accessible: boolean;
      error: string | null;
    };
    expected: Array<{
      sourceKey: RedashPetyrSourceKey;
      label: string;
      expectedRedashQueryId: number;
      tableName: string;
      existsInRedashSource: boolean;
      redashSource: {
        name: string;
        redashQueryId: number;
        enabled: boolean;
        updatedAt: string;
      } | null;
      latestSyncRun: {
        status: string;
        triggeredBy: string;
        startedAt: string;
        finishedAt: string | null;
        rowsCount: number | null;
        queryResultId: number | null;
        errorMessage: string | null;
      } | null;
      latestSnapshot: {
        fetchedAt: string;
        rowsCount: number | null;
        queryResultId: number | null;
        payloadHash: string;
      } | null;
    }>;
    ownership: PetyrDataHealthOwnershipDiagnostics;
  };
  managementObjectives: PetyrDataHealthManagementObjectives;
  materializedTables: Record<string, PetyrDataHealthTable>;
  rowCounts: Record<string, number | null>;
  availableColumns: Record<string, string[]>;
  mappingDiagnostics: RedashFieldMappingDiagnosticSource[];
  blockingIssues: PetyrDataHealthIssue[];
  warnings: PetyrDataHealthIssue[];
  checkedAt: string;
};

function sqlIdentifier(identifier: string) {
  if (!SAFE_IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(`Unsafe PostgreSQL identifier: ${identifier}`);
  }

  return Prisma.raw(`"${identifier}"`);
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function dateToIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function toNumber(value: string | null | undefined) {
  if (!value) return null;

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

async function relationExists(relationName: string) {
  const rows = await prisma.$queryRaw<RelationExistsRow[]>`
    SELECT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = current_schema()
        AND c.relname = ${relationName}
        AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    ) AS "exists"
  `;

  return rows[0]?.exists ?? false;
}

async function getTableColumns(tableName: string) {
  const rows = await prisma.$queryRaw<TableColumnRow[]>`
    SELECT
      "column_name" AS "columnName",
      "ordinal_position" AS "ordinalPosition"
    FROM information_schema.columns
    WHERE "table_schema" = current_schema()
      AND "table_name" = ${tableName}
    ORDER BY "ordinal_position" ASC
  `;

  return rows.map((row) => ({
    name: row.columnName,
    position: row.ordinalPosition
  }));
}

async function getRowCount(tableName: MaterializedTableName) {
  const rows = await prisma.$queryRaw<RowCountRow[]>(
    Prisma.sql`SELECT COUNT(*)::text AS "rowCount" FROM ${sqlIdentifier(tableName)}`
  );

  return toNumber(rows[0]?.rowCount);
}

async function countNonEmptyColumnRows(input: {
  tableName: MaterializedTableName;
  columnName: string | null;
  tableExists: boolean;
  columnAvailable: boolean;
}) {
  if (!input.tableExists || !input.columnName || !input.columnAvailable) return null;

  const rows = await prisma.$queryRaw<RowCountRow[]>(
    Prisma.sql`
      SELECT COUNT(*)::text AS "rowCount"
      FROM ${sqlIdentifier(input.tableName)}
      WHERE NULLIF(BTRIM(${sqlIdentifier(input.columnName)}::text), '') IS NOT NULL
    `
  );

  return toNumber(rows[0]?.rowCount);
}

async function inspectMaterializedTable(definition: (typeof MATERIALIZED_TABLES)[number]) {
  try {
    const exists = await relationExists(definition.tableName);

    if (!exists) {
      return {
        tableName: definition.tableName,
        label: definition.label,
        sourceKey: definition.sourceKey,
        exists: false,
        rowCount: null,
        columnCount: 0,
        columns: [],
        inspectionError: null
      } satisfies PetyrDataHealthTable;
    }

    const [columns, rowCount] = await Promise.all([
      getTableColumns(definition.tableName),
      getRowCount(definition.tableName)
    ]);

    return {
      tableName: definition.tableName,
      label: definition.label,
      sourceKey: definition.sourceKey,
      exists: true,
      rowCount,
      columnCount: columns.length,
      columns,
      inspectionError: null
    } satisfies PetyrDataHealthTable;
  } catch (error) {
    return {
      tableName: definition.tableName,
      label: definition.label,
      sourceKey: definition.sourceKey,
      exists: false,
      rowCount: null,
      columnCount: 0,
      columns: [],
      inspectionError: formatError(error)
    } satisfies PetyrDataHealthTable;
  }
}

function buildRecordMap<T extends { tableName: string }>(items: T[]) {
  return Object.fromEntries(items.map((item) => [item.tableName, item]));
}

function hasColumn(table: PetyrDataHealthTable | undefined, dbColumnName: string | null) {
  if (!table?.exists || !dbColumnName) return false;

  return table.columns.some((column) => column.name === dbColumnName);
}

function columnCheck(
  sourceKey: RedashPetyrSourceKey,
  logicalField: PetyrLogicalField,
  tablesByName: Record<string, PetyrDataHealthTable>
) {
  const source = getRedashPetyrSourceMappings().find((mapping) => mapping.sourceKey === sourceKey);
  const dbColumnName = source?.fields[logicalField].dbColumnName ?? null;

  return {
    logicalField,
    dbColumnName,
    available: hasColumn(source ? tablesByName[source.tableName] : undefined, dbColumnName)
  } satisfies PetyrDataHealthColumnCheck;
}

async function getRedashSources() {
  const modelExists = await relationExists("RedashSource");

  if (!modelExists) {
    return {
      redashSourceModel: {
        relationName: "RedashSource" as const,
        exists: false,
        accessible: false,
        error: null
      },
      records: [] as RedashSourceRecord[]
    };
  }

  try {
    const sourceKeys = getRedashPetyrSourceMappings().map((source) => source.sourceKey);
    const records = await prisma.redashSource.findMany({
      where: {
        key: {
          in: sourceKeys
        }
      },
      select: {
        key: true,
        name: true,
        redashQueryId: true,
        enabled: true,
        updatedAt: true,
        runs: {
          orderBy: {
            startedAt: "desc"
          },
          take: 1,
          select: {
            status: true,
            triggeredBy: true,
            startedAt: true,
            finishedAt: true,
            rowsCount: true,
            queryResultId: true,
            errorMessage: true
          }
        },
        snapshots: {
          orderBy: {
            fetchedAt: "desc"
          },
          take: 1,
          select: {
            fetchedAt: true,
            rowsCount: true,
            queryResultId: true,
            payloadHash: true
          }
        }
      }
    });

    return {
      redashSourceModel: {
        relationName: "RedashSource" as const,
        exists: true,
        accessible: true,
        error: null
      },
      records
    };
  } catch (error) {
    return {
      redashSourceModel: {
        relationName: "RedashSource" as const,
        exists: true,
        accessible: false,
        error: formatError(error)
      },
      records: [] as RedashSourceRecord[]
    };
  }
}

function buildSources(records: RedashSourceRecord[]) {
  const recordsByKey = new Map(records.map((record) => [record.key, record]));

  return getRedashPetyrSourceMappings().map((source) => {
    const record = recordsByKey.get(source.sourceKey) ?? null;
    const latestSyncRun = record?.runs[0] ?? null;
    const latestSnapshot = record?.snapshots[0] ?? null;

    return {
      sourceKey: source.sourceKey,
      label: source.label,
      expectedRedashQueryId: EXPECTED_REDASH_QUERY_IDS[source.sourceKey],
      tableName: source.tableName,
      existsInRedashSource: Boolean(record),
      redashSource: record
        ? {
            name: record.name,
            redashQueryId: record.redashQueryId,
            enabled: record.enabled,
            updatedAt: record.updatedAt.toISOString()
          }
        : null,
      latestSyncRun: latestSyncRun
        ? {
            status: latestSyncRun.status,
            triggeredBy: latestSyncRun.triggeredBy,
            startedAt: latestSyncRun.startedAt.toISOString(),
            finishedAt: dateToIso(latestSyncRun.finishedAt),
            rowsCount: latestSyncRun.rowsCount,
            queryResultId: latestSyncRun.queryResultId,
            errorMessage: latestSyncRun.errorMessage
          }
        : null,
      latestSnapshot: latestSnapshot
        ? {
            fetchedAt: latestSnapshot.fetchedAt.toISOString(),
            rowsCount: latestSnapshot.rowsCount,
            queryResultId: latestSnapshot.queryResultId,
            payloadHash: latestSnapshot.payloadHash
          }
        : null
    };
  });
}

async function buildOwnershipDiagnostics(tablesByName: Record<string, PetyrDataHealthTable>) {
  const table = tablesByName.redash_raw_company_ownership_latest;
  const companyColumn = columnCheck("company_ownership", "companyName", tablesByName);
  const branchColumn = columnCheck("company_ownership", "branch", tablesByName);
  const csmColumn = columnCheck("company_ownership", "csmName", tablesByName);

  const [rowsWithCompany, rowsWithBranch, rowsWithCsm] = await Promise.all([
    countNonEmptyColumnRows({
      tableName: "redash_raw_company_ownership_latest",
      columnName: companyColumn.dbColumnName,
      tableExists: table?.exists ?? false,
      columnAvailable: companyColumn.available
    }),
    countNonEmptyColumnRows({
      tableName: "redash_raw_company_ownership_latest",
      columnName: branchColumn.dbColumnName,
      tableExists: table?.exists ?? false,
      columnAvailable: branchColumn.available
    }),
    countNonEmptyColumnRows({
      tableName: "redash_raw_company_ownership_latest",
      columnName: csmColumn.dbColumnName,
      tableExists: table?.exists ?? false,
      columnAvailable: csmColumn.available
    })
  ]);

  return {
    tableName: "redash_raw_company_ownership_latest",
    available: Boolean(table?.exists && table.rowCount && table.rowCount > 0),
    rowCount: table?.rowCount ?? null,
    companyColumn,
    branchColumn,
    csmColumn,
    rowsWithCompany,
    rowsWithBranch,
    rowsWithCsm
  } satisfies PetyrDataHealthOwnershipDiagnostics;
}

function currentYear() {
  return new Date().getFullYear();
}

function normalizeObjectiveKey(value: string) {
  return value.trim().toLowerCase();
}

function compactList(items: string[]) {
  const sorted = [...new Set(items)].sort((left, right) => left.localeCompare(right));
  const visible = sorted.slice(0, 8);
  const suffix = sorted.length > visible.length ? `, and ${sorted.length - visible.length} more` : "";

  return `${visible.join(", ")}${suffix}`;
}

function emptyManagementObjectives(input: {
  currentYear: number;
  tableExists: boolean;
  missingTables?: string[];
  diagnostics?: string[];
  inspectionError?: string | null;
}): PetyrDataHealthManagementObjectives {
  return {
    currentYear: input.currentYear,
    tableExists: input.tableExists,
    missingTables: input.missingTables ?? [],
    configuredByYear: [],
    currentYearConfiguredCount: 0,
    currentYearBranchConfiguredCount: 0,
    currentYearBusinessUnitConfiguredCount: 0,
    branchesWithoutObjective: [],
    businessUnitsWithoutObjective: [],
    diagnostics: input.diagnostics ?? [],
    inspectionError: input.inspectionError ?? null
  };
}

function configuredObjectiveCounts(rows: ManagementObjectiveCountRow[]) {
  const byYear = new Map<number, PetyrDataHealthManagementObjectiveYearCount>();

  for (const row of rows) {
    const count = toNumber(row.rowCount) ?? 0;
    const summary = byYear.get(row.year) ?? {
      year: row.year,
      total: 0,
      branch: 0,
      businessUnit: 0
    };

    summary.total += count;

    if (row.scopeType === "branch") {
      summary.branch += count;
    }

    if (row.scopeType === "business_unit") {
      summary.businessUnit += count;
    }

    byYear.set(row.year, summary);
  }

  return [...byYear.values()].sort((left, right) => right.year - left.year);
}

async function inspectManagementObjectives(warnings: PetyrDataHealthIssue[]) {
  const year = currentYear();
  const diagnostics: string[] = [];
  let branches: string[] = [];

  try {
    branches = await getCanonicalCompanyOwnershipBranches();
  } catch (error) {
    const message = formatError(error);
    diagnostics.push(message);
    warnings.push(
      issue({
        code: "MANAGEMENT_OBJECTIVE_BRANCH_LIST_UNAVAILABLE",
        message: "Unable to load the dynamic Branch list for Management Objective data health.",
        detail: message
      })
    );
  }

  const [objectiveTableExists, changeLogTableExists] = await Promise.all([
    relationExists("management_objective"),
    relationExists("management_objective_change_log")
  ]);
  const missingTables = [
    objectiveTableExists ? null : "management_objective",
    changeLogTableExists ? null : "management_objective_change_log"
  ].filter((tableName): tableName is string => Boolean(tableName));

  if (missingTables.length > 0) {
    warnings.push(
      issue({
        code: "MANAGEMENT_OBJECTIVE_TABLES_MISSING",
        message: `Petyr management objective table(s) missing: ${missingTables.join(", ")}. From apps/forecasting-app run "npm run db:sync" for local schema sync, or apply reviewed migrations with "npx prisma migrate deploy".`,
        tableName: missingTables[0]
      })
    );

    if (!objectiveTableExists) {
      return {
        ...emptyManagementObjectives({ currentYear: year, tableExists: false, missingTables, diagnostics }),
        branchesWithoutObjective: branches,
        businessUnitsWithoutObjective: [...PETYR_BUSINESS_UNITS]
      };
    }
  }

  try {
    const [countRows, configuredKeys] = await Promise.all([
      prisma.$queryRaw<ManagementObjectiveCountRow[]>`
        SELECT
          "year",
          "scope_type"::text AS "scopeType",
          COUNT(*)::text AS "rowCount"
        FROM "management_objective"
        WHERE "scope_type"::text IN ('branch', 'business_unit')
        GROUP BY "year", "scope_type"
        ORDER BY "year" DESC, "scope_type" ASC
      `,
      prisma.$queryRaw<ManagementObjectiveConfiguredKeyRow[]>`
        SELECT
          "scope_type"::text AS "scopeType",
          "scope_key" AS "scopeKey"
        FROM "management_objective"
        WHERE "year" = ${year}
          AND "scope_type"::text IN ('branch', 'business_unit')
      `
    ]);
    const configuredByYear = configuredObjectiveCounts(countRows);
    const configuredBranches = new Set(
      configuredKeys
        .filter((row) => row.scopeType === "branch" && row.scopeKey)
        .map((row) => normalizeObjectiveKey(row.scopeKey ?? ""))
    );
    const configuredBusinessUnits = new Set(
      configuredKeys
        .filter((row) => row.scopeType === "business_unit" && row.scopeKey)
        .map((row) => normalizeObjectiveKey(row.scopeKey ?? ""))
    );
    const branchesWithoutObjective = branches.filter((branch) => !configuredBranches.has(normalizeObjectiveKey(branch)));
    const businessUnitsWithoutObjective = PETYR_BUSINESS_UNITS.filter(
      (businessUnit) => !configuredBusinessUnits.has(normalizeObjectiveKey(businessUnit))
    );
    const currentYearSummary = configuredByYear.find((summary) => summary.year === year);

    if (branchesWithoutObjective.length > 0) {
      warnings.push(
        issue({
          code: "BRANCH_OBJECTIVES_MISSING",
          message: `${branchesWithoutObjective.length} Branch objective(s) are missing for ${year}. Non-blocking: configure them in Management Objectives at the bottom of Management View.`,
          detail: compactList(branchesWithoutObjective)
        })
      );
    }

    if (businessUnitsWithoutObjective.length > 0) {
      warnings.push(
        issue({
          code: "BUSINESS_UNIT_OBJECTIVES_MISSING",
          message: `${businessUnitsWithoutObjective.length} Business Unit objective(s) are missing for ${year}. Non-blocking: configure them in Management Objectives at the bottom of Management View.`,
          detail: compactList(businessUnitsWithoutObjective)
        })
      );
    }

    return {
      currentYear: year,
      tableExists: objectiveTableExists,
      missingTables,
      configuredByYear,
      currentYearConfiguredCount: currentYearSummary?.total ?? 0,
      currentYearBranchConfiguredCount: currentYearSummary?.branch ?? 0,
      currentYearBusinessUnitConfiguredCount: currentYearSummary?.businessUnit ?? 0,
      branchesWithoutObjective,
      businessUnitsWithoutObjective,
      diagnostics,
      inspectionError: null
    } satisfies PetyrDataHealthManagementObjectives;
  } catch (error) {
    const message = formatError(error);
    warnings.push(
      issue({
        code: "MANAGEMENT_OBJECTIVE_INSPECTION_FAILED",
        message: "Unable to inspect configured Management Objectives.",
        tableName: "management_objective",
        detail: message
      })
    );

    return emptyManagementObjectives({
      currentYear: year,
      tableExists: objectiveTableExists,
      missingTables,
      diagnostics,
      inspectionError: message
    });
  }
}

function issue(input: PetyrDataHealthIssue) {
  return input;
}

function addMissingSourceWarnings(input: {
  warnings: PetyrDataHealthIssue[];
  redashSourceModel: PetyrDataHealthResult["sources"]["redashSourceModel"];
  sources: PetyrDataHealthResult["sources"]["expected"];
}) {
  if (!input.redashSourceModel.exists) {
    input.warnings.push(
      issue({
        code: "REDASH_SOURCE_MODEL_MISSING",
        message: "RedashSource table is not available. Petyr can still inspect materialized tables, but cannot report configured source metadata."
      })
    );
    return;
  }

  if (!input.redashSourceModel.accessible) {
    input.warnings.push(
      issue({
        code: "REDASH_SOURCE_MODEL_INACCESSIBLE",
        message: "RedashSource table exists but could not be read.",
        detail: input.redashSourceModel.error ?? undefined
      })
    );
    return;
  }

  for (const source of input.sources) {
    if (!source.existsInRedashSource) {
      input.warnings.push(
        issue({
          code: "REDASH_SOURCE_RECORD_MISSING",
          message: `${source.sourceKey} is not configured in RedashSource.`,
          sourceKey: source.sourceKey
        })
      );
      continue;
    }

    if (!source.latestSnapshot) {
      input.warnings.push(
        issue({
          code: "REDASH_SOURCE_SNAPSHOT_MISSING",
          message: `${source.sourceKey} has no RedashSnapshot metadata available.`,
          sourceKey: source.sourceKey
        })
      );
    }
  }
}

function addTableInspectionIssues(input: {
  blockingIssues: PetyrDataHealthIssue[];
  warnings: PetyrDataHealthIssue[];
  tables: Record<string, PetyrDataHealthTable>;
}) {
  for (const table of Object.values(input.tables)) {
    if (!table.inspectionError) continue;

    const target = table.tableName === "redash_raw_master_campaigns_latest" ? input.blockingIssues : input.warnings;
    target.push(
      issue({
        code: "TABLE_INSPECTION_FAILED",
        message: `Unable to inspect ${table.tableName}.`,
        tableName: table.tableName,
        sourceKey: table.sourceKey ?? undefined,
        detail: table.inspectionError
      })
    );
  }
}

function addCoreDataIssues(input: {
  blockingIssues: PetyrDataHealthIssue[];
  warnings: PetyrDataHealthIssue[];
  tables: Record<string, PetyrDataHealthTable>;
  ownership: PetyrDataHealthOwnershipDiagnostics;
}) {
  const campaigns = input.tables.redash_raw_master_campaigns_latest;
  const agreements = input.tables.redash_raw_master_agreements_latest;
  const ownership = input.tables.redash_raw_company_ownership_latest;
  const columnMapping = input.tables.redash_column_mapping;
  const campaignsCompany = columnCheck("master_campaigns", "companyName", input.tables);
  const campaignsRevenue = columnCheck("master_campaigns", "campaignValue", input.tables);
  const campaignsEndDate = columnCheck("master_campaigns", "campaignEndDate", input.tables);
  const optionalCampaignFields = [
    columnCheck("master_campaigns", "campaignCost", input.tables),
    columnCheck("master_campaigns", "grossMarginPct", input.tables),
    columnCheck("master_campaigns", "campaignLink", input.tables)
  ];

  if (!campaigns?.exists) {
    input.blockingIssues.push(
      issue({
        code: "MASTER_CAMPAIGNS_TABLE_MISSING",
        message: "redash_raw_master_campaigns_latest is missing. Run the Redash ingestor sync before Petyr can compute closed revenue.",
        tableName: "redash_raw_master_campaigns_latest",
        sourceKey: "master_campaigns"
      })
    );
  } else if ((campaigns.rowCount ?? 0) === 0) {
    input.blockingIssues.push(
      issue({
        code: "MASTER_CAMPAIGNS_EMPTY",
        message: "redash_raw_master_campaigns_latest exists but has 0 rows. Petyr cannot compute closed revenue from an empty master campaigns table.",
        tableName: "redash_raw_master_campaigns_latest",
        sourceKey: "master_campaigns"
      })
    );
  }

  if (!campaignsCompany.available) {
    input.blockingIssues.push(
      issue({
        code: "MASTER_CAMPAIGNS_COMPANY_COLUMN_MISSING",
        message: "Master campaigns is missing the mapped company column.",
        tableName: "redash_raw_master_campaigns_latest",
        sourceKey: "master_campaigns",
        logicalField: "companyName",
        dbColumnName: campaignsCompany.dbColumnName ?? undefined
      })
    );
  }

  if (!campaignsRevenue.available) {
    input.blockingIssues.push(
      issue({
        code: "MASTER_CAMPAIGNS_REVENUE_COLUMN_MISSING",
        message: "Master campaigns is missing the mapped campaign value/revenue column.",
        tableName: "redash_raw_master_campaigns_latest",
        sourceKey: "master_campaigns",
        logicalField: "campaignValue",
        dbColumnName: campaignsRevenue.dbColumnName ?? undefined
      })
    );
  }

  if (!campaignsEndDate.available) {
    input.blockingIssues.push(
      issue({
        code: "MASTER_CAMPAIGNS_END_DATE_COLUMN_MISSING",
        message: "Master campaigns is missing the mapped campaign end date column, so Closed revenue YTD and monthly trend cannot be computed reliably.",
        tableName: "redash_raw_master_campaigns_latest",
        sourceKey: "master_campaigns",
        logicalField: "campaignEndDate",
        dbColumnName: campaignsEndDate.dbColumnName ?? undefined
      })
    );
  }

  if (!agreements?.exists) {
    input.warnings.push(
      issue({
        code: "MASTER_AGREEMENTS_TABLE_MISSING",
        message: "redash_raw_master_agreements_latest is missing. Agreement residuals and expiry diagnostics may be unavailable.",
        tableName: "redash_raw_master_agreements_latest",
        sourceKey: "master_agreements"
      })
    );
  } else if ((agreements.rowCount ?? 0) === 0) {
    input.warnings.push(
      issue({
        code: "MASTER_AGREEMENTS_EMPTY",
        message: "redash_raw_master_agreements_latest exists but has 0 rows. Agreement residuals and expiry diagnostics may be unavailable.",
        tableName: "redash_raw_master_agreements_latest",
        sourceKey: "master_agreements"
      })
    );
  }

  if (!ownership?.exists) {
    input.warnings.push(
      issue({
        code: "COMPANY_OWNERSHIP_TABLE_MISSING",
        message: "redash_raw_company_ownership_latest is missing. Current company branch and CSM attribution may be unreliable.",
        tableName: "redash_raw_company_ownership_latest",
        sourceKey: "company_ownership"
      })
    );
  } else if ((ownership.rowCount ?? 0) === 0) {
    input.warnings.push(
      issue({
        code: "COMPANY_OWNERSHIP_EMPTY",
        message: "redash_raw_company_ownership_latest exists but has 0 rows. Current company branch and CSM attribution may be unreliable.",
        tableName: "redash_raw_company_ownership_latest",
        sourceKey: "company_ownership"
      })
    );
  }

  if (!input.ownership.branchColumn.available) {
    input.warnings.push(
      issue({
        code: "COMPANY_BRANCH_COLUMN_MISSING",
        message: "Company Ownership is missing the mapped company_branch column. Branch aggregation cannot use canonical ownership.",
        tableName: "redash_raw_company_ownership_latest",
        sourceKey: "company_ownership",
        logicalField: "branch",
        dbColumnName: input.ownership.branchColumn.dbColumnName ?? undefined
      })
    );
  } else if (input.ownership.rowsWithBranch === 0) {
    input.warnings.push(
      issue({
        code: "COMPANY_BRANCH_VALUES_EMPTY",
        message: "Company Ownership has a company_branch column, but no non-empty branch values were found.",
        tableName: "redash_raw_company_ownership_latest",
        sourceKey: "company_ownership",
        logicalField: "branch",
        dbColumnName: input.ownership.branchColumn.dbColumnName ?? undefined
      })
    );
  }

  if (!input.ownership.csmColumn.available) {
    input.warnings.push(
      issue({
        code: "COMPANY_CSM_COLUMN_MISSING",
        message: "Company Ownership is missing the mapped CSM ownership column. Current CSM attribution cannot use canonical ownership.",
        tableName: "redash_raw_company_ownership_latest",
        sourceKey: "company_ownership",
        logicalField: "csmName",
        dbColumnName: input.ownership.csmColumn.dbColumnName ?? undefined
      })
    );
  } else if (input.ownership.rowsWithCsm === 0) {
    input.warnings.push(
      issue({
        code: "COMPANY_CSM_VALUES_EMPTY",
        message: "Company Ownership has a CSM ownership column, but no non-empty CSM values were found.",
        tableName: "redash_raw_company_ownership_latest",
        sourceKey: "company_ownership",
        logicalField: "csmName",
        dbColumnName: input.ownership.csmColumn.dbColumnName ?? undefined
      })
    );
  }

  const hasRealFallbackSourceRows = ((campaigns?.rowCount ?? 0) > 0) || ((agreements?.rowCount ?? 0) > 0);
  const ownershipUnavailableForCanonicalAttribution = (
    !ownership?.exists ||
    (ownership.rowCount ?? 0) === 0 ||
    input.ownership.rowsWithCompany === 0 ||
    input.ownership.rowsWithBranch === 0 ||
    input.ownership.rowsWithCsm === 0 ||
    !input.ownership.companyColumn.available ||
    !input.ownership.branchColumn.available ||
    !input.ownership.csmColumn.available
  );

  if (hasRealFallbackSourceRows && ownershipUnavailableForCanonicalAttribution) {
    input.warnings.push(
      issue({
        code: "COMPANY_OWNERSHIP_REAL_FALLBACK_ACTIVE",
        message: "Company Ownership is unavailable or incomplete while real campaign/agreement rows exist. Petyr renders real PostgreSQL data with fallback CSM/Branch attribution and no mock customers. Run a successful company_ownership sync to restore canonical ownership.",
        tableName: "redash_raw_company_ownership_latest",
        sourceKey: "company_ownership"
      })
    );
  }

  for (const optionalField of optionalCampaignFields) {
    if (optionalField.available) continue;

    input.warnings.push(
      issue({
        code: "OPTIONAL_MASTER_CAMPAIGNS_COLUMN_MISSING",
        message: `Optional Master campaigns column is unavailable for ${optionalField.logicalField}.`,
        tableName: "redash_raw_master_campaigns_latest",
        sourceKey: "master_campaigns",
        logicalField: optionalField.logicalField,
        dbColumnName: optionalField.dbColumnName ?? undefined
      })
    );
  }

  if (!columnMapping?.exists) {
    input.warnings.push(
      issue({
        code: "REDASH_COLUMN_MAPPING_TABLE_MISSING",
        message: "redash_column_mapping is missing. Petyr can use configured logical mappings, but cannot compare them with Redash mapping metadata.",
        tableName: "redash_column_mapping"
      })
    );
  } else if ((columnMapping.rowCount ?? 0) === 0) {
    input.warnings.push(
      issue({
        code: "REDASH_COLUMN_MAPPING_EMPTY",
        message: "redash_column_mapping exists but has 0 rows. Petyr cannot compare logical mappings with Redash mapping metadata.",
        tableName: "redash_column_mapping"
      })
    );
  }
}

async function addBusinessUnitQualityWarnings(input: {
  warnings: PetyrDataHealthIssue[];
  tables: Record<string, PetyrDataHealthTable>;
}) {
  const campaigns = input.tables.redash_raw_master_campaigns_latest;
  const businessUnitColumn = columnCheck("master_campaigns", "businessUnit", input.tables);

  if (!campaigns?.exists || (campaigns.rowCount ?? 0) === 0) return;

  if (!businessUnitColumn.available || !businessUnitColumn.dbColumnName) {
    input.warnings.push(
      issue({
        code: "MASTER_CAMPAIGNS_BUSINESS_UNIT_COLUMN_MISSING",
        message: "Master campaigns is missing the mapped Business Unit column. Petyr will normalize campaign Business Unit values to Other.",
        tableName: "redash_raw_master_campaigns_latest",
        sourceKey: "master_campaigns",
        logicalField: "businessUnit",
        dbColumnName: businessUnitColumn.dbColumnName ?? undefined
      })
    );
    return;
  }

  try {
    const rows = await prisma.$queryRaw<BusinessUnitValueRow[]>(
      Prisma.sql`
        SELECT
          NULLIF(BTRIM(${sqlIdentifier(businessUnitColumn.dbColumnName)}::text), '') AS "originalValue",
          COUNT(*)::text AS "rowCount"
        FROM ${sqlIdentifier("redash_raw_master_campaigns_latest")}
        GROUP BY NULLIF(BTRIM(${sqlIdentifier(businessUnitColumn.dbColumnName)}::text), '')
      `
    );
    let missingCount = 0;
    const unknownCounts = new Map<string, number>();
    const unofficialCounts = new Map<string, number>();

    for (const row of rows) {
      const count = toNumber(row.rowCount) ?? 0;
      const normalized = normalizePetyrBusinessUnit(row.originalValue);

      if (normalized.reason === "missing") {
        missingCount += count;
      } else if (normalized.reason === "unknown") {
        unknownCounts.set(normalized.originalValue || "Unknown", count);
      } else if (normalized.reason === "unofficial") {
        unofficialCounts.set(normalized.originalValue, count);
      }
    }

    const unknownCount = [...unknownCounts.values()].reduce((sum, value) => sum + value, 0);
    const unofficialCount = [...unofficialCounts.values()].reduce((sum, value) => sum + value, 0);
    const fallbackCount = missingCount + unknownCount + unofficialCount;

    if (missingCount > 0) {
      input.warnings.push(
        issue({
          code: "BUSINESS_UNIT_MISSING_NORMALIZED_TO_OTHER",
          message: `${missingCount} Master campaigns row(s) have missing Business Unit values and are normalized to Other.`,
          tableName: "redash_raw_master_campaigns_latest",
          sourceKey: "master_campaigns",
          logicalField: "businessUnit",
          dbColumnName: businessUnitColumn.dbColumnName
        })
      );
    }

    if (unknownCount > 0) {
      input.warnings.push(
        issue({
          code: "BUSINESS_UNIT_UNKNOWN_NORMALIZED_TO_OTHER",
          message: `${unknownCount} Master campaigns row(s) have unknown Business Unit values and are normalized to Other.`,
          tableName: "redash_raw_master_campaigns_latest",
          sourceKey: "master_campaigns",
          logicalField: "businessUnit",
          dbColumnName: businessUnitColumn.dbColumnName,
          detail: compactList([...unknownCounts.entries()].map(([value, count]) => `${value} (${count})`))
        })
      );
    }

    if (unofficialCount > 0) {
      input.warnings.push(
        issue({
          code: "BUSINESS_UNIT_UNOFFICIAL_NORMALIZED_TO_OTHER",
          message: `${unofficialCount} Master campaigns row(s) have Business Unit values outside the official list and are normalized to Other.`,
          tableName: "redash_raw_master_campaigns_latest",
          sourceKey: "master_campaigns",
          logicalField: "businessUnit",
          dbColumnName: businessUnitColumn.dbColumnName,
          detail: `${compactList([...unofficialCounts.entries()].map(([value, count]) => `${value} (${count})`))}. Official Business Units: ${PETYR_BUSINESS_UNITS.join(", ")}.`
        })
      );
    }

    if (fallbackCount > 0) {
      input.warnings.push(
        issue({
          code: "BUSINESS_UNIT_OTHER_FALLBACK_ACTIVE",
          message: `Business Unit fallback to Other is active for ${fallbackCount} Master campaigns row(s).`,
          tableName: "redash_raw_master_campaigns_latest",
          sourceKey: "master_campaigns",
          logicalField: "businessUnit",
          dbColumnName: businessUnitColumn.dbColumnName
        })
      );
    }
  } catch (error) {
    input.warnings.push(
      issue({
        code: "BUSINESS_UNIT_QUALITY_INSPECTION_FAILED",
        message: "Unable to inspect Master campaigns Business Unit values.",
        tableName: "redash_raw_master_campaigns_latest",
        sourceKey: "master_campaigns",
        logicalField: "businessUnit",
        dbColumnName: businessUnitColumn.dbColumnName,
        detail: formatError(error)
      })
    );
  }
}

async function addAnnualEntryInitialForecastDiagnostics(warnings: PetyrDataHealthIssue[]) {
  const annualEntryTableExists = await relationExists("forecast_annual_entry");
  const annualTableExists = await relationExists("forecast_annual");
  const currentYear = new Date().getFullYear();

  if (!annualEntryTableExists) {
    warnings.push(
      issue({
        code: "ANNUAL_ENTRY_TABLE_MISSING",
        message: "Initial Forecast cannot be populated because forecast_annual_entry is missing. Apply the forecasting app Prisma schema before using Annual Forecast Entry.",
        tableName: "forecast_annual_entry"
      })
    );
  }

  if (!annualTableExists) {
    warnings.push(
      issue({
        code: "ANNUAL_FORECAST_TABLE_MISSING",
        message: "Initial Forecast per Business Unit cannot be populated because forecast_annual is missing. Apply the forecasting app Prisma schema before using Annual Forecast Entry.",
        tableName: "forecast_annual"
      })
    );
    return;
  }

  const annualColumns = await getTableColumns("forecast_annual");
  if (!annualColumns.some((column) => column.name === "initial_forecast")) {
    warnings.push(
      issue({
        code: "ANNUAL_FORECAST_INITIAL_COLUMN_MISSING",
        message: "Initial Forecast per Business Unit cannot be populated because forecast_annual.initial_forecast is missing. Apply the forecasting app Prisma schema before relying on Management View Initial Forecast.",
        tableName: "forecast_annual"
      })
    );
    return;
  }

  const rows = await prisma.$queryRaw<InitialForecastCountRow[]>`
    SELECT COUNT(*)::text AS "rowCount"
    FROM "forecast_annual"
    WHERE "initial_forecast" IS NOT NULL
      AND "year" = ${currentYear}
  `;
  const rowCount = Number(rows[0]?.rowCount ?? "0");

  if (rowCount === 0) {
    warnings.push(
      issue({
        code: "ANNUAL_ENTRY_INITIAL_FORECAST_EMPTY",
        message: `No Annual Forecast Entry Initial Forecast values exist for ${currentYear}. Management View shows Initial Forecast as n/a until Annual Forecast Entry saves per-Business Unit Initial values during the December 10-January 10 window.`,
        tableName: "forecast_annual"
      })
    );
  }
}

async function safeGetMappingDiagnostics(warnings: PetyrDataHealthIssue[]) {
  try {
    return await getRedashFieldMappingDiagnostics();
  } catch (error) {
    warnings.push(
      issue({
        code: "MAPPING_DIAGNOSTICS_FAILED",
        message: "Unable to run Redash field mapping diagnostics.",
        detail: formatError(error)
      })
    );
    return [];
  }
}

export async function getPetyrDataHealth(): Promise<PetyrDataHealthResult> {
  const finishPerformance = startPetyrPerformanceTimer("getPetyrDataHealth");
  const checkedAt = new Date().toISOString();
  const blockingIssues: PetyrDataHealthIssue[] = [];
  const warnings: PetyrDataHealthIssue[] = [];

  try {
    const [sourceResult, inspectedTables] = await Promise.all([
      getRedashSources(),
      Promise.all(MATERIALIZED_TABLES.map(inspectMaterializedTable))
    ]);
    const materializedTables = buildRecordMap(inspectedTables);
    const rowCounts = Object.fromEntries(
      inspectedTables.map((table) => [table.tableName, table.rowCount])
    );
    const availableColumns = Object.fromEntries(
      inspectedTables.map((table) => [table.tableName, table.columns.map((column) => column.name)])
    );
    const sources = buildSources(sourceResult.records);
    const ownership = await buildOwnershipDiagnostics(materializedTables);
    const mappingDiagnostics = await safeGetMappingDiagnostics(warnings);
    const managementObjectives = await inspectManagementObjectives(warnings);

    addMissingSourceWarnings({
      warnings,
      redashSourceModel: sourceResult.redashSourceModel,
      sources
    });
    addTableInspectionIssues({
      blockingIssues,
      warnings,
      tables: materializedTables
    });
    addCoreDataIssues({
      blockingIssues,
      warnings,
      tables: materializedTables,
      ownership
    });
    await addBusinessUnitQualityWarnings({
      warnings,
      tables: materializedTables
    });
    await addAnnualEntryInitialForecastDiagnostics(warnings);

    finishPerformance({
      status: blockingIssues.length === 0 ? "success" : "warning",
      rowCount: Object.values(rowCounts).reduce<number>((sum, value) => sum + (value ?? 0), 0),
      blockingIssues: blockingIssues.length,
      warnings: warnings.length
    });

    return {
      ok: blockingIssues.length === 0,
      sources: {
        redashSourceModel: sourceResult.redashSourceModel,
        expected: sources,
        ownership
      },
      managementObjectives,
      materializedTables,
      rowCounts,
      availableColumns,
      mappingDiagnostics,
      blockingIssues,
      warnings,
      checkedAt
    };
  } catch (error) {
    finishPerformance({ status: "failed" });
    throw error;
  }
}
