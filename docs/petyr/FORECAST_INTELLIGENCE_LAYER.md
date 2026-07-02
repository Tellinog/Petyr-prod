# Petyr Forecast Intelligence Layer

Status: accepted implementation contract as of 2026-06-20.

This document supersedes any older Petyr AI Forecasting wording that allowed
OpenRouter to calculate, adjust or choose forecast numbers.

## Responsibility Split

Petyr local code is the source of truth for forecast math.

Local deterministic code must compute:

- eligible months;
- official Business Unit rows;
- three-year historical signals;
- deterministic forecast values;
- trends, scenarios, deltas and risk signals;
- confidence and data-quality flags used by the UI.

OpenRouter is only an interpretation layer. It receives the normalized local
payload after all math is complete and returns structured business analysis.
OpenRouter must not recalculate forecast values, invent metrics, change local
values, overwrite CSM forecasts or write persistence directly.

## API Flow

Primary route:

```txt
POST /api/petyr/ai-forecast/company
```

Expected flow:

```txt
local deterministic forecast
  -> normalized Forecast Intelligence payload
  -> prompt version + input hash
  -> cached validated output lookup
  -> OpenRouter JSON-only request when cache misses
  -> strict schema validation
  -> one retry max for invalid JSON/schema output
  -> ai_forecast_cache success or failure row
  -> UI renders deterministic forecast plus validated intelligence sections
```

If Forecast Intelligence fails, the deterministic preview remains available.
Non-dry-run persistence of numeric forecast rows requires valid or cached
Forecast Intelligence output; failed intelligence saves a failure state and does
not alter deterministic forecast values.

Nightly deterministic automation is separate from this Forecast Intelligence
flow. The `petyr-ai-forecast-worker` service runs at 02:00 in `Europe/Rome`,
computes local deterministic preview rows for active companies and saves those
numeric rows to `ai_forecast_cache` with daily model versions such as
`petyr_deterministic_preview_v1@YYYY-MM-DD`. That worker must not call
OpenRouter, must not create or require Forecast Intelligence sentinel rows and
must not modify CSM-owned forecast data.

Petyr Admin may trigger the same deterministic all-active-company run manually for controlled recovery. The manual run is protected by `petyr:admin` and `APP_INTERNAL_SECRET`, writes missing daily cache rows and reports saved/skipped rows per company. Deterministic final AI Forecast values are rounded to the nearest 100 EUR.

Management/Finance baseline weights are globally configurable in Petyr Admin for historical weighted baseline, monthly seasonality and run-rate. Planned future remains a floor and residual remains allocation/cap pressure. If no weights are configured, Petyr uses the compatible positive-signal average fallback.

## Input Payload Contract

Payload version: `petyr_forecast_intelligence_payload_v3`.

The payload is normalized and company-minimized. It uses `company_001` rather
than real company names in the prompt payload. It includes:

- forecast year, as-of date, currency and eligible months;
- `history_years=3`;
- deterministic forecast rows by Business Unit/year/month, with integer EUR `rounded_forecast_value`;
- local totals for deterministic forecast, baseline, planned value and residual coverage gap;
- three-year historical closed revenue points;
- selected-year real signals, including closed YTD, planned future value and
  campaign counts;
- local deltas by Business Unit;
- local scenarios, including deterministic, planned-floor-only and
  history-signals-only totals;
- local risk signals;
- `deterministic_evidence_registry`, containing only server-owned evidence ids
  that the LLM may cite, with `id`, `label`, `display_value`, `kind`, optional
  Business Unit/month and debug path/metadata;
- recent sanitized CSM change notes for the selected company/year, including
  month, forecast type, source, created time and changed-BU count;
- local trend signals, including recent growth, over-consumption and summer slowdown flags;
- agreement residual allocation with remaining months, monthly cap, historical capacity, linked planned campaign cap and planned-over-residual watchout flag;
- Business Unit attribution from sanitized title tokens, linked-agreement history or company+BU history;
- internal consultative scenarios that may remain in local deterministic data but must not be requested, validated, rendered or charted by Forecast Intelligence output;
- data-quality diagnostics and flags;
- explicit LLM constraints stating consultative-only, numbers are local source of truth, no recalculation, no invented numbers, no prescriptive operational instructions and JSON-only response.

The evidence registry includes only useful citeable evidence such as forecast
totals, planned values, closed revenue, residual gaps, campaign counts,
remaining months/months to expiry, signed deltas and server-calculated
percentages. It must not include technical diagnostics, rounding or adjustment
scenarios, provider metadata or internal implementation details.

The payload must not include CSM-entered monthly or annual forecasts as numeric
forecast inputs. Those values remain UI comparison data only. CSM change notes
are qualitative context for the selected year, not authoritative numeric
evidence. Before they are sent to OpenRouter, Petyr strips URLs, email addresses,
token-like strings and excessive whitespace, limits the number of sessions and
caps total note text. Agreement, campaign and deal titles must not be sent as raw
text; only sanitized BU attribution signals such as matched Business Unit,
matched tokens and confidence may be sent.

## Output JSON Schema

Raw LLM output schema version: `petyr_forecast_intelligence_llm_output_v5`.

OpenRouter must return one JSON object only, with no markdown, code fences or
surrounding prose. The raw LLM output uses evidence refs, not numeric evidence:

```json
{
  "stakeholder_notes": [
    {
      "title": "string",
      "note": "string",
      "evidence_refs": ["registry_entry_id"]
    }
  ],
  "risks": [
    {
      "type": "under_consumption|over_consumption|margin_risk|timing_risk|data_quality|other",
      "severity": "low|medium|high",
      "description": "string",
      "evidence_refs": ["registry_entry_id"]
    }
  ],
  "opportunities": [
    {
      "title": "string",
      "severity": "low|medium|high",
      "evidence": "string",
      "evidence_refs": ["registry_entry_id"]
    }
  ],
  "watchouts": [
    {
      "title": "string",
      "severity": "low|medium|high",
      "evidence": "string",
      "evidence_refs": ["registry_entry_id"]
    }
  ]
}
```

After validation, Petyr enriches the UI-facing output by converting
`evidence_refs` into the existing `numeric_evidence` strings from registry
`display_value` fields. The UI-facing validated output may keep the current
shape with `numeric_evidence`, but those strings are server-generated.

Validation rejects missing required fields, unexpected fields, unknown or empty
`evidence_refs`, raw model-generated `numeric_evidence`, markdown in text
fields, prompt/internal implementation disclosures, visible rounding-scenario
references such as `floor_100`, `nearest_100`, `ceil_100`, and prescriptive
operational instructions such as telling the CSM what to do. Narrative fields
may contain free natural-language numbers, but official numeric evidence shown
in the UI must come from valid registry refs.

## Prompt And Hashing

Prompt version: `petyr_forecast_intelligence_prompt_v5`.

The system prompt must explicitly state that all forecast numbers and metrics
come from Petyr local calculations and must not be recalculated, adjusted,
rounded, overridden or invented by the model. It must also state that the LLM
owns insight text and `evidence_refs`, while Petyr owns forecast values and
numeric evidence display.

The backend computes a stable SHA-256 input hash from the normalized payload.
Cached output may be reused only when provider, model, prompt version and input
hash match.

## Cache Persistence

Cache table/model: `ai_forecast_cache`.

Forecast Intelligence uses the existing table with a sentinel row:

```txt
business_unit = __forecast_intelligence__
month = 0
forecast_value = 0
```

The row stores provider, model, prompt version, input hash, request payload
summary, validated output JSON, status, error message, created_at and
updated_at. For Forecast Intelligence sentinel rows, `model_version` is an
internal cache key containing provider model, prompt version and input hash so
changed inputs do not collide with earlier cache entries. Numeric forecast cache readers must filter to successful rows with
months 1-12 and exclude the sentinel business unit.

Deterministic forecast rows may still be saved to `ai_forecast_cache` for
Business Unit/month values, but their numbers remain local deterministic values.

## Failure Handling

Failure handling is graceful:

- invalid JSON or schema output gets one retry max;
- retry failure stores status `failed` with an error message;
- OpenRouter unavailability stores status `failed`;
- missing `OPENROUTER_API_KEY` stores status `failed` and does not call the
  provider;
- deterministic preview still renders;
- no markdown/prose fallback is accepted as AI output.

## UI Expectations

Forecast Entry's admin-visible AI Forecast support tool exposes:

- `Generate deterministic preview`;
- `Generate AI forecast`;
- `Apply AI forecast`.

Forecast Entry Monthly forecast may also expose a CSM-facing `Generate
Intelligence` action to users with `petyr:forecast:write`. This action must call
only the dry-run Forecast Intelligence path, render validated consultative JSON
and hide apply controls, OpenRouter I/O, raw prompt payloads and prompt/debug
JSON. Company Detail remains read-only for forecast data and must not expose
Forecast Intelligence generation, render persisted Forecast Intelligence
sentinel rows or generate/apply numeric AI Forecast rows.

The UI must render deterministic numeric rows separately from Forecast
Intelligence analysis. Forecast Intelligence sections must show only stakeholder
notes, risks, watchouts and opportunities from validated JSON. Each item must
carry compact numeric evidence generated by Petyr from the deterministic
evidence registry, explaining amounts, timing, residual pressure, planned value,
closed revenue, signed deltas, campaign counts or remaining months. Status,
confidence, as-of date, eligible-month/provider diagnostics, executive
summaries, key insights, drivers, forecast cues, chart-comparison candidates,
rounding scenarios, data-quality notes and CSM questions are intentionally not
part of the user-facing output.

The UI must show a graceful error when AI fails and must not imply OpenRouter changed forecast values. Numeric forecast rows remain deterministic even when Forecast Intelligence is cached, retried or failed.
