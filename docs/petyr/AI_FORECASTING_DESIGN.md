# Petyr AI Forecasting Design

> 2026-06-10 update: `docs/petyr/FORECAST_INTELLIGENCE_LAYER.md` supersedes any older wording in this file that allowed OpenRouter to calculate, adjust or choose forecast numbers. Petyr local deterministic code is now the source of truth for all forecast values; OpenRouter returns validated JSON business interpretation only.

## Status

This is a technical/product design document for the first Petyr AI Forecasting
MVP and later production hardening.

Current implementation status:

- pure prompt-contract, OpenRouter JSON Schema response-format and
  response-validator helpers exist in
  `apps/forecasting-app/src/services/petyrAiForecastLlmContract.ts`;
- a smoke helper exists in
  `apps/forecasting-app/src/services/petyrAiForecastLlmContractSmoke.ts`;
- the protected manual company endpoint can persist `dryRun=false` results to
  `ai_forecast_cache` after server-side LLM output validation;
- no production LLM calls are enabled by those helpers;
- no automatic save to `ai_forecast_cache` is enabled by those helpers;
- no real company data is sent to an external service by those helpers.

This document extends the source of truth in `PETYR_PRODUCT_AND_DATA_LOGIC.md`,
especially the manual MVP, hybrid forecasting, cache-only persistence and
privacy/data-minimization rules.

## Objective

Petyr AI Forecasting should generate read-only monthly forecast suggestions for
future months of a selected year at this grain:

```txt
Company + Business Unit + Future Month + Year
```

The AI Forecast must help CSMs and Management compare system-generated
suggestions with CSM forecasts and closed revenue, without becoming the source
of truth for CSM-owned forecast values.

The first MVP started as manual and company-by-company:

- an operator/user triggers AI forecasting for one selected company at a time;
- the trigger target is one company and one selected forecast year;
- the manual endpoint must not process all companies together;
- Petyr must not run a global automatic LLM/OpenRouter batch in this phase;
- Redash sync completion must not automatically trigger AI Forecasting in this
  phase;
- the goal is to control OpenRouter cost/credits and test result quality before
  expanding automation.

Accepted deterministic automation:

- Petyr runs a dedicated nightly deterministic-only worker for active companies;
- schedule defaults to `02:00` in `Europe/Rome`;
- the worker waits `3000ms` between companies by default;
- the worker targets the current Rome year;
- the worker saves local deterministic preview rows to `ai_forecast_cache`;
- the worker uses daily append-only model versions such as
  `petyr_deterministic_preview_v1@YYYY-MM-DD`;
- the worker does not call OpenRouter or Forecast Intelligence.

Accepted manual recovery:

- Petyr Admin can run the deterministic Daily AI Forecast immediately for all active companies;
- the admin run uses the same service as the worker and requires `petyr:admin` plus `APP_INTERNAL_SECRET`;
- duplicate rows for the same daily model version are skipped rather than overwritten;
- final deterministic AI Forecast values are rounded to the nearest 100 EUR.

Accepted calibration control:

- Petyr Admin stores one global Management/Finance baseline weight set;
- weights apply only to historical weighted baseline, monthly seasonality and run-rate;
- planned campaigns remain a target-month floor;
- agreement residual remains allocation/cap pressure;
- if no weights are configured, Petyr uses the compatible positive-signal average fallback.

AI Forecasting must be hybrid:

```txt
Deterministic baseline + business signals + LLM reasoning layer
```

The LLM must not invent forecast numbers directly from a blank prompt. Petyr
must provide a deterministic baseline and business signals first, then use the
LLM reasoning layer only to reason over, explain or adjust that evidence.

The AI Forecast must:

- read only PostgreSQL-backed Petyr/Redash-derived data;
- never call Redash directly;
- send minimized numeric/categorical features to an LLM whenever possible;
- after the future anonymization tool/API is available, exclude identifying text
  and links from the LLM payload;
- reconcile LLM output through server-side pseudonym mappings;
- write only validated future-month AI suggestions to `ai_forecast_cache`;
- never write CSM-owned `forecast_monthly` or `forecast_annual` rows;
- never write closed revenue, management objectives or annual forecast snapshots;
- never modify past-month AI Forecast values;
- never modify the current month;
- avoid overwriting historical AI Forecast generations.

## Non-goals

This design does not implement:

- a production OpenRouter/LLM call;
- an automatic global LLM/OpenRouter AI batch;
- processing every company in one request;
- Prisma schema changes;
- a new AI cache history table;
- changes to existing forecast AI rows;
- browser-side AI generation;
- client-side pseudonym mapping;
- a complete anonymization tool/API.

Complete anonymization through a dedicated tool/API is deferred for the first
manual MVP. This deferral must not block the first controlled company-by-company
AI test. Once that tool/API exists, Petyr must stop sending company, CSM,
campaign, agreement names or links to the LLM.

## Data flow

First MVP flow:

```txt
Manual company AI forecast request
  -> selected company + selected year
  -> PostgreSQL feature extraction for that company
  -> future-month eligibility check
  -> deterministic baseline calculation
  -> business signal extraction
  -> minimized/manual-MVP LLM payload
  -> LLM response using target refs/pseudonyms where available
  -> server-side response validation
  -> server-side pseudonym reconciliation
  -> ai_forecast_cache insert for eligible rows only
  -> manual-run logs and diagnostics
```

Petyr remains responsible for the full privacy boundary. The LLM must not be
trusted to enforce privacy, choose editable months or decide persistence rules.

## Input features

Petyr should prefer aggregated features over row-level details. Row-level
campaign or agreement features should be used only when an implementation task
explicitly proves that aggregate features are insufficient.

Allowed input categories:

| Feature category | Allowed examples | Notes |
|---|---|---|
| Scope identifiers | `company_001`, `business_unit_QA`, `business_unit_001` | Pseudonyms only. No real names. |
| Forecast target | selected year, eligible future months | Derived server-side. |
| Deterministic baseline | baseline value by target month, baseline method, baseline confidence flags | Required before LLM reasoning. |
| Historical closed revenue | monthly closed revenue by Business Unit, trailing 12/24/36 months | Numeric only. |
| Current-year revenue | closed revenue YTD by Business Unit, monthly totals | Numeric only. |
| Planned future pipeline | aggregate count/value of future planned campaigns by month/status category | No campaign names or links. |
| Campaign mix | counts by status category, counts by month, total planned value | Status categories must be allowlisted. |
| Agreement signals | active agreement count, residual total, expiry bucket counts, days to next expiry bucket | No agreement names or links. |
| CSM forecast input exclusion | CSM-entered previous-month, ongoing and annual forecast values are excluded from the OpenRouter payload | They remain UI comparison/reference data only and must not influence `aiForecastValue`. |
| Real-data volatility | historical closed-revenue variance and sparse-activity flags by company/BU | Numeric aggregates only; do not derive these from CSM forecasts. |
| Company status | active/inactive forecasting status | Categorical. |
| Branch or portfolio signals | pseudonymous branch bucket, if needed | No branch labels if they can identify real org structure. |
| Data quality | missing ownership flag, missing BU fallback flag, sparse-history flag | Categorical flags only. |

Free-text notes should not be included. CSM-entered monthly and annual forecast
values should not be included in the OpenRouter prompt either; AI Forecast must
be grounded in real closed/planned/residual evidence and deterministic baseline
measurements. If future implementation needs a text signal, it must first
document the exact redaction/minimization rule and receive a separate decision.

The first MVP payload must always include the deterministic baseline and the
business signals used to derive it. A payload containing only a company target
and a request for the LLM to invent numbers is invalid.

## Baseline strategies

The deterministic baseline is computed before any LLM reasoning. Each target row
at `company + Business Unit + future month + year` must have a numeric baseline
or an explicit low-data flag explaining why the baseline is weak.

The first manual MVP must define these baseline strategies and expose which
ones materially influenced each generated row:

### Historical weighted baseline

Use historical closed revenue for the same company and Business Unit, weighted
toward more recent months and comparable months from prior years. Sparse or
missing history must lower confidence and must be surfaced as a data quality
driver rather than hidden.

### Monthly seasonality

Use same-month historical performance and Business Unit seasonality to adjust
the baseline for recurring monthly patterns. If same-month history is missing,
the strategy may fall back to nearby months or the company/Business Unit average
only with a visible sparse-history driver.

### Run-rate

Use current-year or trailing-period closed revenue pace to estimate the future
monthly run rate. Run-rate should be treated as a stabilizer, not as proof of
future pipeline, and should be dampened when history is volatile or the company
has low activity.

### Planned campaigns

Use only valid future planned campaigns for the selected company, Business Unit
and target month/year. Planned future campaign eligibility follows the Petyr
status allowlist:

- include `Setup`;
- include `Recruiting`;
- exclude `Running` from planned future;
- exclude completed, aborted, cancelled/canceled, deleted, rejected, lost,
  archived, missing or unknown statuses unless a future documented decision adds
  them.

`Running` belongs to revenue/closed/current-activity reasoning, not planned
future pipeline. The baseline may use `Running` only through closed revenue,
current activity or non-planned signal features when the revenue rules make that
coherent.

### Agreement residual allocation

Agreement residual allocation is a deterministic local signal that prevents the agreement-linked forecast component from consuming more residual than is reasonable before expiry.

Rules:

- consider only active agreements;
- include only agreements with `residual > 0`;
- include only agreements with a future expiry date;
- link agreements to campaigns by company and agreement name;
- estimate remaining months until expiry and allocate residual over time instead of pulling the full residual into the first forecast year;
- attribute residual to Business Units by sanitized title-token match first, linked-agreement historical consumption second and company+BU history fallback third;
- cap the agreement-linked forecast component by the local monthly allowance and historical capacity;
- if a linked planned campaign exceeds the allowance, cap locally and emit a watchout signal;
- do not treat expired residuals as active residual pressure for the future forecast baseline.

The signal must expose residual amount, allowance, cap status, attribution method, matched sanitized tokens and coverage gap so the LLM can identify opportunities or watchouts without changing the forecast number.

## LLM intelligence layer

The LLM intelligence layer receives the deterministic payload after local math completes. It is consultative only and cannot propose, adjust or save a final AI Forecast value.

Rules:

- the LLM may refer only to metrics and signals supplied by Petyr;
- the LLM must not invent a forecast when baseline and signals are absent;
- the LLM must not select, comment on or expose local rounding/adjustment scenarios;
- output must include only structured stakeholder notes, risks, watchouts and opportunities, each with payload-backed numeric evidence; it must not produce status, confidence, executive summary, key insights, drivers, forecast cues, chart candidates, data-quality notes or CSM questions;
- output must not contain prescriptive operational instructions;
- weak-data results must explain the limitation through payload-backed numeric evidence rather than a separate confidence/status field.

## Forbidden fields

Target privacy contract once the dedicated anonymization tool/API is available:
the LLM payload must not contain:

- company name;
- CSM name;
- campaign name;
- agreement name;
- deal link;
- campaign link;
- agreement/deal display link;
- free-text notes that may identify a company, CSM, campaign, agreement or deal;
- HubSpot, Redash, CRM or internal URLs;
- email addresses;
- phone numbers;
- person names;
- raw customer titles if they are identifying;
- raw payload JSON from Redash;
- raw `RedashSnapshot.payload`;
- any field not explicitly needed for forecasting.

This applies to:

- prompt messages;
- tool/function-call payloads;
- JSON schemas and examples sent to the model;
- retry payloads;
- error reports sent to external services;
- model-visible logs, if any are ever introduced.

Temporary MVP exception:

- complete anonymization is deferred to a future tool/API;
- the first manual company-by-company test is allowed to proceed without that
  full tool/API;
- even during the manual MVP, Petyr should omit links, free-text notes and
  unnecessary identifying text wherever practical;
- once the anonymization tool/API exists, the exception ends and company, CSM,
  campaign, agreement names and links must no longer be sent.

## Anonymization strategy

Petyr must eventually build a temporary pseudonym map before constructing any
LLM payload. For the first manual MVP, this complete anonymization capability
is a deferred TODO and must not block controlled testing.

Rules for the future anonymization tool/API:

- Pseudonyms are deterministic within a single manual run.
- Pseudonyms must not be derived by exposing sanitized real names.
- Pseudonyms should be assigned from a stable server-side ordering of selected
  entities, for example `company_001`, `company_002`, `agreement_001`.
- Official Business Units may use non-identifying category refs such as
  `business_unit_QA`; if the category itself becomes sensitive in a future
  context, use `business_unit_001` and keep the real BU in the mapping.
- Campaign and agreement pseudonyms should be avoided unless row-level features
  are explicitly needed. Aggregate campaign/agreement features are preferred.
- The pseudonym map must remain server-side only.
- The pseudonym map must not be sent to the browser.
- The pseudonym map must not be sent to the LLM.
- The pseudonym map must not be written to normal application logs.
- If retry persistence is required later, it must use server-side temporary
  storage with a short TTL and must be documented before implementation.

The mapping exists only to reconcile the response and persist the forecast to
the correct real company/Business Unit after validation.

## Pseudonym mapping

Server-side mapping shape, conceptual only:

```json
{
  "run_id": "internal_manual_run_id",
  "company": {
    "company_001": {
      "company_name": "server-side only",
      "company_key": "server-side stable key"
    }
  },
  "business_unit": {
    "business_unit_QA": {
      "business_unit": "QA"
    }
  },
  "campaign": {
    "campaign_001": {
      "campaign_key": "server-side only"
    }
  },
  "agreement": {
    "agreement_001": {
      "agreement_key": "server-side only"
    }
  }
}
```

The LLM sees only refs such as `company_001` and `business_unit_QA`.

## Payload schema toward the LLM

The LLM payload should be strict JSON. It should contain no natural-language
business context that includes identifying text.

Example schema with synthetic values:

```json
{
  "schema_version": "petyr_ai_forecast_payload_v1",
  "task": "monthly_company_business_unit_forecast",
  "as_of_date": "YYYY-MM-DD",
  "forecast_year": 2026,
  "currency": "EUR",
  "eligible_months": [6, 7, 8, 9, 10, 11, 12],
  "privacy_contract": {
    "identifying_text_removed": true,
    "links_removed": true,
    "free_text_notes_removed": true
  },
  "companies": [
    {
      "company_ref": "company_001",
      "company_features": {
        "forecasting_status": "active",
        "history_months_available": 24,
        "closed_revenue_ytd": 12345.67,
        "planned_future_total": 5000.0,
        "data_quality_flags": ["complete_ownership"]
      },
      "business_units": [
        {
          "business_unit_ref": "business_unit_QA",
          "historical_monthly": [
            {
              "year": 2025,
              "month": 6,
              "closed_revenue": 1200.0
            }
          ],
          "current_year_real_signals": {
            "closed_revenue_ytd": 4200.0,
            "planned_future_value": 2800.0,
            "closed_revenue_campaigns_count": 3,
            "planned_future_campaigns_count": 2
          },
          "excluded_forecast_inputs": {
            "csm_monthly_forecast_excluded": true,
            "csm_annual_forecast_excluded": true
          },
          "deterministic_baseline": {
            "method": "historical_weighted_plus_seasonality_run_rate_pipeline_v1",
            "monthly_values": [
              {
                "year": 2026,
                "month": 7,
                "historical_weighted_baseline": 1350.0,
                "monthly_seasonality_baseline": 1600.0,
                "run_rate_baseline": 1450.0,
                "planned_campaigns_value": 2800.0,
                "agreement_residual_pressure_gap": 0.0,
                "baseline_forecast": 1700.0
              }
            ],
            "confidence_flags": ["sufficient_history"]
          },
          "planned_future": {
            "campaign_count": 2,
            "total_value": 2800.0,
            "status_counts": {
              "Setup": 1,
              "Recruiting": 1
            },
            "excluded_status_counts": {
              "Running": 1
            }
          },
          "agreement_features": {
            "active_agreement_count": 1,
            "residual_total": 3000.0,
            "future_expiring_residual_total": 3000.0,
            "days_to_next_expiry_bucket": "31_60",
            "residual_pressure": {
              "forecast_coverage_value": 3200.0,
              "coverage_gap": 0.0,
              "status": "covered"
            }
          },
          "accuracy_features": {
            "mean_absolute_error": 250.0,
            "mean_percentage_error": 0.08,
            "forecast_bias": "under"
          },
          "targets": [
            {
              "year": 2026,
              "month": 7
            }
          ]
        }
      ]
    }
  ],
  "response_contract": {
    "return_json_only": true,
    "use_only_refs_from_payload": true,
    "do_not_include_real_names_or_links": true,
    "aiForecastValue_must_be_non_negative": true,
    "confidenceScore_range": "0_to_1"
  }
}
```

Implementation must build this payload from an allowlist of fields, not by
serializing arbitrary service objects.

## LLM response schema

The LLM must return JSON only. The response must start with the JSON object opening brace and end with the closing brace; model commentary, candidate review, markdown fences, partial rows or prose before/after JSON are invalid. Useful caveats must be returned inside structured warnings objects, not as surrounding text. OpenRouter requests for the manual MVP must use a
strict JSON Schema `response_format` for this exact shape and provider routing
must require support for the structured-output parameter. Petyr still treats the
server-side validator below as the final authority before persistence.

The model-facing response may use refs. After server-side validation and
reconciliation, the expected MVP output row must expose these fields:

```json
{
  "schema_version": "petyr_ai_forecast_response_v1",
  "forecasts": [
    {
      "company_ref": "company_001",
      "businessUnit": "QA",
      "year": 2026,
      "month": 7,
      "baselineForecast": 1700.0,
      "plannedCampaignsValue": 2800.0,
      "agreementResidualSignal": {
        "activeAgreementCount": 1,
        "residualValue": 3000.0,
        "futureExpiry": true,
        "forecastCoverageValue": 3200.0,
        "coverageGap": 0.0,
        "status": "covered"
      },
      "aiForecastValue": 1800.0,
      "confidenceScore": 0.74,
      "explanation": "Recent seasonality and planned value indicate moderate growth.",
      "advice": "Review planned delivery timing and monitor agreement consumption before expiry.",
      "drivers": [
        "monthly_seasonality",
        "planned_campaigns",
        "agreement_residual_pressure"
      ],
      "model_version": "provider/model@prompt_v1",
      "generated_at": "YYYY-MM-DDTHH:mm:ss.sssZ"
    }
  ],
  "warnings": [
    {
      "company_ref": "company_001",
      "businessUnit": "QA",
      "code": "sparse_history",
      "message": "Same-month history is limited, so confidence remains moderate."
    }
  ]
}
```

Response rules:

- `company_ref` must match the selected company ref or a pseudonym in the
  server-side map.
- `businessUnit` must match a selected official Business Unit after server-side
  reconciliation; if the model-facing payload uses a pseudonym, the pseudonym
  must map to that Business Unit server-side.
- `year` must match the selected forecast year.
- `month` must be an eligible future month.
- `baselineForecast`, `plannedCampaignsValue` and `aiForecastValue` must be
  finite numbers greater than or equal to 0.
- `agreementResidualSignal` must summarize only active agreements with residual
  greater than 0 and future expiry; `coverageGap` is greater than 0 when future
  forecast does not cover the residual.
- `confidenceScore` must be a finite number between 0 and 1.
- `explanation` must be short, non-identifying and must not contain names,
  links, emails, phone numbers or copied free text.
- `advice` must be operational, non-identifying and based on supplied drivers.
- `drivers` must be an array of supplied baseline or business-signal driver
  codes; it must not introduce evidence that was absent from the payload.
- `warnings` must be an array of structured objects with at least `code` and
  `message`; optional `company_ref`, `businessUnit` and `month` may scope the
  warning. Free-form comment text outside JSON is not accepted.
- `model_version` and `generated_at` are persisted from the server-side manual-run
  context as the authoritative values if the model omits or mismatches them.

## Future-month rules

Petyr, not the LLM, decides which months are eligible.

Definitions use the server-side `as_of_date`.

Rules:

- If `forecast_year` is before the current year, no months are eligible.
- If `forecast_year` is after the current year, months 1 through 12 are eligible.
- If `forecast_year` is the current year, only months after the current month are
  eligible.
- Past months are never eligible.
- AI Forecast must never modify past-month AI Forecast values.
- The current month is never eligible in the MVP, even if it has no closed revenue.
- The LLM response must be filtered again against the eligible month set before
  persistence.

Historical AI Forecast generations must not be overwritten. Future
implementation should treat regeneration as append-only through a distinct
versioning policy. Until that policy is defined, existing cache rows for the
same real company, Business Unit, year, month and model version should be
skipped rather than overwritten.

## Saving to `ai_forecast_cache`

`ai_forecast_cache` is the only persistence target for AI Forecast output.

Petyr saves only after:

1. the response parses as strict JSON;
2. the response schema is valid, including structured warnings instead of
   free-form comments;
3. every ref maps to the selected company/Business Unit or a server-side
   pseudonym;
4. every target month is eligible;
5. every numeric value passes validation;
6. every explanation passes privacy checks;
7. the row is reconciled to the real company and Business Unit server-side.

Persisted fields:

| `ai_forecast_cache` field | Source |
|---|---|
| `company_name` | selected company context or server-side pseudonym map |
| `business_unit` | selected Business Unit context or server-side pseudonym map |
| `year` | validated response target |
| `month` | validated eligible future month |
| `forecast_value` | validated `aiForecastValue` |
| `confidence_score` | validated `confidenceScore` |
| `model_version` | authoritative manual-run model/prompt version |
| `explanation` | validated non-identifying explanation, with advice/drivers summarized only if no richer persistence exists |
| `generated_at` | authoritative server-side generation timestamp |

Persistence rules:

- Do not write `forecast_monthly`.
- Do not write `forecast_annual`.
- Do not write Initial Forecast fields such as
  `forecast_annual_entry.initial_forecast` or `forecast_annual.initial_forecast`.
- Do not write closed revenue tables/materialized Redash data.
- Do not write `management_objective`.
- Do not write `forecast_change_log` for AI generation.
- Do not overwrite CSM-owned forecast values.
- Do not overwrite past-month AI forecasts.
- Do not overwrite existing AI cache history.
- Use a transaction boundary that prevents partially saved output for one
  company when that company's response fails validation.

If the current unique key prevents append-only regeneration for the same model
version, the manual run should skip the existing row and log a
`skipped_existing_cache` event until a versioning/history decision is
implemented.

The MVP output contract includes `baselineForecast`, `plannedCampaignsValue`,
`agreementResidualSignal`, `advice` and `drivers`. The current
`ai_forecast_cache` table does not have dedicated columns for all of these
fields. Until a future schema/API decision adds richer persistence, the manual
run output must still expose them in the validated response/dry-run diagnostics
and must not silently pretend that they are stored as structured cache columns.

## Manual and deterministic nightly execution strategy

LLM/OpenRouter AI Forecast execution remains manual for the first MVP.

Rules:

- Trigger one selected company at a time.
- Do not process all companies in one request.
- Select companies from PostgreSQL-backed Petyr data only.
- Do not start a global automatic post-sync LLM/OpenRouter AI batch in this phase.
- Keep the operator-visible trigger explicit so OpenRouter cost/credit usage is
  controlled.
- Wait between external model calls to respect provider limits.
- Support dry-run mode that builds eligibility and sanitized payload previews
  without calling the LLM and without writing cache rows.
- Support retries for transient provider/network failures.
- Do not retry privacy validation failures by resending the same unsafe payload.

Nightly deterministic automation is accepted separately from OpenRouter
automation. It runs in `petyr-ai-forecast-worker`, excludes explicitly inactive
companies, computes local deterministic preview values only and saves those rows
to `ai_forecast_cache`. Future automated/progressive LLM/OpenRouter batch
behavior is still deferred and tracked separately in `BACKLOG.md`.

## Failure handling

Privacy and validation failures are blocking for the affected company payload.

Recommended behavior:

- If forbidden fields are detected before sending, abort the affected company
  payload before any external call.
- If the model call fails transiently, retry with bounded exponential backoff.
- If the model returns invalid JSON, retry only if the retry payload is still
  privacy-safe.
- If the model returns unknown refs, invalid months or invalid values, reject
  the affected company response.
- If one company fails, do not write partial invalid output for that company.
- If a database write fails, do not mark the company as completed.
- If `ai_forecast_cache` already has an eligible row and append-only versioning
  is unavailable, skip the row and record the skip reason.
- If confidence is below the future accepted threshold, either skip or save with
  a low-confidence status only after that policy is defined.

No failure path may add extra real names, links, notes or pseudonym maps beyond
the original manual-run payload, and no failure path may send them to external
logging systems. Once the anonymization tool/API exists, no failure path may
send identifying names or links to the LLM either.

## Logging

Logs must support operations without leaking identity.

Allowed log content:

- internal manual-run id;
- selected model and prompt/schema version;
- count of selected companies, Business Units and forecast rows;
- sanitized pseudonym refs when needed for debugging;
- eligible month set;
- result counts: saved, skipped, failed, retried;
- error codes and validation categories;
- payload hash or schema version.

Forbidden log content:

- company names;
- CSM names;
- campaign names;
- agreement names;
- links;
- free-text notes;
- full raw prompt payloads;
- full raw LLM responses before privacy validation;
- pseudonym-to-real mapping.

If deeper debugging is needed, introduce a separate documented secure diagnostic
mode before implementation.

## Privacy checklist

For the first manual MVP:

- [ ] The run is triggered for one selected company only.
- [ ] The payload includes deterministic baseline values.
- [ ] The payload includes business signals used by the LLM.
- [ ] The payload includes historical closed revenue and selected-year real
      closed/planned aggregates.
- [ ] CSM-entered monthly and annual forecasts are excluded from the OpenRouter
      payload and cannot influence `aiForecastValue`.
- [ ] Planned future includes only valid future planned campaigns and excludes
      `Running`.
- [ ] Agreement residual allocation considers only active agreements with `residual > 0` and future expiry, distributes residual over remaining months and uses sanitized BU attribution signals.
- [ ] The payload omits links and free-text notes where practical.
- [ ] Complete anonymization is explicitly not implemented yet and remains a
      blocking hardening TODO before broader rollout.
- [ ] Past months and the current month are excluded server-side.
- [ ] Output writes only to `ai_forecast_cache`.
- [ ] No CSM forecast, closed revenue, management objective or annual forecast
      table is written.
- [ ] CSM-entered forecast values remain comparison/reference data only.

Before any broader production LLM rollout is enabled:

- [ ] The feature extractor uses an explicit allowlist.
- [ ] The payload contains no real company, CSM, campaign or agreement names.
- [ ] The payload contains no links or URLs.
- [ ] Free-text notes are omitted.
- [ ] Campaign/agreement data is aggregated unless row-level detail is explicitly approved.
- [ ] Pseudonym mapping remains server-side only.
- [ ] Browser code never receives the pseudonym mapping.
- [ ] Logs never contain real names, links, raw prompt payloads or mappings.
- [ ] The model response is schema-validated before reconciliation.
- [ ] The model response is privacy-checked before persistence.
- [ ] Eligible months are computed server-side.
- [ ] Past months are excluded server-side.
- [ ] The current month is excluded server-side.
- [ ] Existing AI forecast history is not overwritten.
- [ ] `ai_forecast_cache` is the only AI output persistence target.
- [ ] CSM-owned forecast tables are never written by AI generation.
- [ ] Dry-run mode can prove the sanitized payload shape without external calls.

## TODOs

Open decisions before production AI Forecasting:

- Define the initial OpenRouter model for Petyr AI Forecasting.
- Define the minimum accepted `confidence_score` threshold and how low-confidence rows are displayed or skipped.
- Build the future anonymization tool/API and then forbid company, CSM,
  campaign, agreement names and links in all LLM payloads.
- Define the future production batch size and rate-limit policy before any
  automated LLM/OpenRouter batch is considered. The deterministic nightly worker
  already uses local-only generation with a default 3000ms inter-company delay.
- Define the final AI output validator, including exact JSON schema, numeric bounds and explanation sanitizer.
- Define append-only AI cache versioning/history so future regenerations do not overwrite historical AI forecasts.
- Define persistence for `baselineForecast`, `plannedCampaignsValue`,
  `agreementResidualSignal`, `advice` and `drivers` if these fields need to be
  queryable after the manual run response.
- Decide whether row-level campaign/agreement pseudonyms are ever allowed, or whether aggregate features remain mandatory.
- Decide temporary pseudonym-map retention rules if retries need to survive process restarts.

## UI explainability and current-run diagnostics

The manual company AI Forecast apply UI is a secondary admin-visible support
tool inside Forecast Entry only. It must stay below the main Forecast Entry
editor. It remains read-only for editing: users can preview AI output and
explicitly apply validated rows to `ai_forecast_cache`, but cannot edit AI
Forecast values in the component and cannot write CSM-owned forecast tables from
the AI UI. Forecast Entry Monthly forecast may expose a separate CSM-facing
`Generate Intelligence` control for users with `petyr:forecast:write`; that
control is consultative-only, uses the dry-run Forecast Intelligence path, hides
OpenRouter I/O and raw prompt payloads, and must not apply numeric AI Forecast
rows. Company Detail must not expose that Intelligence control or render
persisted Forecast Intelligence sentinel rows; future company-level intelligence
belongs to separate documented scope.

Current UI sections:

- Header: company/year context, single-company and deterministic-preview badges,
  selected model/as-of date when available, Generate deterministic preview,
  Generate AI forecast and confirmed Apply AI forecast actions.
- Summary cards: generated row count, model, residual-gap count and deterministic confidence.
- Overview: row-level Business Unit/month baseline, deterministic forecast value, model adjustment fixed at zero, confidence, planned target-month value, residual allocation context and consultative context.
- Intelligence: validated Forecast Intelligence JSON only, including stakeholder notes, risks, watchouts and opportunities. Each item must explain the relevant amount, timing or exposure with numeric evidence from the payload. Failed AI renders a graceful error and leaves deterministic rows available.
- Algorithms & signals: algorithm summary, deterministic formula explanation,
  weighting mode, AI interpretation rule, validation authority, limitations,
  per-row signal values, included signals, excluded signals and reasons.
- Year & Business Unit: selected-year Business Unit aggregates for closed
  revenue YTD, planned future value, deterministic future baseline, forecast
  future total, CSM annual forecast when available and residual gap availability.
- Charts: Recharts monthly line chart for available monthly series and Business
  Unit comparison bar chart for available aggregate series. Null/notAvailable
  values are not mixed into totals and empty states are shown when an entire
  chart has no available series.
- OpenRouter I/O: current-run sanitized prompt payload/messages, call status,
  model, prompt/response schema versions, safe model response when validation and
  safety checks allow it, validation errors and provider errors. Petyr may run
  one strict-JSON retry after an invalid OpenRouter response; the retry output
  must pass the same schema, target-set and privacy validation before use.
- Apply result / diagnostics: saved/skipped/validation counts, validation
  messages and PostgreSQL/data-quality diagnostics.
- CSM Intelligence: a safe subset of validated Forecast Intelligence output,
  without raw prompt payloads, OpenRouter I/O diagnostics or apply controls.

OpenRouter I/O visibility rules:

- Deterministic dry-run clearly reports that OpenRouter was not called.
- Forecast Intelligence OpenRouter call is only requested by the explicit Generate AI forecast or Generate Intelligence action.
- Apply may call OpenRouter only through the existing manual non-dry-run path and
  still writes only validated future-month rows to `ai_forecast_cache`.
- Prompt/response diagnostics are current-run UI data only. They are not
  persisted by the UI and must not be written to logs or application tables.
- API keys, Authorization headers and bearer tokens must never be displayed. The
  backend sanitizes diagnostic fields, and the UI performs an additional
  defensive redaction pass before rendering JSON-like diagnostics.

Remaining UI/product TODOs:

- Complete the future anonymization/minimization service before broader
  production rollout.
- Decide calibrated Management/Finance weights if the current
  positive-signal-average plus planned-floor strategy changes.
- Decide whether rich explainability fields need durable structured persistence
  beyond the current-run response.
- Decide whether Business Unit residual gaps can be safely attributed once
  agreement rows expose canonical Business Unit ownership.
