import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";

const SAFE_IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;

const RAW_LATEST_TABLES = {
  master_campaigns: "redash_raw_master_campaigns_latest",
  master_agreements: "redash_raw_master_agreements_latest",
  company_ownership: "redash_raw_company_ownership_latest"
} as const;

export type RedashDbTablePreviewColumn = {
  name: string;
  position: number;
  dataType: string;
};

export type RedashDbColumnMapping = {
  redashColumnName: string;
  dbColumnName: string;
  detectedType: string;
  position: number;
  lastSeenAt: Date;
};

export type RedashDbTablePreview = {
  sourceKey: string;
  tableName: string | null;
  tableExists: boolean;
  rowCount: number;
  syncedAt: Date | null;
  columns: RedashDbTablePreviewColumn[];
  rows: Record<string, unknown>[];
  mappings: RedashDbColumnMapping[];
  limit: number;
};

type TableExistsRow = {
  exists: boolean;
};

type TableColumnRow = {
  column_name: string;
  ordinal_position: number;
  data_type: string;
};

type TableStatsRow = {
  row_count: bigint | number | string;
  synced_at: Date | null;
};

type MappingTableExistsRow = {
  exists: boolean;
};

type ColumnMappingRow = {
  redashColumnName: string;
  dbColumnName: string;
  detectedType: string;
  position: number;
  lastSeenAt: Date;
};

export function getRedashRawLatestTableName(sourceKey: string) {
  return RAW_LATEST_TABLES[sourceKey as keyof typeof RAW_LATEST_TABLES] ?? null;
}

function sqlIdentifier(identifier: string) {
  if (!SAFE_IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(`Unsafe PostgreSQL identifier: ${identifier}`);
  }

  return Prisma.raw(`"${identifier}"`);
}

function normalizeLimit(limit: number) {
  return Math.min(Math.max(limit || 25, 1), 100);
}

function toNumber(value: bigint | number | string) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  return Number(value);
}

async function tableExists(tableName: string) {
  const rows = await prisma.$queryRaw<TableExistsRow[]>`
    SELECT to_regclass(${tableName}) IS NOT NULL AS "exists"
  `;

  return rows[0]?.exists ?? false;
}

async function mappingTableExists() {
  const rows = await prisma.$queryRaw<MappingTableExistsRow[]>`
    SELECT to_regclass('redash_column_mapping') IS NOT NULL AS "exists"
  `;

  return rows[0]?.exists ?? false;
}

async function getTableColumns(tableName: string) {
  const rows = await prisma.$queryRaw<TableColumnRow[]>`
    SELECT "column_name", "ordinal_position", "data_type"
    FROM information_schema.columns
    WHERE "table_schema" = current_schema()
      AND "table_name" = ${tableName}
    ORDER BY "ordinal_position" ASC
  `;

  return rows.map((row) => ({
    name: row.column_name,
    position: row.ordinal_position,
    dataType: row.data_type
  }));
}

async function getTableStats(tableName: string) {
  const rows = await prisma.$queryRaw<TableStatsRow[]>`
    SELECT COUNT(*)::bigint AS "row_count", MAX("synced_at") AS "synced_at"
    FROM ${sqlIdentifier(tableName)}
  `;

  const row = rows[0];

  return {
    rowCount: row ? toNumber(row.row_count) : 0,
    syncedAt: row?.synced_at ?? null
  };
}

async function getTableRows(tableName: string, limit: number) {
  return prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT *
    FROM ${sqlIdentifier(tableName)}
    ORDER BY "row_index" ASC
    LIMIT ${limit}
  `;
}

async function getColumnMappings(sourceKey: string) {
  if (!(await mappingTableExists())) return [];

  return prisma.$queryRaw<ColumnMappingRow[]>`
    SELECT
      "redash_column_name" AS "redashColumnName",
      "db_column_name" AS "dbColumnName",
      "detected_type" AS "detectedType",
      "position",
      "last_seen_at" AS "lastSeenAt"
    FROM "redash_column_mapping"
    WHERE "source_key" = ${sourceKey}
    ORDER BY "position" ASC, "db_column_name" ASC
  `;
}

export async function getRedashDbTablePreview(
  sourceKey: string,
  requestedLimit = 25
): Promise<RedashDbTablePreview> {
  const limit = normalizeLimit(requestedLimit);
  const tableName = getRedashRawLatestTableName(sourceKey);
  const mappings = await getColumnMappings(sourceKey);

  if (!tableName) {
    return {
      sourceKey,
      tableName: null,
      tableExists: false,
      rowCount: 0,
      syncedAt: null,
      columns: [],
      rows: [],
      mappings,
      limit
    };
  }

  const exists = await tableExists(tableName);

  if (!exists) {
    return {
      sourceKey,
      tableName,
      tableExists: false,
      rowCount: 0,
      syncedAt: null,
      columns: [],
      rows: [],
      mappings,
      limit
    };
  }

  const [columns, stats, rows] = await Promise.all([
    getTableColumns(tableName),
    getTableStats(tableName),
    getTableRows(tableName, limit)
  ]);

  return {
    sourceKey,
    tableName,
    tableExists: true,
    rowCount: stats.rowCount,
    syncedAt: stats.syncedAt,
    columns,
    rows,
    mappings,
    limit
  };
}
