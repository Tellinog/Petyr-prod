# Petyr architecture

Petyr is a separate app inside the data platform.

```txt
unguess-data-platform/
├─ apps/
│  ├─ redash-ingestor/
│  └─ forecasting-app/
└─ docker-compose.yml
```

## Data flow

```txt
Redash
  ↓
redash-ingestor / redash-worker
  ↓
PostgreSQL
  ↓
forecasting-app / Petyr
```

The first AI Forecasting MVP is not triggered by `redash-worker` after sync.
AI Forecasting is an explicit manual company-by-company operation: an operator
selects one company and a target year, Petyr reads PostgreSQL-backed forecast
context, computes deterministic baselines and business signals, uses the
selected OpenRouter model from `app_setting` only when LLM calls are
implemented/enabled, and stores validated generated values only in
`ai_forecast_cache`.
Future post-sync or global batch automation requires a separate documented
decision.

Petyr also exposes a constrained CSM/admin source-refresh command. The browser
calls `POST /api/petyr/data-refresh`; Forecasting authorizes
`petyr:forecast:write` or `petyr:admin` and sends a server-to-server request to
Redash Ingestor using `APP_INTERNAL_SECRET`. Redash Ingestor remains the only
Redash client and refreshes only the three approved Petyr sources before
snapshot persistence and PostgreSQL materialization. This command does not
trigger AI Forecast generation.

## Rule

Petyr never calls Redash directly.

Petyr reads:
1. raw Redash snapshots from PostgreSQL;
2. future normalized facts from PostgreSQL;
3. future internal APIs, if introduced.

Current Redash latest tables used by Petyr:
- `redash_raw_master_campaigns_latest`;
- `redash_raw_master_agreements_latest`;
- `redash_raw_company_ownership_latest`.

## Current base

The approved `/forecasting` rendering is data-bound through Petyr services and
must read PostgreSQL-backed Redash materialized tables plus Petyr-owned forecast
tables. Missing data must surface diagnostics or empty states instead of silent
illustrative fallback values.

Key service entry points:

```txt
src/services/petyrDataService.ts
src/services/forecastEntryService.ts
src/services/petyrApprovedRenderingAdapter.ts
```

The current AI service foundation lives in:

```txt
src/services/aiForecastBatchService.ts
```

It was originally named and shaped around batch execution. Product source of
truth now scopes the MVP to manual single-company execution, so any remaining
batch-oriented code or route naming must be treated as implementation detail or
future refactor scope until a dedicated code task aligns it. The legacy batch
service and route are disabled during the manual MVP. The product contract
remains: manual request, one selected company, future months only, and read-only
AI output stored only in `ai_forecast_cache`.
