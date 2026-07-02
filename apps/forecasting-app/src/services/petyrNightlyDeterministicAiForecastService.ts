import { prisma } from "@/lib/db";
import { getPetyrTimezone } from "@/lib/petyr/config";
import { logPetyrPerformance } from "@/lib/petyr/performance";
import { getForecastEntryCompanies } from "@/services/petyrDataService";
import {
  savePetyrDeterministicAiForecastForCompany,
  type PetyrDeterministicAiForecastCacheSaveResult
} from "@/services/petyrAiForecastCompanyIntelligenceService";

const DEFAULT_DAILY_TIME = "02:00";
const DEFAULT_DELAY_MS = 3000;
const MAX_DELAY_MS = 60_000;
const LOCK_NAMESPACE = 71882201;
const LOCK_KEY = 20260620;
const LOCK_TIMEOUT_MS = 12 * 60 * 60 * 1000;
export const PETYR_DETERMINISTIC_PREVIEW_MODEL_VERSION_PREFIX = "petyr_deterministic_preview_v1";

type ForecastEntryCompanyRow = Awaited<ReturnType<typeof getForecastEntryCompanies>>["data"][number];

export type PetyrNightlyDeterministicAiForecastCompany = {
  companyName: string;
  csmName: string;
  isForecastActive: boolean | null;
  priorityScore: number;
};

export type PetyrNightlyDeterministicAiForecastCompanyResult = {
  companyName: string;
  csmName: string;
  status: "processed" | "skipped" | "failed";
  reason: string | null;
  savedRows: number;
  skippedRows: number;
  deterministicCandidatesCount: number;
};

export type PetyrNightlyDeterministicAiForecastResult = {
  ok: true;
  skippedByLock: boolean;
  year: number;
  runDate: string;
  timezone: string;
  modelVersion: string;
  delayMs: number;
  selectedCompanies: number;
  processedCompanies: number;
  skippedCompanies: number;
  failedCompanies: number;
  savedRows: number;
  skippedRows: number;
  companies: PetyrNightlyDeterministicAiForecastCompanyResult[];
  diagnostics: string[];
};

export type PetyrNightlyDeterministicAiForecastDependencies = {
  listCompanies?: typeof getForecastEntryCompanies;
  saveCompany?: typeof savePetyrDeterministicAiForecastForCompany;
  sleep?: (ms: number) => Promise<void>;
  runWithLock?: <T>(operation: () => Promise<T>) => Promise<T | "lock_busy">;
  now?: () => Date;
  runSource?: "manual" | "scheduled";
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values: string[]) {
  return [...new Set(values)];
}

export function parsePetyrAiForecastDailyTime(rawValue = process.env.PETYR_AI_FORECAST_DAILY_TIME) {
  const normalized = asString(rawValue) || DEFAULT_DAILY_TIME;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(normalized)) return DEFAULT_DAILY_TIME;
  return normalized;
}

export function parsePetyrAiForecastDelayMs(rawValue = process.env.PETYR_AI_FORECAST_DELAY_MS) {
  const normalized = asString(rawValue);
  if (!normalized) return DEFAULT_DELAY_MS;
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed)) return DEFAULT_DELAY_MS;
  return Math.min(Math.max(parsed, 0), MAX_DELAY_MS);
}

export function getPetyrDatePartsInTimezone(date: Date, timeZone = getPetyrTimezone()) {
  const parts = new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric"
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(byType.get("year")),
    month: Number(byType.get("month")),
    day: Number(byType.get("day"))
  };
}

export function getPetyrDateKeyInTimezone(date: Date, timeZone = getPetyrTimezone()) {
  const parts = getPetyrDatePartsInTimezone(date, timeZone);
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0")
  ].join("-");
}

export function getPetyrCurrentYearInTimezone(date: Date, timeZone = getPetyrTimezone()) {
  return getPetyrDatePartsInTimezone(date, timeZone).year;
}

export function getPetyrDeterministicPreviewDailyModelVersion(date: Date, timeZone = getPetyrTimezone()) {
  return `${PETYR_DETERMINISTIC_PREVIEW_MODEL_VERSION_PREFIX}@${getPetyrDateKeyInTimezone(date, timeZone)}`;
}

export function getNextPetyrAiForecastDailyRunAt(now = new Date(), dailyTime = parsePetyrAiForecastDailyTime()) {
  const [hour, minute] = dailyTime.split(":").map(Number);
  const nextRunAt = new Date(now);

  nextRunAt.setHours(hour, minute, 0, 0);
  if (nextRunAt <= now) nextRunAt.setDate(nextRunAt.getDate() + 1);
  return nextRunAt;
}

export function normalizePetyrNightlyForecastCompanies(rows: ForecastEntryCompanyRow[]): PetyrNightlyDeterministicAiForecastCompany[] {
  return rows
    .filter((row) => row.isForecastActive !== false)
    .map((row) => ({
      companyName: row.companyName,
      csmName: row.csmName,
      isForecastActive: row.isForecastActive,
      priorityScore: row.priorityScore
    }));
}

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function defaultRunWithAdvisoryLock<T>(operation: () => Promise<T>) {
  return prisma.$transaction(
    async (tx) => {
      const lockRows = await tx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_xact_lock(${LOCK_NAMESPACE}::int, ${LOCK_KEY}::int) AS locked
      `;
      const locked = lockRows[0]?.locked === true;
      if (!locked) return "lock_busy" as const;
      return operation();
    },
    {
      maxWait: 10_000,
      timeout: LOCK_TIMEOUT_MS
    }
  );
}

function summarizeCompanyResult(input: {
  company: PetyrNightlyDeterministicAiForecastCompany;
  result: PetyrDeterministicAiForecastCacheSaveResult;
}): PetyrNightlyDeterministicAiForecastCompanyResult {
  return {
    companyName: input.result.companyName,
    csmName: input.company.csmName,
    status: input.result.ok ? "processed" : "failed",
    reason: input.result.ok ? null : "Deterministic AI Forecast cache save reported validation errors.",
    savedRows: input.result.report.savedRows,
    skippedRows: input.result.report.skippedRows,
    deterministicCandidatesCount: input.result.deterministicCandidatesCount
  };
}

export async function runPetyrNightlyDeterministicAiForecast(
  dependencies: PetyrNightlyDeterministicAiForecastDependencies = {}
): Promise<PetyrNightlyDeterministicAiForecastResult> {
  const startedAt = Date.now();
  const now = dependencies.now?.() ?? new Date();
  const timezone = getPetyrTimezone();
  const year = getPetyrCurrentYearInTimezone(now, timezone);
  const runDate = getPetyrDateKeyInTimezone(now, timezone);
  const modelVersion = getPetyrDeterministicPreviewDailyModelVersion(now, timezone);
  const delayMs = parsePetyrAiForecastDelayMs();
  const listCompanies = dependencies.listCompanies ?? getForecastEntryCompanies;
  const saveCompany = dependencies.saveCompany ?? savePetyrDeterministicAiForecastForCompany;
  const sleep = dependencies.sleep ?? defaultSleep;
  const runWithLock = dependencies.runWithLock ?? defaultRunWithAdvisoryLock;
  const runSource = dependencies.runSource ?? "scheduled";

  const operation = async (): Promise<Omit<PetyrNightlyDeterministicAiForecastResult, "skippedByLock">> => {
    const diagnostics: string[] = [];
    const companiesResult = await listCompanies();
    diagnostics.push(...companiesResult.diagnostics);
    const companies = normalizePetyrNightlyForecastCompanies(companiesResult.data);
    const results: PetyrNightlyDeterministicAiForecastCompanyResult[] = [];

    for (const [index, company] of companies.entries()) {
      if (index > 0 && delayMs > 0) await sleep(delayMs);

      try {
        const result = await saveCompany({
          companyName: company.companyName,
          year,
          modelVersion
        });
        diagnostics.push(...result.diagnostics);
        results.push(summarizeCompanyResult({ company, result }));
      } catch (error) {
        results.push({
          companyName: company.companyName,
          csmName: company.csmName,
          status: "failed",
          reason: error instanceof Error ? error.message : String(error),
          savedRows: 0,
          skippedRows: 0,
          deterministicCandidatesCount: 0
        });
      }
    }

    return {
      ok: true,
      year,
      runDate,
      timezone,
      modelVersion,
      delayMs,
      selectedCompanies: companies.length,
      processedCompanies: results.filter((row) => row.status === "processed").length,
      skippedCompanies: results.filter((row) => row.status === "skipped").length,
      failedCompanies: results.filter((row) => row.status === "failed").length,
      savedRows: results.reduce((sum, row) => sum + row.savedRows, 0),
      skippedRows: results.reduce((sum, row) => sum + row.skippedRows, 0),
      companies: results,
      diagnostics: unique(diagnostics)
    };
  };

  try {
    const result = await runWithLock(operation);

    if (result === "lock_busy") {
      const lockedResult: PetyrNightlyDeterministicAiForecastResult = {
        ok: true,
        skippedByLock: true,
        year,
        runDate,
        timezone,
        modelVersion,
        delayMs,
        selectedCompanies: 0,
        processedCompanies: 0,
        skippedCompanies: 0,
        failedCompanies: 0,
        savedRows: 0,
        skippedRows: 0,
        companies: [],
        diagnostics: ["Nightly deterministic AI Forecast skipped because another worker holds the PostgreSQL advisory lock."]
      };

      logPetyrPerformance("Daily AI Forecast run", {
        status: "skipped",
        durationMs: Date.now() - startedAt,
        rowCount: 0,
        runSource,
        year,
        runDate,
        modelVersion,
        selectedCompanies: 0,
        processedCompanies: 0,
        failedCompanies: 0,
        savedRows: 0,
        skippedRows: 0,
        skippedByLock: true
      });

      return lockedResult;
    }

    const finalResult = {
      ...result,
      skippedByLock: false
    };

    logPetyrPerformance("Daily AI Forecast run", {
      status: finalResult.failedCompanies > 0 ? "failed" : "success",
      durationMs: Date.now() - startedAt,
      rowCount: finalResult.savedRows,
      runSource,
      year: finalResult.year,
      runDate: finalResult.runDate,
      modelVersion: finalResult.modelVersion,
      selectedCompanies: finalResult.selectedCompanies,
      processedCompanies: finalResult.processedCompanies,
      failedCompanies: finalResult.failedCompanies,
      savedRows: finalResult.savedRows,
      skippedRows: finalResult.skippedRows,
      skippedByLock: finalResult.skippedByLock
    });

    return finalResult;
  } catch (error) {
    logPetyrPerformance("Daily AI Forecast run", {
      status: "failed",
      durationMs: Date.now() - startedAt,
      rowCount: 0,
      runSource,
      year,
      runDate,
      modelVersion,
      selectedCompanies: 0,
      processedCompanies: 0,
      failedCompanies: 0,
      savedRows: 0,
      skippedRows: 0,
      skippedByLock: false
    });

    throw error;
  }
}
