# DEPLOY

Root deployment notes for the multi-project platform.

Existing deployment documentation remains valid and must be read first:

- `README_INSTALL_DOCKER.md`
- `README_PETYR_INSTALL.md`
- `docs/08_operational_commands.md`

This file adds cross-project deployment governance and future Access Control Platform notes.

## Current platform

The current root uses Docker Compose and includes:

- PostgreSQL shared data hub;
- `apps/redash-ingestor`;
- `apps/forecasting-app`;
- `platform-home`.

## Petyr schema sync before local/dev builds

When Petyr's Prisma schema changes and a local/dev PostgreSQL database is behind
the app schema, synchronize it explicitly from the app folder:

```bash
cd apps/forecasting-app
npm run db:sync
```

For local/dev verification that also builds Petyr afterward:

```bash
cd apps/forecasting-app
npm run build:sync
```

`db:sync` runs Prisma client generation and Petyr's safe `db:push` wrapper. The
wrapper preserves Redash materialized latest tables while Prisma updates static
Redash/Petyr tables. Keep production and CI on explicit migration/deploy steps;
do not make plain `npm run build` mutate the database implicitly.

## Unified Petyr access


Local Docker can expose one user-facing host through the `platform-home` Nginx gateway when the local compose file is included:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

```txt
http://localhost:8080/forecasting       -> forecasting-app
http://localhost:8080/petyr-admin       -> forecasting-app
http://localhost:8080/redash-ingestor   -> redash-ingestor
```

The root production compose file is Coolify-oriented and uses `expose: ["8080"]` for `platform-home` instead of binding a host port. Use `docker-compose.local.yml` or an explicit local override when a localhost port is needed.

On a server, publish the chosen Petyr host/domain to the same paths through the selected reverse proxy. Keep `forecasting-app`, `redash-ingestor` and `redash-worker` as separate services behind the proxy. Do not make Forecasting call Redash directly; Forecasting continues to read PostgreSQL-backed data or future stable internal data APIs.

The non-secret `REDASH_INGESTOR_BASE_PATH` defaults to `/redash-ingestor` in root Docker Compose and is passed into the Redash Ingestor build as `NEXT_PUBLIC_REDASH_INGESTOR_BASE_PATH` so its Next.js assets and API links work under the gateway path.

## Access Control deployment target

Petyr is prepared to integrate with an external Access Layer service using the tool-side one-time-code flow. The Access Layer service itself remains a separate deployment and must not be copied into this repository as part of Petyr deployment.

Confirmed target URLs:

```txt
Access Layer: https://access-layer.draftapps.it
Petyr:        https://petyr.draftapps.it
Callback:     https://petyr.draftapps.it/auth/callback
Redash Ingestor operator path:
              https://petyr.draftapps.it/redash-ingestor
Redash Ingestor callback:
              https://petyr.draftapps.it/redash-ingestor/auth/callback
```

For local development, Petyr authentication defaults to disabled when `NODE_ENV=development`. Production must set:

```env
PETYR_AUTH_MODE=access-layer
PETYR_ACCESS_LAYER_PUBLIC_BASE_URL=https://access-layer.draftapps.it
PETYR_ACCESS_LAYER_INTERNAL_BASE_URL=https://access-layer.draftapps.it
PETYR_ACCESS_LAYER_CALLBACK_URL=https://petyr.draftapps.it/auth/callback
PETYR_ACCESS_LAYER_TOOL_SLUG=petyr
PETYR_ACCESS_LAYER_CLIENT_ID=replace_with_petyr_tool_client_id
PETYR_ACCESS_LAYER_CLIENT_SECRET=replace_with_petyr_tool_client_secret
PETYR_SESSION_SECRET=replace_with_long_random_session_secret
```

Root Docker Compose maps the `PETYR_ACCESS_LAYER_*` values into the generic `ACCESS_LAYER_*` names inside the `forecasting-app` container. Standalone app deployment may set the generic variables directly.

The Access Layer Admin UI must register a `petyr` tool with the callback URL above and these Petyr permission keys:

```txt
petyr:read
petyr:forecast:write
petyr:management:write
petyr:admin
petyr:redash:operator
```

Redash Ingestor is a separate Access Layer tool and remains the only service that calls Redash. Petyr must continue to consume PostgreSQL-backed data and must not call Redash or Redash Ingestor for product data.

Production Redash Ingestor Access Layer values:

```env
REDASH_INGESTOR_AUTH_MODE=access-layer
REDASH_INGESTOR_ACCESS_LAYER_PUBLIC_BASE_URL=https://access-layer.draftapps.it
REDASH_INGESTOR_ACCESS_LAYER_INTERNAL_BASE_URL=https://access-layer.draftapps.it
REDASH_INGESTOR_ACCESS_LAYER_CALLBACK_URL=https://petyr.draftapps.it/redash-ingestor/auth/callback
REDASH_INGESTOR_ACCESS_LAYER_TOOL_SLUG=redash-ingestor
REDASH_INGESTOR_ACCESS_LAYER_CLIENT_ID=replace_with_redash_ingestor_tool_client_id
REDASH_INGESTOR_ACCESS_LAYER_CLIENT_SECRET=replace_with_redash_ingestor_tool_client_secret
REDASH_INGESTOR_SESSION_SECRET=replace_with_long_random_session_secret
```

Root Docker Compose maps the `REDASH_INGESTOR_ACCESS_LAYER_*` values into the generic `ACCESS_LAYER_*` names inside the `redash-ingestor` container. Standalone app deployment may set the generic variables directly.

The Access Layer Admin UI must register a `redash-ingestor` tool with:

```txt
redash-ingestor:read
redash-ingestor:sync
redash-ingestor:sources:write
redash-ingestor:admin
```

Non-secret onboarding descriptors for both tools live in `petyr/access-layer-tools/`.

## Coolify deployment guardrails

For the Coolify deployment at `https://petyr.draftapps.it`, route the public domain to the `platform-home` service on internal/container port `8080`. Do not publish `postgres`, `forecasting-app`, `redash-ingestor`, workers or one-shot bootstrap services directly. The public URL must remain `https://petyr.draftapps.it`, without `:8080`.

Coolify should target:

```txt
Service: platform-home
Container port: 8080
Public domain: https://petyr.draftapps.it
```

Root `docker-compose.yml` intentionally exposes `platform-home:8080` only to the Docker network. Host binding such as `8080:8080` belongs in local overrides, not in Coolify production compose.

Set the PostgreSQL variables and connection URL as one coherent set:

```env
POSTGRES_DB=unguess_redash
POSTGRES_USER=unguess
POSTGRES_PASSWORD=replace_with_real_password
DATABASE_URL=postgresql://unguess:replace_with_url_encoded_real_password@postgres:5432/unguess_redash?schema=public
```

If Coolify already initialized the PostgreSQL volume with different credentials, changing `.env` or Coolify variables is not enough. Either keep the real credentials that initialized the volume, or delete/recreate the Coolify resource/volume after exporting any data that must be preserved.

Before exposing production Petyr, configure production PostgreSQL backups at
Coolify/host or equivalent database-backup level. The v1 production standard is
daily backups retained for 5 days, weekly backups retained for 3 weeks, no other
retention tier, encrypted offsite copy, RPO 24 hours and target RTO 8 hours.
Petyr Admin SQL export/import is not sufficient for production backup
compliance; it remains a migration and controlled-recovery workflow. The
Platform owner must document restore drill evidence and keep backup credentials,
offsite credentials and encryption keys outside this repository.

Production auth variables must point to:

```env
PETYR_AUTH_MODE=access-layer
PETYR_ACCESS_LAYER_PUBLIC_BASE_URL=https://access-layer.draftapps.it
PETYR_ACCESS_LAYER_INTERNAL_BASE_URL=https://access-layer.draftapps.it
PETYR_ACCESS_LAYER_CALLBACK_URL=https://petyr.draftapps.it/auth/callback
REDASH_INGESTOR_AUTH_MODE=access-layer
REDASH_INGESTOR_ACCESS_LAYER_PUBLIC_BASE_URL=https://access-layer.draftapps.it
REDASH_INGESTOR_ACCESS_LAYER_INTERNAL_BASE_URL=https://access-layer.draftapps.it
REDASH_INGESTOR_ACCESS_LAYER_CALLBACK_URL=https://petyr.draftapps.it/redash-ingestor/auth/callback
```

Keep all generated client secrets, session secrets, Redash API keys, OpenRouter keys and database passwords in Coolify environment variables only.

### Build-time `NODE_ENV`

Coolify may expose `NODE_ENV=production` while building images. The app Dockerfiles install with `--include=dev` so build tools such as TypeScript, Prisma, Tailwind/PostCSS and `tsx` are available during `npm run build`. Do not remove `tsx` or `prisma` from the production image unless the runtime commands are changed first; worker and bootstrap commands still use them.

### Bootstrap services

Root compose runs schema preparation as one-shot services before long-running app containers start:

```txt
forecasting-db-sync   -> npm run db:sync
redash-bootstrap      -> npm run db:seed
redash-initial-sync   -> optional npm run worker:sync
```

`forecasting-db-sync` runs first and applies the Petyr Prisma superset schema with the safe DB push wrapper. `redash-bootstrap` then seeds the required Redash Ingestor sources only; it must not run the Redash Ingestor partial Prisma schema against the shared PostgreSQL `public` schema, because that database also contains Petyr forecast tables. Long-running app and worker containers depend on these one-shot services completing successfully.

The first Redash data sync is opt-in:

```env
REDASH_INITIAL_SYNC_ON_BOOTSTRAP=false
```

Leave it `false` unless Redash credentials and network connectivity should be required for deploy success. Set it to `true` when a fresh Coolify deploy should immediately materialize `company_ownership`, `master_agreements` and `master_campaigns` before the web/workers start.

### Redash Ingestor base path

Production uses Strategy A: Next.js owns `basePath=/redash-ingestor`, and `platform-home` forwards the original prefixed path without stripping it. Keep:

```env
REDASH_INGESTOR_BASE_PATH=/redash-ingestor
REDASH_INGESTOR_ACCESS_LAYER_CALLBACK_URL=https://petyr.draftapps.it/redash-ingestor/auth/callback
```

Do not configure Nginx/Coolify to rewrite `/redash-ingestor/...` to `/...`, or links and callbacks can become `/redash-ingestor/redash-ingestor/...`.

### Smoke checklist

After deploy, verify:

```txt
https://petyr.draftapps.it                  -> redirects to /forecasting
https://petyr.draftapps.it/forecasting      -> redirects anonymous users to /auth/login
https://petyr.draftapps.it/auth/login       -> starts Access Layer login, not 404
https://petyr.draftapps.it/auth/callback    -> finishes with /forecasting, not 0.0.0.0:3000
https://petyr.draftapps.it/redash-ingestor  -> reaches Redash Ingestor login/dashboard
```

## Deployment rule

Do not expose the production Petyr host until:

1. `docs/access-control/SOURCE_OF_TRUTH.md` has been read;
2. the external Access Layer service is deployed and healthy;
3. environment variables are documented;
4. local smoke tests are defined;
5. `DECISIONS.md` records the chosen Access Layer/Petyr URL contract.

`/redash-ingestor` is routed directly by the gateway to the Redash Ingestor service. Its operator surface is protected inside `apps/redash-ingestor`; server deployments must still avoid exposing backend ports directly around the gateway/proxy.

## Post-deploy checks for Access Control

When implemented, the minimum post-deploy checks are:

```txt
[ ] Anonymous user cannot access protected app.
[ ] Non-company Google account is rejected.
[ ] Company Google account can login.
[ ] Auth API returns allowed=false for users without tool membership.
[ ] Auth API returns allowed=true for authorized users.
[ ] Protected backend blocks direct requests without trusted auth header.
[ ] Audit event is written for successful access.
[ ] Audit event is written for denied access.
[ ] Logout clears session cookie.
```

## Rollback direction

If Access Control breaks access to a tool, rollback must prefer restoring the previous proxy/routing layer rather than weakening app-level authorization.

Never bypass authorization by hardcoding emails inside application code.
