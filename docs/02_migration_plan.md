# Migration plan: from single app to data platform

## Current app

Current working folder:

```txt
unguess-redash-app/
```

Target location:

```txt
unguess-data-platform/apps/redash-ingestor/
```

## Phase 1 - No code rewrite

Move the current working app into:

```txt
apps/redash-ingestor/
```

Keep it working first.

Do not split code yet.

Acceptance criteria:
- `cd apps/redash-ingestor && npm run build` works;
- Docker build still works for the ingestor app;
- existing dashboard still works.

## Phase 2 - Root Docker Compose

Create a root-level `docker-compose.yml` that starts:
- postgres;
- redash-ingestor web;
- redash-ingestor worker.

Use the existing app Dockerfile initially.

Acceptance criteria:
- running `docker compose up --build` from root starts the ingestor;
- the app can connect to the same PostgreSQL service;
- source dashboard still works.

## Phase 3 - Create forecasting app shell

Create:

```txt
apps/forecasting-app/
```

As a separate Next.js app.

Acceptance criteria:
- starts as separate container;
- can connect to PostgreSQL read-only or normal app DB user;
- has `/health`;
- has `/forecasting`.

## Phase 4 - Shared data layer

Decide whether to share Prisma schema:
- initially: allow each app to have its own Prisma client if fastest;
- later: extract shared DB client/schema to `packages/shared-db`.

Acceptance criteria:
- forecasting app can read latest snapshots;
- forecasting app does not call Redash.

## Phase 5 - Normalized facts

Add normalized tables:
- CampaignFact;
- AgreementFact;
- CompanyFact;
- ForecastEntry;
- ForecastRevisionLog;
- ForecastNote.

Acceptance criteria:
- raw snapshots remain unchanged;
- normalization job can be rerun;
- forecasting UI reads from normalized facts where available.
