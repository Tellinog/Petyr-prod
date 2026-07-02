import { Prisma } from "@prisma/client";
import { getMappedDbColumn, getRedashPetyrSourceMapping } from "@/config/redashFieldMapping";
import { prisma } from "@/lib/db";

const SAFE_IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;
const SYSTEM_COLUMNS = new Set(["snapshot_id", "row_index", "synced_at"]);

type RelationExistsRow = {
  exists: boolean;
};

type TableColumnRow = {
  column_name: string;
  ordinal_position: number;
};

type SourcePairRow = {
  companyName: string | null;
  csmName: string | null;
  branchName: string | null;
  workspaceCreatedOn: string | null;
  workspaceUpdatedOn: string | null;
};

type SourceBranchRow = {
  branchName: string | null;
};

export type CanonicalCompanyOwnershipPair = {
  companyName: string;
  csmName: string;
  branchName: string | null;
  workspaceCreatedOn: Date | null;
  workspaceUpdatedOn: Date | null;
};

export type CanonicalCompanyOwnershipIndex = {
  pairs: CanonicalCompanyOwnershipPair[];
  byCompanyKey: Map<string, CanonicalCompanyOwnershipPair>;
};

export const COMPANY_OWNERSHIP_UNASSIGNED_BRANCH = "Unassigned Branch";

export class PetyrCompanyOwnershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PetyrCompanyOwnershipError";
  }
}

function sqlIdentifier(identifier: string) {
  if (!SAFE_IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(`Unsafe PostgreSQL identifier: ${identifier}`);
  }

  return Prisma.raw(`"${identifier}"`);
}

function normalizeCellValue(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || "";
}

export function normalizeCompanyOwnershipKey(value: string) {
  return value.trim().toLowerCase();
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp);
}

function ownershipTime(value: Date | null) {
  return value?.getTime() ?? 0;
}

function compareOwnershipCandidate(candidate: CanonicalCompanyOwnershipPair, existing: CanonicalCompanyOwnershipPair) {
  const updatedDiff = ownershipTime(candidate.workspaceUpdatedOn) - ownershipTime(existing.workspaceUpdatedOn);
  if (updatedDiff !== 0) return updatedDiff;

  const createdDiff = ownershipTime(candidate.workspaceCreatedOn) - ownershipTime(existing.workspaceCreatedOn);
  if (createdDiff !== 0) return createdDiff;

  return candidate.csmName.localeCompare(existing.csmName);
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

function requireSourceColumn(input: {
  tableName: string;
  columnNames: Set<string>;
  mappedColumn: string | null;
  logicalField: "companyName" | "csmName" | "branch";
}) {
  if (!input.mappedColumn || !input.columnNames.has(input.mappedColumn)) {
    throw new PetyrCompanyOwnershipError(
      `${input.tableName} is missing the required Company Ownership column for ${input.logicalField}. Run a successful company_ownership sync before using canonical ownership data.`
    );
  }

  return input.mappedColumn;
}

async function getCompanyOwnershipRows() {
  const source = getRedashPetyrSourceMapping("company_ownership");

  if (!(await relationExists(source.tableName))) {
    throw new PetyrCompanyOwnershipError(
      `${source.tableName} does not exist. Run a successful company_ownership sync before exporting or importing monthly forecasts.`
    );
  }

  const tableColumns = await getTableColumns(source.tableName);
  const columnNames = new Set(tableColumns.map((column) => column.name));
  const companyColumn = requireSourceColumn({
    tableName: source.tableName,
    columnNames,
    mappedColumn: getMappedDbColumn(source.sourceKey, "companyName"),
    logicalField: "companyName"
  });
  const csmColumn = requireSourceColumn({
    tableName: source.tableName,
    columnNames,
    mappedColumn: getMappedDbColumn(source.sourceKey, "csmName"),
    logicalField: "csmName"
  });
  const branchColumn = getMappedDbColumn(source.sourceKey, "branch");
  const branchSelection = branchColumn && columnNames.has(branchColumn)
    ? Prisma.sql`${sqlIdentifier(branchColumn)}`
    : Prisma.sql`NULL::text`;
  const workspaceCreatedOnColumn = columnNames.has("workspace_created_on") ? "workspace_created_on" : null;
  const workspaceUpdatedOnColumn = columnNames.has("workspace_updated_on") ? "workspace_updated_on" : null;
  const workspaceCreatedOnSelection = workspaceCreatedOnColumn
    ? Prisma.sql`${sqlIdentifier(workspaceCreatedOnColumn)}`
    : Prisma.sql`NULL::text`;
  const workspaceUpdatedOnSelection = workspaceUpdatedOnColumn
    ? Prisma.sql`${sqlIdentifier(workspaceUpdatedOnColumn)}`
    : Prisma.sql`NULL::text`;

  return prisma.$queryRaw<SourcePairRow[]>`
    SELECT DISTINCT
      NULLIF(BTRIM(${sqlIdentifier(companyColumn)}), '') AS "companyName",
      NULLIF(BTRIM(${sqlIdentifier(csmColumn)}), '') AS "csmName",
      NULLIF(BTRIM(${branchSelection}), '') AS "branchName",
      ${workspaceCreatedOnSelection} AS "workspaceCreatedOn",
      ${workspaceUpdatedOnSelection} AS "workspaceUpdatedOn"
    FROM ${sqlIdentifier(source.tableName)}
    WHERE NULLIF(BTRIM(${sqlIdentifier(companyColumn)}), '') IS NOT NULL
    ORDER BY "companyName" ASC, "csmName" ASC
  `;
}

function dedupeCompanyCsmPairs(rows: SourcePairRow[]) {
  const pairsByKey = new Map<string, CanonicalCompanyOwnershipPair>();

  for (const row of rows) {
    const companyName = normalizeCellValue(row.companyName);
    const csmName = normalizeCellValue(row.csmName);

    if (!companyName) continue;

    const candidate = {
      companyName,
      csmName,
      branchName: normalizeCellValue(row.branchName) || null,
      workspaceCreatedOn: parseDate(row.workspaceCreatedOn),
      workspaceUpdatedOn: parseDate(row.workspaceUpdatedOn)
    };
    const companyKey = normalizeCompanyOwnershipKey(companyName);
    const existing = pairsByKey.get(companyKey);

    if (!existing || compareOwnershipCandidate(candidate, existing) > 0) {
      pairsByKey.set(companyKey, candidate);
    }
  }

  return [...pairsByKey.values()].sort((left, right) => {
    const companyComparison = left.companyName.localeCompare(right.companyName);
    return companyComparison || left.csmName.localeCompare(right.csmName);
  });
}

export async function getCanonicalCompanyOwnershipPairs() {
  const pairs = dedupeCompanyCsmPairs(await getCompanyOwnershipRows());

  if (pairs.length === 0) {
    const source = getRedashPetyrSourceMapping("company_ownership");
    throw new PetyrCompanyOwnershipError(
      `${source.tableName} has no usable Company Ownership rows. Run a successful company_ownership sync before exporting or importing monthly forecasts.`
    );
  }

  return pairs;
}

export async function getCanonicalCompanyOwnershipBranches() {
  const source = getRedashPetyrSourceMapping("company_ownership");

  if (!(await relationExists(source.tableName))) {
    throw new PetyrCompanyOwnershipError(
      `${source.tableName} does not exist. Run a successful company_ownership sync before managing Branch objectives.`
    );
  }

  const tableColumns = await getTableColumns(source.tableName);
  const columnNames = new Set(tableColumns.map((column) => column.name));
  const branchColumn = requireSourceColumn({
    tableName: source.tableName,
    columnNames,
    mappedColumn: getMappedDbColumn(source.sourceKey, "branch"),
    logicalField: "branch"
  });

  const rows = await prisma.$queryRaw<SourceBranchRow[]>`
    SELECT NULLIF(BTRIM(${sqlIdentifier(branchColumn)}), '') AS "branchName"
    FROM ${sqlIdentifier(source.tableName)}
  `;

  if (rows.length === 0) {
    throw new PetyrCompanyOwnershipError(
      `${source.tableName} has no usable Company Ownership rows. Run a successful company_ownership sync before managing Branch objectives.`
    );
  }

  const branches = new Set<string>();

  for (const row of rows) {
    branches.add(normalizeCellValue(row.branchName) || COMPANY_OWNERSHIP_UNASSIGNED_BRANCH);
  }

  return [...branches].sort((left, right) => {
    if (left === COMPANY_OWNERSHIP_UNASSIGNED_BRANCH) return 1;
    if (right === COMPANY_OWNERSHIP_UNASSIGNED_BRANCH) return -1;
    return left.localeCompare(right);
  });
}

export async function getCanonicalCompanyOwnershipIndex(): Promise<CanonicalCompanyOwnershipIndex> {
  const pairs = await getCanonicalCompanyOwnershipPairs();

  return {
    pairs,
    byCompanyKey: new Map(pairs.map((pair) => [normalizeCompanyOwnershipKey(pair.companyName), pair]))
  };
}

export function resolveCanonicalCompanyOwnership(index: CanonicalCompanyOwnershipIndex, companyName: string) {
  return index.byCompanyKey.get(normalizeCompanyOwnershipKey(companyName)) ?? null;
}
