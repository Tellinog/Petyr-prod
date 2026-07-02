# Operational commands

## From monorepo root

Start all services:

```bash
docker compose up --build
```

Unified local gateway routes:

```txt
http://localhost:8080/forecasting       -> Petyr Forecasting
http://localhost:8080/petyr-admin       -> Petyr Admin
http://localhost:8080/redash-ingestor   -> Redash Ingestor dashboard
```

`http://localhost:8080` redirects to `/forecasting`. The root Compose publishes only the gateway; use explicit local overrides or app-level dev servers for direct app debugging.

Stop all services:

```bash
docker compose down
```

Stop and delete local DB volume:

```bash
docker compose down -v
```

View logs:

```bash
docker compose logs -f
```

View only ingestor logs:

```bash
docker compose logs -f redash-ingestor
```

View only worker logs:

```bash
docker compose logs -f redash-worker
```

View only forecasting logs:

```bash
docker compose logs -f forecasting-app
```

View only Petyr deterministic AI Forecast worker logs:

```bash
docker compose logs -f petyr-ai-forecast-worker
```

## Ingestor app

```bash
cd apps/redash-ingestor
npm run build
npx prisma generate
```

Run a manual Redash sync without `APP_INTERNAL_SECRET`:

```bash
curl -X POST http://localhost:8080/redash-ingestor/api/redash/sync \
  -H "Content-Type: application/json" \
  -d '{}'
```

Run one source only:

```bash
curl -X POST http://localhost:8080/redash-ingestor/api/redash/sync \
  -H "Content-Type: application/json" \
  -d '{"sourceKey":"company_ownership"}'
```

## Forecasting app

```bash
cd apps/forecasting-app
npm run build
```

Synchronize the Prisma client and local/dev database before a local/dev build:

```bash
cd apps/forecasting-app
npm run db:sync
npm run build
```

Or run the combined helper:

```bash
cd apps/forecasting-app
npm run build:sync
```

`build:sync` is for local/dev verification only. Keep plain `npm run build` for
production/CI unless a reviewed database deploy step is run separately.

Run the one-time 2026 closed revenue to Previous Month and Ongoing Forecast DB alignment from `/petyr-admin` -> `2026 closed revenue alignment` when shell access is unavailable. The admin control requires `APP_INTERNAL_SECRET`, runs dry-run first and applies only after explicit confirmation. CLI fallback:

```bash
cd apps/forecasting-app
npm run backfill:2026-ongoing-from-closed -- --dry-run
npm run backfill:2026-ongoing-from-closed -- --apply
```

Use this only once for the historical 2026 alignment after reviewing the dry-run preview. It copies already closed 2026 Redash campaign revenue through the selected execution date into monthly `forecast_monthly` previous-month and ongoing rows with the same real value, plus annual `forecast_annual` rows used by Management View Ongoing Forecast. It is not a CSM workflow, import workflow, scheduler or future-year process, and it must not update Initial Forecast fields, Redash materialized closed revenue, AI forecast cache or Management Objectives.

Petyr AI Forecasting MVP is manual and company-by-company.

Manual OpenRouter/Forecast Intelligence remains company-by-company. Redash sync
completion must not automatically trigger AI generation. Use the protected
single-company endpoint for manual validation and controlled OpenRouter-backed
cache persistence.

Nightly deterministic AI Forecast automation is handled by the dedicated
`petyr-ai-forecast-worker` service. It starts at
`PETYR_AI_FORECAST_DAILY_TIME=02:00` in `Europe/Rome`, waits
`PETYR_AI_FORECAST_DELAY_MS=3000` between active companies, targets the current
Rome year and saves local deterministic preview rows to `ai_forecast_cache` with
daily append-only model versions. It does not call OpenRouter or Forecast
Intelligence.

Run the deterministic worker once for controlled validation:

```bash
cd apps/forecasting-app
npm run worker:ai-forecast:once
```

Run the deterministic worker loop directly:

```bash
cd apps/forecasting-app
npm run worker:ai-forecast:loop
```

Manual AI Forecasting rules:

- select one company and one target year per request;
- generate only eligible future months;
- `dryRun=true` is the default and writes nothing;
- `dryRun=false` requires `OPENROUTER_API_KEY`, validates the LLM response, and
  writes only valid future-month rows to `ai_forecast_cache`;
- if no future months are eligible, `dryRun=false` skips without calling
  OpenRouter or writing rows;
- never write CSM-owned forecasts, closed revenue, management objectives,
  Initial Forecast or annual forecast data.

Preview one company without OpenRouter or database writes:

```bash
curl -X POST http://localhost:8080/api/petyr/ai-forecast/company \
  -H "Content-Type: application/json" \
  -H "x-app-secret: $APP_INTERNAL_SECRET" \
  -d '{"companyName":"Company Name","year":2026,"dryRun":true}'
```

Request an optional OpenRouter dry-run reasoning preview when the server is
configured with `OPENROUTER_API_KEY` and a selected model:

```bash
curl -X POST http://localhost:8080/api/petyr/ai-forecast/company \
  -H "Content-Type: application/json" \
  -H "x-app-secret: $APP_INTERNAL_SECRET" \
  -d '{"companyName":"Company Name","year":2026,"dryRun":true,"llmPreview":true}'
```

Run one controlled non-dry-run save to `ai_forecast_cache`:

```bash
curl -X POST http://localhost:8080/api/petyr/ai-forecast/company \
  -H "Content-Type: application/json" \
  -H "x-app-secret: $APP_INTERNAL_SECRET" \
  -d '{"companyName":"Company Name","year":2026,"dryRun":false}'
```

The response includes saved row count, skipped row count, validation errors and
the model version used for the cache rows.

Check Petyr data health:

```bash
curl http://localhost:8080/api/petyr/admin/data-health
```

The endpoint verifies the real flow from Redash Ingestor materialization to
Petyr services: Redash source metadata, latest snapshots, materialized tables,
row counts, available columns, logical field mappings, company branch and CSM
ownership diagnostics. Blocking issues and warnings are returned separately.

Export a PostgreSQL database backup from Petyr Admin:

```bash
curl -L -o petyr-postgres-backup.sql \
  -H "x-app-secret: $APP_INTERNAL_SECRET" \
  http://localhost:8080/api/petyr/admin/database-backup/export
```

Import a Petyr PostgreSQL backup on a new target server or controlled recovery
environment:

```bash
curl -X POST http://localhost:8080/api/petyr/admin/database-backup/import \
  -H "x-app-secret: $APP_INTERNAL_SECRET" \
  -F "confirmed=true" \
  -F "file=@petyr-postgres-backup.sql;type=application/sql"
```

The admin UI exposes the same workflow under `/petyr-admin` -> `Database backup`.
Both endpoints require Petyr admin permission plus `APP_INTERNAL_SECRET`. The
export is a native PostgreSQL SQL dump from the configured `DATABASE_URL`.
Restore can drop and recreate database objects from the dump, so use it only on
a new target server, disposable environment or controlled recovery after taking
a backup. This is not a replacement for production retention, encryption,
offsite storage or point-in-time recovery.

## Production PostgreSQL backup standard

Production backups for the shared PostgreSQL data hub are owned by the Platform
owner and must be configured at Coolify/host or equivalent database-backup
level, not through the Petyr Admin browser export. Petyr Admin export/import is
for migration, manual pre-change safety exports and controlled recovery only.

Minimum production standard:

```txt
Frequency and retention:
- Daily backups retained for 5 days.
- Weekly backups retained for 3 weeks.
- No other retention tier is part of the v1 standard.

Recovery targets:
- RPO: 24 hours.
- Target RTO: 8 hours.

Storage and protection:
- Store the primary backup through the host/Coolify backup mechanism.
- Copy each retained production backup to encrypted offsite storage.
- Encrypt backups at rest and in transit.
- Keep backup credentials, offsite credentials and encryption keys outside this repository.

Ownership:
- The Platform owner owns backup configuration, restore drill evidence, credential/key rotation and incident coordination.
```

Point-in-time recovery is not part of this v1 standard. If the business needs
RPO below 24 hours, define WAL archiving/PITR in a separate decision before
implementation.

Restore drill checklist:

```txt
1. Select the latest retained daily backup, or the weekly backup being tested.
2. Restore into a disposable non-production environment, never over production.
3. Start the stack against the restored PostgreSQL database.
4. Verify /forecasting, /petyr-admin data health and /redash-ingestor access.
5. Verify row counts for the three required Redash latest tables.
6. Record backup timestamp, restore start/end time, restored environment, checks performed and outcome.
7. Destroy the disposable environment or remove access after evidence is recorded.
```

Useful restored-database checks:

```bash
docker compose exec postgres psql -U unguess -d unguess_redash -c "select count(*) from redash_raw_master_campaigns_latest;"
docker compose exec postgres psql -U unguess -d unguess_redash -c "select count(*) from redash_raw_master_agreements_latest;"
docker compose exec postgres psql -U unguess -d unguess_redash -c "select count(*) from redash_raw_company_ownership_latest;"
```

Initial Forecast is entered through Annual Forecast Entry in `/forecasting/entry`.
The legacy Initial Forecast Excel import/export and manual consolidation
fallback endpoints have been removed from the product API.

## PostgreSQL

Enter database:

```bash
docker compose exec postgres psql -U unguess -d unguess_redash
```

Inspect sources:

```sql
SELECT "key", "name", "redashQueryId", "enabled"
FROM "RedashSource"
ORDER BY "key";
```

Disable unused sources:

```sql
UPDATE "RedashSource"
SET "enabled" = false
WHERE "key" NOT IN ('master_campaigns', 'master_agreements', 'company_ownership');
```

Inspect latest snapshots:

```sql
SELECT 
  s."key",
  sn."fetchedAt",
  sn."rowsCount",
  sn."queryResultId"
FROM "RedashSnapshot" sn
JOIN "RedashSource" s ON s."id" = sn."sourceId"
ORDER BY sn."fetchedAt" DESC
LIMIT 20;
```

Inspect Petyr materialized Redash tables:

```bash
docker compose exec postgres psql -U unguess -d unguess_redash -c "\\dt redash_raw_*"
docker compose exec postgres psql -U unguess -d unguess_redash -c "select count(*) from redash_raw_master_campaigns_latest;"
docker compose exec postgres psql -U unguess -d unguess_redash -c "select count(*) from redash_raw_master_agreements_latest;"
docker compose exec postgres psql -U unguess -d unguess_redash -c "select count(*) from redash_raw_company_ownership_latest;"
```

## Petyr local performance validation checklist

Use this checklist from the monorepo root on a local Docker stack. Measure through the unified gateway on port `8080`; direct ports `3000` and `3001` are debug conveniences only.

### 1. Prepare the stack and logs

Enable verbose server-side performance logs only for the local validation run:

```bash
cp .env.example .env
# edit .env and set:
# PETYR_PERF_LOGS=true
# APP_INTERNAL_SECRET=replace_me_with_a_long_random_string
# REDASH_API_KEY=replace_with_redash_user_or_query_api_key

docker compose up -d --build
```

Petyr Admin also reads sanitized persisted server-side measurements from
`petyr_performance_measurement` through
`GET /api/petyr/admin/performance-results`. `PETYR_PERF_LOGS=true` controls
console log verbosity only; persisted measurements store service, operation,
status, duration, row count, timestamp and scalar metadata, not raw Redash
payloads, workbook contents, customer rows, secrets or browser DevTools timings.

Open log tails in separate terminals before measuring:

```bash
docker compose logs -f forecasting-app
```

```bash
docker compose logs -f redash-ingestor redash-worker
```

Capture these server log fields when present:

```txt
message / operation
durationMs
year
month / reportingMonth
rowCount / rowsCount
campaignRows
agreementRows
ownershipRows
forecastMonthlyRows
forecastAnnualRows
aiForecastCacheRows
latestAiForecastCacheRows
tableName
hasFilter
sourceKey
status
materialized
columnsCount
runId
triggeredBy
```

Do not copy customer row contents, raw Redash payloads, API keys or uploaded workbook contents into the measurement notes.

### 2. Shared curl timing format

Use this timing format for every HTTP measurement:

```bash
CURL_TIME='status=%{http_code} dns=%{time_namelookup}s connect=%{time_connect}s ttfb=%{time_starttransfer}s total=%{time_total}s size=%{size_download} bytes url=%{url_effective}\n'
```

If a request writes an output file, keep it under `/tmp` and delete it after the run.

### 3. Cold `/forecasting` load

A cold local server response is the first request after restarting the Forecasting container. This does not simulate a browser cache cold start by itself; record browser DevTools separately.

```bash
docker compose restart forecasting-app
sleep 10
curl -sS -o /tmp/petyr-forecasting-cold.html -w "$CURL_TIME" http://localhost:8080/forecasting
```

Server logs to capture:

```txt
getPetyrApprovedRenderingData durationMs
getManagementView durationMs
getCsmOverviewWorkspace durationMs
Petyr PostgreSQL row-count loads
queryCampaignRows / queryAgreementRows / queryOwnershipRows rowCount
readForecastMonthlyRows / readForecastAnnualRows / readAiForecastCacheRows rowCount
```

Acceptable MVP threshold: cold load should be documented and should not produce errors. Open a BACKLOG item if cold `/forecasting` is consistently above 5 seconds locally, if a single high-level Petyr operation is above 3 seconds, or if row-count logs show repeated full-table reads growing without an optimization plan.

### 4. Warm `/forecasting` load

Run three warm requests after the cold request and use the median `total` time.

```bash
curl -sS -o /tmp/petyr-forecasting-warm-1.html -w "$CURL_TIME" http://localhost:8080/forecasting
curl -sS -o /tmp/petyr-forecasting-warm-2.html -w "$CURL_TIME" http://localhost:8080/forecasting
curl -sS -o /tmp/petyr-forecasting-warm-3.html -w "$CURL_TIME" http://localhost:8080/forecasting
```

Acceptable MVP threshold: warm server response under 2 seconds. Open a BACKLOG item if the median is above 2 seconds, if `getPetyrApprovedRenderingData` is above 2 seconds, or if nested `getManagementView` / `getCsmOverviewWorkspace` timings show repeated broad reads that dominate the response.

### 5. `/forecasting/company/[companyName]` for a real large company

Pick a real company with many campaigns/agreements from `/petyr-admin` Data Health or PostgreSQL. URL-encode the company name before using it in the path.

```bash
COMPANY_SLUG='Large%20Company%20Name'

curl -sS -o /tmp/petyr-company-cold.html -w "$CURL_TIME" "http://localhost:8080/forecasting/company/$COMPANY_SLUG"
curl -sS -o /tmp/petyr-company-warm-1.html -w "$CURL_TIME" "http://localhost:8080/forecasting/company/$COMPANY_SLUG"
curl -sS -o /tmp/petyr-company-warm-2.html -w "$CURL_TIME" "http://localhost:8080/forecasting/company/$COMPANY_SLUG"
curl -sS -o /tmp/petyr-company-warm-3.html -w "$CURL_TIME" "http://localhost:8080/forecasting/company/$COMPANY_SLUG"
```

Server logs to capture:

```txt
getCompanyDetail durationMs
loadOverviewInputs rows loaded
forecast_monthly / forecast_annual / ai_forecast_cache row counts
```

Acceptable MVP threshold: warm median under 1.5 seconds. Open a BACKLOG item if warm median exceeds 1.5 seconds for a large real company, if `getCompanyDetail` exceeds 1.5 seconds, or if company detail repeatedly loads full platform-wide data where company-scoped queries would be safe.

### 6. `/forecasting/entry` for a real company/month

Measure the page shell first, then measure the company/month context API because the page is interactive and the route can load follow-up data after initial render.

```bash
curl -sS -o /tmp/petyr-entry-page.html -w "$CURL_TIME" http://localhost:8080/forecasting/entry
```

Then use the same real company and CSM selected in the browser. URL-encode query values.

```bash
CSM_NAME='Real%20CSM%20Name'
COMPANY_NAME='Large%20Company%20Name'
YEAR=2026
MONTH=6

curl -sS -o /tmp/petyr-entry-context.json -w "$CURL_TIME" "http://localhost:8080/api/petyr/forecast-entry?csmName=$CSM_NAME&companyName=$COMPANY_NAME&year=$YEAR&month=$MONTH"
```

Server logs to capture:

```txt
getForecastEntryCompanies durationMs
getForecastEntryContext durationMs
year
month
hasCompanyName
hasCsmName
row-count logs for campaign, agreement, ownership, forecast_monthly, forecast_annual and ai_forecast_cache
```

Acceptable MVP threshold: warm Forecast Entry context under 1.5 seconds. Open a BACKLOG item if `getForecastEntryCompanies` or `getForecastEntryContext` is repeatedly above 1.5 seconds, or if `/forecasting/entry` blocks normal users while loading all companies.

### 7. `/petyr-admin` page load

```bash
curl -sS -o /tmp/petyr-admin-warm-1.html -w "$CURL_TIME" http://localhost:8080/petyr-admin
curl -sS -o /tmp/petyr-admin-warm-2.html -w "$CURL_TIME" http://localhost:8080/petyr-admin
curl -sS -o /tmp/petyr-admin-warm-3.html -w "$CURL_TIME" http://localhost:8080/petyr-admin
```

Acceptable MVP threshold: warm median under 1 second. Open a BACKLOG item if admin warm median exceeds 1 second, if Data Health queries dominate the response, or if admin-only diagnostics become visible in non-admin Forecasting routes.

### 8. Excel export duration

Use a real year and optionally a CSM name. The workbook is generated in memory, so record both HTTP timing and container memory symptoms if the export is large.

```bash
YEAR=2026
CSM_NAME='Real%20CSM%20Name'

curl -sS -L -o /tmp/petyr-monthly-forecast.xlsx -w "$CURL_TIME" "http://localhost:8080/api/petyr/admin/export-monthly-forecast-xlsx?year=$YEAR&csmName=$CSM_NAME"
```

Optional memory spot-check during the export:

```bash
docker stats --no-stream forecasting-app
```

Acceptable MVP threshold: document the duration and keep it admin-only. Open a BACKLOG item if export is repeatedly above 10 seconds, if the Forecasting container memory spikes enough to affect `/forecasting`, or if normal user routes slow down during export.

### 9. Excel import dry-run duration

Current monthly Excel import does not expose a non-writing `dryRun` parameter. For local performance validation, treat this as a dry-run-equivalent only on a disposable local stack or after taking a local database backup that will be restored immediately. Do not run this against shared or production-like data as a dry run.

Prepare an import workbook, then measure the local-only import:

```bash
IMPORT_FILE=/tmp/petyr-monthly-forecast.xlsx

curl -sS -o /tmp/petyr-monthly-import-result.json -w "$CURL_TIME" \
  -X POST http://localhost:8080/api/petyr/admin/import-monthly-forecast-xlsx \
  -F "file=@$IMPORT_FILE;type=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
```

If the stack is disposable, clean it after measurement:

```bash
docker compose down -v
```

Acceptable MVP threshold: Excel import is admin-only and acceptable if documented, observable and not blocking normal users. Open a BACKLOG item if a true non-writing dry-run endpoint is needed, if import is above 15 seconds for MVP-sized workbooks, if memory spikes affect `/forecasting`, or if import errors leave partial/ambiguous results.

### 10. Redash manual sync duration

Manual sync is an admin/background operation and should be documented separately from product route thresholds. Measure all enabled sources and individual sources when investigating outliers.

```bash
curl -sS -o /tmp/redash-sync-all.json -w "$CURL_TIME" \
  -X POST http://localhost:8080/redash-ingestor/api/redash/sync \
  -H "Content-Type: application/json" \
  -d '{}'
```

Single source examples:

```bash
curl -sS -o /tmp/redash-sync-master-campaigns.json -w "$CURL_TIME" \
  -X POST http://localhost:8080/redash-ingestor/api/redash/sync \
  -H "Content-Type: application/json" \
  -d '{"sourceKey":"master_campaigns"}'

curl -sS -o /tmp/redash-sync-master-agreements.json -w "$CURL_TIME" \
  -X POST http://localhost:8080/redash-ingestor/api/redash/sync \
  -H "Content-Type: application/json" \
  -d '{"sourceKey":"master_agreements"}'

curl -sS -o /tmp/redash-sync-company-ownership.json -w "$CURL_TIME" \
  -X POST http://localhost:8080/redash-ingestor/api/redash/sync \
  -H "Content-Type: application/json" \
  -d '{"sourceKey":"company_ownership"}'
```

Server logs to capture:

```txt
Redash sync execution durationMs
sourceKey
runId
triggeredBy
status
rowsCount
Redash latest table materialization durationMs
materialized
columnsCount
```

Acceptable MVP threshold: no fixed product-route threshold because sync is background/admin. Open a BACKLOG item if sync exceeds the configured `SYNC_JOB_TIMEOUT_MS`, if one source dominates without a documented Redash-side reason, if sync fails repeatedly, or if manual sync blocks Forecasting routes.

### 11. Redash materialization duration

Materialization is measured from Redash Ingestor server logs during sync. Also verify latest-table row counts after sync:

```bash
docker compose exec postgres psql -U unguess -d unguess_redash -c "select count(*) from redash_raw_master_campaigns_latest;"
docker compose exec postgres psql -U unguess -d unguess_redash -c "select count(*) from redash_raw_master_agreements_latest;"
docker compose exec postgres psql -U unguess -d unguess_redash -c "select count(*) from redash_raw_company_ownership_latest;"
```

Acceptable MVP threshold: materialization duration is documented separately as admin/background work. Open a BACKLOG item if materialization is repeatedly above 30 seconds for MVP-sized source tables, if JSON-to-table insertion causes high memory pressure, or if row counts differ unexpectedly from the Redash snapshot `rowsCount`.

### 12. Browser DevTools measurements

Use Chrome or Edge DevTools for the user-facing routes:

```txt
1. Open http://localhost:8080/forecasting.
2. Open DevTools -> Network.
3. Enable Disable cache for cold browser runs.
4. Hard reload and record Document TTFB, DOMContentLoaded, Load and total transferred bytes.
5. Disable Disable cache and reload three times for warm browser runs.
6. Repeat for /forecasting/company/[companyName], /forecasting/entry and /petyr-admin.
7. In Performance panel, record one reload profile for /forecasting and one interaction profile for selecting a company/month in /forecasting/entry.
```

Browser MVP triggers for BACKLOG:

```txt
/forecasting warm browser Load consistently above 3 seconds
/forecasting/company/[companyName] warm browser Load consistently above 2.5 seconds
/forecasting/entry company/month interaction consistently above 2 seconds
/petyr-admin warm browser Load consistently above 1.5 seconds
large JavaScript or workbook downloads dominate route load without an owner
server timings are acceptable but browser main-thread work is not
```

### 13. Measurement record template

Copy this template into the task notes or a backlog item:

```txt
Date/time:
Git branch / commit:
Docker images rebuilt: yes/no
PETYR_PERF_LOGS=true: yes/no
Dataset notes: row counts only, no customer rows
Route or operation:
Cold curl total / TTFB:
Warm curl totals / median:
Browser DevTools TTFB / DOMContentLoaded / Load:
Server operation durationMs:
Row counts loaded:
Memory observation, if Excel or JSON-heavy:
Threshold result: pass/fail
Backlog item opened: yes/no
Notes:
```
