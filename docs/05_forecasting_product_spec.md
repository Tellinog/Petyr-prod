# Forecasting product spec

## Product goal

Create a forecasting workspace for UNGUESS that helps CSMs and management understand:
- expected monthly revenue;
- closed revenue;
- agreement residuals;
- customer-level trends;
- business unit distribution;
- forecast accuracy;
- risk signals.

## Users

### CSM

Needs:
- see assigned companies;
- understand active agreements;
- see monthly campaign/revenue history;
- enter or revise forecast;
- add notes;
- understand risks.

### Management / C-level

Needs:
- see total forecast;
- compare AI forecast, CSM forecast and closed revenue;
- track accuracy;
- analyze trends by business unit;
- detect risks early.

## MVP pages

### `/forecasting`

Company-level workspace.

The management-approved visual rendering is data-bound through:

```txt
apps/forecasting-app/src/services/petyrApprovedRenderingAdapter.ts
```

The adapter reads Petyr PostgreSQL services and passes serializable props into
`PetyrMVPRendering.tsx`. If Redash materialized data or field mappings are
missing, `/forecasting` must show diagnostics/empty values instead of silently
falling back to illustrative mock data. When company ownership is empty or
incomplete but real PostgreSQL campaign, agreement or forecast rows exist,
Management View, CSM Overview and Company Detail must render those real rows with
fallback CSM attribution and Branch `Unassigned Branch`; the diagnostics are
warnings, not blocking issues.
On `/forecasting`, rendering diagnostics for admins must stay available through
a compact fixed bottom-right `Data diagnostics` menu instead of occupying the
main Management View dashboard body. Blocking issues and warnings must be
grouped and counted in the menu, and the menu must link to `/petyr-admin` Data
Health. The floating diagnostics menu and its operator links are visible only to
users with `petyr:admin`.

`/forecasting` may render a lightweight shell immediately after page permission checks and then refresh PostgreSQL-backed rendering data through protected API route `GET /api/petyr/forecasting/rendering-data`. The endpoint accepts optional `view=management|csm|csm-scoped|all` and `year=YYYY`: on normal app open the browser must request Management first, mark the workspace usable when Management data arrives, then start Forecast Entry Monthly/Annual warmup for users with `petyr:forecast:write`; admin users also start scoped CSM Overview preload for the authenticated/preferred CSM. It must not hydrate `view=all` as the immediate second step after Management. During the Management refresh, Petyr must show only the shared workspace header, section navigator and an in-page loader labelled `Updating data ongoing`, so users know Branch, CSM and Business Unit Management data is updating before the dashboard appears. Forecast Entry Monthly/Annual warmup is best-effort and available for users with `petyr:forecast:write`. The shell and partial view payloads are only temporary rendering states: final Management and CSM data must still come from PostgreSQL-backed Petyr services, diagnostics must remain visible to admins, and Forecasting must not call Redash directly. Company Detail remains on-demand and should load only the selected company/year rather than preloading every company from `/forecasting`.

The Petyr workspace shell must be shared across Management View, CSM Overview, Company Detail and Forecast Entry: one descriptive header card, one section navigator and route-aware links. The header card title and supporting copy must describe what the active view offers, so users can understand the page immediately. CSM Overview is temporarily in development and must be visible/accessible only to users with `petyr:admin`; non-admin users must not see its navigator item, must stay on Management when requesting `?view=csm`, and must not receive CSM Overview rendering payloads. For admins, the top-level workspace switches Management/CSM through `?view=management|csm`; Company Detail and Forecast Entry use dedicated routes with query parameters when context is available.

Petyr must provide branded fallback pages for browser-visible errors. Unknown
routes must render a structured Petyr 404 page, browser bad-request flows must
render a structured 400 page, and runtime application failures must render a
structured 500 page. These pages must use the Petyr/UNGUESS visual language and
offer a clear action back to `/forecasting`. API endpoints keep their JSON error
contracts.

The top-level `/forecasting` menu must send users directly to the complete
operational routes for Forecast Entry and Company Detail. It must not render
partial preview tabs that look like the complete editing/detail workspaces.
When company/CSM/year/month context is available from the dashboard data, links
to `/forecasting/entry` and `/forecasting/company/[companyName]` should include
query parameters that prefill the dedicated route context.

When Petyr has an authenticated Access Layer identity whose `displayName`
normalizes to exactly one canonical Company Ownership CSM name, CSM filters in
Petyr workspaces should use that CSM as the initial non-binding default. Query
parameters and later user changes take precedence. If the Access Layer display
name does not match, or matches ambiguously after trim/case/space/accent
normalization, Petyr keeps the existing default filter behavior. This is a UI
preselection only; it does not introduce row-level access restrictions, new
permissions, schema changes or email-based CSM mapping.

Forecast Entry uses the shared workspace header as the only page title. Its
CSM/company navigator stays sticky during editor scroll, and the company
previous/next control must not repeat the selected CSM name.

Columns:
- Company;
- CSM;
- campaigns count;
- agreements count;
- current year revenue;
- active agreements count;
- residual agreement value;
- last campaign end date;
- data quality status.

The company-level Petyr data service lives in:

```txt
apps/forecasting-app/src/services/petyrDataService.ts
```

It reads from PostgreSQL materialized Redash latest tables and Petyr forecast tables.
Company Detail campaign display names use
`redash_raw_master_campaigns_latest.customer_title`, while the UI label remains
`Campaign name`.
When materialized Redash columns cannot be resolved through `redash_column_mapping`,
the service returns diagnostics and keeps the UI on a safe fallback path.

Current service read models:
- `getManagementView(year)`;
- `getCsmOverview(csmName, year)`;
- `getCsmOverviewWorkspace(year)`;
- `getCompanyDetail(companyName, year)`;
- `getForecastEntryContext(csmName, companyName, year, month)`;
- `getBusinessUnitSummary(year)`.

CSM Overview is read-only. It is populated through `getCsmOverviewWorkspace(year)`
from PostgreSQL materialized Redash latest tables plus Petyr forecast tables. It shows
assigned companies, current month, next month, an optional third selected month,
CSM forecast by Business Unit, AI forecast by Business Unit and relevant insights.
Relevant insights are computed from real company data for forecast update reminders,
agreements expiring within 60 days, high agreement residuals and Business Units below
historical pace. Inactive-company and locked-past-month/past-month-logged categories
must not appear in CSM Overview relevant insights. Opening a relevant insight shows at
most the first four affected rows by default, with an explicit control to expand all
affected rows when there are more. Company names inside the affected list link to
Company Detail. Company cards link to company detail; forecast/action cards link to
the related company or Forecast Entry. The Client View includes a company filter next
to the optional third-month selector. Its description states once that the view is
read-only and edits happen in Forecast Entry; individual month cards do not repeat
that copy. Within each company card, the active agreement title, total agreement
value, residual and expiry date are shown as one combined agreement evidence chip,
and the CSM chip is omitted because the CSM scope is already selected in the page
filter. Inline forecast editing is not allowed here. Agreement expiry relevant
insights must include only agreements whose expiry date is
greater than or equal to today and less than or equal to today plus 60 days; already
expired agreements can remain visible in Company Detail as historical/status data but
must not appear in operational expiring-soon actions. High residual operational alerts
use active, non-expired agreement residual values. High residual affected-company
evidence must use the active residual agreement expiring closest to today, showing
that agreement's total value, residual, expiry and deal link when available instead
of a current-month chip.
Expired agreements with residual value must appear, when implemented, in a separate
informational/operational category named `Expired agreement with residual`, showing
the residual value and not mixed with `expiring within 60 days`.

Rule-based Petyr alerts live in:

```txt
apps/forecasting-app/src/services/petyrAlertService.ts
```

They are deterministic and do not use an LLM. Alerts read PostgreSQL-backed Petyr
read models and cover agreement expiry within 60 days, high residuals, inactive
companies, missing forecast updates, locked past months, closed revenue under forecast,
CSM forecast materially below AI forecast and Business Units below historical pace.
CSM Overview and Company Detail can display each alert with severity, evidence,
suggested action and a target link. CSM Overview hides inactive-company and locked
past-month alerts from its CSM-facing alert list.

Monthly Forecast Entry editability is centralized in:

```txt
apps/forecasting-app/src/lib/forecastEntryMode.ts
```

The helper returns whether the selected month is editable, the only editable
monthly forecast type (`previous_month` or `ongoing`), and a lock reason.
Past months, AI forecast values and closed revenue are never editable. The internal
diagnostic endpoint is:

```txt
GET /api/petyr/forecast-entry-mode-diagnostics
```

These read models use `redash_raw_master_campaigns_latest`,
`redash_raw_master_agreements_latest`, `redash_raw_company_ownership_latest`,
`forecast_monthly`, `forecast_annual`, `company_forecast_status` and
`ai_forecast_cache`. They do not call Redash and
do not read `RedashSnapshot.payload` directly.
Numeric `ai_forecast_cache` reads must use only the columns needed for forecast
math and display: company, Business Unit, year, month, forecast value,
confidence score, model version and generation timestamp. Heavy Forecast
Intelligence fields such as explanation, request payload summary, validated
output and error message must stay out of Management/CSM/Company Detail numeric
read paths. If the numeric AI cache read fails, Petyr must continue rendering
with empty AI rows and a diagnostic warning instead of treating the whole
PostgreSQL read model as empty.

### `/forecasting/entry`

Dedicated Forecast Entry workspace for CSMs, split into separate Monthly and
Annual sections.

Normal `/forecasting/entry` requires `petyr:forecast:write` and is accessible to
users who can write CSM forecasts. It no longer shows the old full single-company
editor. The Monthly section defaults to the current server month/year, exposes
a CSM filter plus Month and Year controls, and renders the selected CSM's companies in one batch table. Changing CSM reloads immediately from the CSM dropdown; changing Month or Year requires pressing the same-row `Load` button.
The Annual section is separate, exposes CSM and Year filters, and renders the current annual portfolio for the selected annual cycle. The Monthly and Annual CSM selectors stay synchronized: changing either selector reloads the other section to the same selected CSM when both sections are loaded.

Normal Forecast Entry must not expose a company filter, Forecast Intelligence,
deterministic preview, apply AI forecast, import/export, diagnostics or admin
tools. Those remain outside the normal CSM batch workflow.

The old full Forecast Entry experience is preserved as an admin-only legacy route:

```txt
/forecasting/entry/old
```

The legacy route requires `petyr:admin` and may continue to render the old
single-company editor, Monthly Forecast, Annual Forecast, Forecast Intelligence,
company selector, active/inactive toggle, AI/admin support tools and change
history.

The normal batch page is the only non-admin area where monthly CSM forecast
values can be edited. It reads CSM options, selected monthly target year/month, official
Business Units, CSM-owned companies, Redash-derived Closed Revenue,
previous-month forecast, ongoing forecast and AI forecast reference metadata
through:

```txt
GET /api/petyr/forecast-entry/batch
```

The batch read endpoint requires `petyr:read`. It must use a portfolio-scoped PostgreSQL read model for the selected CSM and selected monthly target period, not one full per-company Forecast Entry context read per customer.

Annual Forecast Entry reads the selected annual portfolio, annual year options, official Business
Units, customer active status, customer + year metadata, saved annual BU values,
AI annual placeholders, selected-year Revenue, selected-year Planned, derived
percentages and Company Detail history links through:

```txt
GET /api/petyr/forecast-entry/annual-batch?csmName=...&year=YYYY
```

The annual batch read endpoint requires `petyr:read`. It must use a portfolio-scoped PostgreSQL read model for the selected CSM and year, not one full Company Detail read per customer. The normal Forecast Entry page should load Monthly on initial render and start Annual Forecast Entry loading in the background as soon as the Monthly workspace is usable. Opening the Annual tab should either show already loaded data or a passive in-progress/unavailable state, not a separate manual load flow.

The legacy single-company read endpoint remains available for the admin-only old
workspace:

```txt
GET /api/petyr/forecast-entry
```

`/forecasting/entry` remains directly navigable. Optional `csmName` can preselect
the CSM. Optional `year` can preselect the Annual Forecast Entry year. Optional
`month`, together with `year`, can preselect the Monthly Forecast Entry period.
Company query parameters are ignored by the normal page because the normal workflow is CSM batch entry, not single-company editing.

Forecast Entry uses the shared Petyr workspace shell. The shared workspace header
must expose a top-right `?` help control in every workspace section and link to
the dedicated `/forecasting/entry/faq` page, with visible `FAQ` text next to the
question mark. The FAQ page explains Forecast Ongoing, Previous Month Forecast,
Forecast Initial, logs, input deadline windows, forecast urgency ordering,
monthly editability, deterministic preview, baseline calculations, residual
pressure, rule-based alerts and Forecast Intelligence boundaries without changing
formulas or persistence behavior. It must keep the same four-section workspace
header/navigation available so users can continue navigating.

Normal batch table rules:
- rows are companies/customers associated to the selected CSM through
  Company Ownership workspaces updated in the last 6 months; a company may
  appear under more than one CSM when multiple recent company-CSM associations
  exist;
- the first column is the company name linked to Company Detail for the current year;
- columns are grouped by the 10 official Petyr Business Units only;
- each Business Unit starts collapsed and shows only the active editable field;
- the Business Unit Expand/Collapse control must look actionable as a button and sit at the far right of the Business Unit group header;
- the Monthly table must use its own vertical scroll area; the CSM, Month, Year
  and Load control row plus the legend stay sticky above it, while the Monthly
  section title, period summary and editability notice scroll away. Monthly
  table column headers stay fixed at the top of the table while the user scrolls
  down the portfolio;
- days 1-15: active field is Previous Month Forecast;
- from day 16: active field is Ongoing Forecast;
- the inactive monthly forecast field and Closed Revenue YTD are visible only when a BU is expanded;
- in expanded Business Unit groups, Previous Month Forecast is shown to the left of Ongoing Forecast and Closed Revenue YTD is shown to the right of Ongoing Forecast;
- editable monthly forecast columns should be wide enough for their header labels;
- Closed Revenue YTD is always read-only;
- each company has one note field;
- one floating bottom-right `Save` action saves all company updates, stays visible while scrolling, and turns green for five seconds after an effective save.

AI suggestion behavior:
- saved CSM values display as saved forecast values;
- when the active field has no saved CSM value but has an AI forecast, the AI value is displayed only as a placeholder/suggestion;
- focusing or clicking the AI placeholder copies it into the input and marks it as CSM validated from AI;
- changing a value marks it as manually edited;
- untouched AI placeholders are never saved as CSM forecast values.

The save endpoint is:

```txt
POST /api/petyr/forecast-entry/batch/save
```

The batch save endpoint requires `petyr:forecast:write`.

The annual save endpoint is:

```txt
POST /api/petyr/forecast-entry/annual-batch/save
```

The annual save endpoint requires `petyr:forecast:write`.

Annual Forecast Entry rules:
- Year options start at 2026, include at least 2026 and 2027, and progressively
  include the next year as time advances.
- The default year is the current year until December 9, switches to the next
  year from December 10 through December 31, and becomes the new current year on
  January 1.
- rows are all companies/customers associated to the selected CSM through
  Company Ownership workspaces updated in the last 6 months; a company may
  appear under more than one CSM when multiple recent company-CSM associations
  exist;
- ordering is active customers first, then inactive customers with Revenue or
  Planned, then inactive customers without Revenue or Planned;
- inactive rows remain visible with muted styling;
- customer names link to Company Detail; the Logs action opens Company Detail
  at the company logs anchor in a new tab and is labelled `See latest logs of <company>`;
- the Annual table uses its own vertical scroll area so only the legend row and
  table headers stay visible while users scroll down the portfolio; the section
  title, filters, selected-CSM annual summary and Forecast Initial window notice
  scroll away above the table, and the Customer and Confidence columns remain
  visible during horizontal scroll;
- a button to the right of the legend collapses or shows all Business Unit columns,
  so the collapsed table shows only Active through Confidence and Closed Revenue YTD through Logs;
- editable/manual-entry columns use a subtle manual-entry background to distinguish
  CSM-entered or to-be-entered values from consolidated/read-only data;
- active status is a manual toggle persisted through `company_forecast_status`;
- Forecast Initial is stored in `forecast_annual_entry.initial_forecast`, editable only
  from December 10 of year N-1 through January 10 of year N, and read-only
  outside that window unless Petyr Admin has unlocked the selected target year;
- Forecast Ongoing Confidence is stored in
  `forecast_annual_entry.ongoing_confidence`, accepts only `01 High`, `02 Mid`
  and `03 Low`, and is required when a row is modified;
- Business Unit values use all official Petyr Business Units and are stored in
  `forecast_annual` with `value_source=manual` or `value_source=ai_confirmed`;
- AI placeholders are displayed from cached AI forecast values but are not saved
  and do not contribute to Forecast Ongoing until the CSM clicks/focuses or edits the
  value;
- Forecast Ongoing is derived as the sum of saved/confirmed BU values, not from the
  old Excel BU formula;
- a compact horizontally scrollable summary row above the legend and table shows
  the selected CSM total forecast for the selected year plus one total for each
  official Business Unit, using the same live Annual Entry values shown in the table;
- Closed Revenue YTD is selected-year campaign revenue closed through today, read from
  PostgreSQL-backed materialized data;
- Planned This Year is selected-year campaign revenue with end date from tomorrow through
  December 31 and status `Setup`, `Recruiting` or `Running`, read from the same
  PostgreSQL-backed materialized data for this Annual Entry workflow;
- percentages are labelled `Revenue / Forecast Ongoing`, `Planned / Forecast Ongoing`, and
  `Uncovered / Forecast Ongoing`, with `n/a` when Forecast Ongoing is zero or missing;
- each effective annual save creates `forecast_save_session` and
  `forecast_change_log` audit rows with source `Annual Forecast Entry`;
- annual saves reject unconfirmed placeholders, negative/non-numeric BU values,
  Forecast Initial changes outside the edit window, unknown Business Units and missing
  confidence on modified rows.
- the Annual section uses the same floating bottom-right `Save` action pattern as
  Monthly Forecast Entry; inline top or bottom save buttons must not be shown in
  the normal Forecast Entry workflow.

Batch save rules:
- selected month/year is validated server-side;
- editability is validated with `getForecastEntryMode`;
- only the currently editable monthly forecast type is accepted;
- official Petyr Business Units are required;
- Closed Revenue, inactive forecast fields and AI suggestions are read-only unless the CSM explicitly validates or edits the active value;
- each company update may include one company note and active Business Unit values with source metadata such as `accepted_ai` or `manual_edit`;
- note-only company updates are rejected with a clear error;
- one effective company update creates one `forecast_save_session`;
- one modified Business Unit creates one `forecast_change_log` row;
- no synthetic/no-op change logs are created;
- submitted values are upserted into `forecast_monthly`;
- AI suggestions are not saved unless accepted or edited by the CSM;
- `aiForecastValue` and `aiForecastValueAtSave` follow the same snapshot semantics as the single-company save path.

The legacy single-company save endpoint remains available for the admin-only old
workspace:

```txt
POST /api/petyr/forecast-entry/save
```

Save rules:
- editability is validated with `getForecastEntryMode`;
- past months are locked;
- only the currently editable monthly forecast type is saved;
- closed revenue and AI forecast values are read-only;
- one save creates one `forecast_save_session`;
- one modified Business Unit creates one `forecast_change_log` row;
- submitted values are upserted into `forecast_monthly`;
- if at least one submitted monthly forecast value differs from the current saved value,
  the save requires a non-empty CSM note and blank/whitespace notes are rejected;
- the save note is stored on the save session;
- company active/inactive status is stored in `company_forecast_status` and
  snapshotted on the save session.

One-time 2026 closed-revenue alignment:
- Petyr has an explicit DB-only script for the exceptional 2026 alignment requested by product;
- execution surface: `/petyr-admin` contains a protected `2026 closed revenue alignment` section with dry-run and apply buttons that call `/api/petyr/admin/backfill-2026-ongoing-from-closed` using `APP_INTERNAL_SECRET`;
- fallback command: `npm run backfill:2026-ongoing-from-closed -- --dry-run`, then `npm run backfill:2026-ongoing-from-closed -- --apply` after reviewing the JSON preview;
- it copies already closed 2026 Redash campaign revenue through the selected execution date into monthly `forecast_monthly` rows with both `forecast_type=previous_month` and `forecast_type=ongoing`, keeping the two monthly forecast values equal to real closed revenue for those months, and into `forecast_annual` rows that feed Management View Ongoing Forecast;
- it is not a recurring feature, not a CSM workflow, not an import workflow and not a future scheduler;
- it must not update Initial Forecast fields, Redash materialized closed revenue, AI forecast cache or Management Objectives.

Petyr Admin Data Health must expose a PostgreSQL-only `Redash sync status` section for `master_campaigns`, `master_agreements` and `company_ownership`, showing source enabled state, latest sync status, run rows, finish time, error message, latest snapshot rows and materialized table rows. Forecasting app must not call Redash directly for this status.

Forecast Entry also contains the annual forecast workflow for the selected
company and year. It reads and writes Petyr-owned `forecast_annual` rows through:

```txt
GET /api/petyr/annual-forecast
POST /api/petyr/annual-forecast/save-draft
POST /api/petyr/annual-forecast/consolidate
```

Annual forecast rules:
- granularity is company + Business Unit + year;
- past years are read-only;
- the current year is consultative and shows closed revenue/progress against annual values;
- future years can be saved as draft;
- consolidation is a separate explicit action;
- only the next year can be consolidated, and only from December 15 through December 30;
- consolidated rows store `consolidated_by` and `consolidated_at`;
- consolidated rows are read-only unless the request is made by an admin.

Initial Forecast rules:
- Annual Forecast Entry is the canonical Initial Forecast workflow.
- Forecast Initial is entered during the Annual Entry window from December 10 of
  year N-1 through January 10 of year N.
- Petyr Admin may unlock Forecast Initial for a selected target year at any
  time. While a target year is admin-unlocked, normal users with
  `petyr:forecast:write` can enter or edit Forecast Initial through Annual
  Forecast Entry outside the default window.
- `forecast_annual_entry.initial_forecast` stores the company/year Initial
  Forecast total.
- `forecast_annual.initial_forecast` stores the company + Business Unit + year
  Initial Forecast values used by Business Unit, Management and Company Detail
  views.
- During the Forecast Initial window, saved Annual Entry Business Unit values
  also populate the matching per-Business Unit Initial Forecast values, and the
  company/year total is derived as their sum.
- From January 11 onward, Forecast Initial is read-only unless the selected
  target year is admin-unlocked; later Annual Entry changes update Ongoing
  Forecast in `forecast_annual.value` without changing the Initial Forecast
  fields when the year is locked.
- The legacy Initial Forecast Excel import/export, snapshot read path and
  scheduler/consolidation endpoint are deprecated and removed from the product
  API.

Management Objectives live at the bottom of Management View for users with
`petyr:management:write`. The legacy direct route remains available as a
management-only compatibility route:

```txt
/forecasting/entry/objectives
```

Suggested section name:

```txt
Management Objectives
```

This area is not monthly CSM forecast editing. It is for annual Branch and
Business Unit objectives entered by management. Objective management has already
been added/configured for the current MVP; do not add new objective tasks unless
they address a specific bug. The objective page and API are protected by
`petyr:management:write`; the old temporary hardcoded password gate is no longer
used. Forecast Entry Annual Forecast remains the CSM-owned annual forecast and
does not embed Management Objectives.

The objective API routes are:

```txt
GET /api/petyr/management-objectives?year=YYYY
POST /api/petyr/management-objectives
```

Persistence:
- current values are stored in `management_objective`;
- every save writes `management_objective_change_log`;
- `updated_by` currently uses a placeholder until Petyr has authenticated manager identities.

Validation:
- `scope_type` accepts only `branch` or `business_unit`;
- Business Unit scope keys are limited to the official closed list;
- Branch scope keys must be present in Company Ownership `company_branch`, with `Unassigned Branch` allowed as the fallback Branch label;
- `year` must be an integer between 2000 and 2100;
- `value` must be numeric and greater than or equal to 0.

### `/forecasting/company/[companyName]`

Company detail.

Company Detail uses the shared Petyr workspace shell and remains read-only for data edits. It must expose the Forecast Entry-style navigator for CSM filter, company selection, previous/next company and year load, using the same Forecast Entry company ordering. The year/load control appears to the left of previous/next company navigation; the previous/next helper must not repeat the CSM name. It must not expose the manual AI Forecast apply action, numeric AI Forecast generation or the CSM-facing `Intelligence` section. Company Detail must not load or render the Forecast Intelligence sentinel row for the selected company/year. Any future company-level intelligence experience belongs to separate documented scope.

Sections:
- Forecast Entry-style navigator with CSM filter, company selection, year/load on the left, and previous/next company navigation without repeating the CSM name;
- read-only company summary with company name, assigned CSM context and an explicitly labelled Forecast status badge next to the Forecast Entry link;
- primary KPI cards for Total agreement, Closed revenue YTD, Agreement residual and total Initial Forecast for the selected year;
- active agreements, agreement value, agreement residual and agreement expiry date;
- monthly revenue trend;
- revenue by Business Unit, including closed-revenue bars, gray Initial Forecast markers and Previous-month forecast markers colored green when above Initial Forecast, yellow when below it and neutral when aligned;
- Business Unit current-year view showing Business Unit totals with Ongoing Forecast, AI Forecast and Closed Revenue YTD; users can expand a Business Unit to show the individual selected-year months with closed revenue, previous-month forecast, ongoing forecast and AI Forecast;
- relevant company insights, showing only active rule-based insight categories and omitting zero-count categories;
- company note form below Business Unit current-year view and above Relevant company insights, saving note-only company log entries without opening Forecast Entry or changing forecast values;
- campaign detail table with campaign name, status, Business Unit, agreement, value, costs, GM% and campaign link; by default it shows the latest chronologically completed campaign plus running or planned campaigns, while all other campaigns are available behind an explicit expansion control;
- agreement table showing only agreements whose expiry date is after the moment of viewing by default, while expired or undated agreements remain available behind an explicit expansion control;
- Company logs grouped by save session or company note, placed directly below Agreements and residual evidence, showing the latest three logs by default with an explicit expansion control for previous logs;
- company active status;
- admin-only Revenue by Business Unit detail, Monthly forecast rows, Annual forecast rows and AI forecast cache support tables.

This page reads PostgreSQL through `getCompanyDetail(companyName, year)` and does not
call Redash directly. Forecast editing belongs only in `/forecasting/entry`;
Company Detail must render these values read-only and link to Forecast Entry for
monthly forecast edits.

Company Detail Data diagnostics must be available through the fixed bottom-right menu and not as a support card in the body.
Company Detail Data diagnostics must be visible only to users with
`petyr:admin`.

The Revenue by Business Unit section must use only `getCompanyDetail` data derived
from PostgreSQL materialized Redash/Petyr tables. It reads Initial Forecast from
Annual Forecast Entry data: company/year totals in `forecast_annual_entry` and
per-Business Unit values in `forecast_annual.initial_forecast`. If no closed
revenue or forecast values exist for the selected year, the chart area must show
a diagnostic empty state instead of placeholder values. Planned future values,
when available, remain visible in the table.

Agreement links:
- Master Agreements has no usable agreement link;
- agreement/deal links must be derived from the first deterministic linked Master Campaigns deal link;
- if no linked campaign deal link exists, show `n/a`.

### `/forecasting/management`

Management view.

Sections:
- read-only yearly view;
- read-only monthly aggregate view;
- aggregates by Branch, Business Unit and CSM;
- trend of Petyr forecast, Redash closed revenue and closed revenue plus planned;
- revenue mix by Business Unit;
- risk breakdown.
- Management Objectives for users with `petyr:management:write`;
- admin-only Top 4 positive trends and Top 4 negative trends.

Management metrics:
- Branch Yearly Objective comes only from annual Branch objectives entered by management;
- Business Unit Yearly Objective comes only from annual Business Unit objectives entered by management;
- Branch objectives use the dynamic Branch list from Company Ownership `company_branch`;
- Business Unit objectives use only the official closed Business Unit list;
- if a Branch or Business Unit objective is missing, percentage cells show `n/a` and diagnostics report the missing objective;
- Initial Forecast is the frozen annual baseline for the selected year and aggregate scope; it comes from Annual Forecast Entry, with the default December 10-January 10 entry window and an optional Petyr Admin per-year unlock;
- Ongoing Forecast is the current/latest annual forecast for the selected year and aggregate scope;
- if the frozen Initial Forecast baseline is missing, Management View shows `n/a`;
- Closed revenue YTD comes from Redash campaign revenue rows through the current date;
- Closed revenue + planned adds campaign revenue with campaign end date from tomorrow through year end only when `isValidPlannedFutureCampaign(...)` classifies the campaign status as planned future;
- planned future campaign statuses are a closed allowlist: `Setup` and `Recruiting`;
- `Running`, `Completed`, `Aborted`, `Cancelled`, `Canceled`, `Deleted`, `Rejected`, `Lost`, `Archived` and unknown/missing statuses are excluded from planned future; unknown/missing statuses are diagnosed and require a later business decision before inclusion;
- forecast values are not used for planned-through-year-end and must not be confused with Yearly Objective.

Objective rules:
- Petyr must not invent Branch or Business Unit objectives;
- Petyr must not use annual forecast values as objectives;
- Petyr must not derive objectives from Redash, closed revenue, planned campaigns or AI forecast;
- every objective update must be auditable with scope type, scope key, year,
  previous value, new value, note, updated by and timestamp.

CSM percentage rule:
- CSM percentages use a dedicated CSM yearly objective only when one is explicitly configured;
- if no CSM yearly objective exists, percentage cells show `n/a`;
- Petyr must not create a fake CSM target from monthly forecasts, closed revenue or planned campaigns.

Management UI copy/layout cleanup:
- the aggregate-mode selector must not describe the monthly/yearly options as being under product evaluation;
- Monthly Aggregate, Business Unit View and Single CSM View must avoid repeated section titles, low-value explanatory descriptions and non-actionable badges;
- Revenue per Business Unit keeps the three-year Business Unit comparison but separates chart evidence from numeric values: the upper area shows axes, closed-revenue bars and forecast markers, while the lower area shows numeric Closed revenue, Initial Forecast and Previous-month forecast values;
- Revenue per Business Unit closed-revenue bars use the same color as the Current year trend Closed revenue series; Initial Forecast markers are gray; Previous-month forecast markers are green when above Initial Forecast and yellow when below.

### `/petyr-admin`

Temporary internal admin area.

Sections, in display order:
- Data health diagnostics for the Redash Ingestor to PostgreSQL to Petyr service flow;
- Performance test results for sanitized server-side operation measurements;
- an operator link to the Redash Ingestor dashboard at `/redash-ingestor`;
- PostgreSQL database backup export/import for server migration and controlled recovery;
- Forecast Initial window unlock by selected target year;
- deterministic Daily AI Forecast monitoring and manual run;
- AI preview backtest;
- AI Forecast baseline weights;
- AI model settings for the future OpenRouter-backed notes and forecast explanation flow;
- Excel export/import for CSM-friendly monthly forecast templates and bulk updates;
- one-time 2026 closed revenue alignment.

The admin UI no longer exposes legacy Initial Forecast baseline/import workflows,
legacy CSV forecast import/export or Redash field mapping diagnostics sections.
Their existing endpoints/services may remain available for compatibility or
controlled operations, but they are not part of the visible `/petyr-admin`
workspace.

Forecast Initial window admin endpoints:

```txt
GET /api/petyr/admin/initial-forecast-window
PUT /api/petyr/admin/initial-forecast-window
```

They require `petyr:admin` and store the per-year override in `app_setting`
under `petyr_initial_forecast_window_overrides_v1`. The PUT body is
`{ "year": YYYY, "unlocked": true|false }`. Unlocking a year allows users with
`petyr:forecast:write` to edit Forecast Initial from Annual Forecast Entry
outside the default December 10-January 10 window. Locking a year restores the
default window and does not change saved Initial Forecast values.

The database backup export endpoint is:

```txt
GET /api/petyr/admin/database-backup/export
```

It requires `petyr:admin` and `x-app-secret: APP_INTERNAL_SECRET`, runs a native
PostgreSQL SQL dump from the configured `DATABASE_URL`, and returns a downloadable
`.sql` file. The dump is intended to preserve the shared PostgreSQL data hub for
server migration or controlled recovery, including Redash snapshots/metadata,
materialized Redash tables and Petyr-owned forecast/admin tables. It must not
call Redash or export secrets from environment variables.

The database backup import endpoint is:

```txt
POST /api/petyr/admin/database-backup/import
```

It requires `petyr:admin`, `x-app-secret: APP_INTERNAL_SECRET`, an uploaded `.sql`
file generated by the backup workflow and explicit confirmation. Restore runs
through PostgreSQL with stop-on-error behavior. Because exported dumps include
clean/drop statements, restore can replace existing database objects and must be
used only on a new target server, disposable environment or controlled recovery
after taking a backup. This admin workflow is not a substitute for a production
backup policy with retention, encryption, offsite storage or point-in-time
recovery.

The data health endpoint is:

```txt
GET /api/petyr/admin/data-health
```

It returns `ok`, Redash source metadata, materialized table existence, row counts,
available columns, logical mapping diagnostics, blocking issues, warnings and
Management Objective diagnostics for the current year. It reads only PostgreSQL
and must not call Redash directly. Missing or empty
`redash_raw_master_campaigns_latest`, missing campaign company/revenue columns
and missing campaign end date are blocking because they prevent reliable Closed
revenue / Closed revenue YTD diagnostics. Missing or empty agreements, missing
or empty company ownership, missing `company_branch`, missing current CSM
ownership, missing Branch or Business Unit objectives and optional GM%, cost or
link columns are warnings. If Management Objective tables are missing, Data
Health must tell operators to run `npm run db:sync` from `apps/forecasting-app`
for local schema sync, or to apply reviewed
migrations with `npx prisma migrate deploy`. Missing, unknown or non-official
campaign Business Unit values that are normalized to `Other` are warnings.
Management Objective data health exposes objective counts by year plus Branches
and official Business Units without a configured objective for the current year.
Initial Forecast data health warns when Annual Entry storage is missing or when
the current year has no per-Business Unit Initial Forecast values in
`forecast_annual.initial_forecast`.

The performance results endpoint is:

```txt
GET /api/petyr/admin/performance-results
```

It requires `petyr:admin`, reads only PostgreSQL and returns the latest persisted
server-side measurement for each documented Petyr/Redash performance check plus
a short recent history and aggregate statistics for high-level readability,
including average, median and p95 duration per operation. Measurements are written to
`petyr_performance_measurement` with sanitized service, operation, status,
duration, row count, timestamp and scalar metadata only. The endpoint must not
return raw Redash payloads, uploaded workbook contents, customer rows, secrets or
browser DevTools timing values.
Daily deterministic AI Forecast runs are measured as operation
`Daily AI Forecast run`, with sanitized metadata for manual vs scheduled source,
selected/processed/failed company counts, saved/skipped AI cache rows, model
version, run date and advisory-lock skip state. Petyr Admin may show these as a
dedicated run history without exposing secrets or raw customer payloads.

The recommended monthly forecast Excel export endpoint is:

```txt
GET /api/petyr/admin/export-monthly-forecast-xlsx?year=2026&csmName=...
```

It creates a `.xlsx` workbook with:
- `Instructions`;
- `Forecast Input`;
- `Reference - Business Units`;
- `Reference - Companies`;
- `Validation Rules`.

`Forecast Input` is sorted CSM -> Company -> Business Unit -> Month and defaults
to/focuses on year 2026 from the admin UI. It includes editable CSM-owned fields
for previous-month forecast, ongoing forecast, company active status and note,
plus read-only Closed revenue and AI forecast reference columns. The workbook uses
Company Ownership for canonical Company/CSM/Branch reference data and does not call
Redash directly.

Company active status in the external workbook uses `active`, `inactive`, or an
empty cell meaning do not modify. The export should show the current known status
when available; verifying and correcting that export behavior is tracked in backlog.

The recommended monthly forecast Excel import endpoint is:

```txt
POST /api/petyr/admin/import-monthly-forecast-xlsx
```

It accepts a multipart `.xlsx` upload, reads the `Forecast Input` sheet, validates
required columns, official Business Units, Company Ownership company/CSM data,
year/month and non-negative numeric forecast values. It imports only CSM-owned
forecast fields, ignores read-only Closed revenue and AI forecast reference
columns, creates one save session with source `Admin Excel Import`, logs changed
values and returns imported/skipped row counts, errors, warnings and a preview of
problematic rows when available.

Excel import performance/status visibility is now limited to sanitized
operational measurements and the existing import result counters. Do not change
monthly import business behavior, worksheet contract, forecast ownership or audit
semantics unless a later task explicitly selects that scope.

The monthly template export endpoint is:

```txt
GET /api/petyr/admin/export-monthly-template?year=2026
```

It reads company and CSM pairs only from the latest materialized Company Ownership
table, never from Redash directly, and expands them across the official Business Units
and all 12 months. If the Company Ownership table or its canonical company/CSM columns
are missing, the export must fail with a clear diagnostic instead of producing an
ambiguous template.

This CSV endpoint remains available as a legacy/advanced workflow. It must not be
broken by the Excel workflow.

Legacy Initial Forecast Excel import/export and the protected manual
consolidation endpoint have been removed from the product API. Annual Forecast
Entry is the only supported product workflow for Initial Forecast entry.

The monthly forecast import endpoint is:

```txt
POST /api/petyr/admin/import-monthly-forecast
```

It accepts a multipart CSV upload with the monthly template columns, validates company,
year, month and official Business Unit values, and resolves every row's CSM from
Company Ownership before writing. The CSV `csmName` column is kept for compatibility,
but import ignores it for persistence and reports how many rows were corrected to the
canonical owner. Companies not found in Company Ownership are rejected. The import
writes monthly forecast values to Petyr's forecast tables, stores company active status
when provided, creates one save session with source `Admin CSV Import`, and logs changed
values.

This CSV endpoint remains available as a legacy/advanced workflow. It must not be
broken by the Excel workflow.

The AI model settings area shows the current selected OpenRouter model, defaults to
`OPENROUTER_DEFAULT_MODEL` when no database setting exists, and persists changes in
`app_setting`. The browser loads model options only through Petyr's internal endpoint:

```txt
GET /api/petyr/admin/openrouter-models
```

That endpoint may call the OpenRouter models API server-side with `OPENROUTER_API_KEY`.
If the key is missing or OpenRouter is unavailable, it returns fallback model options and
a diagnostic message for the UI. The OpenRouter API key must never be exposed to the browser.

Petyr AI Forecasting has two accepted execution modes:

- manual company-by-company actions from Forecast Entry and the protected
  single-company endpoint;
- nightly deterministic-only automation for active companies through the
  `petyr-ai-forecast-worker` service.

The nightly worker runs at `PETYR_AI_FORECAST_DAILY_TIME=02:00` in
`Europe/Rome`, targets the current Rome year, excludes only companies explicitly
marked inactive, waits `PETYR_AI_FORECAST_DELAY_MS=3000` between companies and
saves local deterministic preview rows to `ai_forecast_cache` with daily
append-only model versions such as `petyr_deterministic_preview_v1@YYYY-MM-DD`.
It must not call OpenRouter or Forecast Intelligence and must not write CSM
forecast, annual forecast, management objective, Initial Forecast, closed revenue
or Redash data.

Automated LLM/OpenRouter batch execution remains out of scope until a separate
privacy, cost, quality and rate-limit decision is accepted.

The protected manual AI Forecast company endpoint is:

```txt
POST /api/petyr/ai-forecast/company
```

It requires `x-app-secret: APP_INTERNAL_SECRET`.

Payload:

```json
{
  "companyName": "Company Name",
  "year": 2026,
  "dryRun": true
}
```

Rules:

- `dryRun` defaults to `true`;
- `dryRun=true` builds a validated deterministic preview and writes no database rows;
- the endpoint accepts one `companyName` and one target `year` per request;
- array/global/all-company input is rejected;
- `dryRun=false` calls OpenRouter server-side with strict JSON Schema
  `response_format`, validates strict LLM JSON output, applies future-month and
  privacy checks, and writes only validated rows to `ai_forecast_cache`;
- OpenRouter requests must set provider parameter support enforcement so the
  request is not routed to providers that would ignore the structured response
  format. The provider-facing JSON Schema must stay within the selected
  endpoint supported subset: Petyr may use it for structural shape, required
  fields, types and string enums, while numeric ranges, non-empty strings, string
  lengths, confidence bounds, duplicate/missing target rows and future-month
  eligibility remain enforced by Petyr server-side validation after the model
  returns. Petyr must avoid optional sampling parameters that are not supported
  by the selected model endpoint, because `require_parameters=true` makes
  unsupported request parameters a routing failure;
- `dryRun=false` requires `OPENROUTER_API_KEY`; if no future months are eligible,
  it skips without calling OpenRouter or writing rows;
- non-dry-run persistence returns a report with saved row count, skipped row
  count, validation errors and model version;
- optional LLM preview can be requested with `llmPreview=true`, `useLlmPreview=true`
  or `includeLlmPreview=true`; it may call OpenRouter only server-side when
  `OPENROUTER_API_KEY` and the selected model are configured;
- the deterministic dry-run response remains available when LLM preview is
  not requested or cannot be called;
- when optional LLM preview is requested, Petyr may perform one server-side
  strict-JSON retry if the first OpenRouter response fails validation; only a
  retry response that passes the same strict validation may be used. When LLM
  preview passes validation, the current-run preview rows and aggregates must
  use the validated OpenRouter output marked as `llm_current_run`. Validation
  must reject missing or duplicate target rows against the deterministic
  candidate set; when it fails validation, deterministic rows remain visible
  with OpenRouter validation diagnostics. If the provider returns structured
  `message.parsed`, Petyr validates that parsed object as the authoritative
  response. Free-form commentary is accepted only when represented as structured
  `warnings` objects inside the strict JSON response; prose outside JSON and
  truncated/partial output remain invalid.

The endpoint reads the selected model from `app_setting` key
`petyr.openrouter.model`, falls back to `OPENROUTER_DEFAULT_MODEL`, and uses
`OPENROUTER_API_KEY` only server-side. The MVP forecast grain is company +
Business Unit + future month + year. It does not update CSM-owned
`forecast_monthly`, `forecast_annual`, closed revenue, management objective or
Initial Forecast data. Non-dry-run persistence may upsert only validated
future-month rows for the selected company, Business Unit, year, month and model
version in `ai_forecast_cache`; past and current months are excluded before any
write.

The OpenRouter prompt receives only the normalized Forecast Intelligence payload after Petyr local code has computed all metrics, integer-EUR forecast values, signed deltas, local risks, trend signals, agreement residual allocation, sanitized Business Unit attribution and a deterministic evidence registry. Internal consultative scenarios may remain part of local deterministic data, but Forecast Intelligence must not request, validate, render or chart rounding/adjustment scenarios. OpenRouter is consultative only: it must return JSON business analysis limited to stakeholder notes, risks, watchouts and opportunities, using `evidence_refs` copied from the deterministic registry to support its main claims. It must not generate `numeric_evidence`, recalculate or modify `aiForecastValue`, invent official forecast evidence absent from the registry or return prescriptive operational instructions. Petyr enriches the validated UI output by converting `evidence_refs` into `numeric_evidence` from server-owned registry `display_value` fields. CSM-entered monthly and annual forecast values are comparison reference data in the UI only; they must not be sent to OpenRouter and must not influence deterministic forecast values. Recent CSM save-session notes for the selected company/year may be sent as sanitized qualitative context with month, forecast type, source, timestamp and changed-BU count, but they are not authoritative numeric evidence.

Forecast Entry may expose `Generate deterministic preview`, `Generate AI forecast` and `Apply AI forecast` actions for the currently selected company and year only inside the admin-visible support tool. Forecast Entry may also expose a CSM-facing `Generate Intelligence` action for users with `petyr:forecast:write`; this consultative action calls the dry-run Forecast Intelligence path, renders validated JSON guidance and must not expose Apply, OpenRouter I/O, raw prompt payloads or prompt/debug JSON. Company Detail may show saved numeric `ai_forecast_cache` suggestions as read-only evidence, but must not expose `Generate Intelligence`, load persisted Forecast Intelligence sentinel rows, generate numeric AI Forecast rows or apply numeric AI Forecast rows. The deterministic preview must not call OpenRouter. The AI forecast and Forecast Entry Intelligence actions may call OpenRouter only for validated Forecast Intelligence JSON and may save or reuse the intelligence cache sentinel row. The manual CSM-facing `Generate Intelligence` action forces a fresh Intelligence generation attempt instead of reusing a same-hash cache hit; after a successful save, the UI replaces the previously visible persisted result and timestamp. Failed generation attempts must render the error while keeping the latest previous successful Intelligence visible. The UI must show Business Unit/month deterministic forecast rows separately from compact Forecast Intelligence sections for stakeholder notes, risks, watchouts and opportunities only. Each card keeps title/severity, model-generated insight text and server-generated numeric evidence under it. It must not show status/confidence/as-of/eligible-month/provider-call tiles, selected-month eligibility warnings, executive summary, key insights, drivers, forecast cues, chart-comparison candidates or rounding scenarios. A non-dry-run apply may run only after explicit user confirmation and may write only through the validated manual company flow to `ai_forecast_cache`. Browser code must not
receive or expose `APP_INTERNAL_SECRET`, `OPENROUTER_API_KEY` or any equivalent
server-side secret.

Petyr also provides a local read-only AI preview backtest command for calibration:

```bash
cd apps/forecasting-app
npm run backtest:ai-preview -- --as-of=2026-03-15 --year=2026 --months=5,6 --top-revenue --limit=10
```

The backtest selects top-revenue companies from PostgreSQL-backed Redash materialized data, runs deterministic AI preview candidates with the selected server-side as-of date, filters to the requested months and compares those values with real closed revenue currently available in PostgreSQL. It is an operational validation report only: it does not call OpenRouter, does not save to `ai_forecast_cache`, does not update CSM forecast tables, does not modify Redash materialized data and does not establish an accepted accuracy threshold. Petyr Admin exposes the same workflow in an `AI preview backtest` card backed by `POST /api/petyr/admin/ai-preview-backtest`, protected with `x-app-secret: APP_INTERNAL_SECRET`, and showing selected companies, month aggregates, total aggregate, row-level comparison and diagnostics.

Forecast Entry AI Forecast UI must show execution feedback immediately after `Generate deterministic preview`, `Generate AI forecast` or `Apply AI forecast` is clicked. Runtime or Server Action failures must render a visible error notice instead of leaving the card apparently idle; deterministic preview details remain in the same result panel once the action returns.

The legacy route is disabled for the manual MVP and must not be used as a
global/all-company operational workflow:

```txt
POST /api/petyr/admin/ai-forecast-batch
```

It returns a disabled/gone response and points operators to the single-company
manual endpoint instead.

AI Forecasting must be hybrid: deterministic local forecast + real business signals + consultative LLM intelligence. The LLM must not invent numbers without payload evidence, must not use CSM-entered forecast values as an anchor and must not change persisted forecast numbers.

For the first manual MVP, complete anonymization through a dedicated tool/API is
deferred and must not block a controlled company-by-company test. When that
tool/API is available, OpenRouter/LLM payloads must no longer include company,
CSM, campaign or agreement names, links, deal links or other identifying text.
AI Forecast may generate/update only future months of the selected year and must
never update past months or the current month.

Current Forecast Intelligence implementation contract lives in:

```txt
docs/petyr/FORECAST_INTELLIGENCE_LAYER.md
```

Detailed historical and future implementation design lives in:

```txt
docs/petyr/AI_FORECASTING_DESIGN.md
```

Current Forecast Intelligence contract helpers live in:

```txt
apps/forecasting-app/src/services/petyrForecastIntelligenceService.ts
apps/forecasting-app/src/services/petyrForecastIntelligenceCacheService.ts
apps/forecasting-app/src/services/petyrAiForecastCompanyIntelligenceService.ts
```

These helpers build the normalized payload, prompt messages, OpenRouter JSON
Schema response format, input hash, cache adapter and server-side validator for
the interpretation layer. They validate strict JSON output against the accepted
business-analysis schema and reject markdown, unexpected fields, prompt/internal
implementation disclosures and numeric claims absent from the deterministic
payload. OpenRouter cannot calculate or modify forecast values.

## MVP constraints

- Use only PostgreSQL / internal APIs.
- Do not call Redash from UI.
- Keep UI simple first.
- Prioritize correctness over design.
- Forecasting AI comes later.
- OpenRouter API keys must come from `OPENROUTER_API_KEY`; never hardcode them.

## Later features

- AI forecast suggestions;
- forecast confidence;
- automatic anomaly detection;
- Slack notifications;
- forecast lock after the 15th of the current month;
- forecast ongoing editable from the 16th;
- revision logs.
