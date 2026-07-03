# Platform Architecture

## Petyr Intelligence Architecture

Petyr Intelligence should be implemented as a separate module inside the Petyr app boundary, similarly to how Petyr Admin is separated from Forecasting.

Current structure fit:

- `apps/forecasting-app/src/app/forecasting` contains Forecasting product routes and should remain Forecasting-owned.
- `apps/forecasting-app/src/app/petyr-admin` contains the separated admin surface pattern to follow.
- `apps/forecasting-app/src/app/api/petyr/*` already groups Petyr product/admin APIs.
- `apps/forecasting-app/src/services/*` currently mixes Petyr service files at one level; Intelligence should use a dedicated `src/services/intelligence/` subfolder from the start to avoid confusion with Forecasting services.
- `apps/forecasting-app/src/worker/*` is the right later location for an `intelligence-scan` worker entry point if the scheduled job shares the Petyr app image.

Implemented placement:

```txt
apps/forecasting-app/
  src/app/intelligence/
    page.tsx
    company/[companyName]/page.tsx
  src/app/api/petyr/intelligence/
    insights/route.ts
    feedback/route.ts
    runs/route.ts
  src/app/api/petyr/admin/intelligence/
    runs/route.ts
    calibration/route.ts
    budget/route.ts
  src/services/intelligence/
    companySelectionService.ts
    intelligenceScanService.ts
    exaSearchClient.ts
    signalDeduplicationService.ts
    signalClassificationService.ts
    insightGenerationService.ts
    feedbackService.ts
    calibrationReportService.ts
  src/worker/intelligenceScanWorker.ts
```

The scheduled worker is implemented as a separate Compose service named `intelligence-scan`, reusing the same Petyr app image pattern already used by `petyr-ai-forecast-worker`.

## Data Flow

```txt
Petyr company, CSM and Business Unit context
  -> intelligence-scan company selector
  -> aggregated company-level Exa queries
  -> raw local search result persistence
  -> deterministic deduplication
  -> OpenRouter classification and insight generation
  -> local insight persistence
  -> Petyr Intelligence admin UI
  -> admin feedback
  -> admin calibration recommendations
```

Forecasting remains separate:

```txt
PostgreSQL deterministic facts/services
  -> Forecasting
```

Petyr Intelligence must not feed LLM-generated numeric analysis back into Forecasting calculations.

## Search Strategy

Do not run naive `company x Business Unit` external searches. For each selected company, build one or a small number of aggregated company-level queries using company name plus optional stable context such as domain, market, aliases or high-level signal categories. Classify returned results against official Petyr Business Units after retrieval.

## Background Job

Implemented job name: `intelligence-scan`.

Responsibilities:

- select companies using active/inactive status, CSM ownership, last scan timestamp and admin limits;
- enforce default MVP limits;
- acquire a PostgreSQL advisory lock so overlapping scans do not duplicate provider spend;
- persist `CompanyIntelligenceRun` before calling providers;
- call Exa with timeout and retry policy;
- store raw results before interpretation;
- deduplicate locally;
- classify and generate insights through OpenRouter;
- persist success, partial failure and provider error states;
- emit sanitized performance measurements without raw provider payloads or secrets.

## Logging, Retry, Budget and Rate Limits

Logging:

- log run id, company count, selected company names only when already visible to the user/operator, provider request counts, result counts, status, duration, retry count and error class;
- do not log Exa API keys, OpenRouter API keys, raw full provider payloads, full page contents or internal notes;
- persist sanitized run metrics so `/petyr-admin/intelligence` can show last run status and budget usage.

Retry:

- retry transient Exa/OpenRouter failures with bounded exponential backoff;
- do not retry validation failures as provider failures;
- allow at most one strict-JSON retry for OpenRouter when the response is malformed but the request itself succeeded;
- persist partial failure state rather than dropping the whole run.

Budget and rate limits:

- enforce `INTELLIGENCE_MAX_COMPANIES_PER_RUN` before selecting companies;
- enforce `INTELLIGENCE_MAX_RESULTS_PER_COMPANY` before storing/processing large result sets;
- enforce `INTELLIGENCE_SEARCH_RECENCY_DAYS` at query construction time;
- enforce `INTELLIGENCE_DAILY_BUDGET_REQUESTS` before each provider call;
- keep separate counters for Exa search calls and OpenRouter classification/generation calls;
- default MVP limits are intentionally low: 10 companies, 5 results per company, 30-day recency and 100 daily requests.
- scheduled scans default to disabled through `INTELLIGENCE_WORKER_ENABLED=false` and can be enabled/disabled from `/petyr-admin/intelligence` through the persisted `app_setting` key `petyr_intelligence_scan_worker_enabled_v1`.

## Integration Boundary

Petyr Intelligence can read existing Petyr company, CSM and Business Unit data from PostgreSQL-backed services, but should expose its own admin-only API/read models. Forecasting pages should not import Intelligence services during the MVP.
