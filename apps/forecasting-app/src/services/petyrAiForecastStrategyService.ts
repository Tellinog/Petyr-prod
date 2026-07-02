import { PETYR_BUSINESS_UNITS, type PetyrBusinessUnit } from "../lib/petyr/constants";
import type {
  PetyrAgreementDetail,
  PetyrBusinessUnitSummary,
  PetyrCampaignDetail,
  PetyrMonthlyRevenueTrend
} from "./petyrDataService";
import {
  getPetyrAiForecastBaselineWeightsWithDiagnostics,
  type PetyrAiForecastBaselineWeights
} from "./petyrAiForecastWeightsService";

const DEFAULT_HISTORY_YEARS = 3;
const MIN_STRONG_HISTORY_MONTHS = 6;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const COMMERCIAL_ROUNDING_GRANULARITY = 100;
const GROWTH_THRESHOLD = 1.15;
const OVER_CONSUMPTION_THRESHOLD = 1.2;
const SUMMER_SLOWDOWN_THRESHOLD = 0.85;
const PLANNED_FUTURE_STATUSES = new Set(["setup", "recruiting"]);
const INVALID_STATUS_TOKENS = [
  "abort",
  "cancel",
  "cancell",
  "annull",
  "delete",
  "deleted",
  "void",
  "lost",
  "reject",
  "archive",
  "archiv",
  "invalid"
];
const PLANNING_ONLY_STATUS_TOKENS = [
  "draft",
  "planned",
  "planning",
  "pipeline",
  "tentative",
  "proposed",
  "setup",
  "recruiting"
];
const BUSINESS_UNIT_TITLE_ALIASES: Record<PetyrBusinessUnit, string[][]> = {
  AI: [["ai"], ["artificial", "intelligence"], ["intelligenza", "artificiale"]],
  Accessibility: [["accessibility"], ["accessibilita"], ["a11y"]],
  Community: [["community"]],
  Experience: [["experience"], ["ux"], ["user", "experience"]],
  Express: [["express"]],
  FTE: [["fte"], ["full", "time", "equivalent"]],
  Other: [["other"]],
  QA: [["qa"], ["quality", "assurance"]],
  Security: [["security"], ["cybersecurity"], ["cyber", "security"]],
  TA: [["ta"], ["test", "automation"]]
};
const AMBIGUOUS_SINGLE_TOKEN_BU_ALIASES = new Set(["ai", "ta"]);

type TechnicalSignalResult = {
  value: number;
  flags: string[];
  explanationParts: string[];
};

export type PetyrAiForecastHistoricalClosedRevenuePoint = {
  businessUnit: PetyrBusinessUnit;
  year: number;
  month: number;
  closedRevenue: number;
};

type PetyrAiForecastHistoricalPoint = PetyrAiForecastHistoricalClosedRevenuePoint;

type PetyrAiForecastInternalHistoricalPoint = PetyrAiForecastHistoricalPoint & {
  agreementName: string;
  campaignName: string;
};

export type PetyrAiForecastSelectedYearRealSignal = {
  businessUnit: PetyrBusinessUnit;
  year: number;
  closedRevenueYtd: number;
  plannedFutureValue: number;
  closedRevenueCampaignsCount: number;
  plannedFutureCampaignsCount: number;
  normalizedToOtherCount: number;
};

type PetyrAiForecastPlannedCampaign = {
  businessUnit: PetyrBusinessUnit;
  year: number;
  month: number;
  value: number;
  agreementName: string;
  campaignName: string;
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
  businessUnit: PetyrBusinessUnit;
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

export type PetyrAiForecastSelectedYearContext = {
  monthlyTrend: PetyrMonthlyRevenueTrend[];
  businessUnitSummary: PetyrBusinessUnitSummary[];
  monthlyForecasts: Array<{
    businessUnit: string;
    year: number;
    month: number;
    forecastType: string;
    value: number;
    aiForecastValue: number | null;
    status: string;
  }>;
  annualForecasts: Array<{
    businessUnit: string;
    year: number;
    value: number;
    aiForecastValue: number | null;
    status: string;
    note: string | null;
  }>;
  aiForecasts: Array<{
    businessUnit: string;
    year: number;
    month: number;
    forecastValue: number;
    confidenceScore: number | null;
    modelVersion: string;
    explanation: string | null;
    generatedAt: string;
  }>;
};

export type PetyrAiForecastAgreementResidualSignal = {
  activeAgreementCount: number;
  residualValue: number;
  futureExpiry: boolean;
  monthsToExpiry: number | null;
  forecastCoverageValue: number;
  estimatedCoverageUntilExpiry: number;
  coverageGap: number;
  residualCoverageGap: number;
  residualPressureLevel: "none" | "covered" | "gap";
  adviceCandidate: string | null;
  status: "no_active_residual" | "covered" | "gap" | "company_level_unattributed";
};

export type PetyrAiForecastCandidate = {
  companyName: string;
  businessUnit: PetyrBusinessUnit;
  year: number;
  month: number;
  baselineForecast: number;
  historicalWeightedBaseline: number;
  seasonalitySignal: number;
  runRateSignal: number;
  plannedCampaignsValue: number;
  activeAgreementResidual: number;
  monthsToExpiry: number | null;
  estimatedCoverageUntilExpiry: number;
  residualCoverageGap: number;
  residualPressureLevel: PetyrAiForecastAgreementResidualSignal["residualPressureLevel"];
  adviceCandidate: string | null;
  agreementResidualSignal: PetyrAiForecastAgreementResidualSignal;
  roundedForecastValue: number;
  roundingGranularity: number;
  trendSignal: PetyrAiForecastTrendSignal;
  businessUnitAttribution: PetyrAiForecastBusinessUnitAttribution;
  agreementResidualAllocation: PetyrAiForecastAgreementResidualAllocation;
  consultativeScenarios: PetyrAiForecastConsultativeScenario[];
  dataQualityFlags: string[];
  explanationParts: string[];
};

type PetyrAiForecastCandidateBeforeResidual = Omit<
  PetyrAiForecastCandidate,
  | "activeAgreementResidual"
  | "monthsToExpiry"
  | "estimatedCoverageUntilExpiry"
  | "residualCoverageGap"
  | "residualPressureLevel"
  | "adviceCandidate"
  | "agreementResidualSignal"
  | "roundedForecastValue"
  | "roundingGranularity"
  | "businessUnitAttribution"
  | "agreementResidualAllocation"
  | "consultativeScenarios"
>;

export type PetyrAiForecastSignalsResult = {
  source: "postgresql";
  companyName: string;
  year: number;
  asOfDate: string;
  eligibleMonths: number[];
  candidates: PetyrAiForecastCandidate[];
  historicalClosedRevenue: PetyrAiForecastHistoricalClosedRevenuePoint[];
  selectedYearRealSignals: PetyrAiForecastSelectedYearRealSignal[];
  selectedYearContext: PetyrAiForecastSelectedYearContext;
  diagnostics: string[];
};

export type PetyrAiForecastStrategyOptions = {
  currentDate?: Date;
  historyYears?: number;
};

type BuildCandidateInput = {
  companyName: string;
  year: number;
  currentDate: Date;
  eligibleMonths: number[];
  historicalPoints: PetyrAiForecastInternalHistoricalPoint[];
  plannedCampaigns: PetyrAiForecastPlannedCampaign[];
  campaigns: PetyrCampaignDetail[];
  agreements: PetyrAgreementDetail[];
  baselineWeights: PetyrAiForecastBaselineWeights;
};

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function roundMoney(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, value));
}

function roundCommercial(value: number, direction: "floor" | "nearest" | "ceil") {
  if (!Number.isFinite(value)) return 0;
  const normalized = Math.max(0, value);
  if (direction === "floor") return Math.floor(normalized / COMMERCIAL_ROUNDING_GRANULARITY) * COMMERCIAL_ROUNDING_GRANULARITY;
  if (direction === "ceil") return Math.ceil(normalized / COMMERCIAL_ROUNDING_GRANULARITY) * COMMERCIAL_ROUNDING_GRANULARITY;
  return Math.round(normalized / COMMERCIAL_ROUNDING_GRANULARITY) * COMMERCIAL_ROUNDING_GRANULARITY;
}

function roundForecastValue(value: number) {
  return roundCommercial(value, "nearest");
}

function monthIndex(year: number, month: number) {
  return year * 12 + month - 1;
}

function parseIsoDate(value: string | null | undefined) {
  if (!value) return null;

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return null;

  return new Date(timestamp);
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function emptySelectedYearContext(): PetyrAiForecastSelectedYearContext {
  return {
    monthlyTrend: [],
    businessUnitSummary: [],
    monthlyForecasts: [],
    annualForecasts: [],
    aiForecasts: []
  };
}

function daysUntil(date: Date, currentDate: Date) {
  return Math.ceil((startOfLocalDay(date).getTime() - startOfLocalDay(currentDate).getTime()) / ONE_DAY_MS);
}

function monthsUntil(date: Date, currentDate: Date) {
  return Math.max(0, Math.ceil(daysUntil(date, currentDate) / 30.4375));
}

function remainingAgreementMonths(expiryDate: Date, currentDate: Date) {
  const currentIndex = monthIndex(currentDate.getFullYear(), currentDate.getMonth() + 1);
  const expiryIndex = monthIndex(expiryDate.getFullYear(), expiryDate.getMonth() + 1);
  return Math.max(1, expiryIndex - currentIndex + 1);
}

function resolveHistoryYears(input: number | undefined) {
  if (!Number.isInteger(input) || !input) return DEFAULT_HISTORY_YEARS;
  return Math.min(Math.max(input, 1), 5);
}

function getEligibleFutureMonths(year: number, currentDate: Date) {
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;

  if (year < currentYear) return [];
  if (year > currentYear) return Array.from({ length: 12 }, (_, index) => index + 1);

  return Array.from({ length: 12 - currentMonth }, (_, index) => currentMonth + index + 1);
}

function isOfficialBusinessUnit(value: string): value is PetyrBusinessUnit {
  return PETYR_BUSINESS_UNITS.includes(value as PetyrBusinessUnit);
}

function normalizeBusinessUnit(value: string): PetyrBusinessUnit {
  return isOfficialBusinessUnit(value) ? value : "Other";
}

function sanitizeTitleTokens(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/g)
    .filter(Boolean);
}

function phraseMatches(tokens: string[], phrase: string[]) {
  if (phrase.length === 0 || tokens.length < phrase.length) return false;

  return tokens.some((_, index) => phrase.every((part, offset) => tokens[index + offset] === part));
}

export function matchBusinessUnitsFromSanitizedTitle(values: string[]) {
  const tokens = values.flatMap(sanitizeTitleTokens);
  const byBusinessUnit = new Map<PetyrBusinessUnit, string[]>();

  for (const businessUnit of PETYR_BUSINESS_UNITS) {
    for (const alias of BUSINESS_UNIT_TITLE_ALIASES[businessUnit]) {
      if (alias.length === 1 && AMBIGUOUS_SINGLE_TOKEN_BU_ALIASES.has(alias[0])) continue;
      if (!phraseMatches(tokens, alias)) continue;
      byBusinessUnit.set(businessUnit, [...(byBusinessUnit.get(businessUnit) ?? []), alias.join("_")]);
    }
  }

  return {
    tokens: [...new Set(tokens)],
    matches: [...byBusinessUnit.entries()].map(([businessUnit, matchedTokens]) => ({
      businessUnit,
      matchedTokens: [...new Set(matchedTokens)]
    }))
  };
}

function emptyBusinessUnitAttribution(businessUnit: PetyrBusinessUnit): PetyrAiForecastBusinessUnitAttribution {
  return {
    businessUnit,
    method: "none",
    confidence: "none",
    matchedTokens: [],
    share: 0
  };
}

function averagePositive(values: number[]) {
  const positive = values.filter((value) => value > 0);
  return positive.length === 0 ? 0 : average(positive);
}

function campaignAgreementKey(value: string | null | undefined) {
  return normalizeKey(value ?? "");
}

function campaignsLinkedToAgreement(campaigns: PetyrCampaignDetail[], agreement: PetyrAgreementDetail) {
  const agreementKey = campaignAgreementKey(agreement.name);
  if (!agreementKey) return [];
  return campaigns.filter((campaign) => campaignAgreementKey(campaign.agreementName) === agreementKey);
}

function sumRevenueByBusinessUnit(campaigns: PetyrCampaignDetail[], currentDate: Date) {
  const byBusinessUnit = new Map<PetyrBusinessUnit, number>();

  for (const campaign of campaigns) {
    if (!isClosedRevenueCampaign(campaign, currentDate)) continue;
    const businessUnit = normalizeBusinessUnit(campaign.businessUnit);
    byBusinessUnit.set(businessUnit, roundMoney((byBusinessUnit.get(businessUnit) ?? 0) + campaign.revenue));
  }

  return byBusinessUnit;
}

function sumHistoricalByBusinessUnit(points: PetyrAiForecastInternalHistoricalPoint[]) {
  const byBusinessUnit = new Map<PetyrBusinessUnit, number>();

  for (const point of points) {
    byBusinessUnit.set(point.businessUnit, roundMoney((byBusinessUnit.get(point.businessUnit) ?? 0) + point.closedRevenue));
  }

  return byBusinessUnit;
}

function shareMapFromRevenue(revenueByBusinessUnit: Map<PetyrBusinessUnit, number>) {
  const total = [...revenueByBusinessUnit.values()].reduce((sum, value) => sum + value, 0);
  const shares = new Map<PetyrBusinessUnit, number>();
  if (total <= 0) return shares;

  for (const [businessUnit, value] of revenueByBusinessUnit.entries()) {
    if (value > 0) shares.set(businessUnit, value / total);
  }

  return shares;
}

function attributionForBusinessUnit(input: {
  businessUnit: PetyrBusinessUnit;
  titleMatches: ReturnType<typeof matchBusinessUnitsFromSanitizedTitle>["matches"];
  linkedRevenueShares: Map<PetyrBusinessUnit, number>;
  companyRevenueShares: Map<PetyrBusinessUnit, number>;
}): PetyrAiForecastBusinessUnitAttribution {
  const titleMatch = input.titleMatches.find((match) => match.businessUnit === input.businessUnit);
  if (titleMatch && input.titleMatches.length === 1) {
    return { businessUnit: input.businessUnit, method: "title_token", confidence: "high", matchedTokens: titleMatch.matchedTokens, share: 1 };
  }
  if (titleMatch && input.titleMatches.length > 1) {
    const share = input.linkedRevenueShares.get(input.businessUnit) ?? 1 / input.titleMatches.length;
    return { businessUnit: input.businessUnit, method: "title_token", confidence: "medium", matchedTokens: titleMatch.matchedTokens, share };
  }

  const linkedShare = input.linkedRevenueShares.get(input.businessUnit) ?? 0;
  if (linkedShare > 0) return { businessUnit: input.businessUnit, method: "linked_campaign_history", confidence: "medium", matchedTokens: [], share: linkedShare };

  const companyShare = input.companyRevenueShares.get(input.businessUnit) ?? 0;
  if (companyShare > 0) return { businessUnit: input.businessUnit, method: "company_history", confidence: "low", matchedTokens: [], share: companyShare };

  return emptyBusinessUnitAttribution(input.businessUnit);
}

function historicalCapacityForBusinessUnit(input: {
  businessUnit: PetyrBusinessUnit;
  linkedCampaigns: PetyrCampaignDetail[];
  historicalPoints: PetyrAiForecastInternalHistoricalPoint[];
  currentDate: Date;
}) {
  const linkedClosedValues = input.linkedCampaigns
    .filter((campaign) => normalizeBusinessUnit(campaign.businessUnit) === input.businessUnit)
    .filter((campaign) => isClosedRevenueCampaign(campaign, input.currentDate))
    .map((campaign) => roundMoney(campaign.revenue));
  const linkedAverage = averagePositive(linkedClosedValues);
  if (linkedAverage > 0) return roundMoney(linkedAverage);

  const companyAverage = averagePositive(
    input.historicalPoints
      .filter((point) => point.businessUnit === input.businessUnit)
      .map((point) => point.closedRevenue)
  );

  return roundMoney(companyAverage);
}

export function buildConsultativeScenarios(value: number): PetyrAiForecastConsultativeScenario[] {
  const roundedValue = roundMoney(value);

  return [
    { id: "floor_100", label: "Round down to 100 EUR", value: roundCommercial(roundedValue, "floor"), direction: "down", reason: "Commercial conservative scenario rounded down to the nearest 100 EUR." },
    { id: "nearest_100", label: "Round to nearest 100 EUR", value: roundCommercial(roundedValue, "nearest"), direction: "nearest", reason: "Neutral consultative scenario rounded to the nearest 100 EUR." },
    { id: "ceil_100", label: "Round up to 100 EUR", value: roundCommercial(roundedValue, "ceil"), direction: "up", reason: "Growth or opportunity scenario rounded up to the nearest 100 EUR." }
  ];
}

function campaignDateParts(campaign: PetyrCampaignDetail) {
  const endDate = parseIsoDate(campaign.endDate);
  if (!endDate) return null;

  return {
    date: endDate,
    year: endDate.getFullYear(),
    month: endDate.getMonth() + 1
  };
}

function isInvalidCampaignStatus(status: string) {
  return INVALID_STATUS_TOKENS.some((token) => status.includes(token));
}

function isPlanningOnlyCampaignStatus(status: string) {
  return PLANNING_ONLY_STATUS_TOKENS.some((token) => status.includes(token));
}

function isClosedRevenueCampaign(campaign: PetyrCampaignDetail, currentDate: Date) {
  const status = normalizeKey(campaign.status);
  const dateParts = campaignDateParts(campaign);

  if (!dateParts) return false;
  if (isInvalidCampaignStatus(status)) return false;
  if (isPlanningOnlyCampaignStatus(status)) return false;

  return startOfLocalDay(dateParts.date).getTime() <= startOfLocalDay(currentDate).getTime();
}

function isPlannedFutureCampaign(campaign: PetyrCampaignDetail, currentDate: Date) {
  const status = normalizeKey(campaign.status);
  const dateParts = campaignDateParts(campaign);

  if (!dateParts) return false;
  if (!PLANNED_FUTURE_STATUSES.has(status)) return false;

  return startOfLocalDay(dateParts.date).getTime() > startOfLocalDay(currentDate).getTime();
}

function collectHistoricalPoints(input: {
  campaigns: PetyrCampaignDetail[];
  currentDate: Date;
}) {
  const byKey = new Map<string, PetyrAiForecastInternalHistoricalPoint>();

  for (const campaign of input.campaigns) {
    if (!isClosedRevenueCampaign(campaign, input.currentDate)) continue;

    const dateParts = campaignDateParts(campaign);
    if (!dateParts) continue;

    const businessUnit = normalizeBusinessUnit(campaign.businessUnit);
    const key = [businessUnit, dateParts.year, dateParts.month].join("\u0000");
    const existing = byKey.get(key);

    if (existing) {
      existing.closedRevenue = roundMoney(existing.closedRevenue + campaign.revenue);
    } else {
      byKey.set(key, {
        businessUnit,
        year: dateParts.year,
        month: dateParts.month,
        closedRevenue: roundMoney(campaign.revenue),
        agreementName: campaign.agreementName,
        campaignName: campaign.name
      });
    }
  }

  return [...byKey.values()];
}

function collectPlannedCampaigns(input: {
  campaigns: PetyrCampaignDetail[];
  currentDate: Date;
}) {
  return input.campaigns.flatMap<PetyrAiForecastPlannedCampaign>((campaign) => {
    if (!isPlannedFutureCampaign(campaign, input.currentDate)) return [];

    const dateParts = campaignDateParts(campaign);
    if (!dateParts) return [];

    return [
      {
        businessUnit: normalizeBusinessUnit(campaign.businessUnit),
        year: dateParts.year,
        month: dateParts.month,
        value: roundMoney(campaign.revenue),
        agreementName: campaign.agreementName,
        campaignName: campaign.name
      }
    ];
  });
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;

  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));

  return Math.sqrt(variance);
}

function signalPoints(input: {
  historicalPoints: PetyrAiForecastHistoricalPoint[];
  businessUnit: PetyrBusinessUnit;
  year: number;
  month: number;
}) {
  const targetIndex = monthIndex(input.year, input.month);

  return input.historicalPoints
    .filter((point) => point.businessUnit === input.businessUnit)
    .filter((point) => monthIndex(point.year, point.month) < targetIndex)
    .sort((left, right) => monthIndex(right.year, right.month) - monthIndex(left.year, left.month));
}

export function calculateHistoricalWeightedBaseline(input: {
  historicalPoints: PetyrAiForecastHistoricalPoint[];
  businessUnit: PetyrBusinessUnit;
  year: number;
  month: number;
}): TechnicalSignalResult {
  const points = signalPoints(input);

  if (points.length === 0) {
    return {
      value: 0,
      flags: ["no_historical_closed_revenue"],
      explanationParts: ["Historical weighted baseline is 0 because no prior closed revenue was found for this company and Business Unit."]
    };
  }

  const targetIndex = monthIndex(input.year, input.month);
  let weightedSum = 0;
  let weightTotal = 0;

  for (const point of points) {
    const monthsAgo = targetIndex - monthIndex(point.year, point.month);
    const recencyWeight = monthsAgo <= 12 ? 3 : monthsAgo <= 24 ? 2 : 1;
    const seasonalityBoost = point.month === input.month ? 1.5 : 1;
    const weight = recencyWeight * seasonalityBoost;

    weightedSum += point.closedRevenue * weight;
    weightTotal += weight;
  }

  const flags = points.length < MIN_STRONG_HISTORY_MONTHS ? ["sparse_history"] : [];

  return {
    value: roundMoney(weightedSum / weightTotal),
    flags,
    explanationParts: [
      `Historical weighted baseline used ${points.length} prior month(s), with stronger weight for recent months and same-month history.`
    ]
  };
}

export function calculateMonthlySeasonality(input: {
  historicalPoints: PetyrAiForecastHistoricalPoint[];
  businessUnit: PetyrBusinessUnit;
  year: number;
  month: number;
}): TechnicalSignalResult {
  const points = signalPoints(input);

  if (points.length === 0) {
    return {
      value: 0,
      flags: ["no_seasonality_history"],
      explanationParts: ["Monthly seasonality signal is 0 because no historical closed revenue was found for this company and Business Unit."]
    };
  }

  const sameMonthValues = points
    .filter((point) => point.month === input.month)
    .map((point) => point.closedRevenue);

  if (sameMonthValues.length > 0) {
    return {
      value: roundMoney(average(sameMonthValues)),
      flags: sameMonthValues.length < 2 ? ["limited_same_month_history"] : [],
      explanationParts: [`Monthly seasonality used ${sameMonthValues.length} same-month historical revenue point(s).`]
    };
  }

  const nearbyMonthValues = points
    .filter((point) => Math.abs(point.month - input.month) === 1)
    .map((point) => point.closedRevenue);

  if (nearbyMonthValues.length > 0) {
    return {
      value: roundMoney(average(nearbyMonthValues)),
      flags: ["same_month_history_missing"],
      explanationParts: ["Monthly seasonality fell back to adjacent-month history because same-month history is missing."]
    };
  }

  return {
    value: roundMoney(average(points.map((point) => point.closedRevenue))),
    flags: ["same_month_history_missing", "nearby_month_history_missing"],
    explanationParts: ["Monthly seasonality fell back to the Business Unit historical average because comparable month history is missing."]
  };
}

export function calculateRunRateSignal(input: {
  historicalPoints: PetyrAiForecastHistoricalPoint[];
  businessUnit: PetyrBusinessUnit;
  year: number;
  month: number;
  currentDate: Date;
}): TechnicalSignalResult {
  const currentYear = input.currentDate.getFullYear();
  const currentMonth = input.currentDate.getMonth() + 1;
  const points = signalPoints(input);
  const currentYearPoints = points.filter(
    (point) =>
      point.year === input.year &&
      input.year === currentYear &&
      point.month < currentMonth
  );
  const runRatePoints = currentYearPoints.length > 0 ? currentYearPoints : points.slice(0, 6);

  if (runRatePoints.length === 0) {
    return {
      value: 0,
      flags: ["no_run_rate_history"],
      explanationParts: ["Run-rate signal is 0 because no completed historical months are available."]
    };
  }

  const values = runRatePoints.map((point) => point.closedRevenue);
  const mean = average(values);
  const deviation = standardDeviation(values);
  const volatilityRatio = mean > 0 ? deviation / mean : 0;
  const volatilityDampener = volatilityRatio > 1 ? 0.8 : volatilityRatio > 0.5 ? 0.9 : 1;
  const flags = [];

  if (runRatePoints.length < 3) flags.push("run_rate_sparse");
  if (volatilityDampener < 1) flags.push("run_rate_volatility_dampened");

  return {
    value: roundMoney(mean * volatilityDampener),
    flags,
    explanationParts: [
      `Run-rate signal used ${runRatePoints.length} completed month(s)${volatilityDampener < 1 ? " with volatility dampening" : ""}.`
    ]
  };
}

export function calculateTrendSignal(input: {
  historicalPoints: PetyrAiForecastInternalHistoricalPoint[];
  businessUnit: PetyrBusinessUnit;
  year: number;
  month: number;
  currentDate: Date;
}): PetyrAiForecastTrendSignal {
  const points = signalPoints(input);
  const recentValues = points.slice(0, 3).map((point) => point.closedRevenue);
  const comparisonValues = points.slice(3, 9).map((point) => point.closedRevenue);
  const recentAverage = roundMoney(averagePositive(recentValues));
  const comparisonAverage = roundMoney(averagePositive(comparisonValues));
  const ratio = comparisonAverage > 0 ? recentAverage / comparisonAverage : null;
  const flags: string[] = [];

  if (recentValues.length < 2 || comparisonAverage <= 0) flags.push("trend_sparse");

  const completedTargetYearValues = points
    .filter((point) => point.year === input.year && point.month < input.month)
    .map((point) => point.closedRevenue);
  const comparableHistoricalValues = points
    .filter((point) => point.year < input.year && point.month < input.month)
    .map((point) => point.closedRevenue);
  const completedTargetYearAverage = averagePositive(completedTargetYearValues);
  const comparableAverage = averagePositive(comparableHistoricalValues);
  const overConsumption = comparableAverage > 0 && completedTargetYearAverage / comparableAverage >= OVER_CONSUMPTION_THRESHOLD;

  if (overConsumption) flags.push("over_consumption_vs_history");

  const summerValues = points.filter((point) => point.month === 7 || point.month === 8).map((point) => point.closedRevenue);
  const nonSummerValues = points.filter((point) => point.month !== 7 && point.month !== 8).map((point) => point.closedRevenue);
  const summerAverage = averagePositive(summerValues);
  const nonSummerAverage = averagePositive(nonSummerValues);
  const summerSlowdown = (input.month === 7 || input.month === 8) && nonSummerAverage > 0 && summerAverage / nonSummerAverage <= SUMMER_SLOWDOWN_THRESHOLD;

  if (summerSlowdown) flags.push("summer_slowdown_detected");

  const direction = flags.includes("trend_sparse")
    ? "sparse"
    : overConsumption
      ? "downward"
      : ratio !== null && ratio >= GROWTH_THRESHOLD
        ? "growth"
        : "neutral";

  if (direction === "growth") flags.push("recent_growth_signal");
  if (direction === "downward") flags.push("downward_rounding_signal");

  return {
    direction,
    recentAverage,
    comparisonAverage,
    ratio: ratio === null ? null : Math.round(ratio * 10000) / 10000,
    summerSlowdown,
    overConsumption,
    flags
  };
}

function plannedCampaignValue(input: {
  plannedCampaigns: PetyrAiForecastPlannedCampaign[];
  businessUnit: PetyrBusinessUnit;
  year: number;
  month: number;
}) {
  return roundMoney(
    input.plannedCampaigns
      .filter((campaign) => campaign.businessUnit === input.businessUnit)
      .filter((campaign) => campaign.year === input.year && campaign.month === input.month)
      .reduce((sum, campaign) => sum + campaign.value, 0)
  );
}

export function weightedSignalBaseline(input: {
  historicalWeightedBaseline: number;
  monthlySeasonality: number;
  runRate: number;
  baselineWeights: PetyrAiForecastBaselineWeights;
}) {
  const signals = [
    { value: input.historicalWeightedBaseline, weight: input.baselineWeights.historicalWeightedBaseline },
    { value: input.monthlySeasonality, weight: input.baselineWeights.monthlySeasonality },
    { value: input.runRate, weight: input.baselineWeights.runRate }
  ];
  const availableSignals = signals.filter((signal) => signal.value > 0);
  if (availableSignals.length === 0) return 0;

  if (input.baselineWeights.enabled) {
    const totalWeight = availableSignals.reduce((sum, signal) => sum + signal.weight, 0);
    if (totalWeight > 0) {
      return roundMoney(
        availableSignals.reduce((sum, signal) => sum + signal.value * (signal.weight / totalWeight), 0)
      );
    }
  }

  return roundMoney(average(availableSignals.map((signal) => signal.value)));
}

function isActiveFutureResidualAgreement(agreement: PetyrAgreementDetail, currentDate: Date) {
  const expiryDate = parseIsoDate(agreement.expiryDate);

  if (!expiryDate || startOfLocalDay(expiryDate).getTime() < startOfLocalDay(currentDate).getTime()) return false;
  if (agreement.residualValue <= 0) return false;

  return true;
}

function emptyAgreementResidualSignal(): PetyrAiForecastAgreementResidualSignal {
  return {
    activeAgreementCount: 0,
    residualValue: 0,
    futureExpiry: false,
    monthsToExpiry: null,
    forecastCoverageValue: 0,
    estimatedCoverageUntilExpiry: 0,
    coverageGap: 0,
    residualCoverageGap: 0,
    residualPressureLevel: "none",
    adviceCandidate: null,
    status: "no_active_residual"
  };
}

function emptyAgreementResidualAllocation(): PetyrAiForecastAgreementResidualAllocation {
  return {
    activeAgreementCount: 0,
    residualValue: 0,
    allocatedResidualValue: 0,
    monthlyResidualCap: 0,
    historicalCapacityValue: 0,
    linkedPlannedCampaignValue: 0,
    cappedLinkedPlannedCampaignValue: 0,
    plannedExceedsResidual: false,
    remainingMonths: null,
    monthsToExpiry: null,
    attributionMethod: "none",
    matchedTokens: [],
    status: "not_applicable"
  };
}

type PetyrAiForecastResidualBundle = {
  signal: PetyrAiForecastAgreementResidualSignal;
  allocation: PetyrAiForecastAgreementResidualAllocation;
  attribution: PetyrAiForecastBusinessUnitAttribution;
};

function emptyResidualBundle(businessUnit: PetyrBusinessUnit): PetyrAiForecastResidualBundle {
  return {
    signal: emptyAgreementResidualSignal(),
    allocation: emptyAgreementResidualAllocation(),
    attribution: emptyBusinessUnitAttribution(businessUnit)
  };
}

function candidateResidualKey(businessUnit: PetyrBusinessUnit, month: number) {
  return [businessUnit, month].join("\u0000");
}

function mergeResidualBundle(
  existing: PetyrAiForecastResidualBundle | undefined,
  next: PetyrAiForecastResidualBundle
): PetyrAiForecastResidualBundle {
  if (!existing) return next;

  const residualValue = roundMoney(existing.signal.residualValue + next.signal.residualValue);
  const forecastCoverageValue = roundMoney(existing.signal.forecastCoverageValue + next.signal.forecastCoverageValue);
  const coverageGap = roundMoney(existing.signal.coverageGap + next.signal.coverageGap);
  const monthsToExpiryValues = [existing.signal.monthsToExpiry, next.signal.monthsToExpiry].filter((value): value is number => value !== null);
  const monthsToExpiry = monthsToExpiryValues.length > 0 ? Math.min(...monthsToExpiryValues) : null;
  const allocation: PetyrAiForecastAgreementResidualAllocation = {
    activeAgreementCount: existing.allocation.activeAgreementCount + next.allocation.activeAgreementCount,
    residualValue,
    allocatedResidualValue: roundMoney(existing.allocation.allocatedResidualValue + next.allocation.allocatedResidualValue),
    monthlyResidualCap: roundMoney(existing.allocation.monthlyResidualCap + next.allocation.monthlyResidualCap),
    historicalCapacityValue: roundMoney(existing.allocation.historicalCapacityValue + next.allocation.historicalCapacityValue),
    linkedPlannedCampaignValue: roundMoney(existing.allocation.linkedPlannedCampaignValue + next.allocation.linkedPlannedCampaignValue),
    cappedLinkedPlannedCampaignValue: roundMoney(existing.allocation.cappedLinkedPlannedCampaignValue + next.allocation.cappedLinkedPlannedCampaignValue),
    plannedExceedsResidual: existing.allocation.plannedExceedsResidual || next.allocation.plannedExceedsResidual,
    remainingMonths: existing.allocation.remainingMonths === null
      ? next.allocation.remainingMonths
      : next.allocation.remainingMonths === null
        ? existing.allocation.remainingMonths
        : Math.min(existing.allocation.remainingMonths, next.allocation.remainingMonths),
    monthsToExpiry,
    attributionMethod: existing.attribution.confidence === "none" ? next.allocation.attributionMethod : existing.allocation.attributionMethod,
    matchedTokens: [...new Set([...existing.allocation.matchedTokens, ...next.allocation.matchedTokens])],
    status: coverageGap > 0 ? "gap" : allocationStatus(existing.allocation, next.allocation)
  };

  return {
    signal: {
      activeAgreementCount: allocation.activeAgreementCount,
      residualValue,
      futureExpiry: true,
      monthsToExpiry,
      forecastCoverageValue,
      estimatedCoverageUntilExpiry: forecastCoverageValue,
      coverageGap,
      residualCoverageGap: coverageGap,
      residualPressureLevel: coverageGap > 0 ? "gap" : "covered",
      adviceCandidate: coverageGap > 0 ? "Agreement residual consumption may be below the historical-guided allowance before expiry." : null,
      status: coverageGap > 0 ? "gap" : "covered"
    },
    allocation,
    attribution: existing.attribution.confidence === "none" ? next.attribution : existing.attribution
  };
}

function allocationStatus(left: PetyrAiForecastAgreementResidualAllocation, right: PetyrAiForecastAgreementResidualAllocation) {
  if (left.status === "gap" || right.status === "gap") return "gap";
  if (left.status === "capped" || right.status === "capped") return "capped";
  if (left.status === "allocated" || right.status === "allocated") return "allocated";
  return "not_applicable";
}

function buildAgreementResidualSignals(input: {
  agreements: PetyrAgreementDetail[];
  candidates: PetyrAiForecastCandidateBeforeResidual[];
  campaigns: PetyrCampaignDetail[];
  historicalPoints: PetyrAiForecastInternalHistoricalPoint[];
  plannedCampaigns: PetyrAiForecastPlannedCampaign[];
  currentDate: Date;
}) {
  const activeResidualAgreements = input.agreements.filter((agreement) =>
    isActiveFutureResidualAgreement(agreement, input.currentDate)
  );
  const bundles = new Map<string, PetyrAiForecastResidualBundle>();
  const companyRevenueShares = shareMapFromRevenue(sumHistoricalByBusinessUnit(input.historicalPoints));

  for (const agreement of activeResidualAgreements) {
    const expiryDate = parseIsoDate(agreement.expiryDate);
    if (!expiryDate) continue;

    const linkedCampaigns = campaignsLinkedToAgreement(input.campaigns, agreement);
    const titleMatch = matchBusinessUnitsFromSanitizedTitle([
      agreement.name,
      ...linkedCampaigns.map((campaign) => campaign.name)
    ]);
    const linkedRevenueShares = shareMapFromRevenue(sumRevenueByBusinessUnit(linkedCampaigns, input.currentDate));
    const remainingMonths = remainingAgreementMonths(expiryDate, input.currentDate);
    const monthsToExpiry = monthsUntil(expiryDate, input.currentDate);
    const expiryIndex = monthIndex(expiryDate.getFullYear(), expiryDate.getMonth() + 1);

    for (const candidate of input.candidates) {
      if (monthIndex(candidate.year, candidate.month) > expiryIndex) continue;

      const attribution = attributionForBusinessUnit({
        businessUnit: candidate.businessUnit,
        titleMatches: titleMatch.matches,
        linkedRevenueShares,
        companyRevenueShares
      });
      if (attribution.share <= 0) continue;

      const monthlyResidualCap = roundMoney((agreement.residualValue / remainingMonths) * attribution.share);
      const historicalCapacityValue = historicalCapacityForBusinessUnit({
        businessUnit: candidate.businessUnit,
        linkedCampaigns,
        historicalPoints: input.historicalPoints,
        currentDate: input.currentDate
      });
      const allocatedResidualValue = roundMoney(Math.min(monthlyResidualCap, historicalCapacityValue > 0 ? historicalCapacityValue : monthlyResidualCap));
      const linkedPlannedCampaignValue = roundMoney(input.plannedCampaigns
        .filter((campaign) => campaign.businessUnit === candidate.businessUnit)
        .filter((campaign) => campaign.year === candidate.year && campaign.month === candidate.month)
        .filter((campaign) => campaignAgreementKey(campaign.agreementName) === campaignAgreementKey(agreement.name))
        .reduce((sum, campaign) => sum + campaign.value, 0));
      const cappedLinkedPlannedCampaignValue = roundMoney(Math.min(linkedPlannedCampaignValue, allocatedResidualValue || monthlyResidualCap));
      const plannedExceedsResidual = linkedPlannedCampaignValue > cappedLinkedPlannedCampaignValue;
      const forecastCoverageValue = roundMoney(Math.min(candidate.baselineForecast, allocatedResidualValue || candidate.baselineForecast));
      const coverageGap = roundMoney(Math.max(0, allocatedResidualValue - forecastCoverageValue));
      const allocation: PetyrAiForecastAgreementResidualAllocation = {
        activeAgreementCount: 1,
        residualValue: roundMoney(agreement.residualValue * attribution.share),
        allocatedResidualValue,
        monthlyResidualCap,
        historicalCapacityValue,
        linkedPlannedCampaignValue,
        cappedLinkedPlannedCampaignValue,
        plannedExceedsResidual,
        remainingMonths,
        monthsToExpiry,
        attributionMethod: attribution.method,
        matchedTokens: attribution.matchedTokens,
        status: plannedExceedsResidual ? "capped" : coverageGap > 0 ? "gap" : "allocated"
      };
      const bundle: PetyrAiForecastResidualBundle = {
        signal: {
          activeAgreementCount: 1,
          residualValue: allocation.residualValue,
          futureExpiry: true,
          monthsToExpiry,
          forecastCoverageValue,
          estimatedCoverageUntilExpiry: forecastCoverageValue,
          coverageGap,
          residualCoverageGap: coverageGap,
          residualPressureLevel: coverageGap > 0 ? "gap" : "covered",
          adviceCandidate: coverageGap > 0 || plannedExceedsResidual
            ? "Agreement residual consumption deserves attention: historical-guided allocation is tight before expiry."
            : null,
          status: coverageGap > 0 ? "gap" : "covered"
        },
        allocation,
        attribution
      };
      const key = candidateResidualKey(candidate.businessUnit, candidate.month);
      bundles.set(key, mergeResidualBundle(bundles.get(key), bundle));
    }
  }

  return new Map<string, PetyrAiForecastResidualBundle>(
    input.candidates.map((candidate) => {
      const key = candidateResidualKey(candidate.businessUnit, candidate.month);
      return [key, bundles.get(key) ?? emptyResidualBundle(candidate.businessUnit)];
    })
  );
}

function applyResidualAllocationCap(input: {
  signalBaseline: number;
  plannedCampaignsValue: number;
  allocation: PetyrAiForecastAgreementResidualAllocation;
}) {
  if (input.allocation.status === "not_applicable") {
    return roundMoney(Math.max(input.signalBaseline, input.plannedCampaignsValue));
  }

  const unlinkedPlannedValue = roundMoney(Math.max(0, input.plannedCampaignsValue - input.allocation.linkedPlannedCampaignValue));
  const residualBackedSignal = input.allocation.allocatedResidualValue > 0
    ? Math.min(input.signalBaseline, input.allocation.allocatedResidualValue)
    : input.signalBaseline;
  const linkedResidualComponent = Math.max(
    residualBackedSignal,
    input.allocation.cappedLinkedPlannedCampaignValue
  );

  return roundMoney(unlinkedPlannedValue + linkedResidualComponent);
}


export function buildDeterministicForecastCandidates(input: BuildCandidateInput) {
  const candidatesWithoutResidual = input.eligibleMonths.flatMap((month) =>
    PETYR_BUSINESS_UNITS.map((businessUnit) => {
      const historicalWeighted = calculateHistoricalWeightedBaseline({
        historicalPoints: input.historicalPoints,
        businessUnit,
        year: input.year,
        month
      });
      const seasonality = calculateMonthlySeasonality({
        historicalPoints: input.historicalPoints,
        businessUnit,
        year: input.year,
        month
      });
      const runRate = calculateRunRateSignal({
        historicalPoints: input.historicalPoints,
        businessUnit,
        year: input.year,
        month,
        currentDate: input.currentDate
      });
      const trendSignal = calculateTrendSignal({
        historicalPoints: input.historicalPoints,
        businessUnit,
        year: input.year,
        month,
        currentDate: input.currentDate
      });
      const plannedCampaignsValue = plannedCampaignValue({
        plannedCampaigns: input.plannedCampaigns,
        businessUnit,
        year: input.year,
        month
      });
      const signalBaseline = weightedSignalBaseline({
        historicalWeightedBaseline: historicalWeighted.value,
        monthlySeasonality: seasonality.value,
        runRate: runRate.value,
        baselineWeights: input.baselineWeights
      });
      const baselineForecast = roundMoney(Math.max(signalBaseline, plannedCampaignsValue));
      const dataQualityFlags = [
        ...historicalWeighted.flags,
        ...seasonality.flags,
        ...runRate.flags,
        ...trendSignal.flags
      ];
      const explanationParts = [
        ...historicalWeighted.explanationParts,
        ...seasonality.explanationParts,
        ...runRate.explanationParts
      ];

      if (plannedCampaignsValue > 0) {
        dataQualityFlags.push("planned_future_present");
        explanationParts.push("Baseline uses valid planned future campaign value as a floor for the target month only.");
      }

      if (trendSignal.direction === "growth") {
        explanationParts.push("Recent closed revenue pace is above the comparable historical baseline.");
      }
      if (trendSignal.overConsumption) {
        explanationParts.push("Selected-year consumption is above comparable historical pace, so consultative rounding should be conservative.");
      }
      if (trendSignal.summerSlowdown) {
        explanationParts.push("Historical summer slowdown is visible for this target month.");
      }

      if (baselineForecast === 0) {
        dataQualityFlags.push("zero_baseline");
        explanationParts.push("Baseline forecast remains 0 because no positive historical, run-rate or valid planned future signal was available.");
      }

      return {
        companyName: input.companyName,
        businessUnit,
        year: input.year,
        month,
        baselineForecast,
        historicalWeightedBaseline: historicalWeighted.value,
        seasonalitySignal: seasonality.value,
        runRateSignal: runRate.value,
        plannedCampaignsValue,
        trendSignal,
        dataQualityFlags,
        explanationParts
      };
    })
  );
  const residualBundles = buildAgreementResidualSignals({
    agreements: input.agreements,
    candidates: candidatesWithoutResidual,
    campaigns: input.campaigns,
    historicalPoints: input.historicalPoints,
    plannedCampaigns: input.plannedCampaigns,
    currentDate: input.currentDate
  });

  return candidatesWithoutResidual.map<PetyrAiForecastCandidate>((candidate) => {
    const residualBundle = residualBundles.get(candidateResidualKey(candidate.businessUnit, candidate.month)) ?? emptyResidualBundle(candidate.businessUnit);
    const agreementResidualSignal = residualBundle.signal;
    const agreementResidualAllocation = residualBundle.allocation;
    const businessUnitAttribution = residualBundle.attribution;
    const uncappedBaseline = candidate.baselineForecast;
    const signalBaseline = weightedSignalBaseline({
      historicalWeightedBaseline: candidate.historicalWeightedBaseline,
      monthlySeasonality: candidate.seasonalitySignal,
      runRate: candidate.runRateSignal,
      baselineWeights: input.baselineWeights
    });
    const baselineForecast = applyResidualAllocationCap({
      signalBaseline,
      plannedCampaignsValue: candidate.plannedCampaignsValue,
      allocation: agreementResidualAllocation
    });
    const dataQualityFlags = [...candidate.dataQualityFlags];
    const explanationParts = [...candidate.explanationParts];

    if (agreementResidualSignal.activeAgreementCount > 0) {
      dataQualityFlags.push("agreement_residual_historical_guided_signal");
      explanationParts.push(
        "Agreement residual pressure is allocated by sanitized BU title matches, linked campaign history, then company BU history."
      );

      if (businessUnitAttribution.method === "title_token") dataQualityFlags.push("agreement_bu_title_token_match");
      if (agreementResidualAllocation.status === "capped" || baselineForecast < uncappedBaseline) {
        dataQualityFlags.push("agreement_residual_cap_applied");
        explanationParts.push("Forecast was capped so the agreement-linked component does not exceed historical-guided residual allowance.");
      }
      if (agreementResidualAllocation.plannedExceedsResidual) {
        dataQualityFlags.push("planned_exceeds_residual_allowance");
        explanationParts.push("A linked planned campaign is above the residual allowance for this agreement/month.");
      }
      if (agreementResidualSignal.coverageGap > 0) {
        dataQualityFlags.push("agreement_residual_gap");
        explanationParts.push("Future deterministic baseline coverage is below active future-expiring agreement residual value.");
      }
    }

    return {
      ...candidate,
      baselineForecast,
      activeAgreementResidual: agreementResidualSignal.residualValue,
      monthsToExpiry: agreementResidualSignal.monthsToExpiry,
      estimatedCoverageUntilExpiry: agreementResidualSignal.estimatedCoverageUntilExpiry,
      residualCoverageGap: agreementResidualSignal.residualCoverageGap,
      residualPressureLevel: agreementResidualSignal.residualPressureLevel,
      adviceCandidate: agreementResidualSignal.adviceCandidate,
      agreementResidualSignal,
      roundedForecastValue: roundForecastValue(baselineForecast),
      roundingGranularity: COMMERCIAL_ROUNDING_GRANULARITY,
      businessUnitAttribution,
      agreementResidualAllocation,
      consultativeScenarios: buildConsultativeScenarios(baselineForecast),
      dataQualityFlags: [...new Set(dataQualityFlags)],
      explanationParts: [...new Set(explanationParts)]
    };
  });
}


export async function buildCompanyBuForecastSignals(
  companyName: string,
  year: number,
  options: PetyrAiForecastStrategyOptions = {}
): Promise<PetyrAiForecastSignalsResult> {
  const currentDate = options.currentDate ?? new Date();
  const historyYears = resolveHistoryYears(options.historyYears);
  const eligibleMonths = getEligibleFutureMonths(year, currentDate);
  const diagnostics: string[] = [];
  const resolvedCompanyName = companyName.trim();

  if (!resolvedCompanyName) {
    return {
      source: "postgresql",
      companyName: resolvedCompanyName,
      year,
      asOfDate: toIsoDate(currentDate),
      eligibleMonths: [],
      candidates: [],
      historicalClosedRevenue: [],
      selectedYearRealSignals: [],
      selectedYearContext: emptySelectedYearContext(),
      diagnostics: ["Missing company name for Petyr AI Forecast deterministic baseline."]
    };
  }

  if (eligibleMonths.length === 0) {
    diagnostics.push(
      `No eligible AI Forecast months for ${year}: past months and the current month are excluded.`
    );
  }

  const yearsToRead = Array.from(
    { length: historyYears + 1 },
    (_, index) => year - index
  );
  const weightsResolution = await getPetyrAiForecastBaselineWeightsWithDiagnostics();
  const { getCompanyDetail } = await import("./petyrDataService");
  const detailsByYear = await Promise.all(
    yearsToRead.map(async (detailYear) => ({
      year: detailYear,
      detail: await getCompanyDetail(resolvedCompanyName, detailYear)
    }))
  );

  const canonicalCompanyName =
    detailsByYear.find((item) => item.detail.data.overview?.companyName)?.detail.data.overview?.companyName ??
    resolvedCompanyName;
  const historicalPoints = detailsByYear.flatMap((item) =>
    collectHistoricalPoints({
      campaigns: item.detail.data.campaigns,
      currentDate
    })
  );
  const plannedCampaigns = detailsByYear.flatMap((item) =>
    collectPlannedCampaigns({
      campaigns: item.detail.data.campaigns,
      currentDate
    })
  );
  const targetYearDetail = detailsByYear.find((item) => item.year === year)?.detail;

  diagnostics.push(
    ...detailsByYear.flatMap((item) => item.detail.diagnostics),
    ...weightsResolution.diagnostics
  );

  const candidates = buildDeterministicForecastCandidates({
    companyName: canonicalCompanyName,
    year,
    currentDate,
    eligibleMonths,
    historicalPoints,
    plannedCampaigns,
    campaigns: detailsByYear.flatMap((item) => item.detail.data.campaigns),
    agreements: targetYearDetail?.data.agreements ?? [],
    baselineWeights: weightsResolution.weights
  });

  const selectedYearContext = targetYearDetail
    ? {
        monthlyTrend: targetYearDetail.data.monthlyTrend,
        businessUnitSummary: targetYearDetail.data.businessUnitSummary,
        monthlyForecasts: targetYearDetail.data.monthlyForecasts,
        annualForecasts: targetYearDetail.data.annualForecasts,
        aiForecasts: targetYearDetail.data.aiForecasts
      }
    : emptySelectedYearContext();
  const selectedYearRealSignals = selectedYearContext.businessUnitSummary
    .filter((row) => isOfficialBusinessUnit(row.businessUnit))
    .map<PetyrAiForecastSelectedYearRealSignal>((row) => ({
      businessUnit: normalizeBusinessUnit(row.businessUnit),
      year,
      closedRevenueYtd: roundMoney(row.actualRevenue),
      plannedFutureValue: roundMoney(row.plannedFuture),
      closedRevenueCampaignsCount: row.closedRevenueCampaignsCount,
      plannedFutureCampaignsCount: row.plannedFutureCampaignsCount,
      normalizedToOtherCount: row.normalizedToOtherCount
    }));

  return {
    source: "postgresql",
    companyName: canonicalCompanyName,
    year,
    asOfDate: toIsoDate(currentDate),
    eligibleMonths,
    candidates,
    historicalClosedRevenue: historicalPoints.map(({ businessUnit, year, month, closedRevenue }) => ({ businessUnit, year, month, closedRevenue })),
    selectedYearRealSignals,
    selectedYearContext,
    diagnostics: [...new Set(diagnostics)]
  };
}
