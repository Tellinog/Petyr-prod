import { prisma } from "../../lib/db";
import { readIntelligenceConfig } from "./config";
import { getIntelligenceDailyBudgetStatus, type IntelligenceDailyBudgetStatus } from "./intelligenceBudgetService";

export const INTELLIGENCE_WORKER_ENABLED_SETTING_KEY = "petyr_intelligence_scan_worker_enabled_v1";

type Queryable = {
  $queryRaw: <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
  $executeRaw?: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
};

type WorkerEnabledSetting = {
  enabled: boolean;
  source: "database" | "environment_default";
  updatedAt: string | null;
};

export type IntelligenceWorkerStatus = {
  workerEnabled: boolean;
  workerEnabledSource: WorkerEnabledSetting["source"];
  workerEnabledUpdatedAt: string | null;
  intelligenceEnabled: boolean;
  providerReady: boolean;
  hasExaKey: boolean;
  hasOpenRouterKey: boolean;
  scanDailyTime: string;
  scanTimezone: string;
  dailyBudget: IntelligenceDailyBudgetStatus;
};

function parseStoredEnabled(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return null;
}

async function readWorkerEnabledSetting(db: Queryable = prisma): Promise<WorkerEnabledSetting> {
  const config = readIntelligenceConfig();
  const rows = await db.$queryRaw<Array<{ settingValue: string | null; updatedAt: Date | null }>>`
    SELECT "setting_value" AS "settingValue", "updated_at" AS "updatedAt"
    FROM "app_setting"
    WHERE "setting_key" = ${INTELLIGENCE_WORKER_ENABLED_SETTING_KEY}
    LIMIT 1
  `;
  const stored = rows[0] ?? null;
  const parsed = parseStoredEnabled(stored?.settingValue);

  if (parsed === null) {
    return {
      enabled: config.workerEnabledByDefault,
      source: "environment_default",
      updatedAt: null
    };
  }

  return {
    enabled: parsed,
    source: "database",
    updatedAt: stored?.updatedAt ? stored.updatedAt.toISOString() : null
  };
}

export async function getIntelligenceWorkerStatus(db: Queryable = prisma): Promise<IntelligenceWorkerStatus> {
  const config = readIntelligenceConfig();
  const [setting, dailyBudget] = await Promise.all([
    readWorkerEnabledSetting(db),
    getIntelligenceDailyBudgetStatus(db)
  ]);

  return {
    workerEnabled: setting.enabled,
    workerEnabledSource: setting.source,
    workerEnabledUpdatedAt: setting.updatedAt,
    intelligenceEnabled: config.enabled,
    providerReady: config.enabled && Boolean(config.exaApiKey) && Boolean(config.openRouterApiKey),
    hasExaKey: Boolean(config.exaApiKey),
    hasOpenRouterKey: Boolean(config.openRouterApiKey),
    scanDailyTime: config.scanDailyTime,
    scanTimezone: config.scanTimezone,
    dailyBudget
  };
}

export async function setIntelligenceWorkerEnabled(enabled: boolean, _updatedBy: string, db: Queryable = prisma) {
  if (!db.$executeRaw) throw new Error("Database executor does not support writes.");

  await db.$executeRaw`
    INSERT INTO "app_setting" ("setting_key", "setting_value")
    VALUES (${INTELLIGENCE_WORKER_ENABLED_SETTING_KEY}, ${enabled ? "true" : "false"})
    ON CONFLICT ("setting_key")
    DO UPDATE SET "setting_value" = EXCLUDED."setting_value", "updated_at" = now()
  `;

  return getIntelligenceWorkerStatus(db);
}
