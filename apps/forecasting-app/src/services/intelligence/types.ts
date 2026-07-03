import type { PetyrBusinessUnit } from "../../lib/petyr/constants";

export const INTELLIGENCE_INSIGHT_TYPES = [
  "opportunity",
  "reactivation",
  "caution",
  "risk",
  "monitor",
  "no_action"
] as const;

export const INTELLIGENCE_URGENCIES = ["high", "medium", "low"] as const;
export const INTELLIGENCE_USEFULNESS_RATINGS = ["useful", "not_useful", "unclear"] as const;
export const INTELLIGENCE_ACCURACY_RATINGS = ["accurate", "inaccurate", "unclear"] as const;

export type IntelligenceInsightType = (typeof INTELLIGENCE_INSIGHT_TYPES)[number];
export type IntelligenceUrgency = (typeof INTELLIGENCE_URGENCIES)[number];
export type IntelligenceUsefulnessRating = (typeof INTELLIGENCE_USEFULNESS_RATINGS)[number];
export type IntelligenceAccuracyRating = (typeof INTELLIGENCE_ACCURACY_RATINGS)[number];

export type IntelligenceCompanyContext = {
  companyId: string;
  companyName: string;
  csmName: string | null;
  branchName: string | null;
  aliases: string[];
  domain: string | null;
  isActive: boolean;
};

export type IntelligenceQuery = {
  companyId: string;
  companyName: string;
  query: string;
  recencyDays: number;
  maxResults: number;
};

export type ExaSearchResult = {
  id: string | null;
  url: string;
  title: string | null;
  publishedAt: string | null;
  authorOrSource: string | null;
  snippet: string | null;
  raw: unknown;
};

export type NormalizedSignalResult = {
  providerResultId: string | null;
  url: string;
  canonicalUrl: string;
  sourceDomain: string | null;
  title: string | null;
  normalizedTitle: string | null;
  publishedAt: Date | null;
  authorOrSource: string | null;
  snippet: string | null;
  raw: unknown;
  contentHash: string;
  eventSignature: string;
};

export type PersistedSignalItem = NormalizedSignalResult & {
  id: string;
};

export type BusinessUnitClassification = {
  businessUnit: PetyrBusinessUnit;
  relevanceScore: number;
  rationale: string;
  provider: string;
};

export type IntelligenceInsightInput = {
  companyId: string;
  businessUnit: PetyrBusinessUnit;
  insightType: IntelligenceInsightType;
  title: string;
  summary: string;
  rationale: string;
  suggestedAction: string;
  urgency: IntelligenceUrgency;
  confidence: number;
  assumptionsOrLimits: string[];
  sourceIds: string[];
};

export type IntelligenceInsightListItem = {
  id: string;
  companyId: string;
  companyName: string;
  csmName: string | null;
  businessUnit: string;
  insightType: string;
  title: string;
  summary: string;
  rationale: string;
  suggestedAction: string;
  urgency: string;
  confidence: number | null;
  generatedAt: string;
  sources: Array<{
    id: string;
    url: string;
    title: string | null;
    sourceDomain: string | null;
    publishedAt: string | null;
  }>;
  feedback: {
    useful: number;
    notUseful: number;
    unclearUsefulness: number;
    accurate: number;
    inaccurate: number;
    unclearAccuracy: number;
  };
};

export type IntelligenceRunSummary = {
  id: string;
  runScope: string;
  companyName: string | null;
  csmName: string | null;
  status: string;
  dryRun: boolean;
  startedAt: string;
  finishedAt: string | null;
  selectedCompaniesCount: number;
  exaRequestsUsed: number;
  exaResultsReceived: number;
  openrouterRequestsUsed: number;
  errorMessage: string | null;
};

export type IntelligenceRunStatus =
  | "succeeded"
  | "partial"
  | "failed"
  | "skipped_budget"
  | "skipped_disabled"
  | "skipped_lock";
