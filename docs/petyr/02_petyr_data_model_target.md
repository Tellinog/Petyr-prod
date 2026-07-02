# Petyr target database model

The first Petyr forecasting schema is implemented in:

```txt
apps/forecasting-app/prisma/schema.prisma
```

Apply it from `apps/forecasting-app` with:

```bash
npm run db:sync
```

Do not run raw `npx prisma db push` against the shared platform database. Petyr's
`db:push` wrapper preserves Redash materialized latest tables while Prisma
updates static Redash/Petyr tables.

For migration-managed environments, create and review a migration instead:

```bash
npx prisma migrate dev --name add_petyr_forecasting_schema
```

Implemented Petyr-owned tables:

## forecast_monthly

- id
- company_name
- csm_name
- business_unit
- year
- month
- forecast_type: previous_month | ongoing
- value
- ai_forecast_value
- status: draft | saved | locked
- created_by
- created_at
- updated_by
- updated_at

## forecast_annual

- id
- company_name
- csm_name
- business_unit
- year
- value
- ai_forecast_value
- value_source: manual | ai_confirmed
- status: draft | consolidated
- note
- created_by
- created_at
- updated_by
- updated_at
- consolidated_by
- consolidated_at

`forecast_annual` is the current/latest annual CSM forecast source. Management
View reads `value` as Ongoing Forecast.

`forecast_annual.initial_forecast` stores the fixed Initial Forecast value for
the same company + Business Unit + year when Annual Forecast Entry is saved
during the Forecast Initial window. Management View, Business Unit views and
Company Detail read this field for Initial Forecast aggregates.

## forecast_annual_entry

- id
- company_name
- csm_name
- year
- initial_forecast
- ongoing_confidence: 01 High | 02 Mid | 03 Low
- created_by
- created_at
- updated_by
- updated_at

`forecast_annual_entry` stores customer + year metadata for the CSM-facing
Annual Forecast Entry section. The Business Unit annual values remain in
`forecast_annual`; FC Ongoing is derived by summing only saved or confirmed BU
values. Unclicked AI placeholders are not persisted and do not contribute.

FC Initial is editable only from December 10 of the previous year through
January 10 of the selected year, or while Petyr Admin has unlocked that selected
target year. Outside that window and without an admin unlock it is read-only.

`forecast_annual_entry.initial_forecast` is the company/year total derived from
the per-Business Unit Initial Forecast values stored in
`forecast_annual.initial_forecast`.

## forecast_annual_snapshot

Deprecated legacy table. Frozen annual forecast snapshots previously lived in a
dedicated table so Initial Forecast would not mutate Ongoing Forecast. Product
read paths now use Annual Forecast Entry instead.

- id
- company_name
- csm_name
- business_unit
- year
- snapshot_type: initial
- value
- source: manual_excel_2026 | year_end_consolidation | admin
- note
- created_by
- created_at
- locked_at

Unique key:

```txt
company_name + business_unit + year + snapshot_type
```

Rules:

- Product Initial Forecast reads must not use `forecast_annual_snapshot`.
- Ongoing Forecast reads from current/latest `forecast_annual.value`.
- Initial Forecast reads from `forecast_annual_entry.initial_forecast` for
  company/year totals and `forecast_annual.initial_forecast` for BU aggregates.
- The old 2026 Excel bootstrap and future year-end consolidation endpoints have
  been removed from the product API.
- Existing physical snapshot rows are historical legacy data only until a
  separate backup-backed cleanup task drops them.

## forecast_annual_snapshot_change_log

Deprecated legacy audit table for the old snapshot workflow. Current Initial
Forecast audit uses Annual Forecast Entry save sessions and change logs.

- id
- snapshot_id
- company_name
- csm_name
- business_unit
- year
- snapshot_type
- previous_value
- new_value
- previous_source
- new_source
- note
- changed_by
- changed_at

Every effective snapshot creation or overwrite writes one audit row.

## forecast_save_session

- id
- company_name
- csm_name
- source
- year
- month
- forecast_type
- note
- company_active_status
- created_by
- created_at

## forecast_change_log

- id
- save_session_id
- company_name
- business_unit
- field_name
- previous_value
- new_value
- ai_forecast_value_at_save
- created_by
- created_at

## company_forecast_status

- id
- company_name
- is_active
- reason
- updated_by
- updated_at

## app_setting

- setting_key
- setting_value
- updated_at

Temporary Petyr settings are stored here. The selected OpenRouter model uses
`setting_key=petyr.openrouter.model` and falls back to `OPENROUTER_DEFAULT_MODEL`
when no row exists.

## ai_forecast_cache

- id
- company_name
- business_unit
- year
- month
- forecast_value
- confidence_score
- model_version
- explanation
- generated_at
- provider
- model
- prompt_version
- input_hash
- request_payload_summary
- validated_output
- status
- error_message
- created_at
- updated_at

Forecast Intelligence analysis rows use `business_unit=__forecast_intelligence__`, `month=0` and `forecast_value=0`. Numeric AI forecast readers must exclude this sentinel row and read only successful months 1-12. For sentinel rows, `model_version` is an internal cache key that includes provider model, prompt version and input hash.

## management_objective

Annual management objectives persist Branch and Business Unit objective values
separately from CSM forecast tables.

Required objective fields:

- scope type: `branch` or `business_unit`
- scope key: Branch name from Company Ownership or official Business Unit name
- year
- value
- note
- created_by
- created_at
- updated_by
- updated_at

Unique key:

```txt
scope_type + scope_key + year
```

## management_objective_change_log

Required objective audit fields:

- scope type: `branch` or `business_unit`
- scope key: Branch name or official Business Unit name
- year
- previous value
- new value
- note
- updated by, even if temporarily a placeholder until authentication exists
- timestamp

Rules:

- Branch keys come from the dynamic Company Ownership `company_branch` list.
- Business Unit keys must stay within the official closed list.
- Objective rows must not be derived from Redash.
- Objective rows must not be derived from annual forecasts.

## Business Unit rule

Business Unit is stored as a string in this first schema. App logic must validate values
against the official list from `03_petyr_business_rules.md`.
