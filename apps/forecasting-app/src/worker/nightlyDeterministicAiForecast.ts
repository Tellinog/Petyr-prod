import { prisma } from "@/lib/db";
import {
  getNextPetyrAiForecastDailyRunAt,
  parsePetyrAiForecastDailyTime,
  runPetyrNightlyDeterministicAiForecast
} from "@/services/petyrNightlyDeterministicAiForecastService";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(level: "info" | "warn" | "error", message: string, meta: Record<string, unknown> = {}) {
  console[level](JSON.stringify({
    level,
    message,
    service: "petyr-ai-forecast-worker",
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
  log("info", "Nightly deterministic AI Forecast started");
  const result = await runPetyrNightlyDeterministicAiForecast({ runSource });

  log(result.failedCompanies > 0 ? "warn" : "info", "Nightly deterministic AI Forecast finished", {
    skippedByLock: result.skippedByLock,
    year: result.year,
    runDate: result.runDate,
    timezone: result.timezone,
    modelVersion: result.modelVersion,
    delayMs: result.delayMs,
    selectedCompanies: result.selectedCompanies,
    processedCompanies: result.processedCompanies,
    failedCompanies: result.failedCompanies,
    savedRows: result.savedRows,
    skippedRows: result.skippedRows,
    diagnosticsCount: result.diagnostics.length
  });

  return result;
}

async function runLoop() {
  while (true) {
    const dailyTime = parsePetyrAiForecastDailyTime();
    const nextRunAt = getNextPetyrAiForecastDailyRunAt(new Date(), dailyTime);
    const sleepMs = Math.max(nextRunAt.getTime() - Date.now(), 0);

    log("info", "Scheduled next Petyr deterministic AI Forecast run", {
      dailyTime,
      timezone: process.env.TZ ?? process.env.PETYR_TIMEZONE ?? "Europe/Rome",
      nextRunAt: formatLocalDateTime(nextRunAt),
      sleepSeconds: Math.round(sleepMs / 1000)
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
    log("error", "Petyr deterministic AI Forecast worker crashed", {
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
