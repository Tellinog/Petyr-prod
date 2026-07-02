import { Prisma, type ManagementObjectiveScopeType } from "@prisma/client";
import { PETYR_BUSINESS_UNITS, type PetyrBusinessUnit } from "@/lib/petyr/constants";
import { prisma } from "@/lib/db";
import {
  COMPANY_OWNERSHIP_UNASSIGNED_BRANCH,
  getCanonicalCompanyOwnershipBranches
} from "@/services/petyrCompanyOwnershipService";

export const MANAGEMENT_OBJECTIVE_USER_FALLBACK = "petyr-management-objectives";

const SCOPE_TYPES = new Set<ManagementObjectiveScopeType>(["branch", "business_unit"]);
const BUSINESS_UNITS_BY_KEY = new Map(
  PETYR_BUSINESS_UNITS.map((businessUnit) => [normalizeObjectiveKey(businessUnit), businessUnit])
);

export type ManagementObjectiveScope = ManagementObjectiveScopeType;

export type ManagementObjectiveDisplayRow = {
  scopeType: ManagementObjectiveScope;
  scopeKey: string;
  year: number;
  objectiveId: string | null;
  currentValue: number | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
};

export type ManagementObjectivesData = {
  year: number;
  officialBusinessUnits: PetyrBusinessUnit[];
  branchObjectives: ManagementObjectiveDisplayRow[];
  businessUnitObjectives: ManagementObjectiveDisplayRow[];
  diagnostics: string[];
};

export type ManagementObjectiveMaps = {
  branches: Map<string, number>;
  businessUnits: Map<string, number>;
  diagnostics: string[];
};

export type ManagementObjectiveInput = {
  scope_type?: unknown;
  scopeType?: unknown;
  scope_key?: unknown;
  scopeKey?: unknown;
  year?: unknown;
  value?: unknown;
  note?: unknown;
  created_by?: unknown;
  createdBy?: unknown;
  updated_by?: unknown;
  updatedBy?: unknown;
};

export type ManagementObjectiveSaveResult = {
  ok: true;
  objective: ManagementObjectiveDisplayRow;
  changeLogId: string;
  objectives: ManagementObjectivesData;
};

export class PetyrManagementObjectiveError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "PetyrManagementObjectiveError";
    this.status = status;
  }
}

function normalizeObjectiveKey(value: string) {
  return value.trim().toLowerCase();
}

export function getManagementObjectiveMapValue(map: Map<string, number>, key: string) {
  return map.get(normalizeObjectiveKey(key)) ?? null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function currentYear() {
  return new Date().getFullYear();
}

export function parseManagementObjectiveYear(value: unknown, options: { defaultToCurrent?: boolean } = {}) {
  const rawValue = typeof value === "number" ? value : Number(asString(value));

  if (Number.isInteger(rawValue) && rawValue >= 2000 && rawValue <= 2100) {
    return rawValue;
  }

  if (options.defaultToCurrent && (value === null || value === undefined || asString(value) === "")) {
    return currentYear();
  }

  throw new PetyrManagementObjectiveError("year must be an integer between 2000 and 2100.", 400);
}

function normalizeMoneyString(value: string) {
  let normalized = value.trim().replace(/\s+/g, "").replace(/EUR|€/gi, "");

  if (/^\d+,\d+$/.test(normalized)) {
    normalized = normalized.replace(",", ".");
  } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(normalized)) {
    normalized = normalized.replace(/,/g, "");
  } else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(normalized)) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  }

  return normalized;
}

function parseObjectiveValue(value: unknown) {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    return new Prisma.Decimal(value);
  }

  if (typeof value !== "string") return null;

  const normalized = normalizeMoneyString(value);
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  const decimal = new Prisma.Decimal(normalized);
  return decimal.greaterThanOrEqualTo(0) ? decimal : null;
}

function decimalToNumber(value: Prisma.Decimal | null | undefined) {
  return value === null || value === undefined ? null : Number(value.toString());
}

function tableMissingMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("does not exist") || message.includes("Unknown field `managementObjective`")) {
    return "Petyr management objective tables are missing. From apps/forecasting-app run \"npm run db:sync\" for local schema sync, or apply reviewed migrations with \"npx prisma migrate deploy\" before saving or reading Management Objectives.";
  }

  return message;
}

function toDisplayRow(input: {
  scopeType: ManagementObjectiveScope;
  scopeKey: string;
  year: number;
  objective?: {
    id: string;
    value: Prisma.Decimal;
    note: string | null;
    createdBy: string;
    createdAt: Date;
    updatedBy: string | null;
    updatedAt: Date;
  } | null;
}): ManagementObjectiveDisplayRow {
  return {
    scopeType: input.scopeType,
    scopeKey: input.scopeKey,
    year: input.year,
    objectiveId: input.objective?.id ?? null,
    currentValue: decimalToNumber(input.objective?.value),
    note: input.objective?.note ?? null,
    createdBy: input.objective?.createdBy ?? null,
    createdAt: input.objective?.createdAt.toISOString() ?? null,
    updatedBy: input.objective?.updatedBy ?? null,
    updatedAt: input.objective?.updatedAt.toISOString() ?? null
  };
}

async function readObjectiveRows(year: number, diagnostics: string[]) {
  try {
    return await prisma.managementObjective.findMany({
      where: {
        year,
        scopeType: {
          in: ["branch", "business_unit"]
        }
      },
      orderBy: [{ scopeType: "asc" }, { scopeKey: "asc" }]
    });
  } catch (error) {
    diagnostics.push(tableMissingMessage(error));
    return [];
  }
}

function objectiveByScopeKey(rows: Awaited<ReturnType<typeof readObjectiveRows>>, scopeType: ManagementObjectiveScope) {
  const map = new Map<string, (typeof rows)[number]>();

  for (const row of rows) {
    if (row.scopeType !== scopeType) continue;
    map.set(normalizeObjectiveKey(row.scopeKey), row);
  }

  return map;
}

async function getBranchList(diagnostics: string[]) {
  try {
    return await getCanonicalCompanyOwnershipBranches();
  } catch (error) {
    diagnostics.push(error instanceof Error ? error.message : String(error));
    return [];
  }
}

export async function getManagementObjectiveMaps(year: number): Promise<ManagementObjectiveMaps> {
  const diagnostics: string[] = [];
  const rows = await readObjectiveRows(year, diagnostics);
  const branches = new Map<string, number>();
  const businessUnits = new Map<string, number>();

  for (const row of rows) {
    const target = row.scopeType === "branch" ? branches : businessUnits;
    target.set(normalizeObjectiveKey(row.scopeKey), Number(row.value.toString()));
  }

  return {
    branches,
    businessUnits,
    diagnostics
  };
}

export async function getManagementObjectives(year: number): Promise<ManagementObjectivesData> {
  const diagnostics: string[] = [];
  const [branches, objectiveRows] = await Promise.all([getBranchList(diagnostics), readObjectiveRows(year, diagnostics)]);
  const branchObjectivesByKey = objectiveByScopeKey(objectiveRows, "branch");
  const businessUnitObjectivesByKey = objectiveByScopeKey(objectiveRows, "business_unit");

  return {
    year,
    officialBusinessUnits: [...PETYR_BUSINESS_UNITS],
    branchObjectives: branches.map((branch) =>
      toDisplayRow({
        scopeType: "branch",
        scopeKey: branch,
        year,
        objective: branchObjectivesByKey.get(normalizeObjectiveKey(branch)) ?? null
      })
    ),
    businessUnitObjectives: PETYR_BUSINESS_UNITS.map((businessUnit) =>
      toDisplayRow({
        scopeType: "business_unit",
        scopeKey: businessUnit,
        year,
        objective: businessUnitObjectivesByKey.get(normalizeObjectiveKey(businessUnit)) ?? null
      })
    ),
    diagnostics: [...new Set(diagnostics)]
  };
}

async function validateScopeKey(scopeType: ManagementObjectiveScope, rawScopeKey: unknown) {
  const scopeKey = asString(rawScopeKey);

  if (!scopeKey) {
    throw new PetyrManagementObjectiveError("scope_key is required.", 400);
  }

  if (scopeType === "business_unit") {
    const businessUnit = BUSINESS_UNITS_BY_KEY.get(normalizeObjectiveKey(scopeKey));

    if (!businessUnit) {
      throw new PetyrManagementObjectiveError(
        `scope_key must be one of the official Business Units: ${PETYR_BUSINESS_UNITS.join(", ")}.`,
        400
      );
    }

    return businessUnit;
  }

  if (normalizeObjectiveKey(scopeKey) === normalizeObjectiveKey(COMPANY_OWNERSHIP_UNASSIGNED_BRANCH)) {
    return COMPANY_OWNERSHIP_UNASSIGNED_BRANCH;
  }

  let branches: string[];
  try {
    branches = await getCanonicalCompanyOwnershipBranches();
  } catch (error) {
    throw new PetyrManagementObjectiveError(
      `Unable to validate Branch objective scope_key from company ownership: ${error instanceof Error ? error.message : String(error)}`,
      400
    );
  }

  const branch = branches.find((candidate) => normalizeObjectiveKey(candidate) === normalizeObjectiveKey(scopeKey));

  if (!branch) {
    throw new PetyrManagementObjectiveError(
      `scope_key must be a Branch present in company ownership or ${COMPANY_OWNERSHIP_UNASSIGNED_BRANCH}.`,
      400
    );
  }

  return branch;
}

function validateScopeType(value: unknown): ManagementObjectiveScope {
  const scopeType = asString(value) as ManagementObjectiveScope;

  if (!SCOPE_TYPES.has(scopeType)) {
    throw new PetyrManagementObjectiveError("scope_type must be branch or business_unit.", 400);
  }

  return scopeType;
}

function validateActor(input: ManagementObjectiveInput) {
  return asString(input.updated_by) || asString(input.updatedBy) || asString(input.created_by) || asString(input.createdBy) || MANAGEMENT_OBJECTIVE_USER_FALLBACK;
}

export async function upsertManagementObjective(input: ManagementObjectiveInput): Promise<ManagementObjectiveSaveResult> {
  const scopeType = validateScopeType(input.scope_type ?? input.scopeType);
  const scopeKey = await validateScopeKey(scopeType, input.scope_key ?? input.scopeKey);
  const year = parseManagementObjectiveYear(input.year);
  const value = parseObjectiveValue(input.value);
  const note = asString(input.note) || null;
  const actor = validateActor(input);

  if (!value) {
    throw new PetyrManagementObjectiveError("value must be numeric and greater than or equal to 0.", 400);
  }

  try {
    const written = await prisma.$transaction(async (tx) => {
      const where = {
        scopeType_scopeKey_year: {
          scopeType,
          scopeKey,
          year
        }
      };
      const existing = await tx.managementObjective.findUnique({ where });
      const objective = await tx.managementObjective.upsert({
        where,
        create: {
          scopeType,
          scopeKey,
          year,
          value,
          note,
          createdBy: actor,
          updatedBy: actor
        },
        update: {
          value,
          note,
          updatedBy: actor
        }
      });
      const changeLog = await tx.managementObjectiveChangeLog.create({
        data: {
          objectiveId: objective.id,
          scopeType,
          scopeKey,
          year,
          previousValue: existing?.value ?? null,
          newValue: value,
          note,
          updatedBy: actor
        }
      });

      return { objective, changeLog };
    });

    return {
      ok: true,
      objective: toDisplayRow({ scopeType, scopeKey, year, objective: written.objective }),
      changeLogId: written.changeLog.id,
      objectives: await getManagementObjectives(year)
    };
  } catch (error) {
    throw new PetyrManagementObjectiveError(tableMissingMessage(error), 500);
  }
}

export async function getBranchObjective(branch: string, year: number) {
  const maps = await getManagementObjectiveMaps(year);
  return getManagementObjectiveMapValue(maps.branches, branch);
}

export async function getBusinessUnitObjective(businessUnit: string, year: number) {
  const maps = await getManagementObjectiveMaps(year);
  return getManagementObjectiveMapValue(maps.businessUnits, businessUnit);
}
