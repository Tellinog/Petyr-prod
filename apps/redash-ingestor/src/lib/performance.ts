import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { logger } from "./logger";

type PerfMeta = Record<string, string | number | boolean | null | undefined>;
const REDASH_PERFORMANCE_OPERATIONS = new Set(["Redash sync execution", "Redash latest table materialization"]);
const METADATA_DENYLIST = new Set(["durationMs", "rowCount", "rowsCount", "error", "errorMessage", "detail", "fileName"]);

export function isPerfLogsEnabled() {
  return process.env.PETYR_PERF_LOGS?.trim().toLowerCase() === "true";
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

async function persistPerformanceMeasurement(operation: string, meta: PerfMeta) {
  if (!REDASH_PERFORMANCE_OPERATIONS.has(operation)) return;

  try {
    await prisma.petyrPerformanceMeasurement.create({
      data: {
        service: "redash-ingestor",
        operation,
        status: safeStatus(meta.status),
        durationMs: safeNumber(meta.durationMs),
        rowCount: safeNumber(meta.rowCount ?? meta.rowsCount),
        metadata: safeMetadata(meta)
      }
    });
  } catch {
    // Performance persistence is diagnostic-only; Redash sync must not depend on the table existing.
  }
}

export function logPerformance(operation: string, meta: PerfMeta = {}) {
  void persistPerformanceMeasurement(operation, meta);

  if (!isPerfLogsEnabled()) return;

  logger.info("Redash Ingestor performance", {
    operation,
    ...meta
  });
}

export function startPerformanceTimer(operation: string, meta: PerfMeta = {}) {
  const startedAt = Date.now();

  return (extraMeta: PerfMeta = {}) => {
    logPerformance(operation, {
      ...meta,
      ...extraMeta,
      durationMs: Date.now() - startedAt
    });
  };
}
