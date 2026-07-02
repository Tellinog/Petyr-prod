import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PETYR_PERFORMANCE_CHECKS } from "@/lib/petyr/performance";

type RelationExistsRow = {
  exists: boolean;
};

type MetadataValue = string | number | boolean | null;

export type PetyrPerformanceResultRow = {
  id: string | null;
  service: string;
  operation: string;
  measured: boolean;
  status: string;
  durationMs: number | null;
  rowCount: number | null;
  metadata: Record<string, MetadataValue>;
  measuredAt: string | null;
};

export type PetyrPerformanceOperationStats = {
  service: string;
  operation: string;
  sampleCount: number;
  successCount: number;
  failureCount: number;
  averageDurationMs: number | null;
  medianDurationMs: number | null;
  p95DurationMs: number | null;
  latestDurationMs: number | null;
  latestMeasuredAt: string | null;
};

export type PetyrPerformanceSummary = {
  measuredChecks: number;
  totalChecks: number;
  totalSamples: number;
  successSamples: number;
  failureSamples: number;
  averageDurationMs: number | null;
  slowestAverageOperation: PetyrPerformanceOperationStats | null;
};

export type PetyrPerformanceResults = {
  ok: boolean;
  persistenceEnabled: boolean;
  checkedAt: string;
  summary: PetyrPerformanceSummary;
  checks: PetyrPerformanceResultRow[];
  operationStats: PetyrPerformanceOperationStats[];
  recentHistory: PetyrPerformanceResultRow[];
  dailyAiForecastRuns: PetyrPerformanceResultRow[];
  warnings: string[];
};

function expectedService(operation: string) {
  return operation.startsWith("Redash ") ? "redash-ingestor" : "forecasting-app";
}

async function performanceTableExists() {
  const rows = await prisma.$queryRaw<RelationExistsRow[]>`
    SELECT to_regclass('petyr_performance_measurement') IS NOT NULL AS "exists"
  `;

  return rows[0]?.exists ?? false;
}

function toMetadata(value: Prisma.JsonValue): Record<string, MetadataValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const metadata: Record<string, MetadataValue> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean" || entry === null) {
      metadata[key] = entry;
    }
  }

  return metadata;
}

function toRow(row: {
  id: string;
  service: string;
  operation: string;
  status: string;
  durationMs: number | null;
  rowCount: number | null;
  metadata: Prisma.JsonValue;
  measuredAt: Date;
}): PetyrPerformanceResultRow {
  return {
    id: row.id,
    service: row.service,
    operation: row.operation,
    measured: true,
    status: row.status,
    durationMs: row.durationMs,
    rowCount: row.rowCount,
    metadata: toMetadata(row.metadata),
    measuredAt: row.measuredAt.toISOString()
  };
}

function emptyRow(operation: string): PetyrPerformanceResultRow {
  return {
    id: null,
    service: expectedService(operation),
    operation,
    measured: false,
    status: "never_measured",
    durationMs: null,
    rowCount: null,
    metadata: {},
    measuredAt: null
  };
}

function percentile(sortedValues: number[], percentileValue: number) {
  if (sortedValues.length === 0) return null;

  const index = Math.min(sortedValues.length - 1, Math.ceil((percentileValue / 100) * sortedValues.length) - 1);
  return sortedValues[index] ?? null;
}

function average(values: number[]) {
  if (values.length === 0) return null;

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function buildOperationStats(history: PetyrPerformanceResultRow[]) {
  const byOperation = new Map<string, PetyrPerformanceResultRow[]>();

  for (const row of history) {
    const rows = byOperation.get(row.operation) ?? [];
    rows.push(row);
    byOperation.set(row.operation, rows);
  }

  return [...byOperation.entries()].map<PetyrPerformanceOperationStats>(([operation, rows]) => {
    const durations = rows
      .map((row) => row.durationMs)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      .sort((left, right) => left - right);
    const latest = rows[0] ?? null;

    return {
      service: latest?.service ?? expectedService(operation),
      operation,
      sampleCount: rows.length,
      successCount: rows.filter((row) => row.status === "success" || row.status === "measured").length,
      failureCount: rows.filter((row) => row.status === "failed").length,
      averageDurationMs: average(durations),
      medianDurationMs: percentile(durations, 50),
      p95DurationMs: percentile(durations, 95),
      latestDurationMs: latest?.durationMs ?? null,
      latestMeasuredAt: latest?.measuredAt ?? null
    };
  }).sort((left, right) => {
    const leftAverage = left.averageDurationMs ?? -1;
    const rightAverage = right.averageDurationMs ?? -1;
    return rightAverage - leftAverage || left.operation.localeCompare(right.operation);
  });
}

function buildSummary(input: {
  checks: PetyrPerformanceResultRow[];
  history: PetyrPerformanceResultRow[];
  operationStats: PetyrPerformanceOperationStats[];
}): PetyrPerformanceSummary {
  const durations = input.history
    .map((row) => row.durationMs)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  return {
    measuredChecks: input.checks.filter((check) => check.measured).length,
    totalChecks: input.checks.length,
    totalSamples: input.history.length,
    successSamples: input.history.filter((row) => row.status === "success" || row.status === "measured").length,
    failureSamples: input.history.filter((row) => row.status === "failed").length,
    averageDurationMs: average(durations),
    slowestAverageOperation: input.operationStats.find((row) => row.averageDurationMs !== null) ?? null
  };
}

export async function getPetyrPerformanceResults(): Promise<PetyrPerformanceResults> {
  const checkedAt = new Date().toISOString();
  const operations = [...PETYR_PERFORMANCE_CHECKS];

  if (!(await performanceTableExists())) {
    return {
      ok: false,
      persistenceEnabled: false,
      checkedAt,
      summary: {
        measuredChecks: 0,
        totalChecks: operations.length,
        totalSamples: 0,
        successSamples: 0,
        failureSamples: 0,
        averageDurationMs: null,
        slowestAverageOperation: null
      },
      checks: operations.map(emptyRow),
      operationStats: [],
      recentHistory: [],
      dailyAiForecastRuns: [],
      warnings: [
        "petyr_performance_measurement is missing. Apply the forecasting app Prisma schema before Petyr Admin can show persisted performance results."
      ]
    };
  }

  const [rows, latestRows, dailyAiForecastRows] = await Promise.all([
    prisma.petyrPerformanceMeasurement.findMany({
      where: { operation: { in: operations } },
      orderBy: { measuredAt: "desc" },
      take: 200
    }),
    Promise.all(
      operations.map((operation) => prisma.petyrPerformanceMeasurement.findFirst({
        where: { operation },
        orderBy: { measuredAt: "desc" }
      }))
    ),
    prisma.petyrPerformanceMeasurement.findMany({
      where: { operation: "Daily AI Forecast run" },
      orderBy: { measuredAt: "desc" },
      take: 20
    })
  ]);
  const latestByOperation = new Map<string, PetyrPerformanceResultRow>();
  const history = rows.map(toRow);
  const dailyAiForecastRuns = dailyAiForecastRows.map(toRow);

  for (const row of latestRows) {
    if (!row) continue;
    latestByOperation.set(row.operation, toRow(row));
  }
  for (const row of history) {
    if (!latestByOperation.has(row.operation)) latestByOperation.set(row.operation, row);
  }
  const checks = operations.map((operation) => latestByOperation.get(operation) ?? emptyRow(operation));
  const operationStats = buildOperationStats(history);

  return {
    ok: true,
    persistenceEnabled: true,
    checkedAt,
    summary: buildSummary({ checks, history, operationStats }),
    checks,
    operationStats,
    recentHistory: history.slice(0, 40),
    dailyAiForecastRuns,
    warnings: []
  };
}
