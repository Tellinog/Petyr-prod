export type IntelligenceConfig = {
  enabled: boolean;
  exaApiKey: string | null;
  openRouterApiKey: string | null;
  openRouterModel: string;
  maxCompaniesPerRun: number;
  maxResultsPerCompany: number;
  searchRecencyDays: number;
  dailyBudgetRequests: number;
  workerEnabledByDefault: boolean;
  scanDailyTime: string;
  scanTimezone: string;
};

function clean(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed !== "replace_me" ? trimmed : null;
}

function positiveInteger(value: string | undefined, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

export function parseIntelligenceScanDailyTime(rawValue: string | undefined, fallback = "03:00") {
  const normalized = rawValue?.trim() || fallback;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(normalized) ? normalized : fallback;
}

export function readIntelligenceConfig(env: NodeJS.ProcessEnv = process.env): IntelligenceConfig {
  return {
    enabled: (env.INTELLIGENCE_ENABLED ?? "false").trim().toLowerCase() === "true",
    exaApiKey: clean(env.EXA_API_KEY),
    openRouterApiKey: clean(env.OPENROUTER_API_KEY),
    openRouterModel: clean(env.OPENROUTER_MODEL) ?? clean(env.OPENROUTER_DEFAULT_MODEL) ?? "openai/gpt-4.1-mini",
    maxCompaniesPerRun: positiveInteger(env.INTELLIGENCE_MAX_COMPANIES_PER_RUN, 10, 100),
    maxResultsPerCompany: positiveInteger(env.INTELLIGENCE_MAX_RESULTS_PER_COMPANY, 5, 25),
    searchRecencyDays: positiveInteger(env.INTELLIGENCE_SEARCH_RECENCY_DAYS, 30, 365),
    dailyBudgetRequests: positiveInteger(env.INTELLIGENCE_DAILY_BUDGET_REQUESTS, 100, 10000),
    workerEnabledByDefault: (env.INTELLIGENCE_WORKER_ENABLED ?? "false").trim().toLowerCase() === "true",
    scanDailyTime: parseIntelligenceScanDailyTime(env.INTELLIGENCE_SCAN_DAILY_TIME),
    scanTimezone: clean(env.INTELLIGENCE_SCAN_TIMEZONE) ?? clean(env.PETYR_TIMEZONE) ?? clean(env.TZ) ?? "Europe/Rome"
  };
}
