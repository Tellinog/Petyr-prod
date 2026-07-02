import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { PETYR_BUSINESS_UNITS, type PetyrBusinessUnit } from "@/lib/petyr/constants";
import {
  createPetyrForecastIntelligenceCacheAdapter
} from "@/services/petyrForecastIntelligenceCacheService";
import {
  PETYR_FORECAST_INTELLIGENCE_OUTPUT_SCHEMA_VERSION,
  PETYR_FORECAST_INTELLIGENCE_PAYLOAD_VERSION,
  PETYR_FORECAST_INTELLIGENCE_PROMPT_VERSION,
  buildPetyrForecastIntelligenceCsmChangeNotes,
  generatePetyrForecastIntelligence,
  type PetyrForecastIntelligenceCsmChangeNote,
  type PetyrForecastIntelligenceEvidenceRegistryEntry,
  type PetyrForecastIntelligenceOutput,
  type PetyrForecastIntelligencePayload,
  type PetyrForecastIntelligenceRunResult
} from "@/services/petyrForecastIntelligenceService";
import {
  buildCompanyBuForecastSignals,
  type PetyrAiForecastCandidate
} from "@/services/petyrAiForecastStrategyService";
import { getPetyrAiModelSettingWithDiagnostics } from "@/services/petyrAiModelSettingsService";
import type {
  PetyrAiForecastAlgorithmSummary,
  PetyrAiForecastConfidenceBreakdown,
  PetyrAiForecastIncludedSignal,
  PetyrAiForecastManualForecastRow,
  PetyrAiForecastManualValidationError,
  PetyrAiForecastNumericMetric,
  PetyrAiForecastOpenRouterDebug,
  PetyrAiForecastRowExplainability,
  PetyrAiForecastSelectedYearAggregates
} from "@/types/petyrAiForecastManualAction";

const MISSING_KEY_VALUES = new Set(["", "replace_me"]);

type RawCompanyPreviewPayload = {
  companyName?: unknown;
  companyNames?: unknown;
  year?: unknown;
  dryRun?: unknown;
  llmPreview?: unknown;
  useLlmPreview?: unknown;
  includeLlmPreview?: unknown;
  forceRefresh?: unknown;
};

type CurrentRunForecastRow = Omit<PetyrAiForecastManualForecastRow, "businessUnit"> & {
  businessUnit: PetyrBusinessUnit;
  modelVersion: string;
  generatedAt: string;
};

type AiForecastCacheSavedRow = {
  company: string;
  businessUnit: PetyrBusinessUnit;
  year: number;
  month: number;
  forecastValue: number;
  confidenceScore: number | null;
  explanation: string;
  modelVersion: string;
  generatedAt: string;
  action: "created";
};

type AiForecastCacheSkippedRow = {
  company: string;
  businessUnit: PetyrBusinessUnit | null;
  year: number;
  month: number | null;
  modelVersion: string;
  reason: string;
};

type AiForecastCacheSaveReport = {
  savedRows: number;
  skippedRows: number;
  validationErrors: PetyrAiForecastManualValidationError[];
  modelVersion: string;
  savedRowDetails: AiForecastCacheSavedRow[];
  skippedRowDetails: AiForecastCacheSkippedRow[];
};

export type PetyrDeterministicAiForecastCacheKeyInput = {
  companyName: string;
  businessUnit: string;
  year: number;
  month: number;
  modelVersion: string;
};

export type PetyrAiForecastCompanyAiIntelligence = {
  requested: boolean;
  ok: boolean;
  status: "not_requested" | "success" | "failed" | "cached";
  provider: "openrouter";
  model: string;
  promptVersion: string;
  outputSchemaVersion: string;
  inputHash: string | null;
  output: PetyrForecastIntelligenceOutput | null;
  errorMessage: string | null;
  validationErrors: PetyrAiForecastManualValidationError[];
  openRouterCalled: boolean;
  retried: boolean;
  cacheAction: "created" | "updated" | "reused" | "none";
  generatedAt: string | null;
};

export type PetyrAiForecastCompanyPreviewResult = {
  ok: true;
  endpoint: "/api/petyr/ai-forecast/company";
  dryRun: true;
  wroteToDatabase: boolean;
  companyName: string;
  requestedCompanyName: string;
  year: number;
  asOfDate: string;
  eligibleMonths: number[];
  modelVersion: string;
  deterministicCandidatesCount: number;
  preview: {
    schema_version: "petyr_local_deterministic_forecast_v1";
    forecasts: CurrentRunForecastRow[];
    warnings: Array<{ code: string; message: string }>;
  };
  llmPayloadPreview: Record<string, unknown>;
  aiIntelligence: PetyrAiForecastCompanyAiIntelligence;
  algorithmSummary: PetyrAiForecastAlgorithmSummary;
  selectedYearAggregates: PetyrAiForecastSelectedYearAggregates;
  openRouterDebug: PetyrAiForecastOpenRouterDebug;
  diagnostics: string[];
};

export type PetyrAiForecastCompanySaveResult = {
  ok: boolean;
  endpoint: "/api/petyr/ai-forecast/company";
  dryRun: false;
  wroteToDatabase: boolean;
  companyName: string;
  requestedCompanyName: string;
  year: number;
  asOfDate: string;
  eligibleMonths: number[];
  modelVersion: string;
  generatedAt: string;
  deterministicCandidatesCount: number;
  forecasts: CurrentRunForecastRow[];
  aiIntelligence: PetyrAiForecastCompanyAiIntelligence;
  algorithmSummary: PetyrAiForecastAlgorithmSummary;
  selectedYearAggregates: PetyrAiForecastSelectedYearAggregates;
  openRouterDebug: PetyrAiForecastOpenRouterDebug;
  report: AiForecastCacheSaveReport;
  diagnostics: string[];
  error?: string;
};

export type PetyrDeterministicAiForecastCacheSaveResult = {
  ok: boolean;
  companyName: string;
  requestedCompanyName: string;
  year: number;
  asOfDate: string;
  eligibleMonths: number[];
  modelVersion: string;
  generatedAt: string;
  deterministicCandidatesCount: number;
  forecasts: CurrentRunForecastRow[];
  report: AiForecastCacheSaveReport;
  diagnostics: string[];
};

export class PetyrAiForecastCompanyPreviewError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "PetyrAiForecastCompanyPreviewError";
    this.status = status;
  }
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return fallback;

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "n"].includes(normalized)) return false;
  return fallback;
}

function parseRequiredYear(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(asString(value));

  if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 2100) {
    throw new PetyrAiForecastCompanyPreviewError("year must be an integer between 2000 and 2100.");
  }

  return parsed;
}

function rejectBatchPayload(input: RawCompanyPreviewPayload) {
  if (Array.isArray(input.companyName) || Array.isArray(input.companyNames) || input.companyNames !== undefined) {
    throw new PetyrAiForecastCompanyPreviewError(
      "This endpoint accepts exactly one companyName string. Use one request per company."
    );
  }
}

function roundNonNegativeMoney(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, value));
}

function roundSignedMoney(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

function roundMoney(value: number) {
  return roundNonNegativeMoney(value);
}

function metricAvailable(value: number, reason: string | null = null): PetyrAiForecastNumericMetric {
  return { value: roundMoney(value), availability: "available", reason };
}

function metricNotAvailable(reason: string): PetyrAiForecastNumericMetric {
  return { value: null, availability: "notAvailable", reason };
}

function uniqueDiagnostics(values: string[]) {
  return [...new Set(values)];
}

function getOpenRouterApiKey() {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  return MISSING_KEY_VALUES.has(apiKey) ? null : apiKey;
}

function normalizeAgreementSignal(candidate: PetyrAiForecastCandidate) {
  return {
    activeAgreementCount: candidate.agreementResidualSignal.activeAgreementCount,
    residualValue: roundMoney(candidate.agreementResidualSignal.residualValue),
    futureExpiry: candidate.agreementResidualSignal.futureExpiry,
    forecastCoverageValue: roundMoney(candidate.agreementResidualSignal.forecastCoverageValue),
    coverageGap: roundMoney(candidate.agreementResidualSignal.coverageGap),
    status: candidate.agreementResidualSignal.status
  };
}

function deterministicConfidenceBreakdown(candidate: PetyrAiForecastCandidate): PetyrAiForecastConfidenceBreakdown {
  const baseScore = candidate.baselineForecast > 0 ? 0.62 : 0.28;
  let confidence = baseScore;
  const flags = new Set(candidate.dataQualityFlags);
  const adjustments: PetyrAiForecastConfidenceBreakdown["adjustments"] = [];

  function addAdjustment(code: string, label: string, delta: number, reason: string) {
    confidence += delta;
    adjustments.push({ code, label, delta, reason });
  }

  if (candidate.plannedCampaignsValue > 0) addAdjustment("planned_future_present", "Planned future present", 0.08, "Valid planned future campaign value exists for this target month.");
  if (flags.has("sparse_history")) addAdjustment("sparse_history", "Sparse history", -0.08, "Fewer than the strong-history threshold of prior closed-revenue months were available.");
  if (flags.has("no_historical_closed_revenue")) addAdjustment("no_historical_closed_revenue", "No historical closed revenue", -0.12, "No prior closed revenue was found for this company and Business Unit.");
  if (flags.has("zero_baseline")) addAdjustment("zero_baseline", "Zero baseline", -0.1, "The deterministic baseline is zero because no positive historical, run-rate or planned signal was available.");
  if (flags.has("agreement_residual_gap")) addAdjustment("agreement_residual_gap", "Agreement residual gap", -0.03, "Historical-guided residual allocation is not covered by future deterministic baseline coverage.");

  return {
    mode: "deterministic_rule_based_score",
    score: Math.round(Math.min(Math.max(confidence, 0.15), 0.82) * 10000) / 10000,
    baseScore,
    adjustments,
    minScore: 0.15,
    maxScore: 0.82,
    notAvailableReason: null
  };
}

function confidenceFromCandidate(candidate: PetyrAiForecastCandidate) {
  return deterministicConfidenceBreakdown(candidate).score ?? null;
}

function driversFromCandidate(candidate: PetyrAiForecastCandidate) {
  const drivers = new Set<string>();

  if (candidate.historicalWeightedBaseline > 0) drivers.add("historical_weighted_baseline");
  if (candidate.seasonalitySignal > 0) drivers.add("monthly_seasonality");
  if (candidate.runRateSignal > 0) drivers.add("run_rate");
  if (candidate.plannedCampaignsValue > 0) drivers.add("planned_campaigns_target_month");
  if (candidate.activeAgreementResidual > 0) drivers.add("agreement_residual_allocation");
  if (candidate.agreementResidualAllocation.status === "capped") drivers.add("agreement_residual_cap_applied");
  if (candidate.agreementResidualAllocation.plannedExceedsResidual) drivers.add("planned_exceeds_residual_allowance");
  if (candidate.businessUnitAttribution.method !== "none") drivers.add("bu_attribution_" + candidate.businessUnitAttribution.method);
  if (candidate.trendSignal.direction !== "neutral") drivers.add("trend_" + candidate.trendSignal.direction);
  if (candidate.trendSignal.summerSlowdown) drivers.add("summer_slowdown_detected");
  if (candidate.trendSignal.overConsumption) drivers.add("over_consumption_vs_history");
  if (candidate.consultativeScenarios.length > 0) drivers.add("consultative_scenarios_100_eur");
  for (const flag of candidate.dataQualityFlags) drivers.add(flag);

  if (drivers.size === 0) drivers.add("deterministic_baseline");
  return [...drivers];
}

function explanationFromCandidate(candidate: PetyrAiForecastCandidate) {
  const explanation = candidate.explanationParts.slice(0, 3).join(" ");
  return explanation || "Deterministic forecast built from available Petyr baseline signals.";
}

function adviceFromCandidate(candidate: PetyrAiForecastCandidate) {
  if (candidate.adviceCandidate) return candidate.adviceCandidate;
  if (candidate.baselineForecast === 0) return "Zero baseline: no positive historical, run-rate or planned target-month evidence is available.";
  return "Deterministic forecast value is local source of truth; Forecast Intelligence adds consultative context only.";
}

function positiveSignalAverage(candidate: PetyrAiForecastCandidate) {
  const values = [
    candidate.historicalWeightedBaseline,
    candidate.seasonalitySignal,
    candidate.runRateSignal
  ].filter((value) => value > 0);

  if (values.length === 0) return 0;
  return roundMoney(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function includedSignal(input: {
  code: string;
  label: string;
  role: PetyrAiForecastIncludedSignal["role"];
  value: number | null;
  reason: string;
}): PetyrAiForecastIncludedSignal {
  return {
    code: input.code,
    label: input.label,
    role: input.role,
    value: input.value === null ? null : roundMoney(input.value),
    numericWeight: null,
    weightReason: "When configured, Management/Finance weights apply to positive historical/seasonality/run-rate signals and are renormalized across available signals; otherwise the compatible positive-signal average is used. Planned future remains a floor.",
    reason: input.reason
  };
}

function buildIncludedSignals(candidate: PetyrAiForecastCandidate): PetyrAiForecastIncludedSignal[] {
  const signals: PetyrAiForecastIncludedSignal[] = [];

  if (candidate.historicalWeightedBaseline > 0) signals.push(includedSignal({ code: "historical_weighted_baseline", label: "Historical weighted baseline", role: "numeric_baseline_signal", value: candidate.historicalWeightedBaseline, reason: "Positive historical weighted signal participates in the positive-signal average." }));
  if (candidate.seasonalitySignal > 0) signals.push(includedSignal({ code: "monthly_seasonality", label: "Monthly seasonality", role: "numeric_baseline_signal", value: candidate.seasonalitySignal, reason: "Positive seasonality signal participates in the positive-signal average." }));
  if (candidate.runRateSignal > 0) signals.push(includedSignal({ code: "run_rate", label: "Run-rate", role: "numeric_baseline_signal", value: candidate.runRateSignal, reason: "Positive run-rate signal participates in the positive-signal average." }));
  if (candidate.plannedCampaignsValue > 0) signals.push(includedSignal({ code: "planned_campaigns", label: "Planned campaigns", role: "planned_future_floor", value: candidate.plannedCampaignsValue, reason: "Valid Setup/Recruiting planned future campaign value is used as the baseline floor for this month only." }));
  if (candidate.agreementResidualAllocation.status !== "not_applicable") signals.push(includedSignal({ code: "agreement_residual_allocation", label: "Agreement residual allocation", role: "agreement_residual_allocation", value: candidate.agreementResidualAllocation.allocatedResidualValue, reason: "Active residual is distributed over remaining agreement months and attributed by sanitized BU title tokens, linked campaign history or company BU history." }));
  if (candidate.businessUnitAttribution.method !== "none") signals.push(includedSignal({ code: "business_unit_attribution", label: "Business Unit attribution", role: "business_unit_attribution", value: null, reason: "Residual attribution uses " + candidate.businessUnitAttribution.method.replaceAll("_", " ") + " with " + candidate.businessUnitAttribution.confidence + " confidence." }));
  if (candidate.trendSignal.flags.length > 0) signals.push(includedSignal({ code: "trend_signal", label: "Trend signal", role: "trend_signal", value: null, reason: "Trend direction is " + candidate.trendSignal.direction + "; flags: " + candidate.trendSignal.flags.join(", ") + "." }));
  const nearestScenario = candidate.consultativeScenarios.find((scenario) => scenario.id === "nearest_100");
  if (nearestScenario) signals.push(includedSignal({ code: "consultative_scenario_nearest_100", label: "Consultative 100 EUR scenario", role: "consultative_scenario", value: nearestScenario.value, reason: "Scenario is available for consultative interpretation only; saved value remains deterministic." }));

  return signals;
}

function buildExcludedSignals(candidate: PetyrAiForecastCandidate): PetyrAiForecastRowExplainability["excludedSignals"] {
  const excluded: PetyrAiForecastRowExplainability["excludedSignals"] = [];

  if (candidate.historicalWeightedBaseline <= 0) excluded.push({ code: "historical_weighted_baseline", label: "Historical weighted baseline", role: "numeric_baseline_signal", value: candidate.historicalWeightedBaseline, reason: "Computed value is zero, usually because no prior closed revenue exists for this company and Business Unit." });
  if (candidate.seasonalitySignal <= 0) excluded.push({ code: "monthly_seasonality", label: "Monthly seasonality", role: "numeric_baseline_signal", value: candidate.seasonalitySignal, reason: "Computed value is zero because comparable historical seasonality was unavailable." });
  if (candidate.runRateSignal <= 0) excluded.push({ code: "run_rate", label: "Run-rate", role: "numeric_baseline_signal", value: candidate.runRateSignal, reason: "Computed value is zero because completed historical months for a run-rate were unavailable." });
  if (candidate.plannedCampaignsValue <= 0) excluded.push({ code: "planned_campaigns", label: "Planned campaigns", role: "planned_future_floor", value: candidate.plannedCampaignsValue, reason: "No valid Setup/Recruiting planned future campaign value exists for this target month." });
  if (candidate.activeAgreementResidual <= 0) {
    excluded.push({ code: "agreement_residual_allocation", label: "Agreement residual allocation", role: "agreement_residual_allocation", value: 0, reason: "No active future agreement residual is available for this company and month." });
  } else {
    excluded.push({ code: "agreement_residual_direct_uplift", label: "Agreement residual direct uplift", role: "driver_advice_only", value: candidate.residualCoverageGap, reason: "Residual is never used as an uncapped uplift; only the agreement-linked component can be capped by local historical-guided allocation." });
  }

  return excluded;
}

function buildExplainability(candidate: PetyrAiForecastCandidate): PetyrAiForecastRowExplainability {
  const baselineForecast = roundMoney(candidate.roundedForecastValue);
  const agreementResidualSignal = normalizeAgreementSignal(candidate);

  return {
    weightingMode: "positive_signal_average_with_planned_floor",
    calibratedWeights: null,
    calibratedWeightsAvailability: {
      availability: "notAvailable",
      reason: "The deterministic algorithm can use Petyr Admin Management/Finance weights when configured; otherwise it uses the compatible positive-signal average fallback."
    },
    plannedFutureRole: "floor",
    residualPressureRole: "historical_guided_allocation_cap",
    formula: "deterministicForecastValue = roundedForecastValue; Forecast Intelligence interprets local scenarios and cannot modify numbers.",
    positiveSignalAverage: metricAvailable(positiveSignalAverage(candidate)),
    historicalWeightedBaseline: metricAvailable(candidate.historicalWeightedBaseline),
    seasonalitySignal: metricAvailable(candidate.seasonalitySignal),
    runRateSignal: metricAvailable(candidate.runRateSignal),
    plannedCampaignsValue: metricAvailable(candidate.plannedCampaignsValue),
    baselineForecast: metricAvailable(baselineForecast),
    aiForecastValue: metricAvailable(baselineForecast),
    finalAiAdjustment: metricAvailable(0, "OpenRouter is interpretation-only and cannot adjust deterministic forecast values."),
    agreementResidualSignal,
    roundedForecastValue: candidate.roundedForecastValue,
    roundingGranularity: candidate.roundingGranularity,
    trendSignal: candidate.trendSignal,
    agreementResidualAllocation: candidate.agreementResidualAllocation,
    businessUnitAttribution: candidate.businessUnitAttribution,
    consultativeScenarios: candidate.consultativeScenarios,
    dataQualityFlags: candidate.dataQualityFlags,
    includedSignals: buildIncludedSignals(candidate),
    excludedSignals: buildExcludedSignals(candidate),
    drivers: driversFromCandidate(candidate),
    explanation: explanationFromCandidate(candidate),
    advice: adviceFromCandidate(candidate),
    confidenceScore: confidenceFromCandidate(candidate),
    confidenceBreakdown: deterministicConfidenceBreakdown(candidate)
  };
}

function buildDeterministicRows(input: {
  candidates: PetyrAiForecastCandidate[];
  modelVersion: string;
  generatedAt: string;
}): CurrentRunForecastRow[] {
  return input.candidates.map((candidate) => {
    const baselineForecast = roundMoney(candidate.roundedForecastValue);

    return {
      source: "deterministic_dry_run",
      businessUnit: candidate.businessUnit,
      year: candidate.year,
      month: candidate.month,
      baselineForecast,
      plannedCampaignsValue: roundMoney(candidate.plannedCampaignsValue),
      agreementResidualSignal: normalizeAgreementSignal(candidate),
      roundedForecastValue: candidate.roundedForecastValue,
      roundingGranularity: candidate.roundingGranularity,
      trendSignal: candidate.trendSignal,
      agreementResidualAllocation: candidate.agreementResidualAllocation,
      businessUnitAttribution: candidate.businessUnitAttribution,
      consultativeScenarios: candidate.consultativeScenarios,
      aiForecastValue: baselineForecast,
      finalAiAdjustment: 0,
      confidenceScore: confidenceFromCandidate(candidate),
      explanation: explanationFromCandidate(candidate),
      advice: adviceFromCandidate(candidate),
      drivers: driversFromCandidate(candidate),
      explainability: buildExplainability(candidate),
      modelVersion: input.modelVersion,
      generatedAt: input.generatedAt
    };
  });
}

function algorithmSummary(): PetyrAiForecastAlgorithmSummary {
  return {
    code: "petyr_hybrid_company_bu_month_v1",
    version: 1,
    deterministicFormulaExplanation:
      "For each selected company + official Business Unit + eligible future month, Petyr computes historical weighted baseline, monthly seasonality, run-rate, local trend/seasonality signals, target-month planned campaign floor and historical-guided agreement residual allocation/caps.",
    weightingMode: "positive_signal_average_with_planned_floor",
    usesCalibratedWeights: false,
    calibratedWeights: null,
    plannedFutureRole: "floor",
    residualPressureRole: "historical_guided_allocation_cap",
    llmAdjustmentExplanation:
      "OpenRouter is now interpretation-only. It receives the deterministic forecast payload after local math completes and cannot calculate, modify or overwrite forecast values.",
    validationAuthorityExplanation:
      "Petyr server code owns eligible months, official Business Units, numeric validation, input hashing, cache persistence and deterministic forecast values.",
    currentLimitations: [
      "Management/Finance weights are configurable in Petyr Admin; until saved, Petyr uses the compatible positive-signal average fallback.",
      "Agreement residual allocation is historical-guided and may still be low-confidence when no sanitized BU title token or linked campaign history is available.",
      "CSM-entered monthly and annual forecast values stay available for UI comparison, but they are intentionally excluded from the OpenRouter payload.",
      "OpenRouter output is saved as structured Forecast Intelligence JSON and cannot change deterministic numbers."
    ]
  };
}

function sumRows(rows: CurrentRunForecastRow[], readValue: (row: CurrentRunForecastRow) => number) {
  return roundMoney(rows.reduce((sum, row) => sum + readValue(row), 0));
}

function buildSelectedYearAggregates(input: {
  signals: Awaited<ReturnType<typeof buildCompanyBuForecastSignals>>;
  forecasts: CurrentRunForecastRow[];
}): PetyrAiForecastSelectedYearAggregates {
  const context = input.signals.selectedYearContext;
  const forecastRowsByBusinessUnit = new Map<string, CurrentRunForecastRow[]>();
  const forecastRowsByMonth = new Map<number, CurrentRunForecastRow[]>();
  const monthlyTrendByMonth = new Map(context.monthlyTrend.map((row) => [row.month, row]));
  const summaryByBusinessUnit = new Map(context.businessUnitSummary.map((row) => [row.businessUnit, row]));

  for (const forecast of input.forecasts) {
    forecastRowsByBusinessUnit.set(forecast.businessUnit, [
      ...(forecastRowsByBusinessUnit.get(forecast.businessUnit) ?? []),
      forecast
    ]);
    forecastRowsByMonth.set(forecast.month, [
      ...(forecastRowsByMonth.get(forecast.month) ?? []),
      forecast
    ]);
  }

  const annualForecastByBusinessUnit = new Map<string, { rows: number; value: number }>();
  for (const row of context.annualForecasts) {
    const existing = annualForecastByBusinessUnit.get(row.businessUnit) ?? { rows: 0, value: 0 };
    existing.rows += 1;
    existing.value += row.value;
    annualForecastByBusinessUnit.set(row.businessUnit, existing);
  }

  const monthlyForecastByMonthAndType = new Map<string, { rows: number; value: number }>();
  for (const row of context.monthlyForecasts) {
    const key = [row.month, row.forecastType].join("\u0000");
    const existing = monthlyForecastByMonthAndType.get(key) ?? { rows: 0, value: 0 };
    existing.rows += 1;
    existing.value += row.value;
    monthlyForecastByMonthAndType.set(key, existing);
  }

  const noEligibleReason = input.signals.eligibleMonths.length === 0
    ? "No eligible future months exist for the selected year; past and current months are excluded."
    : null;

  return {
    businessUnits: PETYR_BUSINESS_UNITS.map((businessUnit) => {
      const currentRunRows = forecastRowsByBusinessUnit.get(businessUnit) ?? [];
      const summary = summaryByBusinessUnit.get(businessUnit);
      const annualForecast = annualForecastByBusinessUnit.get(businessUnit);

      return {
        businessUnit,
        closedRevenueYtd: summary ? metricAvailable(summary.actualRevenue) : metricNotAvailable("Selected-year Business Unit summary was not available."),
        plannedFutureValue: summary ? metricAvailable(summary.plannedFuture) : metricNotAvailable("Selected-year planned future value was not available."),
        deterministicBaselineFutureTotal: metricAvailable(sumRows(currentRunRows, (row) => row.baselineForecast), noEligibleReason),
        aiForecastFutureTotal: metricAvailable(sumRows(currentRunRows, (row) => row.aiForecastValue), noEligibleReason),
        csmAnnualForecast: annualForecast && annualForecast.rows > 0 ? metricAvailable(annualForecast.value) : metricNotAvailable("No selected-year CSM-owned annual forecast row is available."),
        residualPressureGap: currentRunRows.length > 0 ? metricAvailable(sumRows(currentRunRows, (row) => row.agreementResidualSignal.coverageGap), noEligibleReason) : metricNotAvailable("No current-run deterministic forecast row is available for residual allocation.")
      };
    }),
    monthlySeries: Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const trend = monthlyTrendByMonth.get(month);
      const monthRows = forecastRowsByMonth.get(month) ?? [];
      const previous = monthlyForecastByMonthAndType.get([month, "previous_month"].join("\u0000"));
      const ongoing = monthlyForecastByMonthAndType.get([month, "ongoing"].join("\u0000"));
      const eligible = input.signals.eligibleMonths.includes(month);
      const unavailableReason = eligible
        ? "No current-run deterministic forecast row was produced for this eligible month."
        : "This month is not eligible for current-run AI Forecast; past and current months are excluded.";

      return {
        month,
        closedRevenue: trend ? metricAvailable(trend.actualRevenue) : metricNotAvailable("Selected-year monthly closed revenue trend was not available."),
        previousMonthForecast: previous && previous.rows > 0 ? metricAvailable(previous.value) : metricNotAvailable("No saved previous-month forecast rows are available for this company/month."),
        ongoingForecast: ongoing && ongoing.rows > 0 ? metricAvailable(ongoing.value) : metricNotAvailable("No saved ongoing forecast rows are available for this company/month."),
        deterministicBaseline: monthRows.length > 0 ? metricAvailable(sumRows(monthRows, (row) => row.baselineForecast)) : metricNotAvailable(unavailableReason),
        aiForecast: monthRows.length > 0 ? metricAvailable(sumRows(monthRows, (row) => row.aiForecastValue)) : metricNotAvailable(unavailableReason),
        aiForecastSource: monthRows.length > 0 ? "current_run" : "notAvailable",
        plannedCampaignValue: monthRows.length > 0 ? metricAvailable(sumRows(monthRows, (row) => row.plannedCampaignsValue)) : metricNotAvailable(unavailableReason)
      };
    }),
    notes: [
      "AI Forecast numeric rows are local deterministic forecast values.",
      "OpenRouter Forecast Intelligence is interpretation-only and cannot change these numbers.",
      "Previous-month and ongoing forecast metrics are null/notAvailable when no saved forecast rows exist."
    ]
  };
}

function evidenceId(...parts: Array<string | number>) {
  return parts
    .join(".")
    .replace(/[^a-zA-Z0-9_.-]+/g, "_")
    .replace(/_+/g, "_")
    .toLowerCase();
}

function formatEur(value: number) {
  const rounded = roundSignedMoney(value);
  return `${rounded} EUR`;
}

function registryEntry(input: {
  id: string;
  label: string;
  displayValue: string;
  kind: PetyrForecastIntelligenceEvidenceRegistryEntry["kind"];
  businessUnit?: PetyrBusinessUnit;
  month?: number;
  path?: string;
  metadata?: Record<string, string | number | boolean | null>;
}): PetyrForecastIntelligenceEvidenceRegistryEntry {
  return {
    id: input.id,
    label: input.label,
    display_value: `${input.label}: ${input.displayValue}`,
    kind: input.kind,
    ...(input.businessUnit ? { business_unit: input.businessUnit } : {}),
    ...(input.month ? { month: input.month } : {}),
    ...(input.path ? { path: input.path } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {})
  };
}

function buildDeterministicEvidenceRegistry(input: {
  forecasts: CurrentRunForecastRow[];
  selectedYearRealSignals: Awaited<ReturnType<typeof buildCompanyBuForecastSignals>>["selectedYearRealSignals"];
  localDeltas: PetyrForecastIntelligencePayload["local_deltas"];
  totals: PetyrForecastIntelligencePayload["deterministic_forecast"]["totals"];
}): PetyrForecastIntelligenceEvidenceRegistryEntry[] {
  const entries: PetyrForecastIntelligenceEvidenceRegistryEntry[] = [
    registryEntry({
      id: "total.deterministic_forecast_value",
      label: "Total deterministic forecast",
      displayValue: formatEur(input.totals.deterministic_forecast_value),
      kind: "forecast_total",
      path: "deterministic_forecast.totals.deterministic_forecast_value"
    }),
    registryEntry({
      id: "total.planned_campaigns_value",
      label: "Total planned campaigns",
      displayValue: formatEur(input.totals.planned_campaigns_value),
      kind: "planned_value",
      path: "deterministic_forecast.totals.planned_campaigns_value"
    }),
    registryEntry({
      id: "total.residual_coverage_gap",
      label: "Total residual coverage gap",
      displayValue: formatEur(input.totals.residual_coverage_gap),
      kind: "residual_gap",
      path: "deterministic_forecast.totals.residual_coverage_gap"
    })
  ];

  for (const row of input.forecasts) {
    entries.push(
      registryEntry({
        id: evidenceId("bu", row.businessUnit, "month", row.month, "forecast"),
        label: `${row.businessUnit} month ${row.month} deterministic forecast`,
        displayValue: formatEur(row.aiForecastValue),
        kind: "forecast_total",
        businessUnit: row.businessUnit,
        month: row.month,
        path: "deterministic_forecast.rows[].deterministic_forecast_value"
      }),
      registryEntry({
        id: evidenceId("bu", row.businessUnit, "month", row.month, "planned"),
        label: `${row.businessUnit} month ${row.month} planned campaigns`,
        displayValue: formatEur(row.plannedCampaignsValue),
        kind: "planned_value",
        businessUnit: row.businessUnit,
        month: row.month,
        path: "deterministic_forecast.rows[].planned_campaigns_value"
      }),
      registryEntry({
        id: evidenceId("bu", row.businessUnit, "month", row.month, "residual_gap"),
        label: `${row.businessUnit} month ${row.month} residual gap`,
        displayValue: formatEur(row.agreementResidualSignal.coverageGap),
        kind: "residual_gap",
        businessUnit: row.businessUnit,
        month: row.month,
        path: "deterministic_forecast.rows[].residual_coverage_gap"
      }),
      registryEntry({
        id: evidenceId("bu", row.businessUnit, "month", row.month, "active_agreement_count"),
        label: `${row.businessUnit} month ${row.month} active residual agreements`,
        displayValue: String(row.agreementResidualSignal.activeAgreementCount),
        kind: "campaign_count",
        businessUnit: row.businessUnit,
        month: row.month,
        path: "deterministic_forecast.rows[].agreement_residual_allocation.active_agreement_count"
      })
    );

    if (row.agreementResidualAllocation.remainingMonths !== null) {
      entries.push(registryEntry({
        id: evidenceId("bu", row.businessUnit, "month", row.month, "remaining_months"),
        label: `${row.businessUnit} month ${row.month} remaining agreement months`,
        displayValue: String(row.agreementResidualAllocation.remainingMonths),
        kind: "remaining_months",
        businessUnit: row.businessUnit,
        month: row.month,
        path: "deterministic_forecast.rows[].agreement_residual_allocation.remaining_months"
      }));
    }

    if (row.agreementResidualAllocation.monthsToExpiry !== null) {
      entries.push(registryEntry({
        id: evidenceId("bu", row.businessUnit, "month", row.month, "months_to_expiry"),
        label: `${row.businessUnit} month ${row.month} months to expiry`,
        displayValue: String(row.agreementResidualAllocation.monthsToExpiry),
        kind: "months_to_expiry",
        businessUnit: row.businessUnit,
        month: row.month,
        path: "deterministic_forecast.rows[].agreement_residual_allocation.months_to_expiry"
      }));
    }
  }

  for (const signal of input.selectedYearRealSignals) {
    entries.push(
      registryEntry({
        id: evidenceId("bu", signal.businessUnit, "closed_ytd"),
        label: `${signal.businessUnit} closed revenue YTD`,
        displayValue: formatEur(signal.closedRevenueYtd),
        kind: "closed_revenue",
        businessUnit: signal.businessUnit,
        path: "selected_year_real_signals[].closed_revenue_ytd"
      }),
      registryEntry({
        id: evidenceId("bu", signal.businessUnit, "planned_future"),
        label: `${signal.businessUnit} selected-year planned future`,
        displayValue: formatEur(signal.plannedFutureValue),
        kind: "planned_value",
        businessUnit: signal.businessUnit,
        path: "selected_year_real_signals[].planned_future_value"
      }),
      registryEntry({
        id: evidenceId("bu", signal.businessUnit, "closed_campaigns"),
        label: `${signal.businessUnit} closed campaign count`,
        displayValue: String(signal.closedRevenueCampaignsCount),
        kind: "campaign_count",
        businessUnit: signal.businessUnit,
        path: "selected_year_real_signals[].closed_revenue_campaigns_count"
      }),
      registryEntry({
        id: evidenceId("bu", signal.businessUnit, "planned_campaigns"),
        label: `${signal.businessUnit} planned campaign count`,
        displayValue: String(signal.plannedFutureCampaignsCount),
        kind: "campaign_count",
        businessUnit: signal.businessUnit,
        path: "selected_year_real_signals[].planned_future_campaigns_count"
      })
    );
  }

  for (const delta of input.localDeltas) {
    entries.push(
      registryEntry({
        id: evidenceId("bu", delta.business_unit, "delta", "deterministic_minus_planned"),
        label: `${delta.business_unit} deterministic minus planned`,
        displayValue: formatEur(delta.deterministic_minus_planned),
        kind: "signed_delta",
        businessUnit: delta.business_unit,
        path: "local_deltas[].deterministic_minus_planned"
      }),
      registryEntry({
        id: evidenceId("bu", delta.business_unit, "delta", "deterministic_minus_closed_ytd"),
        label: `${delta.business_unit} deterministic minus closed YTD`,
        displayValue: formatEur(delta.deterministic_minus_closed_ytd),
        kind: "signed_delta",
        businessUnit: delta.business_unit,
        path: "local_deltas[].deterministic_minus_closed_ytd"
      })
    );
  }

  return entries.filter((entry, index, all) => all.findIndex((candidate) => candidate.id === entry.id) === index);
}

function buildIntelligencePayload(input: {
  signals: Awaited<ReturnType<typeof buildCompanyBuForecastSignals>>;
  forecasts: CurrentRunForecastRow[];
  diagnostics: string[];
  csmChangeNotes: PetyrForecastIntelligenceCsmChangeNote[];
}): PetyrForecastIntelligencePayload {
  const forecastRowsByBusinessUnit = new Map<string, CurrentRunForecastRow[]>();
  for (const row of input.forecasts) {
    forecastRowsByBusinessUnit.set(row.businessUnit, [
      ...(forecastRowsByBusinessUnit.get(row.businessUnit) ?? []),
      row
    ]);
  }
  const selectedSignalsByBusinessUnit = new Map(input.signals.selectedYearRealSignals.map((row) => [row.businessUnit, row]));
  const dataQualityFlags = [...new Set(input.signals.candidates.flatMap((candidate) => candidate.dataQualityFlags))];
  const totalDeterministic = sumRows(input.forecasts, (row) => row.aiForecastValue);
  const totalBaseline = sumRows(input.forecasts, (row) => row.baselineForecast);
  const totalPlanned = sumRows(input.forecasts, (row) => row.plannedCampaignsValue);
  const totalResidualGap = sumRows(input.forecasts, (row) => row.agreementResidualSignal.coverageGap);
  const historySignalsOnly = roundMoney(
    input.signals.candidates.reduce((sum, candidate) => sum + positiveSignalAverage(candidate), 0)
  );
  const riskSignals: PetyrForecastIntelligencePayload["local_risk_signals"] = [];

  if (totalResidualGap > 0) {
    riskSignals.push({
      type: "under_consumption",
      severity: "high",
      metric: "residual_coverage_gap",
      evidence: "Local deterministic residual coverage gap is positive."
    });
  }
  if (dataQualityFlags.includes("sparse_history") || dataQualityFlags.includes("no_historical_closed_revenue")) {
    riskSignals.push({
      type: "data_quality",
      severity: "medium",
      metric: "historical_coverage",
      evidence: "Local deterministic forecast found sparse or missing history flags."
    });
  }
  if (dataQualityFlags.includes("zero_baseline")) {
    riskSignals.push({
      type: "data_quality",
      severity: "medium",
      metric: "zero_baseline",
      evidence: "At least one deterministic forecast row has zero baseline."
    });
  }

  if (dataQualityFlags.includes("planned_exceeds_residual_allowance")) {
    riskSignals.push({
      type: "under_consumption",
      severity: "high",
      metric: "planned_exceeds_residual_allowance",
      evidence: "At least one linked planned campaign exceeds the local residual allowance for its agreement/month."
    });
  }
  if (dataQualityFlags.includes("agreement_residual_cap_applied")) {
    riskSignals.push({
      type: "under_consumption",
      severity: "medium",
      metric: "agreement_residual_cap_applied",
      evidence: "At least one agreement-linked component was capped by historical-guided residual allocation."
    });
  }
  if (dataQualityFlags.includes("over_consumption_vs_history")) {
    riskSignals.push({
      type: "over_consumption",
      severity: "medium",
      metric: "over_consumption_vs_history",
      evidence: "Recent selected-year consumption is at least 20% above comparable historical pace."
    });
  }
  if (dataQualityFlags.includes("summer_slowdown_detected")) {
    riskSignals.push({
      type: "timing_risk",
      severity: "medium",
      metric: "summer_slowdown_detected",
      evidence: "Local history shows July/August slowdown of at least 15% versus non-summer months."
    });
  }

  const localDeltas: PetyrForecastIntelligencePayload["local_deltas"] = PETYR_BUSINESS_UNITS.map((businessUnit) => {
    const rows = forecastRowsByBusinessUnit.get(businessUnit) ?? [];
    const selectedSignal = selectedSignalsByBusinessUnit.get(businessUnit);
    const deterministic = sumRows(rows, (row) => row.aiForecastValue);
    const planned = selectedSignal?.plannedFutureValue ?? 0;
    const closed = selectedSignal?.closedRevenueYtd ?? 0;

    return {
      business_unit: businessUnit,
      deterministic_minus_planned: roundSignedMoney(deterministic - planned),
      deterministic_minus_closed_ytd: roundSignedMoney(deterministic - closed)
    };
  });
  const totals = {
    deterministic_forecast_value: totalDeterministic,
    baseline_forecast: totalBaseline,
    planned_campaigns_value: totalPlanned,
    residual_coverage_gap: totalResidualGap
  };
  const evidenceRegistry = buildDeterministicEvidenceRegistry({
    forecasts: input.forecasts,
    selectedYearRealSignals: input.signals.selectedYearRealSignals,
    localDeltas,
    totals
  });

  return {
    schema_version: PETYR_FORECAST_INTELLIGENCE_PAYLOAD_VERSION,
    task: "forecast_intelligence_company_analysis",
    company_ref: "company_001",
    forecast_year: input.signals.year,
    as_of_date: input.signals.asOfDate,
    currency: "EUR",
    history_years: 3,
    eligible_months: input.signals.eligibleMonths,
    deterministic_forecast: {
      algorithm: "petyr_hybrid_company_bu_month_v1",
      rows: input.signals.candidates.map((candidate) => ({
        business_unit: candidate.businessUnit,
        year: candidate.year,
        month: candidate.month,
        deterministic_forecast_value: roundMoney(candidate.roundedForecastValue),
        baseline_forecast: roundMoney(candidate.roundedForecastValue),
        historical_weighted_baseline: roundMoney(candidate.historicalWeightedBaseline),
        seasonality_signal: roundMoney(candidate.seasonalitySignal),
        run_rate_signal: roundMoney(candidate.runRateSignal),
        planned_campaigns_value: roundMoney(candidate.plannedCampaignsValue),
        residual_coverage_gap: roundMoney(candidate.residualCoverageGap),
        residual_pressure_status: candidate.agreementResidualSignal.status,
        rounded_forecast_value: roundMoney(candidate.roundedForecastValue),
        rounding_granularity: candidate.roundingGranularity,
        trend_signal: {
          direction: candidate.trendSignal.direction,
          recent_average: roundMoney(candidate.trendSignal.recentAverage),
          comparison_average: roundMoney(candidate.trendSignal.comparisonAverage),
          ratio: candidate.trendSignal.ratio,
          summer_slowdown: candidate.trendSignal.summerSlowdown,
          over_consumption: candidate.trendSignal.overConsumption,
          flags: candidate.trendSignal.flags
        },
        agreement_residual_allocation: {
          active_agreement_count: candidate.agreementResidualAllocation.activeAgreementCount,
          residual_value: roundMoney(candidate.agreementResidualAllocation.residualValue),
          allocated_residual_value: roundMoney(candidate.agreementResidualAllocation.allocatedResidualValue),
          monthly_residual_cap: roundMoney(candidate.agreementResidualAllocation.monthlyResidualCap),
          historical_capacity_value: roundMoney(candidate.agreementResidualAllocation.historicalCapacityValue),
          linked_planned_campaign_value: roundMoney(candidate.agreementResidualAllocation.linkedPlannedCampaignValue),
          capped_linked_planned_campaign_value: roundMoney(candidate.agreementResidualAllocation.cappedLinkedPlannedCampaignValue),
          planned_exceeds_residual: candidate.agreementResidualAllocation.plannedExceedsResidual,
          remaining_months: candidate.agreementResidualAllocation.remainingMonths,
          months_to_expiry: candidate.agreementResidualAllocation.monthsToExpiry,
          attribution_method: candidate.agreementResidualAllocation.attributionMethod,
          matched_tokens: candidate.agreementResidualAllocation.matchedTokens,
          status: candidate.agreementResidualAllocation.status
        },
        business_unit_attribution: {
          method: candidate.businessUnitAttribution.method,
          confidence: candidate.businessUnitAttribution.confidence,
          matched_tokens: candidate.businessUnitAttribution.matchedTokens,
          share: candidate.businessUnitAttribution.share
        },
        consultative_scenarios: candidate.consultativeScenarios.map((scenario) => ({
          id: scenario.id,
          label: scenario.label,
          value: roundMoney(scenario.value),
          direction: scenario.direction,
          reason: scenario.reason
        })),
        confidence_score: confidenceFromCandidate(candidate),
        drivers: driversFromCandidate(candidate),
        data_quality_flags: candidate.dataQualityFlags
      })),
      totals
    },
    historical_closed_revenue: input.signals.historicalClosedRevenue.map((row) => ({
      business_unit: row.businessUnit,
      year: row.year,
      month: row.month,
      closed_revenue: roundMoney(row.closedRevenue)
    })),
    selected_year_real_signals: input.signals.selectedYearRealSignals.map((row) => ({
      business_unit: row.businessUnit,
      year: row.year,
      closed_revenue_ytd: roundMoney(row.closedRevenueYtd),
      planned_future_value: roundMoney(row.plannedFutureValue),
      closed_revenue_campaigns_count: row.closedRevenueCampaignsCount,
      planned_future_campaigns_count: row.plannedFutureCampaignsCount,
      normalized_to_other_count: row.normalizedToOtherCount
    })),
    local_deltas: localDeltas,
    local_scenarios: [
      {
        name: "deterministic",
        value: totalDeterministic,
        description: "Local deterministic forecast total from Petyr math engine."
      },
      {
        name: "planned_floor_only",
        value: totalPlanned,
        description: "Local total if only valid planned future campaign floor values are considered."
      },
      {
        name: "history_signals_only",
        value: historySignalsOnly,
        description: "Local total from positive historical, seasonality and run-rate signals before planned floor."
      }
    ],
    local_risk_signals: riskSignals,
    deterministic_evidence_registry: evidenceRegistry,
    csm_change_notes: input.csmChangeNotes,
    data_quality: {
      diagnostics: input.diagnostics,
      flags: dataQualityFlags
    },
    llm_constraints: {
      interpretation_only: true,
      numbers_are_local_source_of_truth: true,
      must_not_recalculate_forecast: true,
      must_not_modify_forecast_values: true,
      must_not_invent_numbers: true,
      return_json_only: true
    }
  };
}

function notRequestedIntelligence(model: string): PetyrAiForecastCompanyAiIntelligence {
  return {
    requested: false,
    ok: false,
    status: "not_requested",
    provider: "openrouter",
    model,
    promptVersion: PETYR_FORECAST_INTELLIGENCE_PROMPT_VERSION,
    outputSchemaVersion: PETYR_FORECAST_INTELLIGENCE_OUTPUT_SCHEMA_VERSION,
    inputHash: null,
    output: null,
    errorMessage: null,
    validationErrors: [],
    openRouterCalled: false,
    retried: false,
    cacheAction: "none",
    generatedAt: null
  };
}

function mapIntelligenceResult(result: PetyrForecastIntelligenceRunResult): PetyrAiForecastCompanyAiIntelligence {
  return {
    requested: true,
    ok: result.ok,
    status: result.status,
    provider: result.provider,
    model: result.model,
    promptVersion: result.promptVersion,
    outputSchemaVersion: result.outputSchemaVersion,
    inputHash: result.inputHash,
    output: result.output,
    errorMessage: result.errorMessage,
    validationErrors: result.validationErrors,
    openRouterCalled: result.openRouterCalled,
    retried: result.retried,
    cacheAction: result.cacheAction,
    generatedAt: result.generatedAt
  };
}

function sanitizeDebugText(value: string) {
  let sanitized = value;
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();

  if (apiKey) sanitized = sanitized.split(apiKey).join("[redacted_openrouter_api_key]");

  return sanitized
    .replace(/Authorization\s*:\s*Bearer\s+[^\n\r]+/gi, "Authorization: Bearer [redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{16,}/g, "Bearer [redacted]");
}

function buildOpenRouterDebug(input: {
  intelligencePayload: PetyrForecastIntelligencePayload | null;
  intelligenceResult: PetyrForecastIntelligenceRunResult | null;
  selectedModel: string;
  asOfDate: string | null;
  eligibleMonths: number[];
  notCalledReason: PetyrAiForecastOpenRouterDebug["notCalledReason"];
}): PetyrAiForecastOpenRouterDebug {
  const messages = input.intelligenceResult?.prompt.messages ?? [];
  const sanitizedMessages = messages.map((message) => ({
    role: message.role,
    content: sanitizeDebugText(message.content)
  }));
  const openRouterCalled = input.intelligenceResult?.openRouterCalled ?? false;
  const validationErrors = input.intelligenceResult?.validationErrors ?? [];
  const providerError = input.intelligenceResult?.errorMessage ?? null;
  const rawModelContent = input.intelligenceResult?.rawModelContent ?? null;
  const notCalledReason = openRouterCalled
    ? null
    : providerError?.includes("OPENROUTER_API_KEY")
      ? "missing_api_key"
      : input.notCalledReason;

  return {
    openRouterCalled,
    notCalledReason,
    selectedModel: input.selectedModel,
    promptSchemaVersion: PETYR_FORECAST_INTELLIGENCE_PROMPT_VERSION,
    responseSchemaVersion: PETYR_FORECAST_INTELLIGENCE_OUTPUT_SCHEMA_VERSION,
    asOfDate: input.asOfDate,
    eligibleMonths: input.eligibleMonths,
    sanitizedPayloadSentToPromptBuilder: input.intelligencePayload as unknown as Record<string, unknown> | null,
    sanitizedPromptMessagesPrepared: sanitizedMessages,
    sanitizedPromptMessagesSentToOpenRouter: openRouterCalled ? sanitizedMessages : [],
    rawModelContent: rawModelContent ? sanitizeDebugText(rawModelContent) : null,
    rawModelContentStatus: rawModelContent
      ? "safe_to_display_validated"
      : providerError
        ? "withheld_provider_error"
        : validationErrors.length > 0
          ? "withheld_validation_failed"
          : "not_received",
    validationErrors,
    providerError: providerError ? sanitizeDebugText(providerError) : null
  };
}

async function readCsmChangeNotes(input: {
  companyName: string;
  year: number;
  diagnostics: string[];
}) {
  try {
    const sessions = await prisma.forecastSaveSession.findMany({
      where: {
        companyName: input.companyName,
        year: input.year,
        note: { not: null }
      },
      select: {
        year: true,
        month: true,
        forecastType: true,
        source: true,
        note: true,
        createdAt: true,
        changeLogs: {
          select: { businessUnit: true }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 24
    });

    return buildPetyrForecastIntelligenceCsmChangeNotes({ year: input.year, sessions });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    input.diagnostics.push(`Unable to read CSM change notes for Forecast Intelligence: ${message}`);
    return [];
  }
}

function emptySaveReport(modelVersion: string): AiForecastCacheSaveReport {
  return {
    savedRows: 0,
    skippedRows: 0,
    validationErrors: [],
    modelVersion,
    savedRowDetails: [],
    skippedRowDetails: []
  };
}

export function getPetyrDeterministicAiForecastCacheKey(input: PetyrDeterministicAiForecastCacheKeyInput) {
  return [
    input.companyName.trim().toLowerCase(),
    input.businessUnit.trim().toLowerCase(),
    input.year,
    input.month,
    input.modelVersion
  ].join("\u0000");
}

export function isPetyrDeterministicAiForecastCacheDuplicate(input: {
  forecast: PetyrDeterministicAiForecastCacheKeyInput;
  existingKeys: Set<string>;
}) {
  return input.existingKeys.has(getPetyrDeterministicAiForecastCacheKey(input.forecast));
}

async function saveDeterministicForecastRowsToCache(input: {
  companyName: string;
  forecasts: CurrentRunForecastRow[];
  modelVersion: string;
  generatedAt: Date;
  intelligence: PetyrForecastIntelligenceRunResult;
}) {
  const report = emptySaveReport(input.modelVersion);

  if (!input.intelligence.ok || !input.intelligence.output) {
    report.validationErrors.push({
      path: "aiIntelligence",
      message: input.intelligence.errorMessage ?? "Forecast Intelligence was not valid."
    });
    return report;
  }

  const existingRows = await prisma.aiForecastCache.findMany({
    where: {
      companyName: input.companyName,
      modelVersion: input.modelVersion,
      OR: input.forecasts.map((forecast) => ({
        businessUnit: forecast.businessUnit,
        year: forecast.year,
        month: forecast.month
      }))
    },
    select: {
      companyName: true,
      businessUnit: true,
      year: true,
      month: true,
      modelVersion: true
    }
  });
  const existingKeys = new Set(existingRows.map(getPetyrDeterministicAiForecastCacheKey));
  const rowsToCreate = input.forecasts.filter((forecast) => {
    const exists = isPetyrDeterministicAiForecastCacheDuplicate({
      forecast: {
        companyName: input.companyName,
        businessUnit: forecast.businessUnit,
        year: forecast.year,
        month: forecast.month,
        modelVersion: input.modelVersion
      },
      existingKeys
    });

    if (exists) {
      report.skippedRowDetails.push({
        company: input.companyName,
        businessUnit: forecast.businessUnit,
        year: forecast.year,
        month: forecast.month,
        modelVersion: input.modelVersion,
        reason: "skipped_existing_cache"
      });
    }

    return !exists;
  });

  report.skippedRows = report.skippedRowDetails.length;
  if (rowsToCreate.length === 0) return report;

  const savedRows = await prisma.$transaction(async (tx) => {
    const saved: AiForecastCacheSavedRow[] = [];

    for (const forecast of rowsToCreate) {
      await tx.aiForecastCache.create({
        data: {
          companyName: input.companyName,
          businessUnit: forecast.businessUnit,
          year: forecast.year,
          month: forecast.month,
          forecastValue: new Prisma.Decimal(forecast.aiForecastValue),
          confidenceScore: forecast.confidenceScore === null ? null : new Prisma.Decimal(forecast.confidenceScore),
          modelVersion: input.modelVersion,
          explanation: forecast.explanation,
          generatedAt: input.generatedAt,
          provider: input.intelligence.provider,
          providerModel: input.intelligence.model,
          promptVersion: input.intelligence.promptVersion,
          inputHash: input.intelligence.inputHash,
          requestPayloadSummary: input.intelligence.requestPayloadSummary as Prisma.InputJsonValue,
          validatedOutput: input.intelligence.output as Prisma.InputJsonValue,
          status: "success",
          errorMessage: null
        }
      });

      saved.push({
        company: input.companyName,
        businessUnit: forecast.businessUnit,
        year: forecast.year,
        month: forecast.month,
        forecastValue: forecast.aiForecastValue,
        confidenceScore: forecast.confidenceScore,
        explanation: forecast.explanation,
        modelVersion: input.modelVersion,
        generatedAt: input.generatedAt.toISOString(),
        action: "created"
      });
    }

    return saved;
  });

  report.savedRowDetails.push(...savedRows);
  report.savedRows = savedRows.length;
  return report;
}

async function saveDeterministicPreviewRowsToCache(input: {
  companyName: string;
  forecasts: CurrentRunForecastRow[];
  modelVersion: string;
  generatedAt: Date;
}) {
  const report = emptySaveReport(input.modelVersion);

  if (input.forecasts.length === 0) return report;

  const existingRows = await prisma.aiForecastCache.findMany({
    where: {
      companyName: input.companyName,
      modelVersion: input.modelVersion,
      OR: input.forecasts.map((forecast) => ({
        businessUnit: forecast.businessUnit,
        year: forecast.year,
        month: forecast.month
      }))
    },
    select: {
      companyName: true,
      businessUnit: true,
      year: true,
      month: true,
      modelVersion: true
    }
  });
  const existingKeys = new Set(existingRows.map(getPetyrDeterministicAiForecastCacheKey));
  const rowsToCreate = input.forecasts.filter((forecast) => {
    const exists = isPetyrDeterministicAiForecastCacheDuplicate({
      forecast: {
        companyName: input.companyName,
        businessUnit: forecast.businessUnit,
        year: forecast.year,
        month: forecast.month,
        modelVersion: input.modelVersion
      },
      existingKeys
    });

    if (exists) {
      report.skippedRowDetails.push({
        company: input.companyName,
        businessUnit: forecast.businessUnit,
        year: forecast.year,
        month: forecast.month,
        modelVersion: input.modelVersion,
        reason: "skipped_existing_daily_deterministic_cache"
      });
    }

    return !exists;
  });

  report.skippedRows = report.skippedRowDetails.length;
  if (rowsToCreate.length === 0) return report;

  const savedRows = await prisma.$transaction(async (tx) => {
    const saved: AiForecastCacheSavedRow[] = [];

    for (const forecast of rowsToCreate) {
      await tx.aiForecastCache.create({
        data: {
          companyName: input.companyName,
          businessUnit: forecast.businessUnit,
          year: forecast.year,
          month: forecast.month,
          forecastValue: new Prisma.Decimal(forecast.aiForecastValue),
          confidenceScore: forecast.confidenceScore === null ? null : new Prisma.Decimal(forecast.confidenceScore),
          modelVersion: input.modelVersion,
          explanation: forecast.explanation,
          generatedAt: input.generatedAt,
          provider: "petyr",
          providerModel: "deterministic_preview",
          promptVersion: "petyr_deterministic_preview_v1",
          inputHash: null,
          requestPayloadSummary: {
            source: "nightly_deterministic_preview",
            businessUnit: forecast.businessUnit,
            year: forecast.year,
            month: forecast.month,
            drivers: forecast.drivers,
            confidenceScore: forecast.confidenceScore
          },
          validatedOutput: {
            schema_version: "petyr_local_deterministic_forecast_v1",
            source: "nightly_deterministic_preview",
            forecast
          },
          status: "success",
          errorMessage: null
        }
      });

      saved.push({
        company: input.companyName,
        businessUnit: forecast.businessUnit,
        year: forecast.year,
        month: forecast.month,
        forecastValue: forecast.aiForecastValue,
        confidenceScore: forecast.confidenceScore,
        explanation: forecast.explanation,
        modelVersion: input.modelVersion,
        generatedAt: input.generatedAt.toISOString(),
        action: "created"
      });
    }

    return saved;
  });

  report.savedRowDetails.push(...savedRows);
  report.savedRows = savedRows.length;
  return report;
}

async function maybeRunIntelligence(input: {
  requested: boolean;
  companyName: string;
  year: number;
  modelVersion: string;
  payload: PetyrForecastIntelligencePayload;
  forceRefresh?: boolean;
}) {
  if (!input.requested) return null;

  return generatePetyrForecastIntelligence({
    payload: input.payload,
    apiKey: getOpenRouterApiKey(),
    model: input.modelVersion,
    cache: createPetyrForecastIntelligenceCacheAdapter({
      companyName: input.companyName,
      year: input.year
    }),
    forceRefresh: input.forceRefresh
  });
}

async function buildBaseRun(input: {
  companyName: string;
  requestedCompanyName: string;
  year: number;
  modelVersion: string;
}) {
  const signals = await buildCompanyBuForecastSignals(input.companyName, input.year, { historyYears: 3 });
  const generatedAt = new Date();
  const generatedAtIso = generatedAt.toISOString();
  const forecasts = buildDeterministicRows({
    candidates: signals.candidates,
    modelVersion: input.modelVersion,
    generatedAt: generatedAtIso
  });
  const diagnostics = uniqueDiagnostics(signals.diagnostics);
  const csmChangeNotes = await readCsmChangeNotes({
    companyName: signals.companyName,
    year: input.year,
    diagnostics
  });
  const intelligencePayload = buildIntelligencePayload({ signals, forecasts, diagnostics, csmChangeNotes });

  return {
    signals,
    forecasts,
    diagnostics,
    generatedAt,
    generatedAtIso,
    intelligencePayload
  };
}

async function runNonDryRunSave(input: {
  companyName: string;
  requestedCompanyName: string;
  year: number;
}): Promise<PetyrAiForecastCompanySaveResult> {
  const modelSettingResolution = await getPetyrAiModelSettingWithDiagnostics();
  const modelVersion = modelSettingResolution.setting.selectedModel;
  const base = await buildBaseRun({ ...input, modelVersion });
  const diagnostics = uniqueDiagnostics([...base.diagnostics, ...modelSettingResolution.diagnostics]);

  if (base.signals.eligibleMonths.length === 0) {
    const report = emptySaveReport(modelVersion);
    report.skippedRowDetails.push({
      company: base.signals.companyName,
      businessUnit: null,
      year: input.year,
      month: null,
      modelVersion,
      reason: "no_eligible_future_months"
    });
    report.skippedRows = report.skippedRowDetails.length;

    return {
      ok: true,
      endpoint: "/api/petyr/ai-forecast/company",
      dryRun: false,
      wroteToDatabase: false,
      companyName: base.signals.companyName,
      requestedCompanyName: input.requestedCompanyName,
      year: input.year,
      asOfDate: base.signals.asOfDate,
      eligibleMonths: base.signals.eligibleMonths,
      modelVersion,
      generatedAt: base.generatedAtIso,
      deterministicCandidatesCount: base.signals.candidates.length,
      forecasts: base.forecasts,
      aiIntelligence: notRequestedIntelligence(modelVersion),
      algorithmSummary: algorithmSummary(),
      selectedYearAggregates: buildSelectedYearAggregates({ signals: base.signals, forecasts: base.forecasts }),
      openRouterDebug: buildOpenRouterDebug({
        intelligencePayload: base.intelligencePayload,
        intelligenceResult: null,
        selectedModel: modelVersion,
        asOfDate: base.signals.asOfDate,
        eligibleMonths: base.signals.eligibleMonths,
        notCalledReason: "no_eligible_future_months"
      }),
      report,
      diagnostics
    };
  }

  const intelligenceResult = await maybeRunIntelligence({
    requested: true,
    companyName: base.signals.companyName,
    year: input.year,
    modelVersion,
    payload: base.intelligencePayload
  });
  const intelligence = intelligenceResult ? mapIntelligenceResult(intelligenceResult) : notRequestedIntelligence(modelVersion);
  const report = intelligenceResult
    ? await saveDeterministicForecastRowsToCache({
        companyName: base.signals.companyName,
        forecasts: base.forecasts,
        modelVersion,
        generatedAt: base.generatedAt,
        intelligence: intelligenceResult
      })
    : emptySaveReport(modelVersion);
  const ok = intelligence.ok && report.validationErrors.length === 0;

  return {
    ok,
    endpoint: "/api/petyr/ai-forecast/company",
    dryRun: false,
    wroteToDatabase: report.savedRows > 0 || intelligence.cacheAction === "created" || intelligence.cacheAction === "updated",
    companyName: base.signals.companyName,
    requestedCompanyName: input.requestedCompanyName,
    year: input.year,
    asOfDate: base.signals.asOfDate,
    eligibleMonths: base.signals.eligibleMonths,
    modelVersion,
    generatedAt: base.generatedAtIso,
    deterministicCandidatesCount: base.signals.candidates.length,
    forecasts: base.forecasts,
    aiIntelligence: intelligence,
    algorithmSummary: algorithmSummary(),
    selectedYearAggregates: buildSelectedYearAggregates({ signals: base.signals, forecasts: base.forecasts }),
    openRouterDebug: buildOpenRouterDebug({
      intelligencePayload: base.intelligencePayload,
      intelligenceResult,
      selectedModel: modelVersion,
      asOfDate: base.signals.asOfDate,
      eligibleMonths: base.signals.eligibleMonths,
      notCalledReason: intelligence.status === "cached" ? "cached_output_reused" : "llm_preview_not_requested"
    }),
    report,
    diagnostics,
    error: ok ? undefined : intelligence.errorMessage ?? "Forecast Intelligence did not pass validation."
  };
}

export async function generatePetyrAiForecastCompanyPreview(
  input: RawCompanyPreviewPayload = {}
): Promise<PetyrAiForecastCompanyPreviewResult | PetyrAiForecastCompanySaveResult> {
  rejectBatchPayload(input);

  const companyName = asString(input.companyName);
  if (!companyName) throw new PetyrAiForecastCompanyPreviewError("companyName is required.");

  const year = parseRequiredYear(input.year);
  const dryRun = parseBoolean(input.dryRun, true);
  const requestedLlmPreview =
    parseBoolean(input.llmPreview, false) ||
    parseBoolean(input.useLlmPreview, false) ||
    parseBoolean(input.includeLlmPreview, false);
  const forceRefresh = parseBoolean(input.forceRefresh, false);

  if (!dryRun) {
    return runNonDryRunSave({ companyName, requestedCompanyName: companyName, year });
  }

  const modelSettingResolution = await getPetyrAiModelSettingWithDiagnostics();
  const modelVersion = modelSettingResolution.setting.selectedModel;
  const base = await buildBaseRun({ companyName, requestedCompanyName: companyName, year, modelVersion });
  const diagnostics = uniqueDiagnostics([...base.diagnostics, ...modelSettingResolution.diagnostics]);
  const intelligenceResult = await maybeRunIntelligence({
    requested: requestedLlmPreview,
    companyName: base.signals.companyName,
    year,
    modelVersion,
    payload: base.intelligencePayload,
    forceRefresh
  });
  const intelligence = intelligenceResult ? mapIntelligenceResult(intelligenceResult) : notRequestedIntelligence(modelVersion);

  return {
    ok: true,
    endpoint: "/api/petyr/ai-forecast/company",
    dryRun: true,
    wroteToDatabase: intelligence.cacheAction === "created" || intelligence.cacheAction === "updated",
    companyName: base.signals.companyName,
    requestedCompanyName: companyName,
    year,
    asOfDate: base.signals.asOfDate,
    eligibleMonths: base.signals.eligibleMonths,
    modelVersion,
    deterministicCandidatesCount: base.signals.candidates.length,
    preview: {
      schema_version: "petyr_local_deterministic_forecast_v1",
      forecasts: base.forecasts,
      warnings: diagnostics.map((message) => ({ code: "petyr_diagnostic", message }))
    },
    llmPayloadPreview: base.intelligencePayload,
    aiIntelligence: intelligence,
    algorithmSummary: algorithmSummary(),
    selectedYearAggregates: buildSelectedYearAggregates({ signals: base.signals, forecasts: base.forecasts }),
    openRouterDebug: buildOpenRouterDebug({
      intelligencePayload: base.intelligencePayload,
      intelligenceResult,
      selectedModel: modelVersion,
      asOfDate: base.signals.asOfDate,
      eligibleMonths: base.signals.eligibleMonths,
      notCalledReason: intelligence.status === "cached" ? "cached_output_reused" : "deterministic_dry_run"
    }),
    diagnostics
  };
}

export async function savePetyrDeterministicAiForecastForCompany(input: {
  companyName: string;
  year: number;
  modelVersion: string;
}): Promise<PetyrDeterministicAiForecastCacheSaveResult> {
  const companyName = asString(input.companyName);
  if (!companyName) throw new PetyrAiForecastCompanyPreviewError("companyName is required.");

  const year = parseRequiredYear(input.year);
  const modelVersion = asString(input.modelVersion);
  if (!modelVersion) throw new PetyrAiForecastCompanyPreviewError("modelVersion is required.");

  const base = await buildBaseRun({
    companyName,
    requestedCompanyName: companyName,
    year,
    modelVersion
  });
  const diagnostics = uniqueDiagnostics(base.diagnostics);
  const report =
    base.signals.eligibleMonths.length === 0
      ? emptySaveReport(modelVersion)
      : await saveDeterministicPreviewRowsToCache({
          companyName: base.signals.companyName,
          forecasts: base.forecasts,
          modelVersion,
          generatedAt: base.generatedAt
        });

  if (base.signals.eligibleMonths.length === 0) {
    report.skippedRowDetails.push({
      company: base.signals.companyName,
      businessUnit: null,
      year,
      month: null,
      modelVersion,
      reason: "no_eligible_future_months"
    });
    report.skippedRows = report.skippedRowDetails.length;
  }

  return {
    ok: report.validationErrors.length === 0,
    companyName: base.signals.companyName,
    requestedCompanyName: companyName,
    year,
    asOfDate: base.signals.asOfDate,
    eligibleMonths: base.signals.eligibleMonths,
    modelVersion,
    generatedAt: base.generatedAtIso,
    deterministicCandidatesCount: base.signals.candidates.length,
    forecasts: base.forecasts,
    report,
    diagnostics
  };
}
