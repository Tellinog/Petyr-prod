export const PETYR_DETERMINISTIC_PREVIEW_MODEL_VERSION_PREFIX = "petyr_deterministic_preview_v1";

const DEFAULT_DAILY_TIME = "02:00";
const DEFAULT_DELAY_MS = 3000;
const MAX_DELAY_MS = 60_000;

export type PetyrNightlyForecastCompanyLike = {
  companyName: string;
  csmName: string;
  isForecastActive: boolean | null;
  priorityScore: number;
};

export type PetyrNightlyForecastSaveResultLike = {
  ok: boolean;
  companyName: string;
  year: number;
  deterministicCandidatesCount: number;
  report: {
    savedRows: number;
    skippedRows: number;
  };
  diagnostics: string[];
};

export type PetyrNightlyForecastCompanyResult = {
  companyName: string;
  csmName: string;
  status: "processed" | "skipped" | "failed";
  reason: string | null;
  savedRows: number;
  skippedRows: number;
  deterministicCandidatesCount: number;
};

export type PetyrNightlyForecastRunResult = {
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
  companies: PetyrNightlyForecastCompanyResult[];
  diagnostics: string[];
};

export type PetyrNightlyForecastCacheKeyInput = {
  companyName: string;
  businessUnit: string;
  year: number;
  month: number;
  modelVersion: string;
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values: string[]) {
  return [...new Set(values)];
}

export function parsePetyrAiForecastDailyTime(rawValue?: unknown) {
  const normalized = asString(rawValue) || DEFAULT_DAILY_TIME;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(normalized)) return DEFAULT_DAILY_TIME;
  return normalized;
}

export function parsePetyrAiForecastDelayMs(rawValue?: unknown) {
  const normalized = asString(rawValue);
  if (!normalized) return DEFAULT_DELAY_MS;
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed)) return DEFAULT_DELAY_MS;
  return Math.min(Math.max(parsed, 0), MAX_DELAY_MS);
}

export function getPetyrDatePartsInTimezone(date: Date, timeZone: string) {
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

export function getPetyrDateKeyInTimezone(date: Date, timeZone: string) {
  const parts = getPetyrDatePartsInTimezone(date, timeZone);
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0")
  ].join("-");
}

export function getPetyrCurrentYearInTimezone(date: Date, timeZone: string) {
  return getPetyrDatePartsInTimezone(date, timeZone).year;
}

export function getPetyrDeterministicPreviewDailyModelVersion(date: Date, timeZone: string) {
  return `${PETYR_DETERMINISTIC_PREVIEW_MODEL_VERSION_PREFIX}@${getPetyrDateKeyInTimezone(date, timeZone)}`;
}

export function getNextPetyrAiForecastDailyRunAt(now: Date, dailyTime: string) {
  const [hour, minute] = dailyTime.split(":").map(Number);
  const nextRunAt = new Date(now);

  nextRunAt.setHours(hour, minute, 0, 0);
  if (nextRunAt <= now) nextRunAt.setDate(nextRunAt.getDate() + 1);
  return nextRunAt;
}

export function normalizePetyrNightlyForecastCompanies<T extends PetyrNightlyForecastCompanyLike>(rows: T[]) {
  return rows
    .filter((row) => row.isForecastActive !== false)
    .map((row) => ({
      companyName: row.companyName,
      csmName: row.csmName,
      isForecastActive: row.isForecastActive,
      priorityScore: row.priorityScore
    }));
}

export function getPetyrNightlyForecastCacheKey(input: PetyrNightlyForecastCacheKeyInput) {
  return [
    input.companyName.trim().toLowerCase(),
    input.businessUnit.trim().toLowerCase(),
    input.year,
    input.month,
    input.modelVersion
  ].join("\u0000");
}

export function isPetyrNightlyForecastCacheDuplicate(input: {
  forecast: PetyrNightlyForecastCacheKeyInput;
  existingKeys: Set<string>;
}) {
  return input.existingKeys.has(getPetyrNightlyForecastCacheKey(input.forecast));
}

export async function runPetyrNightlyDeterministicAiForecastCore(input: {
  now: Date;
  timezone: string;
  delayMs: number;
  listCompanies: () => Promise<{ data: PetyrNightlyForecastCompanyLike[]; diagnostics: string[] }>;
  saveCompany: (input: { companyName: string; year: number; modelVersion: string }) => Promise<PetyrNightlyForecastSaveResultLike>;
  sleep: (ms: number) => Promise<void>;
  runWithLock: <T>(operation: () => Promise<T>) => Promise<T | "lock_busy">;
}): Promise<PetyrNightlyForecastRunResult> {
  const year = getPetyrCurrentYearInTimezone(input.now, input.timezone);
  const runDate = getPetyrDateKeyInTimezone(input.now, input.timezone);
  const modelVersion = getPetyrDeterministicPreviewDailyModelVersion(input.now, input.timezone);
  const operation = async (): Promise<Omit<PetyrNightlyForecastRunResult, "skippedByLock">> => {
    const diagnostics: string[] = [];
    const companiesResult = await input.listCompanies();
    diagnostics.push(...companiesResult.diagnostics);
    const companies = normalizePetyrNightlyForecastCompanies(companiesResult.data);
    const results: PetyrNightlyForecastCompanyResult[] = [];

    for (const [index, company] of companies.entries()) {
      if (index > 0 && input.delayMs > 0) await input.sleep(input.delayMs);

      try {
        const result = await input.saveCompany({
          companyName: company.companyName,
          year,
          modelVersion
        });
        diagnostics.push(...result.diagnostics);
        results.push({
          companyName: result.companyName,
          csmName: company.csmName,
          status: result.ok ? "processed" : "failed",
          reason: result.ok ? null : "Deterministic AI Forecast cache save reported validation errors.",
          savedRows: result.report.savedRows,
          skippedRows: result.report.skippedRows,
          deterministicCandidatesCount: result.deterministicCandidatesCount
        });
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
      timezone: input.timezone,
      modelVersion,
      delayMs: input.delayMs,
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

  const result = await input.runWithLock(operation);

  if (result === "lock_busy") {
    return {
      ok: true,
      skippedByLock: true,
      year,
      runDate,
      timezone: input.timezone,
      modelVersion,
      delayMs: input.delayMs,
      selectedCompanies: 0,
      processedCompanies: 0,
      skippedCompanies: 0,
      failedCompanies: 0,
      savedRows: 0,
      skippedRows: 0,
      companies: [],
      diagnostics: ["Nightly deterministic AI Forecast skipped because another worker holds the PostgreSQL advisory lock."]
    };
  }

  return {
    ...result,
    skippedByLock: false
  };
}
