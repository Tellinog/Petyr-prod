import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/db";
import type {
  BusinessUnitClassification,
  IntelligenceCompanyContext,
  IntelligenceInsightInput,
  IntelligenceRunStatus,
  IntelligenceRunSummary,
  NormalizedSignalResult,
  PersistedSignalItem
} from "./types";

type JsonValue = Prisma.InputJsonValue;

function json(value: JsonValue) {
  return JSON.stringify(value);
}

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toIso(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value);
}

export async function createIntelligenceRun(input: {
  dryRun: boolean;
  runScope: "company" | "batch";
  companyName?: string | null;
  csmName?: string | null;
  selectedCompaniesCount: number;
  selectedReason: string;
  budgetPolicy: JsonValue;
  createdBy: string;
}) {
  const id = randomUUID();

  await prisma.$executeRaw`
    INSERT INTO "company_intelligence_run" (
      "id", "run_scope", "company_name", "csm_name", "status", "dry_run",
      "selected_companies_count", "selected_reason", "budget_policy_json", "created_by"
    )
    VALUES (
      ${id}, ${input.runScope}, ${input.companyName ?? null}, ${input.csmName ?? null}, 'running',
      ${input.dryRun}, ${input.selectedCompaniesCount}, ${input.selectedReason},
      ${json(input.budgetPolicy)}::jsonb, ${input.createdBy}
    )
  `;

  return id;
}

export async function finishIntelligenceRun(input: {
  runId: string;
  status: IntelligenceRunStatus;
  errorMessage?: string | null;
  exaRequestsUsed: number;
  exaResultsReceived: number;
  openrouterRequestsUsed: number;
}) {
  await prisma.$executeRaw`
    UPDATE "company_intelligence_run"
    SET
      "status" = ${input.status}::"IntelligenceRunStatus",
      "finished_at" = now(),
      "error_message" = ${input.errorMessage ?? null},
      "exa_requests_used" = ${input.exaRequestsUsed},
      "exa_results_received" = ${input.exaResultsReceived},
      "openrouter_requests_used" = ${input.openrouterRequestsUsed},
      "updated_at" = now()
    WHERE "id" = ${input.runId}
  `;
}

export async function createSkippedIntelligenceRun(input: {
  status: Extract<IntelligenceRunStatus, "skipped_disabled" | "skipped_lock" | "skipped_budget" | "failed">;
  dryRun: boolean;
  selectedReason: string;
  errorMessage: string;
  createdBy: string;
  runScope?: "company" | "batch";
}) {
  const runId = await createIntelligenceRun({
    dryRun: input.dryRun,
    runScope: input.runScope ?? "batch",
    selectedCompaniesCount: 0,
    selectedReason: input.selectedReason,
    budgetPolicy: {},
    createdBy: input.createdBy
  });

  await finishIntelligenceRun({
    runId,
    status: input.status,
    errorMessage: input.errorMessage,
    exaRequestsUsed: 0,
    exaResultsReceived: 0,
    openrouterRequestsUsed: 0
  });

  return runId;
}

export async function logProviderRequest(input: {
  runId: string;
  provider: string;
  operation: string;
  status: string;
  requestCount?: number;
  resultCount?: number | null;
  durationMs?: number | null;
  model?: string | null;
  requestMetadata?: JsonValue;
  costMetadata?: JsonValue;
  errorMessage?: string | null;
}) {
  await prisma.$executeRaw`
    INSERT INTO "company_intelligence_provider_request_log" (
      "id", "run_id", "provider", "operation", "status", "request_count", "result_count",
      "duration_ms", "model", "request_metadata", "cost_metadata", "error_message"
    )
    VALUES (
      ${randomUUID()}, ${input.runId}, ${input.provider}, ${input.operation}, ${input.status},
      ${input.requestCount ?? 1}, ${input.resultCount ?? null}, ${input.durationMs ?? null},
      ${input.model ?? null}, ${json(input.requestMetadata ?? {})}::jsonb,
      ${json(input.costMetadata ?? {})}::jsonb, ${input.errorMessage ?? null}
    )
  `;
}

export async function persistSignalResult(input: {
  runId: string;
  companyName: string;
  queryText: string;
  signal: NormalizedSignalResult;
}): Promise<PersistedSignalItem> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "company_signal_item" (
      "id", "company_name", "canonical_url", "normalized_title", "source_domain",
      "published_at", "event_signature", "content_hash", "last_seen_at", "duplicate_count"
    )
    VALUES (
      ${randomUUID()}, ${input.companyName}, ${input.signal.canonicalUrl}, ${input.signal.normalizedTitle},
      ${input.signal.sourceDomain}, ${input.signal.publishedAt}, ${input.signal.eventSignature},
      ${input.signal.contentHash}, now(), 1
    )
    ON CONFLICT ("company_name", "content_hash")
    DO UPDATE SET
      "last_seen_at" = now(),
      "duplicate_count" = "company_signal_item"."duplicate_count" + 1,
      "canonical_url" = EXCLUDED."canonical_url",
      "normalized_title" = COALESCE(EXCLUDED."normalized_title", "company_signal_item"."normalized_title"),
      "source_domain" = COALESCE(EXCLUDED."source_domain", "company_signal_item"."source_domain")
    RETURNING "id"
  `;
  const signalItemId = rows[0]?.id;

  await prisma.$executeRaw`
    INSERT INTO "company_signal_raw_result" (
      "id", "run_id", "signal_item_id", "company_name", "provider_result_id", "query_text",
      "url", "title", "published_at", "author_or_source", "snippet", "raw_result_json", "content_hash"
    )
    VALUES (
      ${randomUUID()}, ${input.runId}, ${signalItemId}, ${input.companyName}, ${input.signal.providerResultId},
      ${input.queryText}, ${input.signal.url}, ${input.signal.title}, ${input.signal.publishedAt},
      ${input.signal.authorOrSource}, ${input.signal.snippet}, ${json(input.signal.raw as JsonValue)}::jsonb,
      ${input.signal.contentHash}
    )
  `;

  return {
    ...input.signal,
    id: signalItemId
  };
}

export async function persistBusinessUnitClassifications(signalItemId: string, classifications: BusinessUnitClassification[]) {
  for (const classification of classifications) {
    await prisma.$executeRaw`
      INSERT INTO "company_signal_business_unit_classification" (
        "id", "signal_item_id", "business_unit", "relevance_score", "rationale", "classified_by_provider"
      )
      VALUES (
        ${randomUUID()}, ${signalItemId}, ${classification.businessUnit}, ${classification.relevanceScore},
        ${classification.rationale}, ${classification.provider}
      )
      ON CONFLICT ("signal_item_id", "business_unit")
      DO UPDATE SET
        "relevance_score" = EXCLUDED."relevance_score",
        "rationale" = EXCLUDED."rationale",
        "classified_by_provider" = EXCLUDED."classified_by_provider",
        "classified_at" = now()
    `;
  }
}

export async function persistGeneratedInsight(input: {
  runId: string;
  company: IntelligenceCompanyContext;
  insight: IntelligenceInsightInput;
  provider: string;
  model: string;
  promptVersion: string;
}) {
  const insightId = randomUUID();

  await prisma.$executeRaw`
    INSERT INTO "company_intelligence_insight" (
      "id", "company_name", "company_id", "csm_name", "run_id", "business_unit", "insight_type",
      "title", "summary", "rationale", "suggested_action", "urgency", "confidence",
      "assumptions_or_limits", "provider", "model", "prompt_version"
    )
    VALUES (
      ${insightId}, ${input.company.companyName}, ${input.insight.companyId}, ${input.company.csmName},
      ${input.runId}, ${input.insight.businessUnit}, ${input.insight.insightType}::"IntelligenceInsightType",
      ${input.insight.title}, ${input.insight.summary}, ${input.insight.rationale},
      ${input.insight.suggestedAction}, ${input.insight.urgency}::"IntelligenceUrgency",
      ${input.insight.confidence}, ${json(input.insight.assumptionsOrLimits)}::jsonb,
      ${input.provider}, ${input.model}, ${input.promptVersion}
    )
  `;

  for (const signalItemId of input.insight.sourceIds) {
    await prisma.$executeRaw`
      INSERT INTO "company_intelligence_insight_source" ("id", "insight_id", "signal_item_id")
      VALUES (${randomUUID()}, ${insightId}, ${signalItemId})
      ON CONFLICT ("insight_id", "signal_item_id") DO NOTHING
    `;
  }

  return insightId;
}

export async function listIntelligenceRuns(limit = 20): Promise<IntelligenceRunSummary[]> {
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    runScope: string;
    companyName: string | null;
    csmName: string | null;
    status: string;
    dryRun: boolean;
    startedAt: Date;
    finishedAt: Date | null;
    selectedCompaniesCount: number | bigint;
    exaRequestsUsed: number | bigint;
    exaResultsReceived: number | bigint;
    openrouterRequestsUsed: number | bigint;
    errorMessage: string | null;
  }>>`
    SELECT
      "id",
      "run_scope" AS "runScope",
      "company_name" AS "companyName",
      "csm_name" AS "csmName",
      "status"::text AS "status",
      "dry_run" AS "dryRun",
      "started_at" AS "startedAt",
      "finished_at" AS "finishedAt",
      "selected_companies_count" AS "selectedCompaniesCount",
      "exa_requests_used" AS "exaRequestsUsed",
      "exa_results_received" AS "exaResultsReceived",
      "openrouter_requests_used" AS "openrouterRequestsUsed",
      "error_message" AS "errorMessage"
    FROM "company_intelligence_run"
    ORDER BY "started_at" DESC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    id: row.id,
    runScope: row.runScope,
    companyName: row.companyName,
    csmName: row.csmName,
    status: row.status,
    dryRun: row.dryRun,
    startedAt: toIso(row.startedAt),
    finishedAt: row.finishedAt ? toIso(row.finishedAt) : null,
    selectedCompaniesCount: toNumber(row.selectedCompaniesCount),
    exaRequestsUsed: toNumber(row.exaRequestsUsed),
    exaResultsReceived: toNumber(row.exaResultsReceived),
    openrouterRequestsUsed: toNumber(row.openrouterRequestsUsed),
    errorMessage: row.errorMessage
  }));
}
