import assert from "node:assert/strict";
import test from "node:test";

import {
  PETYR_OPENROUTER_MODEL_SETTING_KEY,
  resolvePetyrAiModelSettingRead
} from "../src/services/petyrAiModelSettingsService";
import {
  mapLatestPetyrCompanyIntelligenceToActionResult,
  resolveVisiblePetyrCompanyIntelligenceResult
} from "../src/lib/petyr/companyIntelligenceState";

import {
  PETYR_FORECAST_INTELLIGENCE_PAYLOAD_VERSION,
  buildPetyrForecastIntelligenceCsmChangeNotes,
  buildPetyrForecastIntelligencePrompt,
  generatePetyrForecastIntelligence,
  validatePetyrForecastIntelligenceOutput,
  hashPetyrForecastIntelligencePayload,
  sanitizePetyrForecastIntelligenceCsmNote,
  selectLatestSuccessfulPetyrCompanyIntelligence,
  type PetyrForecastIntelligenceCacheAdapter,
  type PetyrForecastIntelligenceCacheWrite,
  type PetyrForecastIntelligenceOutput,
  type PetyrForecastIntelligencePayload
} from "../src/services/petyrForecastIntelligenceService";
import {
  getPetyrCurrentYearInTimezone,
  getNextPetyrAiForecastDailyRunAt,
  getPetyrDeterministicPreviewDailyModelVersion,
  getPetyrNightlyForecastCacheKey,
  isPetyrNightlyForecastCacheDuplicate,
  normalizePetyrNightlyForecastCompanies,
  parsePetyrAiForecastDailyTime,
  parsePetyrAiForecastDelayMs,
  runPetyrNightlyDeterministicAiForecastCore
} from "../src/lib/petyr/nightlyDeterministicAiForecastCore";
import { buildDeterministicForecastCandidates, weightedSignalBaseline } from "../src/services/petyrAiForecastStrategyService";
import {
  getDefaultPetyrAiForecastBaselineWeights,
  resolvePetyrAiForecastBaselineWeightsRead
} from "../src/services/petyrAiForecastWeightsService";

const baseRawOutput = {
  stakeholder_notes: [
    {
      title: "Residual timing is the main stakeholder point",
      note: "The same delivery window has residual pressure and planned value in the payload.",
      evidence_refs: ["bu.qa.month.7.remaining_months", "bu.qa.month.7.planned"]
    }
  ],
  risks: [
    {
      type: "timing_risk",
      severity: "medium",
      description: "The current delivery timing can compress residual consumption into fewer remaining months.",
      evidence_refs: ["bu.qa.month.7.remaining_months", "bu.qa.month.7.residual_gap"]
    }
  ],
  opportunities: [
    {
      title: "Planned work is above baseline",
      severity: "medium",
      evidence: "Planned value is above the local deterministic forecast for the month.",
      evidence_refs: ["bu.qa.month.7.planned", "bu.qa.month.7.forecast"]
    }
  ],
  watchouts: [
    {
      title: "Sparse historical context",
      severity: "medium",
      evidence: "The payload includes sparse_history.",
      evidence_refs: ["bu.qa.closed_campaigns", "bu.qa.delta.deterministic_minus_planned"]
    }
  ]
};

const baseOutput: PetyrForecastIntelligenceOutput = {
  stakeholder_notes: [
    {
      title: "Residual timing is the main stakeholder point",
      note: "The same delivery window has residual pressure and planned value in the payload.",
      numeric_evidence: "QA month 7 remaining agreement months: 3; QA month 7 planned campaigns: 120 EUR"
    }
  ],
  risks: [
    {
      type: "timing_risk",
      severity: "medium",
      description: "The current delivery timing can compress residual consumption into fewer remaining months.",
      numeric_evidence: "QA month 7 remaining agreement months: 3; QA month 7 residual gap: 0 EUR"
    }
  ],
  opportunities: [
    {
      title: "Planned work is above baseline",
      severity: "medium",
      evidence: "Planned value is above the local deterministic forecast for the month.",
      numeric_evidence: "QA month 7 planned campaigns: 120 EUR; QA month 7 deterministic forecast: 100 EUR"
    }
  ],
  watchouts: [
    {
      title: "Sparse historical context",
      severity: "medium",
      evidence: "The payload includes sparse_history.",
      numeric_evidence: "QA closed campaign count: 2; QA deterministic minus planned: -20 EUR"
    }
  ]
};

test("falls back to the default OpenRouter model when app_setting cannot be read", () => {
  const result = resolvePetyrAiModelSettingRead(null, new Error("relation app_setting does not exist"));

  assert.equal(result.setting.settingKey, PETYR_OPENROUTER_MODEL_SETTING_KEY);
  assert.equal(result.setting.selectedModel, "openai/gpt-4.1-mini");
  assert.equal(result.setting.isUsingDefault, true);
  assert.equal(result.setting.updatedAt, null);
  assert.equal(result.diagnostics.length, 1);
  assert.match(result.diagnostics[0], /app_setting/);
  assert.match(result.diagnostics[0], /OPENROUTER_DEFAULT_MODEL/);
  assert.match(result.diagnostics[0], /relation app_setting does not exist/);
});

test("uses a persisted OpenRouter model setting without diagnostics", () => {
  const updatedAt = new Date("2026-06-16T08:30:00.000Z");
  const result = resolvePetyrAiModelSettingRead({ settingValue: "anthropic/claude-sonnet-4", updatedAt });

  assert.equal(result.setting.settingKey, PETYR_OPENROUTER_MODEL_SETTING_KEY);
  assert.equal(result.setting.selectedModel, "anthropic/claude-sonnet-4");
  assert.equal(result.setting.isUsingDefault, false);
  assert.equal(result.setting.updatedAt, updatedAt.toISOString());
  assert.deepEqual(result.diagnostics, []);
});

function createPayload(): PetyrForecastIntelligencePayload {
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
      rows: [
        {
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
            direction: "growth",
            recent_average: 115,
            comparison_average: 100,
            ratio: 1.15,
            summer_slowdown: false,
            over_consumption: false,
            flags: ["recent_growth_signal"]
          },
          agreement_residual_allocation: {
            active_agreement_count: 1,
            residual_value: 300,
            allocated_residual_value: 100,
            monthly_residual_cap: 100,
            historical_capacity_value: 100,
            linked_planned_campaign_value: 120,
            capped_linked_planned_campaign_value: 100,
            planned_exceeds_residual: true,
            remaining_months: 3,
            months_to_expiry: 3,
            attribution_method: "title_token",
            matched_tokens: ["qa"],
            status: "capped"
          },
          business_unit_attribution: {
            method: "title_token",
            confidence: "high",
            matched_tokens: ["qa"],
            share: 1
          },
          consultative_scenarios: [
            { id: "floor_100", label: "Round down to 100 EUR", value: 100, direction: "down", reason: "Commercial conservative scenario rounded down to the nearest 100 EUR." },
            { id: "nearest_100", label: "Round to nearest 100 EUR", value: 100, direction: "nearest", reason: "Neutral consultative scenario rounded to the nearest 100 EUR." },
            { id: "ceil_100", label: "Round up to 100 EUR", value: 100, direction: "up", reason: "Growth or opportunity scenario rounded up to the nearest 100 EUR." }
          ],
          confidence_score: 0.62,
          drivers: ["planned_campaigns"],
          data_quality_flags: ["sparse_history"]
        }
      ],
      totals: {
        deterministic_forecast_value: 100,
        baseline_forecast: 100,
        planned_campaigns_value: 120,
        residual_coverage_gap: 0
      }
    },
    historical_closed_revenue: [
      { business_unit: "QA", year: 2024, month: 7, closed_revenue: 80 },
      { business_unit: "QA", year: 2025, month: 7, closed_revenue: 90 }
    ],
    selected_year_real_signals: [
      {
        business_unit: "QA",
        year: 2026,
        closed_revenue_ytd: 70,
        planned_future_value: 120,
        closed_revenue_campaigns_count: 2,
        planned_future_campaigns_count: 1,
        normalized_to_other_count: 0
      }
    ],
    local_deltas: [
      {
        business_unit: "QA",
        deterministic_minus_planned: -20,
        deterministic_minus_closed_ytd: 30
      }
    ],
    local_scenarios: [
      { name: "deterministic", value: 100, description: "Local deterministic forecast total from Petyr math engine." },
      { name: "planned_floor_only", value: 120, description: "Local planned future campaign floor total." },
      { name: "history_signals_only", value: 93, description: "Local historical signal total before planned floor." }
    ],
    local_risk_signals: [
      {
        type: "data_quality",
        severity: "medium",
        metric: "historical_coverage",
        evidence: "Sparse history flag is present."
      }
    ],
    deterministic_evidence_registry: [
      {
        id: "total.deterministic_forecast_value",
        label: "Total deterministic forecast",
        display_value: "Total deterministic forecast: 100 EUR",
        kind: "forecast_total",
        path: "deterministic_forecast.totals.deterministic_forecast_value"
      },
      {
        id: "bu.qa.month.7.forecast",
        label: "QA month 7 deterministic forecast",
        display_value: "QA month 7 deterministic forecast: 100 EUR",
        kind: "forecast_total",
        business_unit: "QA",
        month: 7,
        path: "deterministic_forecast.rows[].deterministic_forecast_value"
      },
      {
        id: "bu.qa.month.7.planned",
        label: "QA month 7 planned campaigns",
        display_value: "QA month 7 planned campaigns: 120 EUR",
        kind: "planned_value",
        business_unit: "QA",
        month: 7,
        path: "deterministic_forecast.rows[].planned_campaigns_value"
      },
      {
        id: "bu.qa.month.7.residual_gap",
        label: "QA month 7 residual gap",
        display_value: "QA month 7 residual gap: 0 EUR",
        kind: "residual_gap",
        business_unit: "QA",
        month: 7,
        path: "deterministic_forecast.rows[].residual_coverage_gap"
      },
      {
        id: "bu.qa.month.7.remaining_months",
        label: "QA month 7 remaining agreement months",
        display_value: "QA month 7 remaining agreement months: 3",
        kind: "remaining_months",
        business_unit: "QA",
        month: 7,
        path: "deterministic_forecast.rows[].agreement_residual_allocation.remaining_months"
      },
      {
        id: "bu.qa.closed_campaigns",
        label: "QA closed campaign count",
        display_value: "QA closed campaign count: 2",
        kind: "campaign_count",
        business_unit: "QA",
        path: "selected_year_real_signals[].closed_revenue_campaigns_count"
      },
      {
        id: "bu.qa.delta.deterministic_minus_planned",
        label: "QA deterministic minus planned",
        display_value: "QA deterministic minus planned: -20 EUR",
        kind: "signed_delta",
        business_unit: "QA",
        path: "local_deltas[].deterministic_minus_planned"
      }
    ],
    csm_change_notes: [
      {
        month: 7,
        forecast_type: "ongoing",
        source: "Forecast Entry",
        created_at: "2026-06-10T09:00:00.000Z",
        changed_bu_count: 1,
        note: "Customer expects a tighter July delivery window."
      }
    ],
    data_quality: {
      diagnostics: ["Sparse history for QA."],
      flags: ["sparse_history"]
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

function createMemoryCache(seed: PetyrForecastIntelligenceOutput | null = null) {
  let cached = seed;
  const writes: PetyrForecastIntelligenceCacheWrite[] = [];
  const adapter: PetyrForecastIntelligenceCacheAdapter = {
    async findSuccessful() {
      if (!cached) return null;
      return {
        output: cached,
        generatedAt: "2026-06-10T00:00:00.000Z",
        createdAt: "2026-06-10T00:00:00.000Z",
        updatedAt: "2026-06-10T00:00:00.000Z"
      };
    },
    async save(write) {
      writes.push(write);
      if (write.status === "success" && write.validatedOutput) cached = write.validatedOutput;
      return {
        action: writes.length === 1 ? "created" : "updated",
        generatedAt: "2026-06-11T00:00:00.000Z",
        updatedAt: "2026-06-11T00:00:00.000Z"
      };
    }
  };

  return { adapter, writes };
}

test("accepts a valid strict JSON response and saves validated output", async () => {
  const payload = createPayload();
  const cache = createMemoryCache();
  let calls = 0;

  const result = await generatePetyrForecastIntelligence({
    payload,
    apiKey: "test-key",
    model: "test/model",
    cache: cache.adapter,
    client: async (request) => {
      calls += 1;
      assert.equal(request.messages[0].role, "system");
      return JSON.stringify(baseRawOutput);
    }
  });

  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  assert.equal(result.status, "success");
  assert.equal(result.openRouterCalled, true);
  assert.equal(result.retried, false);
  assert.equal(result.cacheAction, "created");
  assert.equal(cache.writes.length, 1);
  assert.equal(cache.writes[0].status, "success");
  assert.deepEqual(result.output, baseOutput);
});

test("repairs one invalid JSON response with a single retry", async () => {
  const payload = createPayload();
  const cache = createMemoryCache();
  let calls = 0;

  const result = await generatePetyrForecastIntelligence({
    payload,
    apiKey: "test-key",
    model: "test/model",
    cache: cache.adapter,
    client: async () => {
      calls += 1;
      return calls === 1 ? "not json" : JSON.stringify(baseRawOutput);
    }
  });

  assert.equal(calls, 2);
  assert.equal(result.ok, true);
  assert.equal(result.status, "success");
  assert.equal(result.retried, true);
  assert.equal(cache.writes[0].status, "success");
});

test("rejects missing required fields after one retry and saves failure state", async () => {
  const payload = createPayload();
  const cache = createMemoryCache();
  const missingRequiredFields = JSON.stringify({
    risks: [],
    opportunities: [],
    watchouts: []
  });

  const result = await generatePetyrForecastIntelligence({
    payload,
    apiKey: "test-key",
    model: "test/model",
    cache: cache.adapter,
    client: async () => missingRequiredFields
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "failed");
  assert.equal(result.retried, true);
  assert.ok(result.validationErrors.some((error) => error.path === "stakeholder_notes"));
  assert.equal(cache.writes.length, 1);
  assert.equal(cache.writes[0].status, "failed");
});

test("captures AI provider unavailability as a graceful failure", async () => {
  const payload = createPayload();
  const cache = createMemoryCache();

  const result = await generatePetyrForecastIntelligence({
    payload,
    apiKey: "test-key",
    model: "test/model",
    cache: cache.adapter,
    client: async () => {
      throw new Error("network unavailable");
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "failed");
  assert.equal(result.openRouterCalled, true);
  assert.equal(result.retried, false);
  assert.match(result.errorMessage ?? "", /network unavailable/);
  assert.equal(cache.writes[0].status, "failed");
});

test("reuses cached validated output for matching provider model prompt and input hash", async () => {
  const payload = createPayload();
  const cache = createMemoryCache(baseOutput);

  const result = await generatePetyrForecastIntelligence({
    payload,
    apiKey: "test-key",
    model: "test/model",
    cache: cache.adapter,
    client: async () => {
      throw new Error("client should not be called for cached output");
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "cached");
  assert.equal(result.openRouterCalled, false);
  assert.equal(result.cacheAction, "reused");
  assert.equal(cache.writes.length, 0);
  assert.deepEqual(result.output, baseOutput);
});

test("manual force refresh bypasses matching cached Forecast Intelligence output", async () => {
  const payload = createPayload();
  const cache = createMemoryCache(baseOutput);
  let calls = 0;

  const result = await generatePetyrForecastIntelligence({
    payload,
    apiKey: "test-key",
    model: "test/model",
    cache: cache.adapter,
    forceRefresh: true,
    client: async () => {
      calls += 1;
      return JSON.stringify(baseRawOutput);
    }
  });

  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  assert.equal(result.status, "success");
  assert.equal(result.openRouterCalled, true);
  assert.equal(result.cacheAction, "created");
  assert.equal(cache.writes.length, 1);
});

test("latest Company Intelligence selector returns only newest successful sentinel row", () => {
  const rows = [
    {
      companyName: "Company A",
      year: 2026,
      status: "success",
      businessUnit: "__forecast_intelligence__",
      month: 0,
      forecastValue: 0,
      providerModel: "older/model",
      promptVersion: "prompt",
      inputHash: "older",
      validatedOutput: baseOutput,
      generatedAt: new Date("2026-06-10T10:00:00.000Z"),
      updatedAt: new Date("2026-06-10T10:00:00.000Z")
    },
    {
      companyName: "Company A",
      year: 2026,
      status: "failed",
      businessUnit: "__forecast_intelligence__",
      month: 0,
      forecastValue: 0,
      providerModel: "failed/model",
      promptVersion: "prompt",
      inputHash: "failed",
      validatedOutput: baseOutput,
      generatedAt: new Date("2026-06-12T10:00:00.000Z"),
      updatedAt: new Date("2026-06-12T10:00:00.000Z")
    },
    {
      companyName: "Company A",
      year: 2026,
      status: "success",
      businessUnit: "__forecast_intelligence__",
      month: 0,
      forecastValue: 0,
      providerModel: "latest/model",
      promptVersion: "prompt",
      inputHash: "latest",
      validatedOutput: baseOutput,
      generatedAt: new Date("2026-06-11T10:00:00.000Z"),
      updatedAt: new Date("2026-06-11T10:00:00.000Z")
    }
  ];

  const latest = selectLatestSuccessfulPetyrCompanyIntelligence(rows);

  assert.equal(latest?.model, "latest/model");
  assert.equal(latest?.inputHash, "latest");
  assert.deepEqual(latest?.output, baseOutput);
});

test("latest Company Intelligence selector ignores numeric AI Forecast cache rows", () => {
  const latest = selectLatestSuccessfulPetyrCompanyIntelligence([
    {
      companyName: "Company A",
      year: 2026,
      status: "success",
      businessUnit: "QA",
      month: 7,
      forecastValue: 100,
      providerModel: "numeric/model",
      promptVersion: "prompt",
      inputHash: "numeric",
      validatedOutput: baseOutput,
      generatedAt: new Date("2026-06-12T10:00:00.000Z"),
      updatedAt: new Date("2026-06-12T10:00:00.000Z")
    },
    {
      companyName: "Company A",
      year: 2026,
      status: "success",
      businessUnit: "__forecast_intelligence__",
      month: 0,
      forecastValue: 0,
      providerModel: "sentinel/model",
      promptVersion: "prompt",
      inputHash: "sentinel",
      validatedOutput: baseOutput,
      generatedAt: new Date("2026-06-11T10:00:00.000Z"),
      updatedAt: new Date("2026-06-11T10:00:00.000Z")
    }
  ]);

  assert.equal(latest?.model, "sentinel/model");
  assert.equal(latest?.inputHash, "sentinel");
});

test("Company Detail initial Intelligence mapping preserves latest persisted output and timestamp", () => {
  const mapped = mapLatestPetyrCompanyIntelligenceToActionResult({
    companyName: "Company A",
    year: 2026,
    status: "success",
    model: "test/model",
    promptVersion: "prompt",
    outputSchemaVersion: "schema",
    inputHash: "hash",
    output: baseOutput,
    generatedAt: "2026-06-11T10:00:00.000Z",
    updatedAt: "2026-06-11T10:01:00.000Z"
  });

  assert.equal(mapped?.ok, true);
  assert.equal(mapped?.status, "success");
  assert.equal(mapped?.generatedAt, "2026-06-11T10:00:00.000Z");
  assert.deepEqual(mapped?.output, baseOutput);
});

test("failed Company Intelligence generation keeps previous successful result visible", () => {
  const previous = mapLatestPetyrCompanyIntelligenceToActionResult({
    companyName: "Company A",
    year: 2026,
    status: "success",
    model: "test/model",
    promptVersion: "prompt",
    outputSchemaVersion: "schema",
    inputHash: "hash",
    output: baseOutput,
    generatedAt: "2026-06-11T10:00:00.000Z",
    updatedAt: "2026-06-11T10:01:00.000Z"
  });
  assert.ok(previous);

  const failed = {
    ...previous,
    ok: false,
    status: "failed" as const,
    output: null,
    errorMessage: "OpenRouter failed",
    generatedAt: null
  };

  assert.equal(resolveVisiblePetyrCompanyIntelligenceResult(previous, failed), previous);
});

test("deterministic payload remains available when AI is not configured", async () => {
  const payload = createPayload();
  const cache = createMemoryCache();
  const originalDeterministicValue = payload.deterministic_forecast.rows[0].deterministic_forecast_value;

  const result = await generatePetyrForecastIntelligence({
    payload,
    apiKey: null,
    model: "test/model",
    cache: cache.adapter,
    client: async () => {
      throw new Error("client should not be called without an API key");
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "failed");
  assert.equal(result.openRouterCalled, false);
  assert.match(result.errorMessage ?? "", /OPENROUTER_API_KEY/);
  assert.equal(payload.deterministic_forecast.rows[0].deterministic_forecast_value, originalDeterministicValue);
  assert.equal(hashPetyrForecastIntelligencePayload(payload).length, 64);
  assert.equal(cache.writes[0].status, "failed");
});


test("prompt uses v5 evidence-ref intelligence contract and does not expose raw title fixtures", () => {
  const payload = createPayload();
  const prompt = buildPetyrForecastIntelligencePrompt(payload);
  const promptText = prompt.messages.map((message) => message.content).join("\n");

  assert.equal(payload.schema_version, "petyr_forecast_intelligence_payload_v3");
  assert.match(promptText, /stakeholder_notes, risks, watchouts and opportunities/i);
  assert.match(promptText, /evidence_refs/i);
  assert.match(promptText, /deterministic_evidence_registry/i);
  assert.match(promptText, /CSM change notes are qualitative context only/i);
  assert.doesNotMatch(promptText, /recommended_actions/);
  assert.doesNotMatch(promptText, /Secret Agreement Title|Secret Campaign Title/);
});

test("CSM change notes for the requested year are included in payload shape", () => {
  const notes = buildPetyrForecastIntelligenceCsmChangeNotes({
    year: 2026,
    sessions: [
      {
        year: 2026,
        month: 7,
        forecastType: "ongoing",
        source: "Forecast Entry",
        note: "July delivery timing is tight.",
        createdAt: "2026-06-12T10:00:00.000Z",
        changeLogs: [{ businessUnit: "QA" }, { businessUnit: "QA" }, { businessUnit: "AI" }]
      }
    ]
  });

  assert.equal(notes.length, 1);
  assert.equal(notes[0].month, 7);
  assert.equal(notes[0].changed_bu_count, 2);
  assert.equal(notes[0].note, "July delivery timing is tight.");
});

test("CSM change notes from other years are excluded", () => {
  const notes = buildPetyrForecastIntelligenceCsmChangeNotes({
    year: 2026,
    sessions: [
      {
        year: 2025,
        month: 12,
        forecastType: "previous_month",
        source: "Forecast Entry",
        note: "Prior-year note should not travel.",
        createdAt: "2025-12-20T10:00:00.000Z",
        changeLogs: [{ businessUnit: "QA" }]
      },
      {
        year: 2026,
        month: 7,
        forecastType: "ongoing",
        source: "Forecast Entry",
        note: "Selected-year note should travel.",
        createdAt: "2026-06-12T10:00:00.000Z",
        changeLogs: [{ businessUnit: "QA" }]
      }
    ]
  });

  assert.deepEqual(notes.map((note) => note.note), ["Selected-year note should travel."]);
});

test("CSM change note sanitization removes URLs emails token-like strings and excess whitespace", () => {
  const sanitized = sanitizePetyrForecastIntelligenceCsmNote(
    "Check https://example.test/deal and owner@example.com with token NOT_A_REAL_TOKEN_abcdefghijklmnopqrstuvwxyz123456   now"
  );

  assert.doesNotMatch(sanitized, /https:\/\/example/);
  assert.doesNotMatch(sanitized, /owner@example/);
  assert.doesNotMatch(sanitized, /NOT_A_REAL_TOKEN_abcdefghijklmnopqrstuvwxyz123456/);
  assert.match(sanitized, /\[redacted_url\]/);
  assert.match(sanitized, /\[redacted_email\]/);
  assert.match(sanitized, /\[redacted_token\]/);
  assert.doesNotMatch(sanitized, /\s{2,}/);
});

test("rejects legacy and v3 output fields", () => {
  const payload = createPayload();
  const legacyOutput = JSON.stringify({
    ...baseRawOutput,
    executive_summary: "Payload supports interpretation only.",
    confidence: "medium",
    key_insights: [],
    drivers: [],
    forecast_cues: [],
    forecast_adjustment_candidates: []
  });

  const result = validatePetyrForecastIntelligenceOutput(legacyOutput, payload);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.path === "executive_summary"));
  assert.ok(result.errors.some((error) => error.path === "forecast_adjustment_candidates"));
});

test("accepts free numbers in narrative text when evidence refs are valid", () => {
  const payload = createPayload();
  const freeNumberOutput = JSON.stringify({
    ...baseRawOutput,
    stakeholder_notes: [
      {
        title: "Narrative number",
        note: "The CSM described this as a 999-shaped commercial watchout, but the official evidence stays server-owned.",
        evidence_refs: ["bu.qa.month.7.planned"]
      }
    ]
  });

  const result = validatePetyrForecastIntelligenceOutput(freeNumberOutput, payload);

  assert.equal(result.ok, true);
  assert.equal(result.output.stakeholder_notes[0].numeric_evidence, "QA month 7 planned campaigns: 120 EUR");
});

test("rejects prompt and implementation leaks", () => {
  const payload = createPayload();
  const promptLeakOutput = JSON.stringify({
    ...baseRawOutput,
    stakeholder_notes: [
      {
        title: "Prompt leak",
        note: "The response schema and hidden instruction should be visible here.",
        evidence_refs: ["bu.qa.month.7.forecast"]
      }
    ]
  });

  const result = validatePetyrForecastIntelligenceOutput(promptLeakOutput, payload);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /prompt or implementation/i.test(error.message)));
});

test("rejects model-generated numeric_evidence in raw LLM output", () => {
  const payload = createPayload();
  const rawWithNumericEvidence = JSON.stringify({
    ...baseRawOutput,
    stakeholder_notes: [
      {
        title: "Wrong raw contract",
        note: "The item tries to bring its own numeric evidence.",
        evidence_refs: ["bu.qa.month.7.forecast"],
        numeric_evidence: "Forecast is 100 EUR."
      }
    ]
  });

  const result = validatePetyrForecastIntelligenceOutput(rawWithNumericEvidence, payload);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.path === "stakeholder_notes[0].numeric_evidence"));
});

test("rejects unknown evidence refs", () => {
  const payload = createPayload();
  const unknownRefOutput = JSON.stringify({
    ...baseRawOutput,
    opportunities: [
      {
        title: "Unknown evidence ref",
        severity: "medium",
        evidence: "The opportunity has business context.",
        evidence_refs: ["missing.ref"]
      }
    ]
  });

  const result = validatePetyrForecastIntelligenceOutput(unknownRefOutput, payload);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /Unknown evidence_ref/i.test(error.message)));
});

test("rejects intelligence items without evidence refs", () => {
  const payload = createPayload();
  const noEvidenceRefsOutput = JSON.stringify({
    ...baseRawOutput,
    opportunities: [
      {
        title: "No evidence refs",
        severity: "medium",
        evidence: "The opportunity has business context.",
        evidence_refs: []
      }
    ]
  });

  const result = validatePetyrForecastIntelligenceOutput(noEvidenceRefsOutput, payload);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /At least one valid evidence_ref/i.test(error.message)));
});

test("enriches raw LLM evidence refs into server-generated numeric evidence", () => {
  const payload = createPayload();
  const result = validatePetyrForecastIntelligenceOutput(JSON.stringify(baseRawOutput), payload);

  assert.equal(result.ok, true);
  assert.equal(result.output.opportunities[0].numeric_evidence, "QA month 7 planned campaigns: 120 EUR; QA month 7 deterministic forecast: 100 EUR");
  assert.equal(Object.hasOwn(baseRawOutput.opportunities[0], "numeric_evidence"), false);
});

test("accepts server-derived negative delta evidence from the registry", () => {
  const payload = createPayload();
  const negativeDeltaOutput = JSON.stringify({
    ...baseRawOutput,
    watchouts: [
      {
        title: "Negative delta remains visible",
        severity: "medium",
        evidence: "The deterministic forecast sits below planned future for this Business Unit.",
        evidence_refs: ["bu.qa.delta.deterministic_minus_planned"]
      }
    ]
  });

  const result = validatePetyrForecastIntelligenceOutput(negativeDeltaOutput, payload);

  assert.equal(result.ok, true);
  assert.equal(result.output.watchouts[0].numeric_evidence, "QA deterministic minus planned: -20 EUR");
});

test("rejects visible rounding scenario references", () => {
  const payload = createPayload();
  const roundingScenarioOutput = JSON.stringify({
    ...baseRawOutput,
    watchouts: [
      {
        title: "Rounding scenario leak",
        severity: "medium",
        evidence: "The nearest_100 rounding scenario appears in the text.",
        evidence_refs: ["bu.qa.month.7.forecast"]
      }
    ]
  });

  const result = validatePetyrForecastIntelligenceOutput(roundingScenarioOutput, payload);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /rounding scenarios/i.test(error.message)));
});

test("rejects prescriptive operational language", () => {
  const payload = createPayload();
  const prescriptiveOutput = JSON.stringify({
    ...baseRawOutput,
    opportunities: [
      {
        title: "Prescriptive language",
        severity: "medium",
        evidence: "You should contact the owner about this account.",
        evidence_refs: ["bu.qa.month.7.planned"]
      }
    ]
  });

  const result = validatePetyrForecastIntelligenceOutput(prescriptiveOutput, payload);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /without prescribing corrective actions/i.test(error.message)));
});

test("nightly deterministic worker filters only explicitly inactive companies", () => {
  const companies = normalizePetyrNightlyForecastCompanies([
    { companyName: "Active Co", csmName: "CSM A", isForecastActive: true, priorityScore: 10 },
    { companyName: "Missing Status Co", csmName: "CSM B", isForecastActive: null, priorityScore: 9 },
    { companyName: "Inactive Co", csmName: "CSM C", isForecastActive: false, priorityScore: 8 }
  ] as never);

  assert.deepEqual(companies.map((company) => company.companyName), ["Active Co", "Missing Status Co"]);
});

test("nightly deterministic worker resolves current year and daily model version in Europe/Rome", () => {
  const date = new Date("2026-12-31T23:30:00.000Z");

  assert.equal(getPetyrCurrentYearInTimezone(date, "Europe/Rome"), 2027);
  assert.equal(
    getPetyrDeterministicPreviewDailyModelVersion(date, "Europe/Rome"),
    "petyr_deterministic_preview_v1@2027-01-01"
  );
});

test("nightly deterministic worker parses delay configuration with 3000ms default", () => {
  assert.equal(parsePetyrAiForecastDelayMs(undefined), 3000);
  assert.equal(parsePetyrAiForecastDelayMs("3000"), 3000);
  assert.equal(parsePetyrAiForecastDelayMs("-10"), 0);
  assert.equal(parsePetyrAiForecastDelayMs("120000"), 60000);
});

test("deterministic AI Forecast cache key detects duplicate daily rows", () => {
  const existing = {
    companyName: "Company A",
    businessUnit: "QA",
    year: 2026,
    month: 7,
    modelVersion: "petyr_deterministic_preview_v1@2026-06-20"
  };
  const existingKeys = new Set([getPetyrNightlyForecastCacheKey(existing)]);

  assert.equal(isPetyrNightlyForecastCacheDuplicate({ forecast: { ...existing }, existingKeys }), true);
  assert.equal(
    isPetyrNightlyForecastCacheDuplicate({
      forecast: { ...existing, modelVersion: "petyr_deterministic_preview_v1@2026-06-21" },
      existingKeys
    }),
    false
  );
});

test("nightly deterministic run continues after one company fails", async () => {
  const originalDelay = process.env.PETYR_AI_FORECAST_DELAY_MS;
  const originalTimezone = process.env.PETYR_TIMEZONE;
  process.env.PETYR_AI_FORECAST_DELAY_MS = "3000";
  process.env.PETYR_TIMEZONE = "Europe/Rome";
  const sleepCalls: number[] = [];
  const savedCompanies: string[] = [];

  try {
    const result = await runPetyrNightlyDeterministicAiForecastCore({
      now: new Date("2026-06-20T00:30:00.000Z"),
      timezone: "Europe/Rome",
      delayMs: 3000,
      sleep: async (ms) => {
        sleepCalls.push(ms);
      },
      runWithLock: async (operation) => operation(),
      listCompanies: async () => ({
        data: [
          { companyName: "First Co", csmName: "CSM A", isForecastActive: true, priorityScore: 3 },
          { companyName: "Fail Co", csmName: "CSM B", isForecastActive: true, priorityScore: 2 },
          { companyName: "Inactive Co", csmName: "CSM C", isForecastActive: false, priorityScore: 1 }
        ] as never,
        diagnostics: ["company-list-diagnostic"]
      }),
      saveCompany: async (input) => {
        savedCompanies.push(input.companyName);
        if (input.companyName === "Fail Co") throw new Error("boom");

        return {
          ok: true,
          companyName: input.companyName,
          year: input.year,
          deterministicCandidatesCount: 1,
          report: {
            savedRows: 1,
            skippedRows: 0
          },
          diagnostics: ["save-diagnostic"]
        };
      }
    });

    assert.equal(result.skippedByLock, false);
    assert.equal(result.selectedCompanies, 2);
    assert.equal(result.processedCompanies, 1);
    assert.equal(result.failedCompanies, 1);
    assert.equal(result.savedRows, 1);
    assert.deepEqual(savedCompanies, ["First Co", "Fail Co"]);
    assert.deepEqual(sleepCalls, [3000]);
    assert.ok(result.diagnostics.includes("company-list-diagnostic"));
    assert.ok(result.diagnostics.includes("save-diagnostic"));
  } finally {
    if (originalDelay === undefined) {
      delete process.env.PETYR_AI_FORECAST_DELAY_MS;
    } else {
      process.env.PETYR_AI_FORECAST_DELAY_MS = originalDelay;
    }

    if (originalTimezone === undefined) {
      delete process.env.PETYR_TIMEZONE;
    } else {
      process.env.PETYR_TIMEZONE = originalTimezone;
    }
  }
});

test("nightly deterministic worker defaults to 02:00 Europe/Rome schedule", () => {
  assert.equal(parsePetyrAiForecastDailyTime(undefined), "02:00");
  assert.equal(parsePetyrAiForecastDailyTime("not-a-time"), "02:00");

  const beforeRun = new Date(2026, 5, 20, 1, 30, 0, 0);
  const afterRun = new Date(2026, 5, 20, 2, 30, 0, 0);
  const sameDayRun = getNextPetyrAiForecastDailyRunAt(beforeRun, "02:00");
  const nextDayRun = getNextPetyrAiForecastDailyRunAt(afterRun, "02:00");

  assert.equal(sameDayRun.getFullYear(), 2026);
  assert.equal(sameDayRun.getMonth(), 5);
  assert.equal(sameDayRun.getDate(), 20);
  assert.equal(sameDayRun.getHours(), 2);
  assert.equal(sameDayRun.getMinutes(), 0);
  assert.equal(nextDayRun.getFullYear(), 2026);
  assert.equal(nextDayRun.getMonth(), 5);
  assert.equal(nextDayRun.getDate(), 21);
  assert.equal(nextDayRun.getHours(), 2);
  assert.equal(nextDayRun.getMinutes(), 0);
});

test("AI Forecast baseline weights keep compatible fallback until configured", () => {
  const defaultWeights = getDefaultPetyrAiForecastBaselineWeights();

  assert.equal(defaultWeights.enabled, false);
  assert.equal(
    weightedSignalBaseline({
      historicalWeightedBaseline: 100,
      monthlySeasonality: 200,
      runRate: 300,
      baselineWeights: defaultWeights
    }),
    200
  );
});

test("AI Forecast baseline weights apply and renormalize configured positive signals", () => {
  const configured = resolvePetyrAiForecastBaselineWeightsRead({
    settingValue: JSON.stringify({
      schemaVersion: "petyr_ai_forecast_baseline_weights_v1",
      enabled: true,
      historicalWeightedBaseline: 50,
      monthlySeasonality: 30,
      runRate: 20,
      updatedBy: "test"
    }),
    updatedAt: new Date("2026-06-24T00:00:00.000Z")
  }).weights;

  assert.equal(configured.enabled, true);
  assert.equal(
    weightedSignalBaseline({
      historicalWeightedBaseline: 100,
      monthlySeasonality: 0,
      runRate: 300,
      baselineWeights: configured
    }),
    157
  );
});

test("AI Forecast baseline weights fall back when stored payload is invalid", () => {
  const result = resolvePetyrAiForecastBaselineWeightsRead({
    settingValue: JSON.stringify({
      enabled: true,
      historicalWeightedBaseline: 50,
      monthlySeasonality: 50,
      runRate: 50
    }),
    updatedAt: new Date("2026-06-24T00:00:00.000Z")
  });

  assert.equal(result.weights.enabled, false);
  assert.equal(result.diagnostics.length, 1);
});

test("deterministic AI Forecast final value rounds to nearest 100 EUR", () => {
  const candidates = buildDeterministicForecastCandidates({
    companyName: "Round Co",
    year: 2026,
    currentDate: new Date("2026-06-24T00:00:00.000Z"),
    eligibleMonths: [7],
    historicalPoints: [
      { businessUnit: "QA", year: 2026, month: 5, closedRevenue: 1234, agreementName: "", campaignName: "" }
    ],
    plannedCampaigns: [],
    campaigns: [],
    agreements: [],
    baselineWeights: getDefaultPetyrAiForecastBaselineWeights()
  });
  const qa = candidates.find((candidate) => candidate.businessUnit === "QA");

  assert.equal(qa?.baselineForecast, 1234);
  assert.equal(qa?.roundedForecastValue, 1200);
});
