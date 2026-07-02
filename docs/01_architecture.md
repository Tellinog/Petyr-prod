# Architecture

## Objective

Build a local-first Dockerized UNGUESS data platform that can later be exported to the Angles server.

The platform should:
- ingest data from Redash;
- persist raw JSON snapshots in PostgreSQL;
- expose Petyr as one unified user-facing application under one host;
- expose controlled data access for product apps;
- power a forecasting web application;
- support future services and agents.

## Target services

```txt
gateway / reverse proxy
postgres
redash-ingestor
redash-worker
forecasting-app
petyr-ai-forecast-worker
platform-home
```

## Responsibilities

### gateway / reverse proxy

User-facing entrypoint for Petyr unified access.

Responsible for:
- exposing one host/domain for Petyr users;
- routing `/forecasting` and `/petyr-admin` to `forecasting-app`;
- routing the Redash Ingestor dashboard and technical Redash Ingestor APIs to
  `redash-ingestor` under an internal/operator path;
- preserving service boundaries between Petyr and Redash Ingestor;
- serving as the future place for OAuth2 Proxy or equivalent access-control
  integration.

The gateway must not collapse the application code into one service. Petyr stays
in `apps/forecasting-app`; Redash sync, dashboard and APIs stay in
`apps/redash-ingestor`.

### postgres

Shared persistent data hub.

Stores:
- Redash source configuration;
- raw Redash snapshots;
- latest materialized raw Redash tables for MVP source previews;
- sync runs;
- future normalized campaign/agreement facts;
- future forecast entries;
- future revision logs and notes.

Petyr Admin exposes a protected PostgreSQL-native SQL dump export/import workflow
for server migration and controlled recovery of this shared data hub. The
workflow is operationally useful for moving to a new server, but it is not the
final production backup strategy for retention, encryption, offsite storage or
point-in-time recovery.

Production PostgreSQL backup is a platform responsibility owned by the Platform
owner and must be configured outside the Petyr browser workflow, at Coolify/host
or equivalent database-backup level. The accepted v1 production standard is:
daily backups retained for 5 days, weekly backups retained for 3 weeks, no other
retention tier, encrypted offsite copy, RPO 24 hours and target RTO 8 hours.
Point-in-time recovery is not part of the v1 standard; add WAL archiving/PITR
only through a later documented decision if the required RPO becomes lower than
24 hours.

### redash-ingestor

Node/Next.js or Node service responsible for:
- Redash API calls;
- sync orchestration;
- raw payload storage;
- ingestion diagnostics;
- preview endpoints;
- an internal/operator dashboard for sync, source status, database preview and
  diagnostics;
- optionally internal data APIs.

Redash Ingestor remains a separate internal service. It may be exposed through
the gateway for operators, but Petyr product logic must not import its code,
merge its Prisma schema casually or call Redash directly through it.

### redash-worker

Same codebase/image as redash-ingestor, different command.

Responsible for:
- daily scheduled sync, default `01:30` in `Europe/Rome`;
- periodic refresh;
- background ingestion.

During the manual Petyr AI Forecasting MVP, Redash sync completion must not
trigger AI generation automatically.

### forecasting-app

Product-facing app.

Responsible for:
- Petyr Forecasting UI at `/forecasting`;
- Petyr Admin at `/petyr-admin`;
- CSM workspace;
- management workspace;
- company detail;
- monthly entry;
- notes and revisions;
- read-only AI forecast cache generation and display.
- protected PostgreSQL database backup export/import for server migration and
  controlled recovery.

Forecasting app must not call Redash. It reads PostgreSQL-backed Redash-derived
data, or future stable internal data APIs, but not Redash APIs directly.

Petyr Admin is the user-facing operational bridge for Petyr data health. It must
provide a path to the Redash Ingestor dashboard when operators need to inspect
sync/dashboard/API details. Forecasting pages must keep the floating Data
Diagnostics menu linked to `/petyr-admin`.

### petyr-ai-forecast-worker

Same codebase/image as `forecasting-app`, different command.

Responsible for:
- nightly deterministic AI Forecast generation for active Petyr companies;
- default schedule `02:00` in `Europe/Rome`;
- default inter-company delay of `3000ms`;
- saving local deterministic preview rows only to `ai_forecast_cache`;
- keeping OpenRouter and Forecast Intelligence out of the nightly numeric job.

The worker targets the current Rome year, skips companies explicitly marked
inactive and uses daily append-only model versions such as
`petyr_deterministic_preview_v1@YYYY-MM-DD`. It does not write CSM forecasts,
annual forecasts, objectives, Initial Forecast, closed revenue or Redash data.

### platform-home

Nginx gateway/reverse proxy used by Docker Compose and Coolify.

Responsible for:
- exposing the unified local host on port `8080` when a local port override is used;
- exposing container port `8080` to Coolify without a host port bind in production;
- routing `/forecasting`, `/petyr-admin` and `/api/petyr/*` to `forecasting-app`;
- routing `/redash-ingestor` and `/redash-ingestor/api/*` to `redash-ingestor`;
- keeping the app containers separate while providing one user-facing origin.

`platform-home` is the gateway implementation for the current Coolify deploy. Root production compose exposes only its container port `8080`; local development can add a host bind through `docker-compose.local.yml` or another override. Redash Ingestor must still remain separate from Petyr.

## Unified access routing

Petyr must feel like one application to users while remaining a multi-service
platform internally.

Accepted routing model:

```txt
Production: https://petyr.draftapps.it
  /forecasting      -> forecasting-app
  /petyr-admin      -> forecasting-app
  /api/petyr/*      -> forecasting-app
  /redash-ingestor       -> redash-ingestor dashboard, internal/operator access
  /redash-ingestor/api/* -> redash-ingestor technical APIs, internal/operator access
```

The accepted production Petyr host is `petyr.draftapps.it`, not a
`/petyr` subpath under `unguess-internal.net`. For local Docker, the gateway is
the existing `platform-home` Nginx service adapted from static launcher to
reverse proxy. For production, the gateway should sit in front of both web
services and be the natural integration point for OAuth2 Proxy or an equivalent
access-control layer.

Petyr Admin and Forecasting cross-links:
- Forecasting pages expose a floating Data Diagnostics menu that links to
  `/petyr-admin`;
- `/petyr-admin` exposes Petyr data health and must provide a link to the
  Redash Ingestor dashboard through the gateway;
- Redash Ingestor remains a technical/operator surface, not a forecasting
  product UI.

## Data flow

```txt
Redash
  ↓
redash-ingestor / redash-worker
  ↓
PostgreSQL raw snapshots
  ↓
data services / normalized facts
  ↓
forecasting-app
  ↓
users / AI agent
```

Redash sync completion does not trigger AI generation automatically. Manual
OpenRouter/Forecast Intelligence remains company-by-company: an operator selects
one company and a target year, Petyr reads PostgreSQL-backed context, builds
deterministic baselines and business signals, computes forecast values locally,
and sends OpenRouter only a normalized Forecast Intelligence payload for JSON
business interpretation. Separately, `petyr-ai-forecast-worker` runs nightly
deterministic-only generation for active companies and saves numeric rows to
`ai_forecast_cache`. CSM-owned forecast rows are not overwritten. Future
post-sync or LLM/OpenRouter batch automation requires a separate documented
decision.

## Why not direct Redash access from forecasting?

Because:
- Redash can be slower or unavailable;
- Redash API semantics should not leak into product logic;
- forecasting needs stable data models;
- audit/debug requires stored snapshots;
- multiple future services should reuse one data hub.
