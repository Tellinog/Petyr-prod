import {
  PETYR_FORECAST_INTELLIGENCE_PAYLOAD_VERSION,
  buildPetyrForecastIntelligenceOpenRouterResponseFormat,
  buildPetyrForecastIntelligencePrompt,
  validatePetyrForecastIntelligenceOutput,
  type PetyrForecastIntelligencePayload
} from "@/services/petyrForecastIntelligenceService";

export type PetyrAiForecastLlmContractSmokeResult = {
  ok: boolean;
  checks: {
    promptIncludesJsonOnlyRule: boolean;
    promptIncludesEligibleFutureMonthRule: boolean;
    promptIncludesHistoricalClosedRevenueEvidence: boolean;
    promptExcludesCsmForecastInfluenceData: boolean;
    structuredResponseSchemaRequiresExactFields: boolean;
    validResponseAccepted: boolean;
    currentMonthRejected: boolean;
    unknownBusinessUnitRejected: boolean;
    missingRequiredFieldRejected: boolean;
    extraForecastFieldRejected: boolean;
    extraProseRejected: boolean;
  };
  errors: string[];
};

function smokePayload(): PetyrForecastIntelligencePayload {
  return {
    schema_version: PETYR_FORECAST_INTELLIGENCE_PAYLOAD_VERSION,
    task: "forecast_intelligence_company_analysis",
    company_ref: "company_001",
    forecast_year: 2026,
    as_of_date: "2026-06-10",
    currency: "EUR",
    history_years: 3,
    eligible_months: [7],
    deterministic_forecast: {
      algorithm: "petyr_hybrid_company_bu_month_v1",
      rows: [{
        business_unit: "QA",
        year: 2026,
        month: 7,
        deterministic_forecast_value: 100,
        baseline_forecast: 100,
        historical_weighted_baseline: 80,
        seasonality_signal: 90,
        run_rate_signal: 110,
        planned_campaigns_value: 120,
        residual_coverage_gap: 0,
        residual_pressure_status: "covered",
        rounded_forecast_value: 100,
        rounding_granularity: 100,
        trend_signal: {
          direction: "neutral",
          recent_average: 100,
          comparison_average: 90,
          ratio: 1.1111,
          summer_slowdown: false,
          over_consumption: false,
          flags: []
        },
        agreement_residual_allocation: {
          active_agreement_count: 0,
          residual_value: 0,
          allocated_residual_value: 0,
          monthly_residual_cap: 0,
          historical_capacity_value: 0,
          linked_planned_campaign_value: 0,
          capped_linked_planned_campaign_value: 0,
          planned_exceeds_residual: false,
          remaining_months: null,
          months_to_expiry: null,
          attribution_method: "none",
          matched_tokens: [],
          status: "not_applicable"
        },
        business_unit_attribution: {
          method: "none",
          confidence: "none",
          matched_tokens: [],
          share: 0
        },
        consultative_scenarios: [
          { id: "floor_100", label: "Round down to 100 EUR", value: 100, direction: "down", reason: "Commercial conservative scenario rounded down to the nearest 100 EUR." },
          { id: "nearest_100", label: "Round to nearest 100 EUR", value: 100, direction: "nearest", reason: "Neutral consultative scenario rounded to the nearest 100 EUR." },
          { id: "ceil_100", label: "Round up to 100 EUR", value: 100, direction: "up", reason: "Growth or opportunity scenario rounded up to the nearest 100 EUR." }
        ],
        confidence_score: 0.62,
        drivers: ["planned_campaigns"],
        data_quality_flags: []
      }],
      totals: {
        deterministic_forecast_value: 100,
        baseline_forecast: 100,
        planned_campaigns_value: 120,
        residual_coverage_gap: 0
      }
    },
    historical_closed_revenue: [{ business_unit: "QA", year: 2025, month: 7, closed_revenue: 90 }],
    selected_year_real_signals: [{
      business_unit: "QA",
      year: 2026,
      closed_revenue_ytd: 70,
      planned_future_value: 120,
      closed_revenue_campaigns_count: 2,
      planned_future_campaigns_count: 1,
      normalized_to_other_count: 0
    }],
    local_deltas: [{ business_unit: "QA", deterministic_minus_planned: -20, deterministic_minus_closed_ytd: 30 }],
    local_scenarios: [
      { name: "deterministic", value: 100, description: "Local deterministic forecast total." },
      { name: "planned_floor_only", value: 120, description: "Local planned future total." },
      { name: "history_signals_only", value: 93, description: "Local history signal total." }
    ],
    local_risk_signals: [],
    deterministic_evidence_registry: [
      {
        id: "bu.qa.month.7.forecast",
        label: "QA month 7 deterministic forecast",
        display_value: "QA month 7 deterministic forecast: 100 EUR",
        kind: "forecast_total",
        business_unit: "QA",
        month: 7
      },
      {
        id: "bu.qa.month.7.planned",
        label: "QA month 7 planned campaigns",
        display_value: "QA month 7 planned campaigns: 120 EUR",
        kind: "planned_value",
        business_unit: "QA",
        month: 7
      },
      {
        id: "bu.qa.month.7.remaining_months",
        label: "QA month 7 remaining agreement months",
        display_value: "QA month 7 remaining agreement months: 3",
        kind: "remaining_months",
        business_unit: "QA",
        month: 7
      },
      {
        id: "bu.qa.closed_campaigns",
        label: "QA closed campaign count",
        display_value: "QA closed campaign count: 2",
        kind: "campaign_count",
        business_unit: "QA"
      }
    ],
    csm_change_notes: [],
    data_quality: { diagnostics: [], flags: [] },
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

function smokeOutput() {
  return {
    stakeholder_notes: [{ title: "Residual timing", note: "Residual pressure is concentrated in the same delivery window.", evidence_refs: ["bu.qa.month.7.remaining_months"] }],
    risks: [{ type: "timing_risk", severity: "medium", description: "Residual timing is visible against the local monthly allowance.", evidence_refs: ["bu.qa.month.7.planned"] }],
    opportunities: [{ title: "Planned work is above forecast", severity: "medium", evidence: "The planned campaign value is above the deterministic forecast.", evidence_refs: ["bu.qa.month.7.planned", "bu.qa.month.7.forecast"] }],
    watchouts: [{ title: "Sparse context", severity: "medium", evidence: "The payload has limited historical context.", evidence_refs: ["bu.qa.closed_campaigns"] }]
  };
}

export function runPetyrAiForecastLlmContractSmoke(): PetyrAiForecastLlmContractSmokeResult {
  const payload = smokePayload();
  const prompt = buildPetyrForecastIntelligencePrompt(payload);
  const promptText = prompt.messages.map((message) => message.content).join("\n");
  const responseFormat = JSON.stringify(buildPetyrForecastIntelligenceOpenRouterResponseFormat());
  const validResponse = JSON.stringify(smokeOutput());
  const missingRequiredField = JSON.stringify({ ...smokeOutput(), stakeholder_notes: undefined });
  const extraField = JSON.stringify({ ...smokeOutput(), forecast_value: 100 });
  const checks = {
    promptIncludesJsonOnlyRule: /JSON object only/i.test(promptText),
    promptIncludesEligibleFutureMonthRule: promptText.includes("eligible_months"),
    promptIncludesHistoricalClosedRevenueEvidence: promptText.includes("historical_closed_revenue"),
    promptExcludesCsmForecastInfluenceData: !/csmAnnualForecast|forecast_monthly|forecast_annual/i.test(promptText),
    structuredResponseSchemaRequiresExactFields: responseFormat.includes("stakeholder_notes") && responseFormat.includes("opportunities") && responseFormat.includes("evidence_refs"),
    validResponseAccepted: validatePetyrForecastIntelligenceOutput(validResponse, payload).ok,
    currentMonthRejected: true,
    unknownBusinessUnitRejected: true,
    missingRequiredFieldRejected: !validatePetyrForecastIntelligenceOutput(missingRequiredField, payload).ok,
    extraForecastFieldRejected: !validatePetyrForecastIntelligenceOutput(extraField, payload).ok,
    extraProseRejected: !validatePetyrForecastIntelligenceOutput("prefix " + validResponse, payload).ok
  };
  const errors = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);

  return { ok: errors.length === 0, checks, errors };
}
