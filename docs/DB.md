# Database

## Petyr Intelligence Tables

The first MVP implements these tables in Prisma migration:

```txt
202607010001_add_petyr_intelligence
202607010002_add_intelligence_worker_statuses
```

### company_intelligence_run

Purpose: track each scan run and provider budget use.

Suggested fields:

- id
- run_scope: `company` or `batch`
- company_name
- csm_name
- status: `pending`, `running`, `succeeded`, `partial`, `failed`, `skipped_budget`
- started_at
- finished_at
- selected_reason
- exa_requests_used
- exa_results_received
- openrouter_requests_used
- budget_policy_json
- error_message
- created_by
- created_at
- updated_at

Worker-related run statuses added by `202607010002_add_intelligence_worker_statuses`:

- `skipped_disabled`
- `skipped_lock`

The worker enable/disable state is stored in `app_setting`:

- `setting_key`: `petyr_intelligence_scan_worker_enabled_v1`
- `setting_value`: `true` or `false`

### company_signal_raw_result

Purpose: keep raw Exa result metadata for audit and reprocessing.

Suggested fields:

- id
- run_id
- company_name
- provider: `exa`
- provider_result_id
- query_text
- url
- title
- published_at
- author_or_source
- snippet
- raw_result_json
- content_hash
- fetched_at
- signal_item_id

### company_signal_item

Purpose: store deduplicated signal/event candidates.

Suggested fields:

- id
- company_name
- canonical_url
- normalized_title
- source_domain
- published_at
- event_signature
- content_hash
- first_seen_at
- last_seen_at
- duplicate_count
- relevance_status: `pending`, `relevant`, `irrelevant`, `uncertain`
- company_relevance_score
- status

### company_signal_business_unit_classification

Purpose: map a signal item to one or more official Petyr Business Units.

Suggested fields:

- id
- signal_item_id
- business_unit
- relevance_score
- rationale
- classified_by_provider
- model
- prompt_version
- classified_at

### company_intelligence_insight

Purpose: persist actionable CSM insights.

Suggested fields:

- id
- company_name
- company_id
- csm_name
- run_id
- business_unit
- insight_type: `opportunity`, `reactivation`, `caution`, `risk`, `monitor`, `no_action`
- title
- summary
- rationale
- suggested_action
- urgency: `high`, `medium`, `low`
- confidence
- assumptions_or_limits
- provider
- model
- prompt_version
- status
- generated_at
- created_at
- updated_at

### company_intelligence_insight_source

Purpose: link generated insights to deduplicated source items.

Suggested fields:

- id
- insight_id
- signal_item_id
- created_at

### company_insight_feedback

Purpose: collect CSM feedback.

Suggested fields:

- id
- insight_id
- rating_usefulness: `useful`, `not_useful`, `unclear`
- rating_accuracy: `accurate`, `inaccurate`, `unclear`
- feedback_text
- submitted_by
- submitted_at

### intelligence_calibration_report

Purpose: store admin recommendations from feedback and quality metrics.

Suggested fields:

- id
- period_start
- period_end
- generated_at
- generated_by
- summary
- recommendations_json
- metrics_json
- status

### company_intelligence_provider_request_log

Purpose: store sanitized provider request metadata and cost/usage metadata.

Suggested fields:

- id
- run_id
- provider
- operation
- status
- request_count
- result_count
- duration_ms
- model
- cost_metadata
- request_metadata
- error_message
- created_at

## Data Rules

- Raw Exa results must remain auditable.
- Deduplication must preserve source links and duplicate counts.
- Insight persistence must keep source ids, rationale and suggested action.
- LLM outputs must not be stored as authoritative numeric forecast evidence.
- Forecasting tables must not depend on these tables during the MVP.
- Provider request logs must not contain API keys, full prompts with secrets or raw provider payloads.
- Daily request budget enforcement reads `company_intelligence_provider_request_log` and sums Exa/OpenRouter `request_count` values for the current local day before each provider call.
