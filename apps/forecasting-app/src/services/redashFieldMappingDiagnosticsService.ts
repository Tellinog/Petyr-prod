import { prisma } from "@/lib/db";
import {
  getRedashPetyrSourceMappings,
  PETYR_LOGICAL_FIELDS,
  type PetyrLogicalField,
  type RedashPetyrSourceKey
} from "@/config/redashFieldMapping";

type RelationExistsRow = {
  exists: boolean;
};

type TableColumnRow = {
  column_name: string;
};

export type RedashFieldMappingDiagnosticRow = {
  sourceKey: RedashPetyrSourceKey;
  sourceLabel: string;
  tableName: string;
  tableExists: boolean;
  logicalField: PetyrLogicalField;
  dbColumnName: string | null;
  columnExists: boolean;
  status: "mapped" | "missing_column" | "unmapped" | "table_missing";
  note: string;
};

export type RedashFieldMappingDiagnosticSource = {
  sourceKey: RedashPetyrSourceKey;
  sourceLabel: string;
  tableName: string;
  tableExists: boolean;
  mappedCount: number;
  missingColumnCount: number;
  unmappedCount: number;
  rows: RedashFieldMappingDiagnosticRow[];
};

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

function getStatus(input: {
  tableExists: boolean;
  dbColumnName: string | null;
  columnExists: boolean;
}): RedashFieldMappingDiagnosticRow["status"] {
  if (!input.tableExists) return "table_missing";
  if (!input.dbColumnName) return "unmapped";
  if (!input.columnExists) return "missing_column";
  return "mapped";
}

export async function getRedashFieldMappingDiagnostics() {
  const sources = await Promise.all(
    getRedashPetyrSourceMappings().map(async (source) => {
      const tableExists = await relationExists(source.tableName);
      const columnNames = tableExists ? await getTableColumnNames(source.tableName) : new Set<string>();

      const rows = PETYR_LOGICAL_FIELDS.map<RedashFieldMappingDiagnosticRow>((logicalField) => {
        const fieldMapping = source.fields[logicalField];
        const columnExists = fieldMapping.dbColumnName ? columnNames.has(fieldMapping.dbColumnName) : false;
        const status = getStatus({
          tableExists,
          dbColumnName: fieldMapping.dbColumnName,
          columnExists
        });

        return {
          sourceKey: source.sourceKey,
          sourceLabel: source.label,
          tableName: source.tableName,
          tableExists,
          logicalField,
          dbColumnName: fieldMapping.dbColumnName,
          columnExists,
          status,
          note: fieldMapping.note
        };
      });

      return {
        sourceKey: source.sourceKey,
        sourceLabel: source.label,
        tableName: source.tableName,
        tableExists,
        mappedCount: rows.filter((row) => row.status === "mapped").length,
        missingColumnCount: rows.filter((row) => row.status === "missing_column").length,
        unmappedCount: rows.filter((row) => row.status === "unmapped").length,
        rows
      } satisfies RedashFieldMappingDiagnosticSource;
    })
  );

  return sources;
}
