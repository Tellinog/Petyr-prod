import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
import { extractRedashColumns, extractRedashRows, type PreviewRow } from "../lib/redashPayload";
import { logger } from "../lib/logger";
import { startPerformanceTimer } from "../lib/performance";

const MAX_IDENTIFIER_LENGTH = 63;
const SAFE_IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;
const SYSTEM_COLUMN_NAMES = new Set(["snapshot_id", "row_index", "synced_at"]);

const RAW_LATEST_TABLES = {
  master_campaigns: "redash_raw_master_campaigns_latest",
  master_agreements: "redash_raw_master_agreements_latest",
  company_ownership: "redash_raw_company_ownership_latest"
} as const;

type MaterializedColumn = {
  redashColumnName: string;
  dbColumnName: string;
  position: number;
  detectedType: string;
};

type ExistingColumnMapping = {
  redash_column_name: string;
  db_column_name: string;
};

export type RedashRawMaterializationInput = {
  sourceKey: string;
  snapshotId: string;
  syncedAt: Date;
  payload: unknown;
};

function getLatestTableName(sourceKey: string) {
  return RAW_LATEST_TABLES[sourceKey as keyof typeof RAW_LATEST_TABLES];
}

function sqlIdentifier(identifier: string) {
  if (!SAFE_IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(`Unsafe PostgreSQL identifier: ${identifier}`);
  }

  return Prisma.raw(`"${identifier}"`);
}

function trimIdentifier(value: string, suffix = "") {
  return value.slice(0, MAX_IDENTIFIER_LENGTH - suffix.length) + suffix;
}

function toBaseDbColumnName(redashColumnName: string) {
  const normalized = redashColumnName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  let base = normalized || "column";

  if (/^[0-9]/.test(base)) {
    base = `column_${base}`;
  }

  if (SYSTEM_COLUMN_NAMES.has(base)) {
    base = `${base}_value`;
  }

  return trimIdentifier(base);
}

function isSafeDbColumnName(value: string | undefined): value is string {
  return typeof value === "string" && SAFE_IDENTIFIER_PATTERN.test(value);
}

function generateUniqueDbColumnName(base: string, usedColumnNames: Set<string>) {
  let suffixIndex = 1;
  let candidate = base;

  while (usedColumnNames.has(candidate)) {
    suffixIndex += 1;
    candidate = trimIdentifier(base, `_${suffixIndex}`);
  }

  usedColumnNames.add(candidate);
  return candidate;
}

function buildDbColumnNames(
  redashColumnNames: string[],
  existingMappings: ExistingColumnMapping[]
) {
  const existingByRedashColumn = new Map(
    existingMappings.map((mapping) => [mapping.redash_column_name, mapping.db_column_name])
  );
  const assignedNames = new Array<string | undefined>(redashColumnNames.length);
  const usedCurrentColumnNames = new Set<string>();

  redashColumnNames.forEach((redashColumnName, index) => {
    const existingDbColumnName = existingByRedashColumn.get(redashColumnName);

    if (isSafeDbColumnName(existingDbColumnName) && !usedCurrentColumnNames.has(existingDbColumnName)) {
      assignedNames[index] = existingDbColumnName;
      usedCurrentColumnNames.add(existingDbColumnName);
    }
  });

  const usedColumnNames = new Set(usedCurrentColumnNames);

  for (const mapping of existingMappings) {
    if (isSafeDbColumnName(mapping.db_column_name)) {
      usedColumnNames.add(mapping.db_column_name);
    }
  }

  return redashColumnNames.map((redashColumnName, index) => {
    const assignedName = assignedNames[index];
    if (assignedName) return assignedName;

    return generateUniqueDbColumnName(toBaseDbColumnName(redashColumnName), usedColumnNames);
  });
}

function valueType(value: unknown) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  if (typeof value === "string") return "string";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  return "unknown";
}

function inferDetectedType(redashType: string | undefined, rows: PreviewRow[], redashColumnName: string) {
  if (redashType?.trim()) return redashType.trim().toLowerCase();

  const observedTypes = new Set<string>();

  for (const row of rows) {
    const detected = valueType(row[redashColumnName]);
    if (detected) observedTypes.add(detected);
  }

  if (observedTypes.size === 0) return "unknown";
  if (observedTypes.size === 1) return [...observedTypes][0];
  if (observedTypes.size === 2 && observedTypes.has("integer") && observedTypes.has("number")) {
    return "number";
  }

  return "mixed";
}

function collectRedashColumns(payload: unknown) {
  const rows = extractRedashRows(payload);
  const redashColumns = extractRedashColumns(payload);
  const orderedColumns = new Map<string, { name: string; redashType?: string }>();

  for (const column of redashColumns) {
    if (!orderedColumns.has(column.name)) {
      orderedColumns.set(column.name, {
        name: column.name,
        redashType: column.type
      });
    }
  }

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!orderedColumns.has(key)) {
        orderedColumns.set(key, { name: key });
      }
    }
  }

  return {
    rows,
    columns: [...orderedColumns.values()]
  };
}

function buildMaterializedColumns(
  payload: unknown,
  existingMappings: ExistingColumnMapping[]
): { rows: PreviewRow[]; columns: MaterializedColumn[] } {
  const { rows, columns } = collectRedashColumns(payload);
  const dbColumnNames = buildDbColumnNames(
    columns.map((column) => column.name),
    existingMappings
  );

  return {
    rows,
    columns: columns.map((column, index) => ({
      redashColumnName: column.name,
      dbColumnName: dbColumnNames[index],
      position: index,
      detectedType: inferDetectedType(column.redashType, rows, column.name)
    }))
  };
}

function createMappingTableQuery() {
  return Prisma.sql`
    CREATE TABLE IF NOT EXISTS "redash_column_mapping" (
      "id" TEXT PRIMARY KEY,
      "source_key" TEXT NOT NULL,
      "redash_column_name" TEXT NOT NULL,
      "db_column_name" TEXT NOT NULL,
      "position" INTEGER NOT NULL,
      "detected_type" TEXT NOT NULL,
      "last_seen_at" TIMESTAMPTZ NOT NULL,
      CONSTRAINT "redash_column_mapping_source_column_key"
        UNIQUE ("source_key", "redash_column_name")
    )
  `;
}

function createMappingSourceIndexQuery() {
  return Prisma.sql`
    CREATE INDEX IF NOT EXISTS "redash_column_mapping_source_key_idx"
    ON "redash_column_mapping" ("source_key")
  `;
}

function createMappingUniqueIndexQuery() {
  return Prisma.sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "redash_column_mapping_source_column_key"
    ON "redash_column_mapping" ("source_key", "redash_column_name")
  `;
}

async function ensureColumnMappingTable() {
  await prisma.$transaction([
    prisma.$executeRaw(createMappingTableQuery()),
    prisma.$executeRaw(createMappingUniqueIndexQuery()),
    prisma.$executeRaw(createMappingSourceIndexQuery())
  ]);
}

async function getExistingColumnMappings(sourceKey: string) {
  return prisma.$queryRaw<ExistingColumnMapping[]>`
    SELECT "redash_column_name", "db_column_name"
    FROM "redash_column_mapping"
    WHERE "source_key" = ${sourceKey}
  `;
}

function createLatestTableQuery(tableName: string) {
  return Prisma.sql`
    CREATE TABLE IF NOT EXISTS ${sqlIdentifier(tableName)} (
      "snapshot_id" TEXT NOT NULL,
      "row_index" INTEGER NOT NULL,
      "synced_at" TIMESTAMPTZ NOT NULL,
      PRIMARY KEY ("snapshot_id", "row_index")
    )
  `;
}

function addLatestColumnQuery(tableName: string, dbColumnName: string) {
  return Prisma.sql`
    ALTER TABLE ${sqlIdentifier(tableName)}
    ADD COLUMN IF NOT EXISTS ${sqlIdentifier(dbColumnName)} TEXT
  `;
}

function upsertMappingQuery(sourceKey: string, column: MaterializedColumn, lastSeenAt: Date) {
  return Prisma.sql`
    INSERT INTO "redash_column_mapping" (
      "id",
      "source_key",
      "redash_column_name",
      "db_column_name",
      "position",
      "detected_type",
      "last_seen_at"
    )
    VALUES (
      ${crypto.randomUUID()},
      ${sourceKey},
      ${column.redashColumnName},
      ${column.dbColumnName},
      ${column.position},
      ${column.detectedType},
      ${lastSeenAt}
    )
    ON CONFLICT ("source_key", "redash_column_name") DO UPDATE
    SET
      "db_column_name" = EXCLUDED."db_column_name",
      "position" = EXCLUDED."position",
      "detected_type" = EXCLUDED."detected_type",
      "last_seen_at" = EXCLUDED."last_seen_at"
  `;
}

function deleteLatestRowsQuery(tableName: string) {
  return Prisma.sql`DELETE FROM ${sqlIdentifier(tableName)}`;
}

function insertLatestRowsQuery(input: {
  tableName: string;
  snapshotId: string;
  syncedAt: Date;
  rows: PreviewRow[];
  columns: MaterializedColumn[];
}) {
  const systemColumns = ["snapshot_id", "row_index", "synced_at"].map(sqlIdentifier);
  const dataColumns = input.columns.map((column) => sqlIdentifier(column.dbColumnName));
  const insertColumns = [...systemColumns, ...dataColumns];
  const systemValues = [
    Prisma.sql`${input.snapshotId}`,
    Prisma.sql`(ord - 1)::integer`,
    Prisma.sql`${input.syncedAt}`
  ];
  const dataValues = input.columns.map((column) => Prisma.sql`row ->> ${column.redashColumnName}`);
  const selectValues = [...systemValues, ...dataValues];

  return Prisma.sql`
    INSERT INTO ${sqlIdentifier(input.tableName)} (${Prisma.join(insertColumns)})
    SELECT ${Prisma.join(selectValues)}
    FROM jsonb_array_elements(CAST(${JSON.stringify(input.rows)} AS jsonb)) WITH ORDINALITY AS data(row, ord)
    ORDER BY ord
  `;
}

export async function materializeLatestRedashSnapshot(input: RedashRawMaterializationInput) {
  const tableName = getLatestTableName(input.sourceKey);
  let materialized = false;
  let rowsCount = 0;
  let columnsCount = 0;
  const finishPerformance = startPerformanceTimer("Redash latest table materialization", {
    sourceKey: input.sourceKey,
    tableName: tableName ?? null,
    hasLatestTable: Boolean(tableName)
  });

  try {
    if (!tableName) {
      return { materialized: false, rowsCount: 0, columnsCount: 0 };
    }

    await ensureColumnMappingTable();

    const existingMappings = await getExistingColumnMappings(input.sourceKey);
    const { rows, columns } = buildMaterializedColumns(input.payload, existingMappings);
    rowsCount = rows.length;
    columnsCount = columns.length;
    const queries = [
      createLatestTableQuery(tableName),
      ...columns.map((column) => addLatestColumnQuery(tableName, column.dbColumnName)),
      ...columns.map((column) => upsertMappingQuery(input.sourceKey, column, input.syncedAt)),
      deleteLatestRowsQuery(tableName),
      insertLatestRowsQuery({
        tableName,
        snapshotId: input.snapshotId,
        syncedAt: input.syncedAt,
        rows,
        columns
      })
    ];

    await prisma.$transaction(queries.map((query) => prisma.$executeRaw(query)));
    materialized = true;

    logger.info("Redash raw latest table materialized", {
      sourceKey: input.sourceKey,
      tableName,
      snapshotId: input.snapshotId,
      rowsCount: rows.length,
      columnsCount: columns.length
    });

    return {
      materialized: true,
      tableName,
      rowsCount: rows.length,
      columnsCount: columns.length
    };
  } finally {
    finishPerformance({
      materialized,
      rowsCount,
      columnsCount
    });
  }
}
