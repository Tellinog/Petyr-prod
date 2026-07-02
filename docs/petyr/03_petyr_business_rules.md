# Petyr business rules

## Forecast granularity

Main forecasting granularity:

```txt
Company + Business Unit + Month + Year
```

## Official Business Units

- AI
- Accessibility
- Community
- Experience
- Express
- FTE
- Other
- QA
- Security
- TA

## Monthly editability

Centralized function:

```txt
getForecastEntryMode(month, currentDate)
```

Rules:

```txt
If month < current month:
  read-only

If month = current month and day <= 15:
  edit previous-month forecast

If month = current month and day > 15:
  edit ongoing forecast

If month > current month:
  edit previous-month forecast
```

## Annual forecast

- Past years: read-only.
- Current year: readable with closed revenue/progress.
- Future year: editable as draft.
- 15-30 December: next year forecast can be consolidated.

Annual forecast is not a yearly objective and must not be used as a fallback
for Branch or Business Unit objectives.

## Annual Forecast Entry

The normal Forecast Entry page has a separate CSM-facing Annual Forecast Entry
section alongside Monthly Forecast Entry.

Rules:

- CSM filter follows the same ownership/preselection logic as Monthly.
- Company lists for Monthly and Annual Forecast Entry include every
  company-CSM association whose Company Ownership workspace has
  `workspace_updated_on` within the last 6 months. A company may therefore
  appear in more than one CSM portfolio when multiple recent associations exist.
- If no recent workspace associations are available, Petyr may fall back to the
  latest owner per company with diagnostics.
- Year options start at 2026, include at least 2026 and 2027, and progressively
  expose the next year.
- Default year is current year until December 9, next year from December 10
  through December 31, and the new current year from January 1.
- FC Initial is editable only from December 10 of year N-1 through January 10 of
  year N, or while Petyr Admin has unlocked the selected target year.
- FC Ongoing is the sum of saved or AI-confirmed annual Business Unit values.
  Unclicked FC AI placeholders are not saved and do not contribute.
- FC Ongoing Confidence is required on modified rows and accepts only `01 High`,
  `02 Mid` and `03 Low`.
- Annual Entry table headers stay fixed during vertical scroll, and Customer plus Confidence stay visible during horizontal scroll.
- The legend row includes a Business Unit collapse/show button; collapsed mode hides all BU input columns and keeps Active through Confidence plus Closed Revenue YTD through Logs visible.
- Editable Annual Entry columns use a subtle manual-entry background, while consolidated/read-only columns remain visually quieter.
- Annual Entry revenue/planned columns are labelled Closed Revenue YTD and Planned This Year; ratio columns explicitly use Forecast Ongoing; the history action is labelled Logs and each row link says `See latest logs of <company>`.
- Annual Entry Planned includes future `Setup`, `Recruiting` and `Running`
  campaigns for the selected year in this workflow. This does not change the
  broader Management View planned-through-year-end rule unless a future decision
  updates it.

## Initial Forecast

Initial Forecast is the frozen annual baseline used for Management View
comparison against Ongoing Forecast.

Persistence:

- Ongoing Forecast remains the current/latest value in `forecast_annual.value`;
- Initial Forecast company/year total is stored in
  `forecast_annual_entry.initial_forecast`;
- Initial Forecast per company + Business Unit + year is stored in
  `forecast_annual.initial_forecast`;
- Annual Forecast Entry saves audit Initial Forecast changes through
  `forecast_save_session` and `forecast_change_log`.

Rules:

- Annual Forecast Entry is the canonical Initial Forecast workflow.
- Forecast Initial is editable only from December 10 of year N-1 through January
  10 of year N.
- Petyr Admin may unlock Forecast Initial for a selected target year at any
  time; while unlocked, users with `petyr:forecast:write` can enter or edit
  Forecast Initial through Annual Forecast Entry outside the default window.
- During that window, saved Annual Entry Business Unit values also populate
  `forecast_annual.initial_forecast`.
- `forecast_annual_entry.initial_forecast` is the sum of saved per-Business Unit
  Initial Forecast values for the same company/year.
- From January 11 onward, Forecast Initial is read-only and remains fixed unless
  the selected target year is admin-unlocked.
- Later Annual Entry saves may update Ongoing Forecast in `forecast_annual.value`
  without changing `forecast_annual.initial_forecast` when the year is locked.
- The old Initial Forecast Excel bootstrap, snapshot read path and automatic
  scheduler/consolidation endpoint are deprecated and must not be used for
  product behavior.

## Management View annual forecast comparison

Management View must compare annual forecast baselines without confusing them
with Yearly Objective:

- Initial Forecast = frozen annual baseline for the selected year and scope.
- Ongoing Forecast = current/latest annual forecast for the selected year and scope.

Scopes:

- Branch = sum company/Business Unit annual forecasts belonging to the Branch.
- Business Unit = sum annual forecasts for that Business Unit.
- Single CSM = sum company/Business Unit annual forecasts assigned to that CSM.

Initial Forecast comes from Annual Forecast Entry. If the frozen Initial values
are missing, show `n/a` for Initial Forecast and keep a non-invasive
diagnostic/admin warning.

## Planned future campaign status

Planned through year end comes from future Redash campaigns, not future CSM
forecast values.

Planned future includes only these campaign statuses:

- Setup
- Recruiting

Planned future excludes:

- Running
- Completed
- Aborted
- Cancelled
- Canceled
- Deleted
- Rejected
- Lost
- Archived

Missing or unknown statuses must be diagnosed and excluded until there is a
new documented business decision. `Running` is not planned future; it is handled
only by the closed revenue/revenue logic when the campaign date and status make
it eligible there.

## Agreement operational alerts

Agreement expiring alerts are operational and must include only agreements whose
expiry date is not already in the past.

Rules:

- expiring within 60 days means `expiry date >= today` and `expiry date <= today + 60 days`;
- agreements with `expiry date < today` are already expired and must not appear in
  the standard expiring-soon urgent action;
- expired agreements can remain visible in Company Detail as historical/status data;
- high residual operational alerts use active, non-expired agreement residual values;
- high residual affected-company evidence uses the active residual agreement whose
  expiry date is closest to today, showing that agreement's total value and residual.

Expired agreements with residual value must be separated from expiring-soon
warnings:

- category label: `Expired agreement with residual`;
- show the residual value;
- do not mix it with `expiring within 60 days`.

## Agreement/deal links

Master Agreements has no usable agreement link. To display a link for an
agreement, Petyr must derive it from linked Master Campaigns rows:

- find campaigns linked to the agreement;
- use the first available campaign deal link in deterministic order;
- if no linked campaign has a deal link, show `n/a`.

## Management yearly objectives

Branch and Business Unit yearly objectives are annual values entered by
management in a dedicated `Management Objectives` area at the bottom of
Management View. `/forecasting/entry/objectives` may remain as a management-only
compatibility route.

The current implementation uses:

```txt
GET /api/petyr/management-objectives?year=YYYY
POST /api/petyr/management-objectives
```

Objective values are stored in `management_objective`; every save is logged in
`management_objective_change_log`.

Branch objective rules:

- Branch list is dynamic and comes from Company Ownership `company_branch`.
- If a Branch has no objective for the selected year, show `n/a`.
- Missing Branch objectives must produce diagnostics.
- Do not invent objectives.
- Do not use annual forecast as objective.

Business Unit objective rules:

- Business Units are limited to the official list.
- If a Business Unit has no objective for the selected year, show `n/a`.
- Missing Business Unit objectives must produce diagnostics.
- Do not derive objectives from Redash.
- Do not invent objectives.

Access and audit:

- The section is intended for management users.
- Objective management has already been added/configured for the current MVP.
- Do not add new objective-management tasks unless they fix a specific bug.
- The section, compatibility route and API require `petyr:management:write`.
- Forecast Entry Annual Forecast remains the CSM-owned annual forecast and must
  not embed Management Objectives.
- The old temporary hardcoded password gate is no longer used.
- Every objective change must track scope type, scope key, year, previous value,
  new value, note, updated by and timestamp.

## View ownership

- CSM Overview: read-only.
- CSM Overview company lists use the same recent 6-month Company Ownership
  workspace association rule as Forecast Entry portfolio lists.
- Company Detail: analytical and read-only for forecast data edits; it can expose CSM, company, previous/next and year navigation filters backed by Forecast Entry ordering. Revenue by Business Unit detail, Monthly forecast rows, Annual forecast rows and AI forecast cache support tables are visible only to users with `petyr:admin`. It must not expose consultative Forecast Intelligence generation or apply numeric AI Forecast rows.
- Forecast Entry: only monthly forecast editing area; users with `petyr:forecast:write` can run consultative Forecast Intelligence from Monthly forecast, and admin users can also see the manual AI Forecast support tools.
- Management View: aggregated, not editing; management users can manage annual Branch and Business Unit objectives at the bottom of the view.

Company ordering rules and implementation status live in:

```txt
docs/petyr/COMPANY_ORDERING.md
```

## Numeric display formatting

User-visible monetary, percentage and decimal values must use Italian formatting
with exactly two decimal digits:

- monetary values: `1.234.567,89 €`
- percentages: `12,34%`
- non-monetary decimal values: `1.234,56`

Missing numeric values show `n/a`. Real zero values show `0,00` or `0,00 €`.
Technical IDs, years, months, CPID/campaign/agreement IDs and row/import counts
that must remain integers are excluded from the two-decimal display rule.

Excel exports for CSM/management workflows must keep editable/calculable cells
numeric and apply compatible money/percentage number formats rather than turning
numbers into strings.

## Change history

Every save creates:

```txt
1 save session
N change log rows
```

Multiple Business Unit edits in one action must be grouped into one save session.

Change logs must contain only effective changes:

- if one Business Unit changes, log only that Business Unit;
- if active/inactive changes, log only that status change;
- unchanged Business Units must not generate rows;
- unchanged active/inactive status must not generate rows.

## Active/inactive Excel format

External Excel import/export format:

- `active`;
- `inactive`;
- empty cell = do not modify.

The export should show the current known status when available. Verification of
current export behavior is tracked in `BACKLOG.md`.

## Monthly import stability

Do not change the existing monthly import behavior except in tasks dedicated to
monthly import performance/status. The 2026 Initial Forecast import must be a
separate one-shot workflow.
Excel import performance is outside this cycle; do not add new performance
tasks for it in this package unless a later task explicitly selects that scope.

## AI Forecast MVP and privacy

OpenRouter-backed AI Forecasting remains manual and company-by-company. It must
not run a global automatic LLM/OpenRouter batch and manual requests must not
process all companies together. Nightly deterministic-only automation is allowed
through `petyr-ai-forecast-worker`: it processes active companies one at a time,
waits 3000ms by default between companies and writes only deterministic preview
rows to `ai_forecast_cache`.

AI Forecasting now uses a deterministic-first Forecast Intelligence approach:

```txt
local deterministic forecast values + local business signals + LLM interpretation JSON
```

Petyr local code is the source of truth for all forecast numbers. OpenRouter must not calculate, recalculate, adjust, smooth, round, override or invent forecast values. It may return only validated structured business analysis over the local payload.

AI Forecast numeric rows and Forecast Intelligence JSON both write only to `ai_forecast_cache`; they must not update CSM forecast, closed revenue, management objectives, Initial Forecast or annual forecast data. The manual numeric generation/apply UI belongs only in Forecast Entry's admin-visible support tool. CSM-facing Forecast Intelligence generation is allowed in Forecast Entry Monthly forecast for users with `petyr:forecast:write`; it is consultative-only and may save/reuse only the sentinel intelligence cache row. Company Detail may show saved numeric cache rows as read-only evidence, but must not expose Forecast Intelligence generation or render persisted Forecast Intelligence sentinel rows.

Complete anonymization through a dedicated tool/API is deferred for the first
manual MVP and must not block the first controlled test. When that tool/API is
available, LLM/OpenRouter payloads must not include company names, CSM names,
campaign names, agreement names, deal links, campaign links or other identifying
text. Use temporary server-side pseudonyms such as `company_001`, `csm_001`,
`campaign_001` and `agreement_001`, keep the pseudonym map server-side, send
only minimized numeric/categorical features, and map AI output back internally.

AI Forecast must update only future months of the selected year. It must never
change past-month or current-month AI Forecast values.
