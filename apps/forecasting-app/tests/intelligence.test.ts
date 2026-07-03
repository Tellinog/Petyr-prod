import assert from "node:assert/strict";
import test from "node:test";
import { ExaSearchClient } from "../src/services/intelligence/exaSearchClient";
import { isAuthorizedAppInternalRequest } from "../src/services/intelligence/intelligenceApiAuth";
import { canSpendIntelligenceRequests, getIntelligenceDailyBudgetStatus } from "../src/services/intelligence/intelligenceBudgetService";
import { getIntelligenceWorkerStatus, setIntelligenceWorkerEnabled } from "../src/services/intelligence/intelligenceWorkerSettingsService";
import { parseOpenRouterInsightJson } from "../src/services/intelligence/openRouterInsightGenerator";
import { isRetryableProviderError, runProviderWithRetry } from "../src/services/intelligence/providerRetry";
import { buildCompanyIntelligenceQuery } from "../src/services/intelligence/queryBuilder";
import { canonicalizeUrl, normalizeExaResult } from "../src/services/intelligence/resultNormalizer";
import { deduplicateSignalResults } from "../src/services/intelligence/signalDeduplicationService";
import {
  createInsightFeedback,
  validateAccuracyRating,
  validateUsefulnessRating
} from "../src/services/intelligence/feedbackService";

const company = {
  companyId: "acme",
  companyName: "Acme Corp",
  csmName: "Ada Lovelace",
  branchName: "Enterprise",
  aliases: ["Acme"],
  domain: "acme.example",
  isActive: true
};

test("query builder creates one aggregated company-level query without company x BU expansion", () => {
  const query = buildCompanyIntelligenceQuery({ company, recencyDays: 30, maxResults: 5 });

  assert.equal(query.companyName, "Acme Corp");
  assert.equal(query.recencyDays, 30);
  assert.equal(query.maxResults, 5);
  assert.match(query.query, /"Acme Corp"/);
  assert.match(query.query, /"product launch"/);
  assert.match(query.query, /"cybersecurity"/);
  assert.doesNotMatch(query.query, /Business Unit/i);
});

test("deduplication groups canonicalized URL duplicates", () => {
  const resultA = normalizeExaResult({
    id: "1",
    url: "https://example.com/news?utm_source=x",
    title: "Acme launches app",
    publishedAt: "2026-06-01",
    authorOrSource: "Example",
    snippet: "Acme launches a new mobile app.",
    raw: {}
  });
  const resultB = normalizeExaResult({
    id: "2",
    url: "https://example.com/news",
    title: "Acme launches app",
    publishedAt: "2026-06-01",
    authorOrSource: "Example",
    snippet: "Acme launches a new mobile app.",
    raw: {}
  });

  assert.equal(canonicalizeUrl("https://example.com/news?utm_campaign=test"), "https://example.com/news");
  const deduped = deduplicateSignalResults([resultA, resultB].filter((item): item is NonNullable<typeof item> => item !== null));
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].duplicateCount, 2);
});

test("OpenRouter JSON parser accepts valid structured Intelligence output", () => {
  const parsed = parseOpenRouterInsightJson(JSON.stringify({
    insights: [{
      company_id: "acme",
      business_unit: "Experience",
      insight_type: "opportunity",
      title: "Mobile app launch signal",
      summary: "Acme is investing in a new customer-facing app.",
      rationale: "The source describes a mobile launch and customer experience shift.",
      suggested_action: "Review whether Experience discovery is relevant for the account.",
      urgency: "medium",
      confidence: 0.82,
      assumptions_or_limits: ["External source only."],
      source_ids: ["signal-1"]
    }]
  }), ["signal-1"]);

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].businessUnit, "Experience");
  assert.equal(parsed[0].insightType, "opportunity");
});

test("OpenRouter JSON parser rejects unsupported Business Units and unknown sources", () => {
  const parsed = parseOpenRouterInsightJson({
    insights: [{
      company_id: "acme",
      business_unit: "Magic",
      insight_type: "opportunity",
      title: "Invalid",
      summary: "Invalid",
      rationale: "Invalid",
      suggested_action: "Invalid",
      urgency: "medium",
      confidence: 0.8,
      assumptions_or_limits: [],
      source_ids: ["missing"]
    }]
  }, ["signal-1"]);

  assert.equal(parsed.length, 0);
});

test("Exa adapter maps mocked provider response", async () => {
  let capturedKey = "";
  const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
    capturedKey = String((init?.headers as Record<string, string>)["x-api-key"]);
    return new Response(JSON.stringify({
      results: [{
        id: "exa-1",
        url: "https://example.com/acme",
        title: "Acme partnership",
        publishedDate: "2026-06-15",
        author: "Example",
        summary: "Acme announced a new partnership."
      }]
    }), { status: 200 });
  };
  const client = new ExaSearchClient({ apiKey: "secret-exa-key", fetchImpl: fetchImpl as typeof fetch });
  const results = await client.search(buildCompanyIntelligenceQuery({ company, recencyDays: 30, maxResults: 5 }));

  assert.equal(capturedKey, "secret-exa-key");
  assert.equal(results.length, 1);
  assert.equal(results[0].id, "exa-1");
});

test("admin API internal secret helper validates protected requests", () => {
  const headers = new Headers({ "x-app-secret": "correct" });

  assert.equal(isAuthorizedAppInternalRequest(headers, { APP_INTERNAL_SECRET: "correct" } as NodeJS.ProcessEnv), true);
  assert.equal(isAuthorizedAppInternalRequest(headers, { APP_INTERNAL_SECRET: "wrong" } as NodeJS.ProcessEnv), false);
  assert.equal(isAuthorizedAppInternalRequest(headers, { APP_INTERNAL_SECRET: "replace_me" } as NodeJS.ProcessEnv), false);
});

test("feedback validation and persistence use documented enums", async () => {
  assert.equal(validateUsefulnessRating("useful"), "useful");
  assert.equal(validateAccuracyRating("accurate"), "accurate");
  assert.equal(validateUsefulnessRating("great"), null);
  assert.equal(validateAccuracyRating("maybe"), null);

  let writes = 0;
  const result = await createInsightFeedback({
    insightId: "insight-1",
    ratingUsefulness: "useful",
    ratingAccuracy: "accurate",
    feedbackText: "Helpful.",
    submittedBy: "csm@example.com"
  }, {
    $executeRaw: async () => {
      writes += 1;
      return 1;
    }
  } as never);

  assert.equal(typeof result.id, "string");
  assert.equal(writes, 1);
});

test("daily budget status counts provider request logs and blocks exhausted spend", async () => {
  const previousBudget = process.env.INTELLIGENCE_DAILY_BUDGET_REQUESTS;
  process.env.INTELLIGENCE_DAILY_BUDGET_REQUESTS = "10";

  try {
    const budget = await getIntelligenceDailyBudgetStatus({
      $queryRaw: async () => [{ usedRequests: 7 }]
    } as never, new Date("2026-07-01T10:00:00Z"));

    assert.equal(budget.limit, 10);
    assert.equal(budget.used, 7);
    assert.equal(budget.remaining, 3);
    assert.equal(canSpendIntelligenceRequests(budget, 3), true);
    assert.equal(canSpendIntelligenceRequests(budget, 4), false);
  } finally {
    if (previousBudget === undefined) {
      delete process.env.INTELLIGENCE_DAILY_BUDGET_REQUESTS;
    } else {
      process.env.INTELLIGENCE_DAILY_BUDGET_REQUESTS = previousBudget;
    }
  }
});

test("provider retry retries transient failures only within bounded attempts", async () => {
  let attempts = 0;
  const result = await runProviderWithRetry({
    baseDelayMs: 0,
    sleep: async () => undefined,
    execute: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("OpenRouter failed with status 429.");
      return "ok";
    }
  });

  assert.equal(result, "ok");
  assert.equal(attempts, 2);
  assert.equal(isRetryableProviderError(new Error("Exa search failed with status 503.")), true);
  assert.equal(isRetryableProviderError(new Error("Exa search failed with status 401.")), false);
});

test("worker setting can be toggled through app_setting without exposing secrets", async () => {
  const previousWorkerEnabled = process.env.INTELLIGENCE_WORKER_ENABLED;
  process.env.INTELLIGENCE_WORKER_ENABLED = "false";
  const writes: string[] = [];

  const readDisabledDb = {
    $queryRaw: async () => [{ settingValue: "false", updatedAt: new Date("2026-07-01T09:00:00Z") }],
    $executeRaw: async () => {
      writes.push("write");
      return 1;
    }
  };
  const disabled = await getIntelligenceWorkerStatus(readDisabledDb as never);
  assert.equal(disabled.workerEnabled, false);
  assert.equal(disabled.workerEnabledSource, "database");

  const enabled = await setIntelligenceWorkerEnabled(true, "admin@example.com", readDisabledDb as never);
  assert.equal(enabled.workerEnabled, false);
  assert.equal(writes.length, 1);

  try {
    const defaultStatus = await getIntelligenceWorkerStatus({
      $queryRaw: async () => []
    } as never);
    assert.equal(defaultStatus.workerEnabled, false);
    assert.equal(defaultStatus.workerEnabledSource, "environment_default");
  } finally {
    if (previousWorkerEnabled === undefined) {
      delete process.env.INTELLIGENCE_WORKER_ENABLED;
    } else {
      process.env.INTELLIGENCE_WORKER_ENABLED = previousWorkerEnabled;
    }
  }
});
