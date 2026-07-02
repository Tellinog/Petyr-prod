# Data model

## Current raw model

The current app stores Redash data as raw JSON snapshots.

Core entities:

```txt
RedashSource
RedashSyncRun
RedashSnapshot
RedashSyncLock
RedashColumnMapping
```

## RedashSnapshot

Purpose:
- retain original Redash API response;
- allow audit/debug;
- allow reprocessing into normalized facts later.

Important payload paths:

```txt
payload.query_result.data.columns
payload.query_result.data.rows
```

## Raw latest materialization

After a successful MVP source sync, the ingestor keeps `RedashSnapshot.payload` unchanged
and also replaces the rows in one source-specific PostgreSQL table:

```txt
redash_raw_master_campaigns_latest
redash_raw_master_agreements_latest
redash_raw_company_ownership_latest
```

These tables are not historical. They contain only the latest materialized rows for the
source and are rebuilt after each successful sync.

Required system columns:

```txt
snapshot_id
row_index
synced_at
```

Every Redash column is materialized as a safe snake_case PostgreSQL column. Conversion:
lowercase, trim, replace spaces/symbols with `_`, collapse repeated `_`, remove leading
and trailing `_`, and append `_2`, `_3`, etc. for duplicates.

## RedashColumnMapping

Physical table:

```txt
redash_column_mapping
```

Purpose:
- record the original Redash column name;
- record the generated database column name;
- keep source order and detected type metadata for UI and later normalization work.

Fields:
- id;
- source_key;
- redash_column_name;
- db_column_name;
- position;
- detected_type;
- last_seen_at.

## RedashSyncLock

Purpose:
- prevent concurrent Redash syncs between the worker and manual API requests;
- keep the lock in PostgreSQL so it works across containers;
- expire stale locks through `SYNC_LOCK_TTL_SECONDS`.

The MVP uses one global lock key for the full Redash sync job.

## Current Petyr forecast model

Petyr owns CSM-entered forecast data and AI forecast cache data. Redash remains the
source of closed revenue; Petyr forecast tables must not be used to store raw Redash rows.

`apps/forecasting-app/prisma/schema.prisma` is the Prisma superset schema for
static shared-database tables. It includes the Redash Ingestor models
(`RedashSource`, `RedashSyncRun`, `RedashSnapshot`, `RedashSyncLock`,
`RedashColumnMapping`) plus Petyr-owned forecast models. The raw latest Redash
tables remain materialized by Redash Ingestor with raw SQL because their columns
come from Redash query output.

Physical tables added by `apps/forecasting-app/prisma/schema.prisma`:

```txt
forecast_monthly
forecast_annual
forecast_annual_entry
forecast_annual_snapshot (deprecated legacy)
forecast_annual_snapshot_change_log (deprecated legacy)
forecast_save_session
forecast_change_log
company_forecast_status
app_setting
petyr_performance_measurement
ai_forecast_cache
management_objective
management_objective_change_log
```

`petyr_performance_measurement` stores sanitized operational measurements used
by Petyr Admin. Forecasting and Redash Ingestor may write operation name,
service name, status, duration, row count, timestamp and small scalar metadata.
It must not store raw Redash payloads, uploaded workbook contents, customer rows,
API keys, secrets or browser DevTools measurements.

Business Unit is stored as a string for now so the schema can remain compatible with
future source cleanup. App logic must validate it against the official values:

```txt
AI
Accessibility
Community
Experience
Express
FTE
Other
QA
Security
TA
```

### forecast_monthly

Purpose:
- store the CSM monthly forecast per company and Business Unit;
- keep AI forecast values read-only alongside CSM values;
- support `previous_month` and `ongoing` forecast windows.

Unique key:

```txt
company_name + business_unit + year + month + forecast_type
```

Statuses:

```txt
draft
saved
locked
```

Exceptional 2026 alignment:
- `forecast_monthly` may receive one-time 2026 `ongoing` rows copied from already closed Redash campaign revenue by the protected `/petyr-admin` 2026 alignment control or CLI fallback `npm run backfill:2026-ongoing-from-closed`;
- this is a controlled historical backfill only, not a recurring import or product feature.

### forecast_annual

Purpose:
- store yearly forecast drafts and consolidated annual forecasts;
- keep annual notes and consolidation metadata.
- store the current value source for Annual Forecast Entry Business Unit values:
  `manual` or `ai_confirmed`. AI placeholders that a CSM has not clicked or
  changed are not stored.
- store the frozen Initial Forecast value for the same company + Business Unit
  + year in `initial_forecast` when saved through Annual Forecast Entry during
  the Forecast Initial window.

Unique key:

```txt
company_name + business_unit + year
```

Statuses:

```txt
draft
consolidated
```

This is the current/latest annual CSM forecast source for Ongoing Forecast in
Management View. `value` is mutable Ongoing Forecast. `initial_forecast` is the
fixed per-Business Unit Initial Forecast used by Management View, Business Unit
views and Company Detail after the Annual Entry Initial window closes.

### forecast_annual_entry

Purpose:
- store customer + year metadata for the CSM-facing Annual Forecast Entry table;
- keep the single FC Initial value for that customer/year;
- keep the single FC Ongoing Confidence value for that customer/year.

Unique key:

```txt
company_name + year
```

Important fields:
- company_name;
- csm_name;
- year;
- initial_forecast;
- ongoing_confidence: `01 High`, `02 Mid`, `03 Low`;
- created_by / updated_by;
- created_at / updated_at.

Rules:
- FC Initial is editable only from December 10 of year N-1 through January 10
  of year N. Outside that window it remains visible read-only.
- FC Initial is the company/year total derived from the saved per-Business Unit
  Initial Forecast values in `forecast_annual.initial_forecast`.
- FC Ongoing Confidence is required when an Annual Forecast Entry row is
  modified.
- FC Ongoing itself is not stored in this table. It is derived as the sum of
  saved/confirmed `forecast_annual` Business Unit values for the same company
  and year.
- Effective Annual Forecast Entry changes are audited through
  `forecast_save_session` and `forecast_change_log` with source
  `Annual Forecast Entry`.

Exceptional 2026 alignment:
- `forecast_annual` may receive one-time 2026 rows copied from already closed Redash campaign revenue by the protected `/petyr-admin` 2026 alignment control or CLI fallback `npm run backfill:2026-ongoing-from-closed`;
- these rows are used only to align Management View Ongoing Forecast for 2026 and must not become a recurring annual forecast generation rule.

### forecast_annual_snapshot

Deprecated legacy table.

Previous purpose:
- store frozen annual forecast baselines separately from current annual forecast rows;
- support the old one-shot 2026 Initial Forecast Excel bootstrap;
- support the old year-end Initial Forecast consolidation without mutating Ongoing Forecast.

Current rule:
- product read paths must not use this table;
- Initial Forecast now comes from Annual Forecast Entry:
  `forecast_annual_entry.initial_forecast` for company/year totals and
  `forecast_annual.initial_forecast` for company + Business Unit + year values;
- the old Excel import/export and scheduler/consolidation endpoints have been
  removed from the product API;
- the physical table may remain in existing databases as historical legacy data
  until a separate backup-backed database cleanup task explicitly drops it.

Initial Forecast snapshots use:

```txt
snapshot_type = initial
```

Sources:

```txt
manual_excel_2026
year_end_consolidation
admin
```

Unique key:

```txt
company_name + business_unit + year + snapshot_type
```

Important fields:
- company_name;
- csm_name;
- business_unit;
- year;
- snapshot_type;
- value;
- source;
- note;
- created_by;
- created_at;
- locked_at.

Rules:
- product code must not read from or write to this table for current Initial
  Forecast behavior;
- `forecast_annual.value` remains the mutable/current Ongoing Forecast source;
- `forecast_annual.initial_forecast` is the current per-Business Unit Initial
  Forecast source;
- `forecast_annual_entry.initial_forecast` is the current company/year Initial
  Forecast total source.

### forecast_annual_snapshot_change_log

Deprecated legacy table for the old snapshot workflow.

Product Initial Forecast audit now uses `forecast_save_session` and
`forecast_change_log` through Annual Forecast Entry saves.

Important fields:
- snapshot_id;
- company_name;
- csm_name;
- business_unit;
- year;
- snapshot_type;
- previous_value;
- new_value;
- previous_source;
- new_source;
- note;
- changed_by;
- changed_at.

### forecast_save_session and forecast_change_log

Every forecast save creates one `forecast_save_session` and one or more
`forecast_change_log` rows.

This preserves the Petyr rule that multiple Business Unit edits made in one action are
grouped in a single save session. The save session also snapshots the company active
status at save time.

The normal current-month Forecast Entry batch workflow reuses these existing
tables and does not introduce a batch-specific Prisma schema change. Batch save
creates one `forecast_save_session` per company with effective changes and one
`forecast_change_log` row per changed Business Unit value. Company note-only
updates and unchanged Business Unit values must not create sessions or synthetic
change logs. AI forecast suggestions remain read-only placeholders until a CSM
explicitly accepts or edits the active value; the accepted CSM value is stored in
`forecast_monthly`, while `ai_forecast_value_at_save` snapshots the AI reference
value for audit comparison.

### company_forecast_status

Purpose:
- store whether a company is active for forecasting;
- keep the reason and latest editor.

Unique key:

```txt
company_name
```

### app_setting

Purpose:
- store temporary Petyr application settings that must persist across app restarts;
- currently stores the selected OpenRouter model for future AI notes and forecast explanations.

Fields:
- setting_key;
- setting_value;
- updated_at.

The selected OpenRouter model uses setting key:

```txt
petyr.openrouter.model
```

If this setting does not exist, Petyr uses `OPENROUTER_DEFAULT_MODEL` from the environment.

### ai_forecast_cache

Purpose:
- cache deterministic monthly AI Forecast values by company and Business Unit;
- cache Forecast Intelligence JSON analysis and failure states for a company-year input hash;
- keep the model version, confidence and explanation used by the UI;
- keep AI forecasts separate from CSM-owned forecast rows so AI output remains read-only.

Unique key:

```txt
company_name + business_unit + year + month + model_version
```

Rows are written only by the explicit manual company-by-company AI Forecasting
MVP flow. Redash sync completion and global/all-company batch requests must not
write AI forecasts during this phase. Production AI generation must not overwrite
historical AI forecast rows. Until append-only regeneration/versioning is
defined, existing rows for the same company, Business Unit, year, month and
model version should be skipped rather than overwritten. AI generation must
never overwrite `forecast_monthly` or `forecast_annual` CSM values. Forecast Intelligence uses the sentinel `business_unit=__forecast_intelligence__`, `month=0` and `forecast_value=0`; numeric forecast readers must filter to successful months 1-12 and exclude the sentinel. Intelligence rows store provider, model, prompt version, input hash, request payload summary, validated output, status, error message and generation metadata. For sentinel rows, `model_version` is an internal cache key that includes provider model, prompt version and input hash so changed inputs do not collide with earlier cache entries. Company Detail reads only the latest successful sentinel row for the selected company + year, ordered by `generated_at DESC` and then `updated_at DESC`, and uses `generated_at` as the visible generation timestamp with `updated_at` only as a fallback.

### management_objective

Purpose:
- store annual management-entered objectives for Branch and Business Unit targets;
- keep objective values separate from CSM monthly and annual forecast rows;
- provide the current objective value used by management aggregates.

Unique key:

```txt
scope_type + scope_key + year
```

Allowed scope types:

```txt
branch
business_unit
```

Rules:
- Branch scope keys must come from current Company Ownership `company_branch`, with `Unassigned` allowed for companies without a branch;
- Business Unit scope keys must use the official closed Business Unit list;
- objectives must not be derived from Redash, closed revenue, planned campaign revenue, AI forecast or annual CSM forecast.

### management_objective_change_log

Purpose:
- record every Management Objective save for traceability;
- preserve previous value, new value, note, timestamp and updater placeholder until authentication exists.

Important fields:
- objective_id;
- scope_type;
- scope_key;
- year;
- previous_value;
- new_value;
- note;
- updated_by;
- updated_at.

## Applying Petyr schema changes

From the forecasting app folder:

```bash
cd apps/forecasting-app
npm run db:generate
```

To generate the Prisma client and apply the schema to a local development database,
ensure `DATABASE_URL` points to the PostgreSQL instance and run:

```bash
npm run db:sync
```

Do not run raw `npx prisma db push` against the shared platform database. Petyr's
`db:push` wrapper preserves Redash materialized latest tables while Prisma
updates static Redash/Petyr tables.

For migration-managed environments, create and review a Prisma migration instead:

```bash
npx prisma migrate dev --name add_petyr_forecasting_schema
```

Production-like deployments should apply reviewed migrations with:

```bash
npx prisma migrate deploy
```

## Future normalized facts

### CampaignFact

Proposed fields:
- id;
- sourceSnapshotId;
- cpid;
- companyName;
- customerTitle;
- agreementName;
- csm;
- sales;
- researcher;
- businessUnit;
- campaignStatus;
- startDate;
- endDate;
- revenue;
- cost;
- grossMargin;
- grossMarginPct;
- syncedAt.

### AgreementFact

Proposed fields:
- id;
- sourceSnapshotId;
- agreementId;
- agreementName;
- companyName;
- csm;
- sales;
- startDate;
- expiryDate;
- totalValue;
- consumedValue;
- residualValue;
- status;
- syncedAt.

### CompanyFact

Proposed fields:
- id;
- companyName;
- csm;
- sales;
- activeAgreementsCount;
- campaignsCurrentYearCount;
- revenueCurrentYear;
- residualAgreementValue;
- lastCampaignEndDate;
- dataQualityStatus;
- updatedAt.

### ForecastEntry

Proposed fields:
- id;
- companyName;
- month;
- year;
- csmForecast;
- aiForecast;
- ongoingForecast;
- actualRevenue;
- lockedSnapshot;
- note;
- updatedBy;
- updatedAt.

### ForecastRevisionLog

Proposed fields:
- id;
- forecastEntryId;
- changedBy;
- changedAt;
- fieldName;
- previousValue;
- newValue;
- reason.

### ForecastNote

Proposed fields:
- id;
- companyName;
- month;
- year;
- note;
- author;
- createdAt;
- updatedAt.

## Rule

Do not create normalized facts before the field mapping from Redash rows is understood.

First inspect row samples.
Then define exact mapping.
Then implement normalized tables.
