import { ForecastType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { clearNumericAiForecastCacheForCompany } from "@/services/petyrAiForecastCacheCleanupService";

const STATUS_SOURCE = "Company Detail Status";
const COMPANY_STATUS_CHANGE_SCOPE = "Company status";

export class CompanyForecastStatusError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "CompanyForecastStatusError";
  }
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseYear(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(asString(value));
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : new Date().getFullYear();
}

function parseBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new CompanyForecastStatusError("isActive must be a boolean.");
}

function booleanToLogValue(value: boolean | null | undefined) {
  if (value === true) return "active";
  if (value === false) return "inactive";
  return null;
}

export async function saveCompanyForecastStatus(input: {
  companyName: unknown;
  csmName?: unknown;
  year?: unknown;
  isActive: unknown;
  updatedBy?: unknown;
}) {
  const companyName = asString(input.companyName);
  const csmName = asString(input.csmName) || "Unassigned";
  const year = parseYear(input.year);
  const isActive = parseBoolean(input.isActive);
  const updatedBy = asString(input.updatedBy) || "Petyr user";

  if (!companyName) throw new CompanyForecastStatusError("Company status requires a company name.");

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const existing = await tx.companyForecastStatus.findUnique({
      where: { companyName }
    });
    const previousIsActive = existing?.isActive ?? true;

    if (previousIsActive === isActive) {
      return {
        ok: true,
        noChanges: true,
        isActive,
        saveSessionId: null,
        changeLogRows: 0,
        deletedAiForecastRows: 0
      };
    }

    const saveSession = await tx.forecastSaveSession.create({
      data: {
        companyName,
        csmName,
        source: STATUS_SOURCE,
        year,
        month: now.getMonth() + 1,
        forecastType: ForecastType.ongoing,
        note: null,
        companyActiveStatus: isActive,
        createdBy: updatedBy
      }
    });

    await tx.companyForecastStatus.upsert({
      where: { companyName },
      create: {
        companyName,
        isActive,
        reason: null,
        updatedBy
      },
      update: {
        isActive,
        reason: null,
        updatedBy
      }
    });

    const cleanup = isActive
      ? { deletedRows: 0 }
      : await clearNumericAiForecastCacheForCompany({ companyName, tx });

    await tx.forecastChangeLog.create({
      data: {
        saveSessionId: saveSession.id,
        companyName,
        businessUnit: COMPANY_STATUS_CHANGE_SCOPE,
        fieldName: "companyActiveStatus",
        previousValue: booleanToLogValue(previousIsActive),
        newValue: booleanToLogValue(isActive),
        aiForecastValueAtSave: null,
        createdBy: updatedBy
      }
    });

    return {
      ok: true,
      noChanges: false,
      isActive,
      saveSessionId: saveSession.id,
      changeLogRows: 1,
      deletedAiForecastRows: cleanup.deletedRows
    };
  });
}
