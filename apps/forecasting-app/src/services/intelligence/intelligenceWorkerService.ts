import { prisma } from "../../lib/db";
import { logPetyrPerformance } from "../../lib/petyr/performance";
import { createSkippedIntelligenceRun } from "./runLogger";
import { runCompanyIntelligenceScan } from "./intelligenceScanService";
import { getIntelligenceWorkerStatus } from "./intelligenceWorkerSettingsService";

const LOCK_NAMESPACE = 71882201;
const LOCK_KEY = 20260701;
const LOCK_TIMEOUT_MS = 2 * 60 * 60 * 1000;

export type IntelligenceWorkerRunSource = "manual" | "scheduled";

export type IntelligenceWorkerRunResult = Awaited<ReturnType<typeof runCompanyIntelligenceScan>> & {
  skippedByLock?: boolean;
  workerEnabled?: boolean;
};

export function getNextIntelligenceScanRunAt(now = new Date(), dailyTime = "03:00") {
  const [hour, minute] = dailyTime.split(":").map(Number);
  const nextRunAt = new Date(now);

  nextRunAt.setHours(hour, minute, 0, 0);
  if (nextRunAt <= now) nextRunAt.setDate(nextRunAt.getDate() + 1);
  return nextRunAt;
}

async function runWithAdvisoryLock<T>(operation: () => Promise<T>) {
  return prisma.$transaction(
    async (tx) => {
      const lockRows = await tx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_xact_lock(${LOCK_NAMESPACE}::int, ${LOCK_KEY}::int) AS locked
      `;
      if (lockRows[0]?.locked !== true) return "lock_busy" as const;
      return operation();
    },
    {
      maxWait: 10_000,
      timeout: LOCK_TIMEOUT_MS
    }
  );
}

export async function runIntelligenceScanWorkerOnce(input: {
  runSource: IntelligenceWorkerRunSource;
  createdBy?: string;
  companyName?: string | null;
  maxCompanies?: number | null;
  maxResultsPerCompany?: number | null;
}) {
  const startedAt = Date.now();
  const status = await getIntelligenceWorkerStatus();

  if (input.runSource === "scheduled" && !status.workerEnabled) {
    const runId = await createSkippedIntelligenceRun({
      status: "skipped_disabled",
      dryRun: false,
      selectedReason: "scheduled worker disabled",
      errorMessage: "Petyr Intelligence scheduled worker is disabled.",
      createdBy: input.createdBy ?? "intelligence-scan"
    });

    logPetyrPerformance("Intelligence scan run", {
      status: "skipped",
      durationMs: Date.now() - startedAt,
      runSource: input.runSource,
      runId,
      workerEnabled: false,
      selectedCompanies: 0
    });

    return {
      runId,
      status: "skipped_disabled",
      selectedCompanies: 0,
      skippedByLock: false,
      workerEnabled: false,
      errors: ["Petyr Intelligence scheduled worker is disabled."]
    } satisfies IntelligenceWorkerRunResult;
  }

  const result = await runWithAdvisoryLock(() => runCompanyIntelligenceScan({
    dryRun: false,
    companyName: input.companyName ?? null,
    maxCompanies: input.maxCompanies ?? null,
    maxResultsPerCompany: input.maxResultsPerCompany ?? null,
    createdBy: input.createdBy ?? (input.runSource === "scheduled" ? "intelligence-scan" : "admin"),
    runSource: input.runSource
  }));

  if (result === "lock_busy") {
    const runId = await createSkippedIntelligenceRun({
      status: "skipped_lock",
      dryRun: false,
      selectedReason: "scan skipped by advisory lock",
      errorMessage: "Another Petyr Intelligence scan is already running.",
      createdBy: input.createdBy ?? "intelligence-scan"
    });

    logPetyrPerformance("Intelligence scan run", {
      status: "skipped",
      durationMs: Date.now() - startedAt,
      runSource: input.runSource,
      runId,
      skippedByLock: true,
      selectedCompanies: 0
    });

    return {
      runId,
      status: "skipped_lock",
      selectedCompanies: 0,
      skippedByLock: true,
      workerEnabled: status.workerEnabled,
      errors: ["Another Petyr Intelligence scan is already running."]
    } satisfies IntelligenceWorkerRunResult;
  }

  logPetyrPerformance("Intelligence scan run", {
    status: result.status === "succeeded" ? "success" : result.status,
    durationMs: Date.now() - startedAt,
    runSource: input.runSource,
    runId: result.runId,
    selectedCompanies: result.selectedCompanies,
    exaRequestsUsed: "exaRequestsUsed" in result ? result.exaRequestsUsed ?? 0 : 0,
    openrouterRequestsUsed: "openrouterRequestsUsed" in result ? result.openrouterRequestsUsed ?? 0 : 0,
    skippedByLock: false
  });

  return {
    ...result,
    skippedByLock: false,
    workerEnabled: status.workerEnabled
  } satisfies IntelligenceWorkerRunResult;
}
