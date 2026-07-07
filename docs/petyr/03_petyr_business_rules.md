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

- CSM filter is a compact single-row multi-select dropdown with checkboxes.
  It defaults to the same preselected CSM as Monthly, allows that default CSM
  to be deselected, and summarizes multiple selections as the first selected
  CSM plus the count of additional selected CSMs. Users can select one or more
  CSMs and Annual Forecast Entry shows the combined company portfolio for all
  selected CSMs.
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
- FC Ongoing Confidence is required only when Forecast Ongoing Business Unit
  values are modified without an existing confidence value, and accepts only
  `01 High`, `02 Mid` and `03 Low`.
- Monthly Forecast Entry can sort the visible company portfolio by Company.
- Monthly Forecast Entry shows a highlighted portfolio-total row directly under
  the table headers and above the first company row. The first cell shows the
  all-Business-Unit active forecast total for the selected CSM/month, each
  visible Business Unit column shows its portfolio total, expanded Business
  Units show separate Previous Month Forecast, Ongoing Forecast and Closed
  Revenue YTD totals, and the Note cell remains empty.
- Annual Forecast Entry can sort visible rows by Company, Forecast Initial,
  Forecast Ongoing and Confidence.
- Annual Forecast Entry shows all active and inactive rows by default, and the
  Active column can filter the visible table to all, active only or inactive
  only without changing persisted company status. The Annual portfolio total row
  reflects the visible rows when this filter is applied.
- Annual Entry table headers stay fixed during vertical scroll, the legend row spans the full horizontal table width, and Company plus Confidence stay visible during horizontal scroll.
- Annual Entry shows the selected CSM filter annual summary as a highlighted total row directly under the table headers and above the first company row. The total row is not a company row: Active, Confidence and Logs remain empty, while Forecast Initial, Forecast Ongoing, visible Business Unit totals, Closed Revenue YTD, Planned This Year and ratio values align under their respective columns.
- Forecast Entry headers may display the official `Experience` Business Unit as `UX` while preserving `Experience` as the stored Business Unit value.
- Monthly and Annual Forecast Entry display Business Unit columns in this CSM
  check order: QA, UX/Experience, Accessibility, Security, FTE, TA, AI, OTHER/Other,
  Express, Community.
- Monthly and Annual Forecast Entry numeric cells display integer monetary
  values without decimal cents, keep Italian thousands separators and are wide
  enough for values up to eight digits plus separators.
- Zero or empty Forecast Entry numeric cells use a softer grey treatment so
  populated values stand out.
- Monthly and Annual Forecast Entry table body rows use compact vertical
  padding and top-align cell content. Saved/Saved CSM forecast labels and
  related AI Forecast references render on separate lines, with the AI Forecast
  reference using the AI legend color.
- The legend row includes a Business Unit collapse/show button immediately after the legend chips; collapsed mode hides all BU input columns and keeps Active through Confidence plus Closed Revenue YTD through Logs visible.
- Editable Annual Entry columns use a subtle manual-entry background, while consolidated/read-only columns remain visually quieter.
- Annual Entry revenue/planned columns are labelled Closed Revenue YTD and Planned This Year; ratio columns explicitly use Forecast Ongoing; the history action is labelled Logs and each row link says `See latest logs of <company>`.
- Annual Entry Planned includes future planning-like statuses (`Draft`, `Plan`,
  `Planned`, `Planning`, `Pipeline`, `Tentative`, `Proposal`, `Proposed`),
  `Setup`, `Recruiting` and `Running` campaigns for the selected year.

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
- `forecast_annual_entry.initial_forecast` stores the company/year Forecast
  Initial value entered in the Annual Forecast Entry Initial column. Saving
  Forecast Initial must not replace that submitted value with existing Forecast
  Ongoing values.
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

Planned future includes only future campaigns, from tomorrow through year end,
with these campaign statuses:

- Draft
- Plan
- Planned
- Planning
- Pipeline
- Tentative
- Proposal
- Proposed
- Setup
- Recruiting
- Running

Planned future excludes:

- Completed
- Aborted
- Cancelled
- Canceled
- Deleted
- Rejected
- Lost
- Archived

Missing or unknown statuses must be diagnosed and excluded until there is a
new documented business decision. `Running` is Planned only when its campaign
end date is tomorrow or later; `Running` with end date today or in the past is
handled by the closed revenue/revenue logic when otherwise eligible there.

Campaigns whose end date is today or in the past but whose status is not
`Completed` must appear as Company Detail relevant insights so operators can
correct the source status or date before the mismatch compromises the counts.

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
Forecast Entry numeric entry cells are also an explicit exception: Monthly and
Annual Forecast Entry show integer monetary values without decimal cents while
preserving Italian thousands separators.

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

When a company is explicitly saved as inactive from Forecast Entry, Annual
Forecast Entry or admin import, Petyr must delete that company's numeric AI
Forecast cache rows from `ai_forecast_cache`. This prevents stale AI Forecast
suggestions from remaining visible for inactive companies and does not mutate
CSM forecast rows, Annual Forecast rows, Initial Forecast, Closed revenue,
management objectives or Redash-derived data.

## Monthly import stability

Do not change the existing monthly import behavior except in tasks dedicated to
monthly import performance/status. The 2026 Initial Forecast import must be a
separate one-shot workflow.
Excel import performance is outside this cycle; do not add new performance
tasks for it in this package unless a later task explicitly selects that scope.

## Annual Forecast Ongoing admin Excel import

Petyr Admin may import the 2026 annual workbook through
`POST /api/petyr/admin/import-annual-forecast-xlsx`.

Rules:

- the endpoint requires `petyr:admin`;
- the admin workflow validates with dry-run before apply;
- the source sheet is `ITA_Andamento lavorato VS Forec`;
- only Business Unit columns after `FORECAST ONGOING` are importable;
- the calculated `FORECAST ONGOING` total is not stored directly;
- `UX` maps to official `Experience` and `OTHER` maps to official `Other`;
- `Community` and `Express` are not touched because the workbook has no columns
  for them;
- `Customer` is the Petyr company key for this workbook;
- workbook `Company` is optional reference data only and is not a fallback key;
- duplicate Customer rows are aggregated and reported as warnings;
- rows with importable values and no Customer are validation errors;
- blank imported BU cells write `0` only when a matching annual row already
  exists in Petyr;
- companies are marked inactive only when their aggregated workbook Forecast
  Ongoing total is zero;
- companies absent from the workbook are not touched unless the unchecked
  Petyr Admin opt-in checkbox is selected for dry-run/apply;
- when that checkbox is selected, canonical Company Ownership companies absent
  from the workbook are marked inactive if they are not already inactive;
- positive totals must not force inactive companies back to active;
- the import writes only `forecast_annual.value` and inactive
  `company_forecast_status` updates;
- it must not write Forecast Initial, annual confidence, monthly forecast,
  Closed revenue, AI forecast cache, Redash data or Management Objectives.

## Inactive companies annual Forecast Ongoing export

Petyr Admin may export inactive companies through
`GET /api/petyr/admin/export-inactive-companies-annual-forecast-xlsx?year=YYYY`.

Rules:

- the endpoint requires `petyr:admin`;
- the export is read-only;
- default/focus year is 2026;
- exported companies are those explicitly saved as inactive in
  `company_forecast_status`;
- total saved revenue is the sum of selected-year `forecast_annual.value`;
- Business Unit columns use only the official Petyr Business Units;
- missing saved annual values export as zero;
- unknown Business Unit values are normalized to `Other`;
- the export must not use Closed revenue, monthly forecast, AI forecast,
  Forecast Initial, Redash data or Management Objectives as revenue values.

## AI Forecast MVP and privacy

OpenRouter-backed AI Forecasting remains manual and company-by-company. It must
not run a global automatic LLM/OpenRouter batch and manual requests must not
process all companies together. Nightly deterministic-only automation is allowed
through `petyr-ai-forecast-worker`: it processes active companies one at a time,
waits 3000ms by default between companies, cleans numeric AI Forecast cache rows
for explicitly inactive companies, skips those inactive companies, and writes
only deterministic preview rows for active companies to `ai_forecast_cache`.

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
