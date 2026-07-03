# Security

## Petyr Intelligence Provider Secrets

Petyr Intelligence requires server-side provider credentials only:

```env
EXA_API_KEY=replace_me
OPENROUTER_API_KEY=replace_me
OPENROUTER_MODEL=replace_me_or_use_default
OPENROUTER_DEFAULT_MODEL=replace_me
```

Proposed Intelligence-specific configuration:

```env
OPENROUTER_MODEL=replace_me_or_use_default
INTELLIGENCE_MAX_COMPANIES_PER_RUN=10
INTELLIGENCE_MAX_RESULTS_PER_COMPANY=5
INTELLIGENCE_SEARCH_RECENCY_DAYS=30
INTELLIGENCE_DAILY_BUDGET_REQUESTS=100
INTELLIGENCE_WORKER_ENABLED=false
INTELLIGENCE_SCAN_DAILY_TIME=03:00
INTELLIGENCE_SCAN_TIMEZONE=Europe/Rome
```

Do not commit real keys, production URLs with credentials or provider secrets. Browser code must never receive Exa or OpenRouter API keys.

## Source Handling

External source results may contain public company information but must still be treated as operational data:

- store raw provider responses only server-side;
- show CSMs source URLs, title/snippet, rationale and suggested action;
- avoid storing secrets or internal customer notes in provider payloads;
- do not send deterministic Forecasting numeric data to OpenRouter for analysis;
- keep provider request/response logs sanitized;
- avoid storing full page content unless explicitly needed and documented.

## Provider Request Minimization

Exa payloads should use aggregated company-level searches and strict recency/result limits. OpenRouter payloads should contain only the source snippets, source metadata, company context and official Business Unit taxonomy needed for classification and insight generation.

Do not send:

- `REDASH_API_KEY`;
- database credentials;
- internal auth/session data;
- CSM-entered forecast values as numeric evidence;
- revenue, margin, forecast, campaign-count or trend datasets for LLM analysis;
- raw full Redash rows;
- private internal notes unless a later decision explicitly allows sanitized qualitative notes.

## Access Control

Accepted MVP permission model:

- Intelligence section and read APIs: `petyr:admin`;
- Intelligence feedback: `petyr:admin`;
- admin scans/calibration: `petyr:admin`;
- non-dry-run admin trigger: `petyr:admin` plus `APP_INTERNAL_SECRET`.
- worker enable/disable: `petyr:admin` plus `APP_INTERNAL_SECRET`.

Do not invent row-level authorization in implementation. If non-admin CSM exposure or row-level CSM scoping is required later, document and implement it through the Access Layer path before changing the admin-only model.
