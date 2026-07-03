import { prisma } from "@/lib/db";
import { readIntelligenceConfig } from "@/services/intelligence/config";
import { getNextIntelligenceScanRunAt, runIntelligenceScanWorkerOnce } from "@/services/intelligence/intelligenceWorkerService";
import { getIntelligenceWorkerStatus } from "@/services/intelligence/intelligenceWorkerSettingsService";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(level: "info" | "warn" | "error", message: string, meta: Record<string, unknown> = {}) {
  console[level](JSON.stringify({
    level,
    message,
    service: "intelligence-scan",
    timestamp: new Date().toISOString(),
    ...meta
  }));
}

function formatLocalDateTime(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day} ${hour}:${minute}`;
}

async function runOnce(runSource: "manual" | "scheduled") {
  log("info", "Petyr Intelligence scan started", { runSource });
  const result = await runIntelligenceScanWorkerOnce({ runSource });

  log(result.status === "succeeded" ? "info" : "warn", "Petyr Intelligence scan finished", {
    runSource,
    runId: result.runId,
    status: result.status,
    selectedCompanies: result.selectedCompanies,
    skippedByLock: result.skippedByLock ?? false,
    errorsCount: result.errors?.length ?? 0
  });

  return result;
}

async function runLoop() {
  while (true) {
    const config = readIntelligenceConfig();
    const status = await getIntelligenceWorkerStatus();
    const nextRunAt = getNextIntelligenceScanRunAt(new Date(), config.scanDailyTime);
    const sleepMs = Math.max(nextRunAt.getTime() - Date.now(), 0);

    log("info", "Scheduled next Petyr Intelligence scan", {
      enabled: status.workerEnabled,
      intelligenceEnabled: status.intelligenceEnabled,
      providerReady: status.providerReady,
      dailyTime: config.scanDailyTime,
      timezone: config.scanTimezone,
      nextRunAt: formatLocalDateTime(nextRunAt),
      sleepSeconds: Math.round(sleepMs / 1000),
      dailyBudgetRemaining: status.dailyBudget.remaining
    });

    await sleep(sleepMs);
    await runOnce("scheduled");
  }
}

const mode = process.argv.includes("--loop") ? "loop" : "once";

async function main() {
  try {
    if (mode === "loop") {
      await runLoop();
    } else {
      await runOnce("manual");
    }
  } catch (error) {
    log("error", "Petyr Intelligence scan worker crashed", {
      error: error instanceof Error ? error.message : String(error)
    });
    process.exitCode = 1;
  } finally {
    if (mode === "once") {
      await prisma.$disconnect();
    }
  }
}

void main();
