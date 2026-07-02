import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

type PerfMeta = Record<string, string | number | boolean | null | undefined>;

export const PETYR_PERFORMANCE_CHECKS = [
  "getPetyrApprovedRenderingData",
  "getManagementView",
  "getCsmOverviewWorkspace",
  "getCompanyDetail",
  "getForecastEntryContext",
  "getForecastEntryCompanies",
  "getForecastEntryBatch",
  "getAnnualForecastEntryBatch",
  "getPetyrDataHealth",
  "exportMonthlyForecastWorkbookXlsx",
  "importMonthlyForecastWorkbookXlsx",
  "queryCampaignRows",
  "queryAgreementRows",
  "queryOwnershipRows",
  "readForecastMonthlyRows",
  "readForecastAnnualRows",
  "readAiForecastCacheRows",
  "loadOverviewInputs rows loaded",
  "Daily AI Forecast run",
  "Redash sync execution",
  "Redash latest table materialization"
] as const;

const CHECK_SET = new Set<string>(PETYR_PERFORMANCE_CHECKS);
const METADATA_DENYLIST = new Set(["durationMs", "rowCount", "rowsCount", "error", "errorMessage", "detail", "fileName"]);

export function isPetyrPerfLogsEnabled() {
  return process.env.PETYR_PERF_LOGS?.trim().toLowerCase() === "true";
}

function writePetyrPerfLog(message: string, meta: PerfMeta) {
  if (!isPetyrPerfLogsEnabled()) return;

  console.info(JSON.stringify({
    level: "info",
    message,
    time: new Date().toISOString(),
    meta
  }));
}

function safeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function safeStatus(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 64) : "measured";
}

function safeMetadata(meta: PerfMeta): Prisma.InputJsonObject {
  const metadata: Record<string, string | number | boolean | null> = {};

  for (const [key, value] of Object.entries(meta)) {
    if (METADATA_DENYLIST.has(key) || value === undefined) continue;

    if (typeof value === "string") {
      metadata[key] = value.slice(0, 160);
    } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
      metadata[key] = value;
    }
  }

  return metadata as Prisma.InputJsonObject;
}

async function persistPetyrPerformanceMeasurement(operation: string, meta: PerfMeta) {
  if (!CHECK_SET.has(operation)) return;

  try {
    await prisma.petyrPerformanceMeasurement.create({
      data: {
        service: "forecasting-app",
        operation,
        status: safeStatus(meta.status),
        durationMs: safeNumber(meta.durationMs),
        rowCount: safeNumber(meta.rowCount ?? meta.rowsCount),
        metadata: safeMetadata(meta)
      }
    });
  } catch {
    // Performance persistence is diagnostic-only; app behavior must not depend on the table existing.
  }
}

export function logPetyrPerformance(operation: string, meta: PerfMeta = {}) {
  writePetyrPerfLog("Petyr performance", {
    operation,
    ...meta
  });
  void persistPetyrPerformanceMeasurement(operation, meta);
}

export function startPetyrPerformanceTimer(operation: string, meta: PerfMeta = {}) {
  const startedAt = Date.now();

  return (extraMeta: PerfMeta = {}) => {
    logPetyrPerformance(operation, {
      ...meta,
      ...extraMeta,
      durationMs: Date.now() - startedAt
    });
  };
}
