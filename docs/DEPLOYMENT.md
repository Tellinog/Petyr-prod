# Deployment

## Petyr Intelligence Deployment Proposal

Petyr Intelligence should start as code inside `apps/forecasting-app` and share the existing Petyr deployment, PostgreSQL connection and Access Layer integration.

Scheduled scans run in a separate worker process/service named `intelligence-scan`.

Implemented Compose direction:

```txt
forecasting-app        -> serves Forecasting, Petyr Admin and Petyr Intelligence UI/API
intelligence-scan      -> runs the scheduled background scan loop
postgres               -> shared persistence
platform-home          -> routes user-facing paths
```

## Routing

Implemented gateway routes:

```txt
/intelligence                 -> forecasting-app
/api/petyr/intelligence/*     -> forecasting-app
/api/petyr/admin/intelligence/* -> forecasting-app
```

Admin UI can remain under:

```txt
/petyr-admin/intelligence
```

## Environment

Deploy only with server-side provider keys configured:

```env
EXA_API_KEY=replace_me
OPENROUTER_API_KEY=replace_me
OPENROUTER_MODEL=openai/gpt-4.1-mini
INTELLIGENCE_ENABLED=false
INTELLIGENCE_MAX_COMPANIES_PER_RUN=10
INTELLIGENCE_MAX_RESULTS_PER_COMPANY=5
INTELLIGENCE_SEARCH_RECENCY_DAYS=30
INTELLIGENCE_DAILY_BUDGET_REQUESTS=100
INTELLIGENCE_WORKER_ENABLED=false
INTELLIGENCE_SCAN_DAILY_TIME=03:00
INTELLIGENCE_SCAN_TIMEZONE=Europe/Rome
```

Apply the database schema before real runs:

```bash
cd apps/forecasting-app
npm run db:sync
```

Migration name:

```txt
202607010001_add_petyr_intelligence
202607010002_add_intelligence_worker_statuses
```

Worker commands:

```bash
cd apps/forecasting-app
npm run worker:intelligence:once
npm run worker:intelligence:loop
```

The root Compose file includes the `intelligence-scan` service. The worker loop defaults to disabled and records `skipped_disabled` runs until Admin enables it.

## Rollout

Recommended rollout phases:

1. ship schema and admin dry-run with mocked providers;
2. enable manual admin dry-run with real Exa only;
3. enable OpenRouter classification for a small company allowlist;
4. expose read-only CSM UI for generated insights;
5. enable CSM feedback;
6. enable scheduled worker with low daily budget;
7. add admin calibration recommendations.

Do not enable unbounded scans in production.
