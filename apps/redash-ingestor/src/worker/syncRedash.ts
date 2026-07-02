import { config } from "../lib/config";
import { logger } from "../lib/logger";
import { prisma } from "../lib/db";
import { syncAllEnabledSources } from "../services/syncService";
import { runWithSyncLock, SyncLockBusyError } from "../services/syncLock";
import { runPostSyncAiForecastBatch } from "../services/postSyncAiForecastService";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runOnce() {
  const owner = `worker:${process.pid}:${Date.now()}`;
  let shouldRunAiForecastBatch = false;

  try {
    await runWithSyncLock(owner, async () => {
      logger.info("Worker sync started");
      const runs = await syncAllEnabledSources("worker");
      shouldRunAiForecastBatch = runs.length > 0 && runs.every((run) => run.status === "SUCCESS");
      logger.info("Worker sync finished", {
        runs: runs.length,
        success: runs.filter((run) => run.status === "SUCCESS").length,
        failed: runs.filter((run) => run.status === "FAILED").length
      });
    });

    if (shouldRunAiForecastBatch) {
      await runPostSyncAiForecastBatch();
    } else {
      logger.warn("Petyr AI forecast batch skipped because the Redash sync did not fully succeed");
    }
  } catch (error) {
    if (error instanceof SyncLockBusyError) {
      logger.warn("Worker sync skipped because another sync is already running");
      return;
    }

    throw error;
  }
}

function parseDailyTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return { hour, minute };
}

function formatLocalDateTime(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function getNextDailyRunAt(now = new Date()) {
  const { hour, minute } = parseDailyTime(config.SYNC_DAILY_TIME);
  const nextRunAt = new Date(now);

  nextRunAt.setHours(hour, minute, 0, 0);

  if (nextRunAt <= now) {
    nextRunAt.setDate(nextRunAt.getDate() + 1);
  }

  return nextRunAt;
}

async function runLoop() {
  while (true) {
    const nextRunAt = getNextDailyRunAt();
    const sleepMs = Math.max(nextRunAt.getTime() - Date.now(), 0);

    logger.info("Worker scheduled next daily sync", {
      dailyTime: config.SYNC_DAILY_TIME,
      timezone: config.TZ,
      nextRunAt: formatLocalDateTime(nextRunAt),
      sleepSeconds: Math.round(sleepMs / 1000)
    });

    await sleep(sleepMs);
    await runOnce();
  }
}

const mode = process.argv.includes("--loop") ? "loop" : "once";

try {
  if (mode === "loop") {
    await runLoop();
  } else {
    await runOnce();
  }
} catch (error) {
  logger.error("Worker crashed", {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exitCode = 1;
} finally {
  if (mode === "once") {
    await prisma.$disconnect();
  }
}
