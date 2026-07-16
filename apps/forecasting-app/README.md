# Petyr Forecasting App

Petyr is the forecasting product app for UNGUESS.

It is intentionally separated from `apps/redash-ingestor`.

## Current scope

This base app includes:

- Next.js + TypeScript app;
- the approved Petyr visual rendering at `/forecasting`;
- Management Objectives in Management View, with `/forecasting/entry/objectives` kept as a management-only compatibility route;
- PostgreSQL database backup export/import in `/petyr-admin`;
- global authenticated feedback tickets with permission-scoped review and Excel export;
- admin-only separated Petyr Intelligence at `/intelligence` and `/petyr-admin/intelligence`;
- Excel-first monthly forecast import/export in `/petyr-admin`;
- admin-only annual Forecast Ongoing Excel import in `/petyr-admin`;
- admin-only inactive companies annual Forecast Ongoing export in `/petyr-admin`;
- read-only Forecast Entry and Management Excel exports from product views;
- persisted sanitized performance results in `/petyr-admin`;
- local UI components needed by the rendering;
- Dockerfile;
- Prisma read model for Redash snapshots;
- health API;
- first DB preview API.

`/forecasting` renders a lightweight shell immediately after Petyr read permission checks, then loads Management first from `GET /api/petyr/forecasting/rendering-data?view=management` in the browser. CSM Overview is currently in development and is visible/accessible only to users with `petyr:admin`; non-admin users are kept on Management and do not see the CSM Overview navigator item or preload its data. For admins, after Management is usable, the client starts scoped CSM Overview preload through `view=csm-scoped` for the authenticated/preferred CSM and starts Forecast Entry Monthly and Annual warmup for users with `petyr:forecast:write`. It does not immediately hydrate `view=all` after Management. While the Management refresh is running, users see only the shared workspace header, section navigator and an in-page loader labelled `Updating data ongoing`; Management dashboard cards, tables and diagnostics remain hidden until the Management payload is ready. Forecasting data remains PostgreSQL-backed; these endpoint variants do not introduce Redash browser calls or schema changes. Company Detail is intentionally on-demand and reads only the selected company/year. Numeric AI Forecast cache reads use a narrow latest-row projection and exclude `explanation`, `request_payload_summary`, `validated_output` and `error_message`; if that read fails, Management, CSM Overview and Company Detail continue rendering with `aiRows=[]` plus a warning.
In Company Detail, the navigator CSM/company filter uses the same recent Company Ownership workspace association rule as Forecast Entry Monthly and Annual: all company-CSM associations with `workspace_updated_on` in the last 6 months are eligible, with latest-owner fallback only when no recent associations exist. Company Detail links and in-page navigation preserve the selected `csmName` query context so the CSM filter and company list stay aligned when a company appears in multiple recent CSM portfolios. The header Forecast status is connected to `company_forecast_status`; users with forecast write permission can change Active/Inactive directly from Company Detail and the change autosaves with save-session/change-log audit, clearing numeric AI Forecast cache rows when set inactive. Month-by-month trend, Revenue per Business Unit, Business Unit current-year view and Relevant company insights are visible only to users with `petyr:admin`. In the admin-only Business Unit current-year view, collapsed Business Unit totals show Ongoing Forecast, AI Forecast and Closed Revenue YTD. Admins can expand each Business Unit to review the individual selected-year months, including previous-month forecast, ongoing forecast, AI Forecast and closed revenue. Users with forecast write permission can add a company note directly to Company logs without opening Forecast Entry or changing forecast values. Company campaigns show the latest completed campaign plus running or planned campaigns by default, with older/other campaigns expandable. Agreements show only rows expiring after the moment of viewing by default, with expired or undated rows expandable. Company logs replace Change history, show notes and forecast changes, and display the latest three logs before expansion. The full Support details area, including Company context and extra metrics, Revenue by Business Unit detail, Monthly forecast rows, Annual forecast rows and AI forecast cache support tables, is visible only to users with `petyr:admin`. In Management View, Current year trend and Revenue per Business Unit are visible only to users with `petyr:admin`.

## Important rule

Petyr must not call Redash directly.

Correct flow:

```txt
Redash -> redash-ingestor -> PostgreSQL -> Petyr
```

## Local app commands

```bash
npm install
npm run db:generate
npm run dev
```

## Environment

Petyr reads these AI settings from the environment:

```env
OPENROUTER_API_KEY=replace_me
OPENROUTER_DEFAULT_MODEL=openai/gpt-4.1-mini
```

`OPENROUTER_API_KEY` is used server-side by `/api/petyr/admin/openrouter-models` and must not be hardcoded or exposed to the browser.
`OPENROUTER_DEFAULT_MODEL` is the `/petyr-admin` fallback when no model setting has been saved.
Forecast Entry Monthly forecast exposes a CSM-facing `Generate Intelligence`
control to users with `petyr:forecast:write`. It calls OpenRouter only
server-side through the dry-run Forecast Intelligence path, renders validated
consultative JSON and does not expose apply controls, prompt payloads or
OpenRouter I/O diagnostics. Company Detail no longer exposes an Intelligence
section; any future company-level intelligence experience must be redesigned in
separate documented scope.
Management Objectives are controlled through Petyr Access Layer permission
`petyr:management:write`. The old temporary hardcoded password gate has been
removed; Forecast Entry no longer embeds the objective editor.

## Applying database schema changes

Petyr's Prisma schema lives in:

```txt
apps/forecasting-app/prisma/schema.prisma
```

After schema changes, regenerate the Prisma client:

```bash
npm run db:generate
```

To apply the current schema directly to a local PostgreSQL database, set `DATABASE_URL`
and run:

```bash
npm run db:push
```

Do not run raw `npx prisma db push` against the shared platform database. Petyr's
`db:push` script preserves Redash materialized latest tables while Prisma updates
the static Redash/Petyr tables.

For local/dev work where the Prisma client and local database should be brought
in sync before verifying the app, run:

```bash
npm run db:sync
npm run build
```

Or use the combined local/dev helper:

```bash
npm run build:sync
```

`build:sync` is intentionally separate from `build` so production and CI builds
do not run database-changing commands implicitly.

One-time 2026 closed revenue to Previous Month and Ongoing Forecast alignment:

Use `/petyr-admin` -> `2026 closed revenue alignment` when shell commands are unavailable. The admin control requires `APP_INTERNAL_SECRET`, runs dry-run first and applies only after explicit confirmation. CLI fallback:

```bash
npm run backfill:2026-ongoing-from-closed -- --dry-run
npm run backfill:2026-ongoing-from-closed -- --apply
```

This is an exceptional 2026 repair operation. It copies already closed Redash campaign revenue through the selected execution date into monthly `forecast_monthly` previous-month and ongoing rows with the same real value, plus annual `forecast_annual` rows used by Management View Ongoing Forecast. It must not become a recurring import, scheduler, CSM workflow or future-year workflow, and it must not update Initial Forecast fields, Redash materialized closed revenue, AI forecast cache or Management Objectives.

`/petyr-admin` Data Health also shows PostgreSQL-only Redash sync status for `master_campaigns`, `master_agreements` and `company_ownership`, includes a link to the Redash Ingestor dashboard at `/redash-ingestor`, and reports latest sync status, row counts, snapshot rows, materialized rows and latest error. When `company_ownership` is unavailable but real campaign/agreement/forecast rows exist, Petyr warns that real fallback rendering is active instead of showing mock customers. If `redash_raw_company_ownership_latest` is empty after a first deployment and `REDASH_INITIAL_SYNC_ON_BOOTSTRAP=false`, operators must run a manual Redash sync from `/redash-ingestor` or redeploy/bootstrap with `REDASH_INITIAL_SYNC_ON_BOOTSTRAP=true`; Petyr cannot invent the canonical CSM/Branch navigator without that materialized source.

AI preview backtest for calibration:

```bash
npm run backtest:ai-preview -- --as-of=2026-03-15 --year=2026 --months=5,6 --top-revenue --limit=10
```

The command is read-only. It selects the top companies by closed revenue through the selected as-of date, runs Petyr deterministic AI preview logic as of that date, and compares the requested future months with closed revenue currently available in PostgreSQL. It does not call OpenRouter and does not write `ai_forecast_cache`, CSM forecast tables, Redash materialized tables or audit tables.

Petyr Admin also exposes the same read-only calibration workflow in the `AI preview backtest` card. The card calls:

```txt
POST /api/petyr/admin/ai-preview-backtest
```

Send `x-app-secret: APP_INTERNAL_SECRET`. The default admin payload is `asOf=2026-03-15`, `year=2026`, `months=[5,6]`, `selection=top_revenue` and `limit=10`.

Nightly deterministic AI Forecast worker:

```bash
npm run worker:ai-forecast:once
npm run worker:ai-forecast:loop
```

The Docker Compose service `petyr-ai-forecast-worker` runs the loop every night
at `PETYR_AI_FORECAST_DAILY_TIME=02:00` in `Europe/Rome`, with
`PETYR_AI_FORECAST_DELAY_MS=3000` between active companies. It targets the
current Rome year, cleans numeric `ai_forecast_cache` rows for companies
explicitly marked inactive, excludes those inactive companies, computes the same
local deterministic preview rows used by Forecast Entry for active companies,
and saves them to `ai_forecast_cache` with daily model versions such as
`petyr_deterministic_preview_v1@YYYY-MM-DD`. It only calculates companies with
at least one agreement expiring after today and residual value greater than 0,
and it writes Business Unit rows only where that company has positive historical
closed revenue. `UX` source values normalize to the official `Experience`
Business Unit rather than `Other`. Repeated runs for the same company, Business
Unit, year, month and model version update the existing cache row instead of
skipping it. Excluding the current month from new writes does not clear an
already saved current-month cache row.
It does not call OpenRouter or
Forecast Intelligence, and it does not write CSM forecast, annual forecast,
management objective, Initial Forecast, closed revenue or Redash tables.
Petyr Admin records each manual or scheduled Daily AI Forecast run in
`petyr_performance_measurement` under operation `Daily AI Forecast run`, showing
duration, run source, selected/processed/failed company counts, saved/skipped
rows and the daily model version.
The Petyr Admin manual run reuses the deterministic Daily AI Forecast service
but runs without the inter-company delay so the browser request does not wait on
the scheduled worker pacing and hit an upstream proxy timeout.

Management View company revenue lifecycle:

Petyr stores company/year lifecycle rows in `company_revenue_lifecycle`, derived
from PostgreSQL-backed Redash closed campaign revenue for the selected year and
the two immediately previous years. `existing` means selected-year revenue plus
previous-year revenue, `reactivated` means selected-year revenue plus revenue two
years ago but no previous-year revenue, and `new_business` means selected-year
revenue with no revenue in either of the two previous years. Companies without
selected-year closed revenue keep a null lifecycle status. Management aggregate
cards expose filters for All company types, Existing, New business and
Reactivated. The Management UI labels the control as `Company Type Filter`,
keeps it in the top-right of the relevant aggregate cards and shares one
selected value across Monthly Aggregate, Yearly View, Business Unit View and
Single CSM View.

Petyr Intelligence scheduled worker:

```bash
npm run worker:intelligence:once
npm run worker:intelligence:loop
```

The Docker Compose service `intelligence-scan` runs the loop every day at
`INTELLIGENCE_SCAN_DAILY_TIME=03:00` in `INTELLIGENCE_SCAN_TIMEZONE=Europe/Rome`.
It defaults to disabled through `INTELLIGENCE_WORKER_ENABLED=false` and can be
enabled or disabled from `/petyr-admin/intelligence` with `APP_INTERNAL_SECRET`.
Real scans require `INTELLIGENCE_ENABLED=true`, `EXA_API_KEY`,
`OPENROUTER_API_KEY`, low run caps and the persisted daily provider request
budget. The worker writes only Intelligence tables and provider request logs; it
does not write Forecasting forecast tables or ask OpenRouter to analyze revenue,
margin, forecast values, campaign counts or numeric trends.

Management Objectives use:

```txt
GET /api/petyr/management-objectives?year=YYYY
POST /api/petyr/management-objectives
```

They require `petyr:management:write` and persist in `management_objective` and
`management_objective_change_log`.

Normal Forecast Entry monthly batch workflow uses:

```txt
GET /api/petyr/forecast-entry/batch?csmName=...
POST /api/petyr/forecast-entry/batch/save
GET /api/petyr/forecast-entry/monthly-export-xlsx?year=YYYY&csmName=...
```

The read endpoint requires `petyr:read`; the save endpoint and normal
`/forecasting/entry` page require `petyr:forecast:write`. The normal page defaults
to the current server month/year, exposes a CSM filter plus Month and Year controls with a same-row `Load` button, official Petyr
Business Units, active forecast cells for the loaded month, read-only Closed Revenue
YTD and one note per company. A company note can be saved without changing any
Business Unit forecast value or Active status; Petyr stores a normal save
session with the note and no Business Unit change-log rows, matching Company
Detail note-only logging. It includes an Active column immediately after
Company, with the same all/active/inactive visibility filter and row checkbox
interaction used by Annual Forecast Entry; Active changes persist to
`company_forecast_status` with save-session/change-log audit and clear numeric
AI Forecast cache rows when a company is set inactive. Monthly Business Unit groups start collapsed; the
Expand/Collapse control is rendered as a button at the right edge of the group
header. For past selected months, collapsed Business Unit groups show the
selected-month read-only `Closed Revenue` value instead of a forecast input.
For editable current and future selected months, Monthly uses Ongoing Forecast
as the active compact/editable field from the 15th of the month before the
selected month onward; future selected months before that cutoff use Previous
Month Forecast. When Ongoing Forecast is active and a company/Business Unit has
no saved Ongoing value yet, Monthly shows the saved Previous Month Forecast for
that same selected month as the Ongoing placeholder. Clicking or focusing the
cell accepts the placeholder through the same interaction used by AI Forecast
placeholders, and the user can still edit the value manually before saving.
When a Business Unit is expanded, Previous Month Forecast appears to the
left of Ongoing Forecast and the read-only closed revenue column remains to the
right of Ongoing Forecast, labelled `Closed Revenue` for past selected months
and `Closed Revenue YTD` otherwise. The Monthly Company header can sort the loaded portfolio by company
name ascending or descending. Each Monthly Business Unit header can sort the
visible rows from highest to lowest value for that Business Unit, using saved or
locally edited values when present and AI placeholder values when no CSM value
is saved. Monthly shows a highlighted portfolio-total row
directly under the table headers and above the first company row: the first cell
shows the all-Business-Unit active forecast total for editable/current or future
months and the all-Business-Unit Closed Revenue total for past selected months.
Each visible Business Unit column follows the same compact value, expanded
Business Units show separate Previous Month Forecast, Ongoing Forecast and
read-only closed revenue totals, and the Active and Note cells remain empty.
The Monthly portfolio-total row stays visible below the sticky table headers
while users scroll down the portfolio.
Each company row shows the company-level total of the currently active Business
Unit forecast values directly under the company name, replacing the previous
company-status label in that position. Monthly numeric Forecast Entry cells show integer values without
decimal cents, keep Italian thousands separators, are sized for values up to
eight digits plus separators and mute zero/empty cells in a softer grey. Monthly
table body rows use compact vertical padding and top-align cell content; saved
forecast labels and related AI Forecast references render on separate lines, with
the AI Forecast reference using the AI legend color. The Monthly table uses its own vertical scroll area: the CSM, Month,
Year and Load control row plus the legend stay sticky above it, while the
Monthly section title, period summary and editability notice scroll away.
Monthly table headers stay fixed at the top of the table while scrolling the
portfolio. Monthly saves use a floating bottom-right `Save`
button that remains visible while scrolling and turns green for five seconds
after an effective save. Pressing Enter inside an editable Monthly forecast
numeric cell triggers the same save flow and floating confirmation as the Save
button. Monthly data is loaded on the initial page render
through a portfolio-scoped batch read model. Changing the CSM dropdown reloads immediately; changing Month or Year updates the controls only until the user presses `Load`. Company lists use all Company
Ownership company-CSM workspace associations whose `workspace_updated_on` is
within the last 6 months, so one company can appear under multiple CSMs when
multiple recent workspace associations exist; if none are available, Petyr
falls back to the latest owner per company with diagnostics. Annual Forecast
Entry starts loading in the background as soon as the Monthly workspace is
usable, so the Annual tab shows already loaded data when available or a passive
loading/unavailable state while the request is still in progress. The old full single-company Forecast Entry workspace
is preserved at `/forecasting/entry/old` and requires `petyr:admin`.

Normal Forecast Entry annual batch workflow uses:

```txt
GET /api/petyr/forecast-entry/annual-batch?csmName=...&csmName=...&year=YYYY
POST /api/petyr/forecast-entry/annual-batch/save
GET /api/petyr/forecast-entry/annual-export-xlsx?csmName=...&csmName=...&year=YYYY
```

The annual section is a separate tab inside `/forecasting/entry`. It exposes a CSM multi-select and Year filter, and users can select one or more CSMs to view the combined company portfolio for all selected CSMs. It stays synchronized with Monthly Forecast Entry only when Annual has exactly one selected CSM; Monthly remains single-CSM when Annual has multiple selected CSMs. The Annual table shows the selected CSM filter year total as a highlighted portfolio-total row directly under the table headers and above the first company row, aligned to Forecast Initial, Forecast Ongoing, visible Business Unit, Closed Revenue YTD, Planned This Year and ratio columns; Active, Confidence and Logs stay empty on that total row. If the Active visibility filter is changed, the highlighted total row follows the visible rows. The Annual portfolio-total row stays visible below the sticky table headers while users scroll down the portfolio.

The Annual table uses its own vertical scroll area so only the full-width legend row and table header stay visible while users scroll down the portfolio; the section title, filters and Forecast Initial window notice scroll away above it. It keeps Company and Confidence visible during horizontal scroll, marks editable/manual-entry columns with a subtle background, displays the official `Experience` Business Unit as `UX` in Forecast Entry headers, sizes numeric cells for values up to eight digits plus separators, renders those numeric monetary values as integers without decimal cents, mutes zero/empty cells in a softer grey, uses compact vertical padding and top-aligns table body cell content. Saved/AI-confirmed labels and related AI Forecast references render on separate lines, with the AI Forecast reference using the AI legend color. Annual company rows show only the linked company name in the first column, without a company-level Forecast Ongoing total label or CSM label beneath it.

The annual table includes a legend-row button to collapse or show all Business Unit columns. Collapsed mode keeps only Active through Confidence plus Closed Revenue YTD through Logs visible. Annual headers can sort the visible rows by Company, Forecast Initial, Forecast Ongoing, Confidence and each visible Business Unit. Business Unit sorting orders rows from highest to lowest Forecast Ongoing value for that Business Unit, using saved or locally edited Forecast Ongoing values when present and AI placeholder values when no CSM value is saved. During the automatic January Forecast Initial entry window, each visible Business Unit has adjacent Forecast Ongoing and Initial Forecast columns. During the automatic December 10-31 preparation window or any manual Petyr Admin unlock outside January, each Business Unit starts with its Initial Forecast column collapsed behind the matching Forecast Ongoing column. The Forecast Ongoing header keeps the Business Unit name, Forecast Ongoing label and sort state together in the sortable control, with a separate per-Business Unit show/hide button immediately to its right; that column may widen slightly while the button is visible. When Forecast Initial is locked and no admin unlock is active, the per-Business Unit Initial Forecast columns and show/hide buttons are hidden while saved values remain available to Management. The Active column can filter the table to all, active only or inactive only without changing persisted status. It stores company + year Forecast Initial and Forecast Ongoing Confidence in
`forecast_annual_entry`, stores annual BU Forecast Ongoing values in `forecast_annual`, stores explicit BU Initial Forecast values in `forecast_annual.initial_forecast`, requires Confidence only when Forecast Ongoing BU values change without an existing confidence value, and
audits effective changes through `forecast_save_session` /
`forecast_change_log` with source `Annual Forecast Entry`. Annual saves use the same floating bottom-right `Save` button pattern and do not show separate top or bottom inline save buttons. Pressing Enter inside an editable Annual Forecast Initial, Forecast Ongoing Business Unit or Confidence field triggers the same save flow and floating confirmation as the Save button. Its read endpoint uses a portfolio-scoped PostgreSQL read model for the selected CSM/year instead of loading full Company Detail for each customer. After schema changes,
run `npm run db:sync` locally or apply the reviewed Prisma migration/deploy step
in managed environments.

Monthly and Annual Forecast Entry expose bottom-right `Export Excel` controls.
Monthly export creates one worksheet per month from January through the current
month for the current year, or all 12 months for other selected years. Annual
export includes all Annual Entry values and always includes per-Business Unit
Initial Forecast columns, even when those columns are hidden in the UI.

Management View exposes bottom-right `Export Excel` controls for Monthly
Aggregate, Business Unit View and Single CSM View. Each export downloads monthly
rows for the selected year and current Company Type Filter from the same
PostgreSQL-backed Management read model used by the UI:

```txt
GET /api/petyr/forecasting/management-export-xlsx?scope=monthly-aggregate&year=YYYY&lifecycle=all
GET /api/petyr/forecasting/management-export-xlsx?scope=business-unit&year=YYYY&lifecycle=all
GET /api/petyr/forecasting/management-export-xlsx?scope=single-csm&year=YYYY&lifecycle=all
```

Focused Annual Forecast Entry rules test:

```bash
npm run test:annual-forecast-entry
```

Petyr Admin monthly forecast Excel workflow uses:

```txt
GET /api/petyr/admin/export-monthly-forecast-xlsx?year=2026&csmName=...
POST /api/petyr/admin/import-monthly-forecast-xlsx
```

Excel is the recommended bulk admin format for 2026 historical input and CSM-friendly
forecast updates. CSV import/export routes remain available as legacy/advanced
compatibility.

Petyr Admin annual Forecast Ongoing Excel import uses:

```txt
POST /api/petyr/admin/import-annual-forecast-xlsx
```

The endpoint requires `petyr:admin`, accepts the 2026 annual workbook, supports
dry-run/apply from `/petyr-admin`, and reads only the Business Unit columns after
`FORECAST ONGOING` in `ITA_Andamento lavorato VS Forec`. The workbook
`Customer` column is the Petyr company key; `Company` is optional reference data
only. It writes
`forecast_annual.value` with `value_source=manual` and may mark companies
inactive when the aggregated workbook Forecast Ongoing total is zero. By
default, companies absent from the workbook are not changed. The unchecked
Petyr Admin checkbox can opt into marking canonical Company Ownership companies
absent from the workbook as inactive during dry-run/apply. It does not write
Forecast Initial, annual confidence, monthly forecast, Closed revenue, AI
forecast cache, Redash data or Management Objectives.

Petyr Admin inactive companies annual Forecast Ongoing Excel export uses:

```txt
GET /api/petyr/admin/export-inactive-companies-annual-forecast-xlsx?year=2026
```

The endpoint requires `petyr:admin` and exports all companies explicitly saved
as inactive in `company_forecast_status`, with selected-year saved annual
Forecast Ongoing totals and official Business Unit values from
`forecast_annual.value`. It is read-only and does not use Closed revenue,
monthly forecast, AI forecast, Forecast Initial, Redash data or Management
Objectives as revenue values.

Petyr Admin performance results use:

```txt
GET /api/petyr/admin/performance-results
```

The endpoint requires `petyr:admin` and reads `petyr_performance_measurement`.
Forecasting and Redash Ingestor write only sanitized operation measurements:
service, operation, status, duration, row count, measured time and small scalar
metadata. Browser DevTools timings, raw Redash payloads, workbook contents,
customer rows and secrets are not stored.

Petyr global feedback tickets use:

```txt
POST /api/petyr/feedback
GET /api/petyr/admin/feedback
PATCH /api/petyr/admin/feedback/[ticketId]
GET /api/petyr/admin/feedback/summary
GET /api/petyr/admin/feedback/export-xlsx
```

The floating bottom-left feedback button is available to authenticated users
with `petyr:read` or `petyr:feedback:manage`. It saves category, message, current page, authenticated user,
sanitized browser basics and the latest sanitized route/click/form-submit
activity. Review, status changes and Excel export require either
`petyr:feedback:manage` or `petyr:admin` and are available from
`/petyr-admin/feedback`. Eligible users see a `Review feedback` extension on the
global feedback control with the current open-ticket count. A grant containing
only `petyr:feedback:manage` is valid and lands directly on the feedback queue;
it does not grant Forecasting or other Petyr Admin access.

Petyr Admin database backup workflow uses:

```txt
GET /api/petyr/admin/database-backup/export
POST /api/petyr/admin/database-backup/import
```

Both endpoints require `petyr:admin` and `x-app-secret: APP_INTERNAL_SECRET`.
The workflow uses native PostgreSQL SQL dumps so a new server can restore the
shared PostgreSQL data hub, including Redash snapshots/metadata, materialized
tables and Petyr-owned forecast data. Restore can drop/recreate database objects
from the dump and is intended only for server migration or controlled recovery,
not as the production backup policy. The production standard is documented in
`docs/08_operational_commands.md` and is owned at platform level: host/Coolify
backup, encrypted offsite copy, daily retention for 5 days, weekly retention for
3 weeks, RPO 24 hours, target RTO 8 hours and no v1 PITR.

Initial Forecast is owned by the Annual Forecast Entry workflow inside normal
`/forecasting/entry`. Forecast Initial is editable from December 10 of year N-1
through January 10 of year N, then read-only unless Petyr Admin unlocks the
selected target year. When unlocked, normal users with `petyr:forecast:write`
can enter or edit Forecast Initial from Annual Forecast Entry at any time of the
year. Annual Entry stores the company total in
`forecast_annual_entry.initial_forecast` and the per-Business Unit Initial
values in `forecast_annual.initial_forecast`. Those BU Initial values are
entered in explicit BU Initial Forecast columns while the window is open or
admin-unlocked; saving Forecast Ongoing BU values does not implicitly write
Initial Forecast. A Forecast Initial value typed in the Initial column is
preserved as Initial and is not replaced by existing Forecast Ongoing values;
later Ongoing Forecast updates change `forecast_annual.value` without changing
Initial Forecast when the year is locked.

Petyr Admin Forecast Initial window override uses:

```txt
GET /api/petyr/admin/initial-forecast-window
PUT /api/petyr/admin/initial-forecast-window
```

Both endpoints require `petyr:admin`. The override is stored in `app_setting`
under `petyr_initial_forecast_window_overrides_v1`; PUT accepts
`{ "year": YYYY, "unlocked": true|false }`.

The old Initial Forecast Excel export/import endpoints and protected
consolidation endpoint have been removed from the product API. The legacy
`forecast_annual_snapshot` tables are deprecated historical storage and are not
used by product read paths.

For migration-managed development, create a migration instead:

```bash
npx prisma migrate dev --name add_petyr_forecasting_schema
```

Then verify the app still builds:

```bash
npm run build
```

When running this app directly with `npm run dev`, open the port printed by Next.js and visit `/forecasting`.

## Docker usage

In the full data platform, Petyr should be started from the root `docker-compose.yml`, not from this folder alone.

Expected local gateway URLs when orchestrated by root compose:

```txt
http://localhost:8080/forecasting
http://localhost:8080/petyr-admin
```

The direct Compose port `http://localhost:3001/forecasting` remains a local/debug convenience, but the user-facing route is the gateway on port `8080`.

## Access Layer preparation

Petyr is prepared to consume the external Access Layer Google SSO protocol without bundling or deploying the Access Layer service itself.

Local development stays open by default:

```env
NODE_ENV=development
PETYR_AUTH_MODE=disabled
```

In this mode Petyr uses a deterministic local identity, `dev.petyr@local`, with all Petyr MVP permissions so developers can continue using `/forecasting`, `/petyr-admin` and local APIs without login.

Production must fail closed through Access Layer:

```env
PETYR_AUTH_MODE=access-layer
ACCESS_LAYER_PUBLIC_BASE_URL=https://access-layer.draftapps.it
ACCESS_LAYER_INTERNAL_BASE_URL=https://access-layer.draftapps.it
ACCESS_LAYER_CALLBACK_URL=https://petyr.unguess-internal.net/auth/callback
ACCESS_LAYER_TOOL_SLUG=petyr
ACCESS_LAYER_CLIENT_ID=replace_with_petyr_tool_client_id
ACCESS_LAYER_CLIENT_SECRET=replace_with_petyr_tool_client_secret
PETYR_SESSION_SECRET=replace_with_long_random_session_secret
```

Petyr implements only the tool-side flow: `/auth/login`, `/auth/callback` and `/auth/logout`. The Access Layer service remains external and must register the `petyr` tool with the callback URL above. If a company-domain user completes Access Layer authentication but the returned grant does not include `petyr:read`, Petyr clears the local auth state and session cookies, then shows an Italian pending-access fallback telling the user that the administrator has been notified and to refer to Lorenzo Brandi for access timing. After the grant is released, the user should return through `/auth/login` and receive a fresh clean session.
