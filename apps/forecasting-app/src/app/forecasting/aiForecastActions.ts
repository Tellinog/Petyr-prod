"use server";

import { requirePetyrPagePermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import {
  PetyrAiForecastCompanyPreviewError,
  generatePetyrAiForecastCompanyPreview,
  type PetyrAiForecastCompanyPreviewResult,
  type PetyrAiForecastCompanySaveResult
} from "@/services/petyrAiForecastCompanyPreviewService";
import {
  PETYR_FORECAST_INTELLIGENCE_OUTPUT_SCHEMA_VERSION,
  PETYR_FORECAST_INTELLIGENCE_PROMPT_VERSION
} from "@/services/petyrForecastIntelligenceService";
import type {
  PetyrAiForecastAlgorithmSummary,
  PetyrCompanyIntelligenceActionResult,
  PetyrAiForecastIntelligenceActionResult,
  PetyrAiForecastManualActionResult,
  PetyrAiForecastManualForecastRow,
  PetyrAiForecastManualReport,
  PetyrAiForecastOpenRouterDebug,
  PetyrAiForecastSelectedYearAggregates
} from "@/types/petyrAiForecastManualAction";

type ManualAiForecastActionInput = {
  companyName: string;
  year: number;
  useLlmPreview?: boolean;
};

type CompanyIntelligenceActionInput = {
  companyName: string;
  year: number;
  selectedMonth?: number | null;
};

type ManualAiForecastApplyInput = ManualAiForecastActionInput & {
  confirmed: boolean;
};

function normalizeCompanyName(value: string) {
  return value.trim();
}

function defaultAlgorithmSummary(): PetyrAiForecastAlgorithmSummary {
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
      "OpenRouter is interpretation-only. It receives the locally computed deterministic forecast payload and cannot calculate, modify or overwrite forecast values.",
    validationAuthorityExplanation:
      "Petyr server code owns eligible months, official Business Units, numeric validation, privacy checks and ai_forecast_cache-only persistence.",
    currentLimitations: [
      "Management/Finance weights are configurable in Petyr Admin; until saved, Petyr uses the compatible positive-signal average fallback.",
      "Agreement residual allocation is historical-guided and may be low-confidence when no sanitized BU title token or linked campaign history is available.",
      "Rich explainability is current-run output and is not persisted as structured cache columns."
    ]
  };
}

function emptyAggregates(): PetyrAiForecastSelectedYearAggregates {
  return {
    businessUnits: [],
    monthlySeries: [],
    notes: ["No aggregate data is available because AI Forecast generation did not complete."]
  };
}

function emptyOpenRouterDebug(): PetyrAiForecastOpenRouterDebug {
  return {
    openRouterCalled: false,
    notCalledReason: "deterministic_dry_run",
    selectedModel: null,
    promptSchemaVersion: PETYR_FORECAST_INTELLIGENCE_PROMPT_VERSION,
    responseSchemaVersion: PETYR_FORECAST_INTELLIGENCE_OUTPUT_SCHEMA_VERSION,
    asOfDate: null,
    eligibleMonths: [],
    sanitizedPayloadSentToPromptBuilder: null,
    sanitizedPromptMessagesPrepared: [],
    sanitizedPromptMessagesSentToOpenRouter: [],
    rawModelContent: null,
    rawModelContentStatus: "not_received",
    validationErrors: [],
    providerError: null
  };
}

function emptyAiIntelligence(model = "n/a"): PetyrAiForecastIntelligenceActionResult {
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

function emptyErrorResult(input: ManualAiForecastActionInput, mode: "preview" | "apply", error: string): PetyrAiForecastManualActionResult {
  return {
    ok: false,
    mode,
    dryRun: mode === "preview",
    wroteToDatabase: false,
    companyName: normalizeCompanyName(input.companyName),
    requestedCompanyName: normalizeCompanyName(input.companyName),
    year: input.year,
    asOfDate: null,
    eligibleMonths: [],
    modelVersion: null,
    deterministicCandidatesCount: 0,
    forecasts: [],
    algorithmSummary: defaultAlgorithmSummary(),
    selectedYearAggregates: emptyAggregates(),
    openRouterDebug: emptyOpenRouterDebug(),
    aiIntelligence: emptyAiIntelligence(),
    diagnostics: [],
    summary: error,
    error
  };
}

function formatActionError(error: unknown) {
  if (error instanceof PetyrAiForecastCompanyPreviewError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unable to generate AI forecast.";
}

function companyIntelligenceErrorResult(
  input: CompanyIntelligenceActionInput,
  error: string
): PetyrCompanyIntelligenceActionResult {
  return {
    ok: false,
    requested: true,
    companyName: normalizeCompanyName(input.companyName),
    requestedCompanyName: normalizeCompanyName(input.companyName),
    year: input.year,
    status: "failed",
    model: null,
    promptVersion: PETYR_FORECAST_INTELLIGENCE_PROMPT_VERSION,
    outputSchemaVersion: PETYR_FORECAST_INTELLIGENCE_OUTPUT_SCHEMA_VERSION,
    inputHash: null,
    output: null,
    errorMessage: error,
    validationErrors: [],
    openRouterCalled: false,
    retried: false,
    cacheAction: "none",
    generatedAt: null,
    diagnostics: [],
    summary: error
  };
}

function mapForecastRow(
  forecast: PetyrAiForecastCompanyPreviewResult["preview"]["forecasts"][number] | PetyrAiForecastCompanySaveResult["forecasts"][number]
): PetyrAiForecastManualForecastRow {
  return {
    source: forecast.source,
    businessUnit: forecast.businessUnit,
    year: forecast.year,
    month: forecast.month,
    baselineForecast: forecast.baselineForecast,
    plannedCampaignsValue: forecast.plannedCampaignsValue,
    agreementResidualSignal: forecast.agreementResidualSignal,
    roundedForecastValue: forecast.roundedForecastValue,
    roundingGranularity: forecast.roundingGranularity,
    trendSignal: forecast.trendSignal,
    agreementResidualAllocation: forecast.agreementResidualAllocation,
    businessUnitAttribution: forecast.businessUnitAttribution,
    consultativeScenarios: forecast.consultativeScenarios,
    aiForecastValue: forecast.aiForecastValue,
    finalAiAdjustment: forecast.finalAiAdjustment,
    confidenceScore: forecast.confidenceScore,
    explanation: forecast.explanation,
    advice: forecast.advice,
    drivers: forecast.drivers,
    explainability: forecast.explainability
  };
}

function mapSaveReport(report: PetyrAiForecastCompanySaveResult["report"]): PetyrAiForecastManualReport {
  return {
    savedRows: report.savedRows,
    skippedRows: report.skippedRows,
    validationErrors: report.validationErrors,
    modelVersion: report.modelVersion,
    savedRowDetails: report.savedRowDetails,
    skippedRowDetails: report.skippedRowDetails
  };
}

export async function generatePetyrCompanyIntelligenceAction(
  input: CompanyIntelligenceActionInput
): Promise<PetyrCompanyIntelligenceActionResult> {
  await requirePetyrPagePermission(PETYR_PERMISSIONS.forecastWrite);

  try {
    const result = await generatePetyrAiForecastCompanyPreview({
      companyName: input.companyName,
      year: input.year,
      dryRun: true,
      llmPreview: true,
      forceRefresh: true
    });

    if (!result.dryRun) {
      return companyIntelligenceErrorResult(input, "Expected a dry-run Forecast Intelligence response.");
    }

    const intelligence = result.aiIntelligence;
    const output = intelligence.output;
    const summary = intelligence.ok && output
      ? "Forecast Intelligence " +
        (intelligence.status === "cached" ? "reused from cache" : "generated") +
        " for " +
        result.companyName +
        "."
      : intelligence.errorMessage ?? "Forecast Intelligence did not produce valid JSON.";

    return {
      ok: intelligence.ok && Boolean(output),
      requested: intelligence.requested,
      companyName: result.companyName,
      requestedCompanyName: result.requestedCompanyName,
      year: result.year,
      status: intelligence.status,
      model: intelligence.model,
      promptVersion: intelligence.promptVersion,
      outputSchemaVersion: intelligence.outputSchemaVersion,
      inputHash: intelligence.inputHash,
      output,
      errorMessage: intelligence.errorMessage,
      validationErrors: intelligence.validationErrors,
      openRouterCalled: intelligence.openRouterCalled,
      retried: intelligence.retried,
      cacheAction: intelligence.cacheAction,
      generatedAt: intelligence.generatedAt,
      diagnostics: result.diagnostics,
      summary
    };
  } catch (error) {
    return companyIntelligenceErrorResult(input, formatActionError(error));
  }
}

export async function generatePetyrAiForecastPreviewAction(
  input: ManualAiForecastActionInput
): Promise<PetyrAiForecastManualActionResult> {
  await requirePetyrPagePermission(PETYR_PERMISSIONS.forecastWrite);

  try {
    const result = await generatePetyrAiForecastCompanyPreview({
      companyName: input.companyName,
      year: input.year,
      dryRun: true,
      llmPreview: input.useLlmPreview === true
    });

    if (!result.dryRun) {
      return emptyErrorResult(input, "preview", "Expected a dry-run preview response.");
    }

    const forecasts = result.preview.forecasts.map(mapForecastRow);
    const intelligence = result.aiIntelligence;
    let summary: string;

    if (input.useLlmPreview === true && intelligence.ok) {
      summary =
        "Forecast Intelligence " +
        (intelligence.status === "cached" ? "reused from cache" : "generated") +
        " for " +
        forecasts.length +
        " deterministic Business Unit/month row(s).";
    } else if (input.useLlmPreview === true) {
      summary =
        "Deterministic preview generated for " +
        forecasts.length +
        " Business Unit/month row(s). Forecast Intelligence failed gracefully; deterministic values remain available.";
    } else {
      summary =
        "Deterministic dry-run preview generated for " +
        forecasts.length +
        " Business Unit/month row(s).";
    }

    return {
      ok: true,
      mode: "preview",
      dryRun: true,
      wroteToDatabase: result.wroteToDatabase,
      companyName: result.companyName,
      requestedCompanyName: result.requestedCompanyName,
      year: result.year,
      asOfDate: result.asOfDate,
      eligibleMonths: result.eligibleMonths,
      modelVersion: result.modelVersion,
      deterministicCandidatesCount: result.deterministicCandidatesCount,
      forecasts,
      algorithmSummary: result.algorithmSummary,
      selectedYearAggregates: result.selectedYearAggregates,
      openRouterDebug: result.openRouterDebug,
      aiIntelligence: result.aiIntelligence,
      diagnostics: result.diagnostics,
      summary
    };
  } catch (error) {
    return emptyErrorResult(input, "preview", formatActionError(error));
  }
}

export async function applyPetyrAiForecastAction(
  input: ManualAiForecastApplyInput
): Promise<PetyrAiForecastManualActionResult> {
  await requirePetyrPagePermission(PETYR_PERMISSIONS.forecastWrite);

  if (!input.confirmed) {
    return emptyErrorResult(input, "apply", "AI Forecast apply requires explicit user confirmation.");
  }

  try {
    const result = await generatePetyrAiForecastCompanyPreview({
      companyName: input.companyName,
      year: input.year,
      dryRun: false
    });

    if (result.dryRun) {
      return emptyErrorResult(input, "apply", "Expected a non-dry-run save response.");
    }

    const report = mapSaveReport(result.report);
    const forecasts = result.forecasts.map(mapForecastRow);
    const validationErrorCount = report.validationErrors.length;
    const savedSummary =
      report.savedRows > 0
        ? `Saved ${report.savedRows} AI Forecast cache row(s).`
        : "No AI Forecast cache rows were saved.";
    const skippedSummary = report.skippedRows > 0 ? ` Skipped ${report.skippedRows} row(s).` : "";
    const validationSummary = validationErrorCount > 0 ? ` Validation errors: ${validationErrorCount}.` : "";
    const intelligenceSummary = result.aiIntelligence.ok
      ? " Forecast Intelligence " + (result.aiIntelligence.status === "cached" ? "reused from cache." : "validated.")
      : " Forecast Intelligence failed validation; deterministic preview remains available.";
    const providerSummary = result.openRouterDebug.providerError ? " Provider error captured in current-run diagnostics." : "";

    return {
      ok: result.ok,
      mode: "apply",
      dryRun: false,
      wroteToDatabase: result.wroteToDatabase,
      companyName: result.companyName,
      requestedCompanyName: result.requestedCompanyName,
      year: result.year,
      asOfDate: result.asOfDate,
      eligibleMonths: result.eligibleMonths,
      modelVersion: result.modelVersion,
      deterministicCandidatesCount: result.deterministicCandidatesCount,
      forecasts,
      algorithmSummary: result.algorithmSummary,
      selectedYearAggregates: result.selectedYearAggregates,
      openRouterDebug: result.openRouterDebug,
      aiIntelligence: result.aiIntelligence,
      diagnostics: result.diagnostics,
      summary: savedSummary + skippedSummary + validationSummary + intelligenceSummary + providerSummary,
      report,
      error: result.ok ? undefined : result.error ?? "AI Forecast output did not pass validation."
    };
  } catch (error) {
    return emptyErrorResult(input, "apply", formatActionError(error));
  }
}
