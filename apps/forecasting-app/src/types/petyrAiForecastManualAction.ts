export type PetyrAiForecastResidualCoverage = {
  activeAgreementCount: number;
  residualValue: number;
  futureExpiry: boolean;
  forecastCoverageValue: number;
  coverageGap: number;
  status: string;
};

export type PetyrAiForecastTrendSignal = {
  direction: "growth" | "downward" | "neutral" | "sparse";
  recentAverage: number;
  comparisonAverage: number;
  ratio: number | null;
  summerSlowdown: boolean;
  overConsumption: boolean;
  flags: string[];
};

export type PetyrAiForecastBusinessUnitAttribution = {
  businessUnit: string;
  method: "title_token" | "linked_campaign_history" | "company_history" | "none";
  confidence: "high" | "medium" | "low" | "none";
  matchedTokens: string[];
  share: number;
};

export type PetyrAiForecastAgreementResidualAllocation = {
  activeAgreementCount: number;
  residualValue: number;
  allocatedResidualValue: number;
  monthlyResidualCap: number;
  historicalCapacityValue: number;
  linkedPlannedCampaignValue: number;
  cappedLinkedPlannedCampaignValue: number;
  plannedExceedsResidual: boolean;
  remainingMonths: number | null;
  monthsToExpiry: number | null;
  attributionMethod: PetyrAiForecastBusinessUnitAttribution["method"];
  matchedTokens: string[];
  status: "not_applicable" | "allocated" | "capped" | "gap";
};

export type PetyrAiForecastConsultativeScenario = {
  id: "floor_100" | "nearest_100" | "ceil_100";
  label: string;
  value: number;
  direction: "down" | "nearest" | "up";
  reason: string;
};

export type PetyrAiForecastAvailability = "available" | "notAvailable";

export type PetyrAiForecastNumericMetric = {
  value: number | null;
  availability: PetyrAiForecastAvailability;
  reason: string | null;
};

export type PetyrAiForecastSignalRole =
  | "numeric_baseline_signal"
  | "planned_future_floor"
  | "driver_advice_only"
  | "agreement_residual_allocation"
  | "business_unit_attribution"
  | "trend_signal"
  | "consultative_scenario"
  | "validation_context";

export type PetyrAiForecastIncludedSignal = {
  code: string;
  label: string;
  role: PetyrAiForecastSignalRole;
  value: number | null;
  numericWeight: number | null;
  weightReason: string;
  reason: string;
};

export type PetyrAiForecastExcludedSignal = {
  code: string;
  label: string;
  role: PetyrAiForecastSignalRole;
  value: number | null;
  reason: string;
};

export type PetyrAiForecastConfidenceAdjustment = {
  code: string;
  label: string;
  delta: number;
  reason: string;
};

export type PetyrAiForecastConfidenceBreakdown = {
  mode: "deterministic_rule_based_score" | "llm_reported_confidence" | "notAvailable";
  score: number | null;
  baseScore: number | null;
  adjustments: PetyrAiForecastConfidenceAdjustment[];
  minScore: number | null;
  maxScore: number | null;
  notAvailableReason: string | null;
};

export type PetyrAiForecastRowExplainability = {
  weightingMode: "positive_signal_average_with_planned_floor" | "notAvailable";
  calibratedWeights: null;
  calibratedWeightsAvailability: {
    availability: "notAvailable";
    reason: string;
  };
  plannedFutureRole: "floor";
  residualPressureRole: "historical_guided_allocation_cap";
  formula: string;
  positiveSignalAverage: PetyrAiForecastNumericMetric;
  historicalWeightedBaseline: PetyrAiForecastNumericMetric;
  seasonalitySignal: PetyrAiForecastNumericMetric;
  runRateSignal: PetyrAiForecastNumericMetric;
  plannedCampaignsValue: PetyrAiForecastNumericMetric;
  baselineForecast: PetyrAiForecastNumericMetric;
  aiForecastValue: PetyrAiForecastNumericMetric;
  finalAiAdjustment: PetyrAiForecastNumericMetric;
  agreementResidualSignal: PetyrAiForecastResidualCoverage;
  roundedForecastValue: number;
  roundingGranularity: number;
  trendSignal: PetyrAiForecastTrendSignal;
  agreementResidualAllocation: PetyrAiForecastAgreementResidualAllocation;
  businessUnitAttribution: PetyrAiForecastBusinessUnitAttribution;
  consultativeScenarios: PetyrAiForecastConsultativeScenario[];
  dataQualityFlags: string[];
  includedSignals: PetyrAiForecastIncludedSignal[];
  excludedSignals: PetyrAiForecastExcludedSignal[];
  drivers: string[];
  explanation: string;
  advice: string;
  confidenceScore: number | null;
  confidenceBreakdown: PetyrAiForecastConfidenceBreakdown;
};

export type PetyrAiForecastManualForecastSource = "deterministic_dry_run" | "llm_current_run";

export type PetyrAiForecastManualForecastRow = {
  source: PetyrAiForecastManualForecastSource;
  businessUnit: string;
  year: number;
  month: number;
  baselineForecast: number;
  plannedCampaignsValue: number;
  agreementResidualSignal: PetyrAiForecastResidualCoverage;
  roundedForecastValue: number;
  roundingGranularity: number;
  trendSignal: PetyrAiForecastTrendSignal;
  agreementResidualAllocation: PetyrAiForecastAgreementResidualAllocation;
  businessUnitAttribution: PetyrAiForecastBusinessUnitAttribution;
  consultativeScenarios: PetyrAiForecastConsultativeScenario[];
  aiForecastValue: number;
  finalAiAdjustment: number;
  confidenceScore: number | null;
  explanation: string;
  advice: string;
  drivers: string[];
  explainability: PetyrAiForecastRowExplainability;
};

export type PetyrAiForecastAlgorithmSummary = {
  code: "petyr_hybrid_company_bu_month_v1";
  version: 1;
  deterministicFormulaExplanation: string;
  weightingMode: "positive_signal_average_with_planned_floor";
  usesCalibratedWeights: false;
  calibratedWeights: null;
  plannedFutureRole: "floor";
  residualPressureRole: "historical_guided_allocation_cap";
  llmAdjustmentExplanation: string;
  validationAuthorityExplanation: string;
  currentLimitations: string[];
};

export type PetyrAiForecastBusinessUnitAggregate = {
  businessUnit: string;
  closedRevenueYtd: PetyrAiForecastNumericMetric;
  plannedFutureValue: PetyrAiForecastNumericMetric;
  deterministicBaselineFutureTotal: PetyrAiForecastNumericMetric;
  aiForecastFutureTotal: PetyrAiForecastNumericMetric;
  csmAnnualForecast: PetyrAiForecastNumericMetric;
  residualPressureGap: PetyrAiForecastNumericMetric;
};

export type PetyrAiForecastMonthlySeriesPoint = {
  month: number;
  closedRevenue: PetyrAiForecastNumericMetric;
  previousMonthForecast: PetyrAiForecastNumericMetric;
  ongoingForecast: PetyrAiForecastNumericMetric;
  deterministicBaseline: PetyrAiForecastNumericMetric;
  aiForecast: PetyrAiForecastNumericMetric;
  aiForecastSource: "current_run" | "notAvailable";
  plannedCampaignValue: PetyrAiForecastNumericMetric;
};

export type PetyrAiForecastSelectedYearAggregates = {
  businessUnits: PetyrAiForecastBusinessUnitAggregate[];
  monthlySeries: PetyrAiForecastMonthlySeriesPoint[];
  notes: string[];
};

export type PetyrAiForecastManualValidationError = {
  path: string;
  message: string;
};

export type PetyrAiForecastOpenRouterDebug = {
  openRouterCalled: boolean;
  notCalledReason:
    | "deterministic_dry_run"
    | "llm_preview_not_requested"
    | "missing_api_key"
    | "no_eligible_future_months"
    | "cached_output_reused"
    | null;
  selectedModel: string | null;
  promptSchemaVersion: string;
  responseSchemaVersion: string;
  asOfDate: string | null;
  eligibleMonths: number[];
  sanitizedPayloadSentToPromptBuilder: Record<string, unknown> | null;
  sanitizedPromptMessagesPrepared: Array<{
    role: "system" | "user";
    content: string;
  }>;
  sanitizedPromptMessagesSentToOpenRouter: Array<{
    role: "system" | "user";
    content: string;
  }>;
  rawModelContent: string | null;
  rawModelContentStatus:
    | "not_received"
    | "safe_to_display_validated"
    | "withheld_validation_failed"
    | "withheld_safety_check_failed"
    | "withheld_provider_error";
  validationErrors: PetyrAiForecastManualValidationError[];
  providerError: string | null;
};

export type PetyrAiForecastManualSavedRow = {
  company: string;
  businessUnit: string;
  year: number;
  month: number;
  forecastValue: number;
  confidenceScore: number | null;
  explanation: string;
  modelVersion: string;
  generatedAt: string;
  action: string;
};

export type PetyrAiForecastManualSkippedRow = {
  company: string;
  businessUnit: string | null;
  year: number;
  month: number | null;
  modelVersion: string;
  reason: string;
};

export type PetyrAiForecastManualReport = {
  savedRows: number;
  skippedRows: number;
  validationErrors: PetyrAiForecastManualValidationError[];
  modelVersion: string;
  savedRowDetails: PetyrAiForecastManualSavedRow[];
  skippedRowDetails: PetyrAiForecastManualSkippedRow[];
};

export type PetyrAiForecastIntelligenceActionResult = {
  requested: boolean;
  ok: boolean;
  status: "not_requested" | "success" | "failed" | "cached";
  provider: "openrouter";
  model: string;
  promptVersion: string;
  outputSchemaVersion: string;
  inputHash: string | null;
  output: {
    stakeholder_notes: Array<{ title: string; note: string; numeric_evidence: string }>;
    risks: Array<{ type: "under_consumption" | "over_consumption" | "margin_risk" | "timing_risk" | "data_quality" | "other"; severity: "low" | "medium" | "high"; description: string; numeric_evidence: string }>;
    opportunities: Array<{ title: string; severity: "low" | "medium" | "high"; evidence: string; numeric_evidence: string }>;
    watchouts: Array<{ title: string; severity: "low" | "medium" | "high"; evidence: string; numeric_evidence: string }>;
  } | null;
  errorMessage: string | null;
  validationErrors: PetyrAiForecastManualValidationError[];
  openRouterCalled: boolean;
  retried: boolean;
  cacheAction: "created" | "updated" | "reused" | "none";
  generatedAt: string | null;
};

export type PetyrCompanyIntelligenceActionResult = {
  ok: boolean;
  requested: boolean;
  companyName: string;
  requestedCompanyName: string;
  year: number;
  status: PetyrAiForecastIntelligenceActionResult["status"];
  model: string | null;
  promptVersion: string;
  outputSchemaVersion: string;
  inputHash: string | null;
  output: PetyrAiForecastIntelligenceActionResult["output"];
  errorMessage: string | null;
  validationErrors: PetyrAiForecastManualValidationError[];
  openRouterCalled: boolean;
  retried: boolean;
  cacheAction: PetyrAiForecastIntelligenceActionResult["cacheAction"];
  generatedAt: string | null;
  diagnostics: string[];
  summary: string;
};

export type PetyrAiForecastManualActionResult = {
  ok: boolean;
  mode: "preview" | "apply";
  dryRun: boolean;
  wroteToDatabase: boolean;
  companyName: string;
  requestedCompanyName: string;
  year: number;
  asOfDate: string | null;
  eligibleMonths: number[];
  modelVersion: string | null;
  deterministicCandidatesCount: number;
  forecasts: PetyrAiForecastManualForecastRow[];
  algorithmSummary: PetyrAiForecastAlgorithmSummary;
  selectedYearAggregates: PetyrAiForecastSelectedYearAggregates;
  openRouterDebug: PetyrAiForecastOpenRouterDebug;
  aiIntelligence: PetyrAiForecastIntelligenceActionResult;
  diagnostics: string[];
  summary: string;
  report?: PetyrAiForecastManualReport;
  error?: string;
};
