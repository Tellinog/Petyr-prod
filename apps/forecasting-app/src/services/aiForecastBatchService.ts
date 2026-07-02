import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getPetyrDefaultYear } from "@/lib/petyr/config";
import { PETYR_BUSINESS_UNITS, type PetyrBusinessUnit } from "@/lib/petyr/constants";
import { getPetyrAiModelSetting } from "@/services/petyrAiModelSettingsService";
import {
  getForecastEntryCompanies,
  getForecastEntryContext,
  type PetyrForecastEntryBusinessUnitContext
} from "@/services/petyrDataService";

const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_BATCH_LIMIT = 3;
const MAX_BATCH_LIMIT = 10;
const DEFAULT_DELAY_MS = 1200;
const MAX_DELAY_MS = 10000;
const OPENROUTER_REQUEST_TIMEOUT_MS = 25000;
const MISSING_KEY_VALUES = new Set(["", "replace_me"]);
const BUSINESS_UNITS = new Set<string>(PETYR_BUSINESS_UNITS);
const AI_FORECAST_BATCH_DISABLED_MESSAGE =
  "Petyr AI Forecast batch processing is disabled for the manual company-by-company MVP. Use /api/petyr/ai-forecast/company for one selected company and year.";

function isAiForecastBatchDisabledForManualMvp() {
  return true;
}

type CandidateCompany = {
  companyName: string;
  csmName: string;
  isForecastActive: boolean | null;
  priorityScore: number;
};

type ExistingAiForecastRow = {
  businessUnit: string;
};

type AiForecastCacheCoverageRow = {
  companyName: string;
  businessUnit: string;
};

type AiForecastBatchForecast = {
  businessUnit: PetyrBusinessUnit;
  forecastValue: number;
  confidenceScore: number | null;
  modelVersion: string;
  explanation: string | null;
  generatedAt: string;
  status: "cached" | "dry_run";
};

type AiForecastBatchCompanyResult = {
  companyName: string;
  csmName: string;
  status: "processed" | "skipped" | "failed";
  reason: string | null;
  forecasts: AiForecastBatchForecast[];
};

export type AiForecastBatchInput = {
  year?: unknown;
  month?: unknown;
  limit?: unknown;
  offset?: unknown;
  companyName?: unknown;
  csmName?: unknown;
  dryRun?: unknown;
  force?: unknown;
  delayMs?: unknown;
};

export type AiForecastBatchResult = {
  ok: true;
  dryRun: boolean;
  year: number;
  month: number;
  modelVersion: string;
  limit: number;
  offset: number;
  delayMs: number;
  processedCompanies: number;
  skippedCompanies: number;
  failedCompanies: number;
  forecastRowsWritten: number;
  companies: AiForecastBatchCompanyResult[];
  diagnostics: string[];
};

type OpenRouterForecast = {
  businessUnit: PetyrBusinessUnit;
  forecastValue: number;
  confidenceScore: number | null;
  explanation: string | null;
};

type OpenRouterPayload = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

type RawForecastPayload = {
  forecasts?: unknown;
};

export class AiForecastBatchError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AiForecastBatchError";
    this.status = status;
  }
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return fallback;

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "n"].includes(normalized)) return false;
  return fallback;
}

function parseInteger(value: unknown, fallback: number, input: { min: number; max: number }) {
  const parsed = typeof value === "number" ? value : Number(asString(value));
  if (!Number.isInteger(parsed)) return fallback;

  return Math.min(Math.max(parsed, input.min), input.max);
}

function parseYear(value: unknown) {
  return parseInteger(value, getPetyrDefaultYear(), { min: 2000, max: 2100 });
}

function parseMonth(value: unknown) {
  return parseInteger(value, new Date().getMonth() + 1, { min: 1, max: 12 });
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function normalizeBusinessUnit(value: unknown): PetyrBusinessUnit | null {
  const normalized = asString(value);
  return PETYR_BUSINESS_UNITS.find((businessUnit) => normalizeKey(businessUnit) === normalizeKey(normalized)) ?? null;
}

function roundMoney(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, value) * 100) / 100;
}

function clampConfidence(value: unknown) {
  const numericValue = typeof value === "number" ? value : Number(asString(value));
  if (!Number.isFinite(numericValue)) return null;

  return Math.round(Math.min(Math.max(numericValue, 0), 1) * 10000) / 10000;
}

function getOpenRouterApiKey() {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  return MISSING_KEY_VALUES.has(apiKey) ? null : apiKey;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uniqueDiagnostics(values: string[]) {
  return [...new Set(values)];
}

function toCandidateCompanies(rows: Awaited<ReturnType<typeof getForecastEntryCompanies>>["data"]): CandidateCompany[] {
  return rows.map((row) => ({
    companyName: row.companyName,
    csmName: row.csmName,
    isForecastActive: row.isForecastActive,
    priorityScore: row.priorityScore
  }));
}

function filterCandidates(
  candidates: CandidateCompany[],
  input: {
    companyName: string;
    csmName: string;
  }
) {
  const companyKey = normalizeKey(input.companyName);
  const csmKey = normalizeKey(input.csmName);

  return candidates.filter((candidate) => {
    if (candidate.isForecastActive === false) return false;
    if (companyKey && normalizeKey(candidate.companyName) !== companyKey) return false;
    if (csmKey && normalizeKey(candidate.csmName) !== csmKey) return false;
    return true;
  });
}

async function readCachedBusinessUnits(input: {
  companyName: string;
  year: number;
  month: number;
  modelVersion: string;
}) {
  const rows: ExistingAiForecastRow[] = await prisma.$queryRaw<ExistingAiForecastRow[]>`
    SELECT "business_unit" AS "businessUnit"
    FROM "ai_forecast_cache"
    WHERE "company_name" = ${input.companyName}
      AND "year" = ${input.year}
      AND "month" = ${input.month}
      AND "model_version" = ${input.modelVersion}
  `;

  return new Set(
    rows
      .map((row) => normalizeBusinessUnit(row.businessUnit))
      .filter((businessUnit): businessUnit is PetyrBusinessUnit => businessUnit !== null)
  );
}

async function readCachedCoverage(input: {
  year: number;
  month: number;
  modelVersion: string;
}) {
  const rows: AiForecastCacheCoverageRow[] = await prisma.$queryRaw<AiForecastCacheCoverageRow[]>`
    SELECT "company_name" AS "companyName", "business_unit" AS "businessUnit"
    FROM "ai_forecast_cache"
    WHERE "year" = ${input.year}
      AND "month" = ${input.month}
      AND "model_version" = ${input.modelVersion}
  `;
  const coverage = new Map<string, Set<PetyrBusinessUnit>>();

  for (const row of rows) {
    const businessUnit = normalizeBusinessUnit(row.businessUnit);
    if (!businessUnit) continue;

    const companyKey = normalizeKey(row.companyName);
    const companyCoverage = coverage.get(companyKey) ?? new Set<PetyrBusinessUnit>();
    companyCoverage.add(businessUnit);
    coverage.set(companyKey, companyCoverage);
  }

  return coverage;
}

function needsForecastCache(input: {
  candidate: CandidateCompany;
  coverage: Map<string, Set<PetyrBusinessUnit>>;
}) {
  return (input.coverage.get(normalizeKey(input.candidate.companyName))?.size ?? 0) < PETYR_BUSINESS_UNITS.length;
}

function buildDryRunForecasts(input: {
  businessUnits: PetyrForecastEntryBusinessUnitContext[];
}) {
  return input.businessUnits
    .map((row): OpenRouterForecast | null => {
      const businessUnit = normalizeBusinessUnit(row.businessUnit);
      if (!businessUnit) return null;

      const annualMonthlyValue = row.annualForecast.value > 0 ? row.annualForecast.value / 12 : 0;
      const bestAvailableSignal = Math.max(
        row.actualRevenue,
        row.ongoingForecast.value,
        row.previousMonthForecast.value,
        annualMonthlyValue
      );
      const hasSignal = bestAvailableSignal > 0;

      return {
        businessUnit,
        forecastValue: roundMoney(bestAvailableSignal),
        confidenceScore: hasSignal ? 0.55 : 0.25,
        explanation: hasSignal
          ? "Dry-run estimate from existing Petyr closed revenue and CSM forecast signals; no AI call was made."
          : "Dry-run estimate found no usable Petyr signal for this company and Business Unit."
      };
    })
    .filter((row): row is OpenRouterForecast => row !== null);
}

function compactBusinessUnitContext(row: PetyrForecastEntryBusinessUnitContext) {
  return {
    businessUnit: row.businessUnit,
    actualRevenue: row.actualRevenue,
    previousMonthForecast: row.previousMonthForecast.value,
    ongoingForecast: row.ongoingForecast.value,
    annualForecast: row.annualForecast.value,
    existingAiForecast: row.aiForecast.value
  };
}

function buildPrompt(input: {
  companyName: string;
  csmName: string;
  year: number;
  month: number;
  businessUnits: PetyrForecastEntryBusinessUnitContext[];
}) {
  const businessUnitContext = input.businessUnits.map(compactBusinessUnitContext);

  return [
    "Generate a monthly AI revenue forecast for Petyr.",
    "Return only valid JSON with a top-level forecasts array.",
    "Each forecast must include businessUnit, forecastValue, confidenceScore, and explanation.",
    "Use confidenceScore from 0 to 1.",
    "Do not modify or reinterpret CSM forecasts; use them only as read-only signal.",
    "Allowed Business Units: " + PETYR_BUSINESS_UNITS.join(", "),
    JSON.stringify({
      companyName: input.companyName,
      csmName: input.csmName,
      year: input.year,
      month: input.month,
      businessUnits: businessUnitContext
    })
  ].join("\n");
}

function extractJsonObject(content: string) {
  const trimmed = content.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new AiForecastBatchError("OpenRouter response did not contain a JSON object.", 502);
  }

  return candidate.slice(firstBrace, lastBrace + 1);
}

function parseOpenRouterForecasts(content: string) {
  const parsed = JSON.parse(extractJsonObject(content)) as RawForecastPayload;

  if (!Array.isArray(parsed.forecasts)) {
    throw new AiForecastBatchError("OpenRouter response JSON did not include a forecasts array.", 502);
  }

  const byBusinessUnit = new Map<PetyrBusinessUnit, OpenRouterForecast>();

  for (const rawForecast of parsed.forecasts) {
    const row = rawForecast as {
      businessUnit?: unknown;
      forecastValue?: unknown;
      confidenceScore?: unknown;
      explanation?: unknown;
    };
    const businessUnit = normalizeBusinessUnit(row.businessUnit);
    if (!businessUnit || !BUSINESS_UNITS.has(businessUnit)) continue;

    const forecastValue = roundMoney(
      typeof row.forecastValue === "number" ? row.forecastValue : Number(asString(row.forecastValue))
    );
    const explanation = asString(row.explanation) || null;

    byBusinessUnit.set(businessUnit, {
      businessUnit,
      forecastValue,
      confidenceScore: clampConfidence(row.confidenceScore),
      explanation
    });
  }

  return [...byBusinessUnit.values()];
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENROUTER_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function generateForecastsWithOpenRouter(input: {
  apiKey: string;
  modelVersion: string;
  companyName: string;
  csmName: string;
  year: number;
  month: number;
  businessUnits: PetyrForecastEntryBusinessUnitContext[];
}) {
  const response = await fetchWithTimeout(OPENROUTER_CHAT_COMPLETIONS_URL, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Title": "UNGUESS Petyr AI Forecast"
    },
    body: JSON.stringify({
      model: input.modelVersion,
      temperature: 0.2,
      max_tokens: 900,
      messages: [
        {
          role: "system",
          content:
            "You are a careful revenue forecasting assistant. You must return compact JSON only and keep CSM forecasts read-only."
        },
        {
          role: "user",
          content: buildPrompt(input)
        }
      ]
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new AiForecastBatchError(
      `OpenRouter forecast request failed with HTTP ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
      502
    );
  }

  const payload = (await response.json()) as OpenRouterPayload;
  const content = payload.choices?.[0]?.message?.content;

  if (typeof content !== "string" || !content.trim()) {
    throw new AiForecastBatchError("OpenRouter response did not include message content.", 502);
  }

  return parseOpenRouterForecasts(content);
}

async function writeForecasts(input: {
  companyName: string;
  year: number;
  month: number;
  modelVersion: string;
  generatedAt: Date;
  forecasts: OpenRouterForecast[];
}) {
  let written = 0;

  for (const forecast of input.forecasts) {
    await prisma.aiForecastCache.upsert({
      where: {
        companyName_businessUnit_year_month_modelVersion: {
          companyName: input.companyName,
          businessUnit: forecast.businessUnit,
          year: input.year,
          month: input.month,
          modelVersion: input.modelVersion
        }
      },
      create: {
        companyName: input.companyName,
        businessUnit: forecast.businessUnit,
        year: input.year,
        month: input.month,
        forecastValue: new Prisma.Decimal(forecast.forecastValue),
        confidenceScore:
          forecast.confidenceScore === null ? null : new Prisma.Decimal(forecast.confidenceScore),
        modelVersion: input.modelVersion,
        explanation: forecast.explanation,
        generatedAt: input.generatedAt
      },
      update: {
        forecastValue: new Prisma.Decimal(forecast.forecastValue),
        confidenceScore:
          forecast.confidenceScore === null ? null : new Prisma.Decimal(forecast.confidenceScore),
        explanation: forecast.explanation,
        generatedAt: input.generatedAt
      }
    });
    written += 1;
  }

  return written;
}

function selectBusinessUnitsForGeneration(input: {
  rows: PetyrForecastEntryBusinessUnitContext[];
  cachedBusinessUnits: Set<PetyrBusinessUnit>;
  force: boolean;
}) {
  return input.rows.filter((row) => {
    const businessUnit = normalizeBusinessUnit(row.businessUnit);
    if (!businessUnit) return false;
    if (input.force) return true;
    return !input.cachedBusinessUnits.has(businessUnit);
  });
}

export async function runAiForecastBatch(input: AiForecastBatchInput = {}): Promise<AiForecastBatchResult> {
  if (isAiForecastBatchDisabledForManualMvp()) {
    throw new AiForecastBatchError(AI_FORECAST_BATCH_DISABLED_MESSAGE, 410);
  }

  const diagnostics: string[] = [];
  const dryRun = parseBoolean(input.dryRun, false);
  const force = parseBoolean(input.force, false);
  const year = parseYear(input.year);
  const month = parseMonth(input.month);
  const limit = parseInteger(input.limit, DEFAULT_BATCH_LIMIT, { min: 1, max: MAX_BATCH_LIMIT });
  const offset = parseInteger(input.offset, 0, { min: 0, max: 100000 });
  const delayMs = parseInteger(input.delayMs, DEFAULT_DELAY_MS, { min: 0, max: MAX_DELAY_MS });
  const companyName = asString(input.companyName);
  const csmName = asString(input.csmName);
  const modelSetting = await getPetyrAiModelSetting();
  const modelVersion = modelSetting.selectedModel;
  const apiKey = getOpenRouterApiKey();

  if (!dryRun && !apiKey) {
    throw new AiForecastBatchError("OPENROUTER_API_KEY is not configured. Run with dryRun=true to preview the batch.", 503);
  }

  const companiesResult = await getForecastEntryCompanies();
  diagnostics.push(...companiesResult.diagnostics);

  const cachedCoverage =
    dryRun || force
      ? new Map<string, Set<PetyrBusinessUnit>>()
      : await readCachedCoverage({ year, month, modelVersion });
  const candidates = filterCandidates(toCandidateCompanies(companiesResult.data), { companyName, csmName })
    .filter((candidate) => dryRun || force || needsForecastCache({ candidate, coverage: cachedCoverage }))
    .slice(offset, offset + limit);
  const results: AiForecastBatchCompanyResult[] = [];
  let forecastRowsWritten = 0;

  for (const [index, candidate] of candidates.entries()) {
    if (index > 0 && delayMs > 0 && !dryRun) {
      await sleep(delayMs);
    }

    try {
      const contextResult = await getForecastEntryContext(candidate.csmName, candidate.companyName, year, month);
      diagnostics.push(...contextResult.diagnostics);

      const cachedBusinessUnits = await readCachedBusinessUnits({
        companyName: contextResult.data.companyName,
        year,
        month,
        modelVersion
      });
      const businessUnits = selectBusinessUnitsForGeneration({
        rows: contextResult.data.businessUnits,
        cachedBusinessUnits,
        force: force || dryRun
      });

      if (businessUnits.length === 0) {
        results.push({
          companyName: contextResult.data.companyName,
          csmName: contextResult.data.csmName || candidate.csmName,
          status: "skipped",
          reason: force ? "No official Business Units available." : "AI forecast cache already contains this company for the selected model.",
          forecasts: []
        });
        continue;
      }

      const generatedAt = new Date();
      const generatedForecasts = dryRun
        ? buildDryRunForecasts({
            businessUnits
          })
        : await generateForecastsWithOpenRouter({
            apiKey: apiKey as string,
            modelVersion,
            companyName: contextResult.data.companyName,
            csmName: contextResult.data.csmName || candidate.csmName,
            year,
            month,
            businessUnits
          });
      const allowedBusinessUnits = new Set(businessUnits.map((row) => normalizeBusinessUnit(row.businessUnit)));
      const writableForecasts = generatedForecasts.filter((forecast) =>
        allowedBusinessUnits.has(forecast.businessUnit)
      );

      if (!dryRun) {
        forecastRowsWritten += await writeForecasts({
          companyName: contextResult.data.companyName,
          year,
          month,
          modelVersion,
          generatedAt,
          forecasts: writableForecasts
        });
      }

      results.push({
        companyName: contextResult.data.companyName,
        csmName: contextResult.data.csmName || candidate.csmName,
        status: "processed",
        reason: dryRun ? "Dry-run only; no OpenRouter call was made and no cache rows were written." : null,
        forecasts: writableForecasts.map((forecast) => ({
          businessUnit: forecast.businessUnit,
          forecastValue: forecast.forecastValue,
          confidenceScore: forecast.confidenceScore,
          modelVersion,
          explanation: forecast.explanation,
          generatedAt: generatedAt.toISOString(),
          status: dryRun ? "dry_run" : "cached"
        }))
      });
    } catch (error) {
      results.push({
        companyName: candidate.companyName,
        csmName: candidate.csmName,
        status: "failed",
        reason: error instanceof Error ? error.message : String(error),
        forecasts: []
      });
    }
  }

  return {
    ok: true,
    dryRun,
    year,
    month,
    modelVersion,
    limit,
    offset,
    delayMs,
    processedCompanies: results.filter((row) => row.status === "processed").length,
    skippedCompanies: results.filter((row) => row.status === "skipped").length,
    failedCompanies: results.filter((row) => row.status === "failed").length,
    forecastRowsWritten,
    companies: results,
    diagnostics: uniqueDiagnostics(diagnostics)
  };
}
