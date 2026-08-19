# Petyr — Product & Data Logic Source of Truth

## 1. Purpose

Petyr replaces the manual Excel-based forecasting process currently used by CSMs.

The tool must make forecasting:

- centralized;
- editable only in the correct operational windows;
- readable by Management, CSMs and single-company views;
- comparable with closed revenue from Redash;
- enriched by AI forecast suggestions and operational alerts;
- traceable through save sessions and change history.

The key principle is:

> The CSM remains the owner of the forecast. Petyr supports, explains, compares and tracks the forecasting process.

---

## 2. Non-negotiable UI rule

`apps/forecasting-app/src/components/petyr/PetyrMVPRendering.tsx` is the management-approved visual rendering.

Treat it as the **golden master UI**.

Do not redesign:

- layout;
- texts;
- cards;
- grids;
- spacing;
- colors;
- chart structure;
- chart colors;
- section order;
- tab structure;
- Tailwind classNames;
- visual hierarchy;
- component arrangement.

Allowed changes:

- data binding;
- props and types needed to inject real data;
- adapter functions;
- user-facing labels/copy explicitly requested by product;
- diagnostics that do not alter the approved layout;
- small formatting helpers if they do not affect the visual design.

If a visual change seems necessary, do not implement it silently. ask or surface the conflict.

The goal is:

> Keep the approved interface pixel-stable and replace only the data engine underneath.

Company Detail and Forecast Entry are part of this visual contract for the next
Petyr alignment cycle:

- their functional content is considered substantially correct;
- the requested work is visual/layout alignment to the Petyr MVP Rendering
  golden master, not a rewrite of the business logic;
- do not introduce a creative redesign;
- the approved Petyr MVP Rendering remains the visual golden master for the
  alignment.

---

## 3. Data ownership

### 3.1 Redash / PostgreSQL owns real business data

Redash-derived data is the source of truth for:

- closed campaign revenue;
- campaign status;
- campaign dates;
- campaign Business Unit;
- campaign costs;
- campaign gross margin and GM%;
- company;
- CSM ownership, when available through company ownership;
- company branch;
- agreements;
- agreement value;
- agreement residual;
- agreement expiry date;
- campaign links / deal links from Master Campaigns;
- no direct agreement link from Master Agreements.

Campaign display names in Petyr come from
`redash_raw_master_campaigns_latest.customer_title`. The Redash column name is
counterintuitive, but Petyr keeps the user-facing label `Campaign name`.

Petyr must not manually edit these values.

Petyr must not call Redash directly from the UI. It must read from PostgreSQL tables materialized by the Redash Ingestor.

Any authenticated Petyr user with at least one Petyr permission may request a
fixed source-data refresh from the shared Petyr workspace header. The UI must
warn before confirmation that Redash query refresh plus Petyr collection
normally takes 2-5 minutes. The browser calls Petyr only; Petyr re-authorizes the
session and sends a protected server-to-server command to Redash Ingestor. The
Ingestor forces fresh results for `master_campaigns`, `master_agreements` and
`company_ownership`, then performs the same audited snapshot and latest-table
materialization used by the nightly sync. Users cannot select arbitrary Redash
queries or access the technical Ingestor surface through this action.

Expected materialized Redash tables include, at minimum:

- `redash_raw_master_campaigns_latest`;
- `redash_raw_master_agreements_latest`;
- `redash_raw_company_ownership_latest`;
- `redash_column_mapping`.

### 3.1.1 Agreement/deal link rule

Master Agreements does not expose a usable agreement link.

The usable link is the deal link available in Master Campaigns.

Rules:

- Petyr must not expect an agreement link from `master_agreements`;
- to display a link for an agreement, Petyr must look for campaigns linked to that agreement;
- if at least one linked campaign has a deal link, use that deal link as the agreement/deal link;
- if multiple linked campaigns have deal links, choose the first available link deterministically;
- deterministic selection must use a stable ordering, for example campaign date/name/id or another documented stable key;
- if no linked campaign has a deal link, show `n/a`;
- do not invent URLs and do not call Redash directly to resolve links.

### 3.2 Petyr owns forecast and operational data

Petyr owns:

- previous-month forecast;
- ongoing forecast;
- annual forecast;
- annual Branch objectives entered by management;
- annual Business Unit objectives entered by management;
- objective change audit trail;
- company active/inactive status;
- company revenue lifecycle status for Management filtering;
- CSM notes;
- save sessions;
- change history;
- AI forecast cache;
- AI model settings;
- user feedback tickets;
- admin import/export operations.

---

## 4. Main hierarchy

Logical hierarchy:

```text
Branch → CSM → Company → Agreement → Campaign → Business Unit
```

Forecasting granularity:

```text
Company + Business Unit + Month + Year
```

Forecast must not be stored only at aggregated company level.

The most important forecasting grain is:

```text
company_id/company_name + business_unit + year + month
```

---

## 5. Branch logic

Branches are dynamic.

They must be extracted from the company ownership data source.

Source:

- logical source: company ownership;
- expected materialized table: `redash_raw_company_ownership_latest`;
- logical column/field: `company_branch`.

Rules:

- do not hardcode the list of branches in the UI;
- do not assume branches are fixed;
- derive available branches from company ownership;
- if a company has no branch, show it as `Unassigned Branch`;
- branch aggregations must use the current company ownership mapping, not historical campaign ownership;
- if company ownership is unavailable, show diagnostics and avoid silently falling back to fake branch data.

Important distinction:

- the **branch list** is dynamic;
- the **yearly objective by branch** is an annual management-entered value keyed by branch and year;
- a branch can appear from company ownership before management has configured an objective for it.

---

## 6. CSM ownership logic

CSM ownership should come from current company ownership when available.

Rules:

- use company_ownership as the primary mapping Company → CSM;
- avoid deriving the current CSM only from historical agreements or historical campaigns;
- CSM portfolio/company lists, Forecast Entry, Company Detail and forecast saves
  must assign each company only to the canonical latest workspace owner from
  `company_ownership`, determined by `workspace_updated_on` and then
  `workspace_created_on` as a tie-breaker;
- if ownership is missing, show diagnostic;
- if company ownership is unavailable or incomplete but real PostgreSQL campaign, agreement or forecast rows exist, render those real rows with fallback CSM attribution and Branch `Unassigned Branch`;
- if a fallback is used, make it explicit in diagnostics and do not fall back to mock customers.

This matters because the CSM assigned to a company may have changed over time.

---

## 7. Business Units

Official Business Units:

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

Rules:

- do not invent new Business Units;
- normalize safely when possible;
- normalize `UX` to the official `Experience` Business Unit;
- map missing or unknown BU values to `Other`;
- add diagnostics for unknown values;
- preserve the official list in views and filters.

Objective rules:

- only the official Business Unit list above can receive yearly objectives;
- Business Unit yearly objectives are annual management-entered values;
- do not derive Business Unit objectives from Redash;
- do not invent Business Unit objectives.

---

## 7.1 Company revenue lifecycle

Petyr classifies companies by selected-year closed revenue history and stores the
result in `company_revenue_lifecycle`.

Allowed statuses:

- `existing`: the company has closed revenue in the selected year and at least
  in the immediately previous year.
- `new_business`: the company has closed revenue in the selected year and no
  closed revenue in either of the two immediately previous years.
- `reactivated`: the company has closed revenue in the selected year, no closed
  revenue in the immediately previous year and closed revenue two years before
  the selected year.

For selected year 2026, revenue in 2026 and 2024 but not 2025 is
`reactivated`; revenue in 2026 and 2023 only, with no 2025 or 2024 revenue, is
`new_business`.

When a company has no selected-year closed revenue, Petyr stores a null lifecycle
status rather than inventing an extra category.

Management View must expose filters for All company types, Existing, New
business and Reactivated in Branch/monthly aggregate, Business Unit View, Single
CSM View and Yearly View. Specific lifecycle filters must recalculate the
aggregate values for the selected company lifecycle status.

---

## 8. Forecast types

Petyr must manage four distinct values.

### 8.1 Previous-month forecast

This is the forecast inserted by the CSM before or at the beginning of the reference month.

Editable:

- selected future months before the 15th of their previous month.

Read-only:

- past months.
- selected current/future months once their Ongoing Forecast window has opened.

### 8.2 Ongoing forecast

This is the revised forecast during the month, when the CSM has more information.

Editable:

- current month;
- selected future months from the 15th of their previous month onward.

Not editable:

- past months;
- selected future months before the 15th of their previous month.

Exceptional 2026 DB alignment:

- a one-time operational backfill may copy already closed 2026 Redash campaign revenue through the selected execution date into monthly `forecast_monthly` rows with both `forecast_type=previous_month` and `forecast_type=ongoing`, using the same real value for both, and into annual `forecast_annual` rows used as Management View Ongoing Forecast;
- the backfill is for historical 2026 alignment only and must not become a recurring feature, CSM workflow, import workflow or scheduler;
- it is exposed in `/petyr-admin` as a protected dry-run/apply admin control using `APP_INTERNAL_SECRET`;
- the CLI command remains an operational fallback, but the Petyr Admin Area is the intended execution surface when shell commands are unavailable;
- it must not write Initial Forecast fields, Redash materialized closed revenue tables, AI forecast cache or management objectives;
- it must run as an explicit dry-run-first DB operation and create forecast save/change audit rows when applied.

### 8.3 Closed revenue

Closed revenue comes from Redash campaign revenue.

It is never editable in Petyr.

It was previously labelled in mock/UI as:

- `Worked`;
- `Worked YTD`;
- `Worked YQTD`;
- `Actual`;
- `Actual revenue`;
- `Actual €`.

The user-facing label must now be:

- `Closed revenue`;
- `Closed revenue YTD`;
- `Closed revenue €`.

### 8.4 AI Forecast

AI Forecast is generated by the system.

It is never editable by the CSM.

It must be visible as a reference beside CSM-editable fields.

The CSM can follow it or diverge from it, but the AI value remains tracked.

---

## 9. Monthly editing rule

Monthly editing logic must be centralized and not duplicated inside individual views.

Expected function:

```ts
getForecastEntryMode(month, currentDate)
```

Expected output:

- editable forecast type;
- label to show;
- whether the field is editable;
- lock reason.

Rules:

- if month < current month: read-only;
- if current date is on or after the 15th of the month before the selected
  month: edit ongoing forecast;
- otherwise, for future selected months: edit previous-month forecast.

Past months are never editable.

Monthly Forecast Entry table rules:

- the Company header can sort the loaded monthly portfolio by company name
  ascending or descending;
- each Monthly Business Unit header can sort the currently visible rows from
  highest to lowest value for that Business Unit. Sorting uses the saved active
  forecast value when present, and the AI placeholder value when no CSM value
  is saved. Local edits keep their row in place; sorting and Active visibility
  are reapplied only after a successful save;
- each Monthly company row shows the company-level total of the currently
  active Business Unit forecast values in a highlighted `Monthly Total` column
  between Company and the Business Unit columns;
- Monthly Forecast Entry includes an `Active` column immediately after Company,
  before the Business Unit groups. The header uses the same all/active/inactive
  visibility filter as Annual Forecast Entry. The per-row checkbox saves the
  company active/inactive status immediately to `company_forecast_status`,
  updates the row without a batch/page reload, creates normal save-session/
  change-log audit rows and clears numeric AI Forecast cache rows when the
  company is set inactive;
- Business Unit groups start collapsed and show only the active editable field;
- when the selected month is before the current month, collapsed Business Unit
  groups show the selected-month `Closed Revenue` value instead of a forecast
  input, because past monthly forecast values are read-only;
- when Ongoing Forecast is the active editable field and a company/Business Unit
  has no saved Ongoing value yet, but it has a saved Previous Month Forecast for
  the same selected month, Monthly Forecast Entry shows that Previous Month
  value as the Ongoing placeholder. Clicking or focusing the cell accepts the
  placeholder into the editable field, using the same save/approval interaction
  as AI Forecast placeholders, and the user can still edit the value manually
  before saving;
- Expand/Collapse must look like an actionable button and sit at the far right
  of the Business Unit group header;
- the Monthly table uses its own vertical scroll area; the CSM, Month, Year and
  Load control row plus the legend stay sticky above it, while the Monthly
  section title, period summary and editability notice scroll away. Monthly
  table headers stay fixed at the top of the table while users scroll down the
  portfolio;
- when a Business Unit is expanded, Previous Month Forecast is shown to the left
  of Ongoing Forecast and the read-only closed revenue column is shown to the
  right of Ongoing Forecast. For past selected months the column label is
  `Closed Revenue`; otherwise it remains `Closed Revenue YTD`;
- Monthly Forecast Entry shows a highlighted portfolio-total row directly under
  the table headers and above the first company row. The first cell shows the
  all-Business-Unit active forecast total for editable/current or future months
  and the all-Business-Unit Closed Revenue total for past selected months. Each
  visible Business Unit column follows the same compact value, expanded Business
  Units show separate Previous Month Forecast, Ongoing Forecast and read-only
  closed revenue totals, and the Active and Note cells remain empty. The
  portfolio-total row stays visible below the sticky headers while users scroll
  down the Monthly portfolio;
- Monthly Forecast Entry displays Business Unit columns in this CSM check order:
  QA, UX/Experience, Accessibility, Security, FTE, TA, AI, OTHER/Other, Express,
  Community;
- Monthly Forecast Entry allows a company-level note to be saved even when no
  Business Unit forecast value or Active status changed. This creates a normal
  save session with the note and no Business Unit change-log rows, matching the
  Company Detail note-only behavior;
- editable monthly forecast columns should be wide enough for their header
  labels;
- numeric Monthly Forecast Entry cells display integer values without decimal
  cents; they must be wide enough for values up to eight digits with Italian
  thousands separators, and zero or empty values should use a softer grey
  treatment than populated cells;
- Monthly table body rows use compact vertical padding and top-align cell
  content. Saved forecast labels and related AI Forecast references render on
  separate lines, and the AI Forecast reference uses the AI legend color;
- Closed Revenue / Closed Revenue YTD is read-only.

---

## 10. Annual forecast

Petyr must also support annual forecast.

Rules:

- past years are read-only;
- current year is readable and can show closed revenue/progress;
- future years can be edited as draft;
- between December 15 and December 30, the forecast for the following year can be formally consolidated;
- consolidation must be an explicit action, separate from saving a draft.

Statuses:

- `draft`;
- `consolidated`.

The annual forecast is owned by the CSM.

Annual forecast is not a yearly objective.

Rules:

- do not use annual forecast values as Branch objectives;
- do not use annual forecast values as Business Unit objectives;
- keep annual forecast editing separate from management-entered objective management.

### 10.1 Initial Forecast

Initial Forecast is the frozen annual baseline used by Management View for
comparison against the latest Ongoing Forecast.

It is distinct from:

- Yearly Objective;
- Ongoing Forecast;
- Closed revenue;
- Planned through year end;
- AI Forecast.

Persistence:

- Ongoing Forecast remains the current/latest annual CSM forecast in `forecast_annual.value`;
- Initial Forecast total by company/year is stored in
  `forecast_annual_entry.initial_forecast`;
- Initial Forecast by company/Business Unit/year is stored in
  `forecast_annual.initial_forecast`;
- effective Annual Entry saves are audited in `forecast_save_session` and
  `forecast_change_log` with source `Annual Forecast Entry`;
- Initial Forecast writes must not update monthly forecast, closed revenue,
  management objectives or AI forecast.

Initial Forecast is now owned by the normal Annual Forecast Entry workflow:

- IGSM/CSM users enter Annual Entry values during the Forecast Initial window;
- Forecast Initial is editable from December 10 of year N-1 through January 10
  of year N;
- Petyr Admin may unlock the Forecast Initial window for a selected target year
  at any time; when a year is admin-unlocked, users with
  `petyr:forecast:write` may enter or edit Forecast Initial for that target year
  from normal Annual Forecast Entry until an admin locks the year again;
- during that window, Annual Forecast Entry shows separate per-Business Unit
  fields for Forecast Ongoing and Business Unit Initial Forecast. Saving a
  Forecast Ongoing Business Unit value must not implicitly populate or change
  `forecast_annual.initial_forecast`;
- Business Unit Initial Forecast values entered in those explicit fields are
  stored in `forecast_annual.initial_forecast` for the same company, Business
  Unit and year;
- the company/year total in `forecast_annual_entry.initial_forecast` preserves
  the value entered in the Annual Forecast Entry Forecast Initial column and
  must not be replaced by existing Forecast Ongoing values;
- from January 11 onward, company/year Forecast Initial is read-only and remains
  fixed unless the selected target year is admin-unlocked; per-Business Unit
  Initial Forecast columns are hidden in Annual Forecast Entry while the window
  is locked, but the saved values remain available to Management View;
- later Annual Entry changes update Ongoing Forecast in `forecast_annual.value`
  without changing `forecast_annual.initial_forecast`;
- the old Initial Forecast Excel bootstrap, snapshot table read path and
  automatic scheduler/consolidation endpoint are deprecated and must not be used
  for product behavior.

### 10.2 Monthly Forecast Entry filters

Monthly Forecast Entry uses a CSM multi-select dropdown so users can select one
or more CSMs and review the combined company portfolio. It uses the same
checkbox dropdown, selected-CSM summary and `Load` interaction as Annual
Forecast Entry. Monthly exports retain the selected multi-CSM portfolio.

### 10.3 Annual Forecast Entry

Normal `/forecasting/entry` contains a separate Annual Forecast Entry section
for CSMs, distinct from the Monthly Forecast Entry section.

Filters:

- CSM, using a multi-select dropdown so users can select one or more CSMs and
  see the combined company portfolio for all selected CSMs; default/preselection
  follows the same ownership/preselection logic as Monthly Forecast Entry;
- Year, starting at 2026 and including at least 2026 and 2027.

Year rules:

- options never include years before 2026;
- each year progressively exposes the following year;
- before December 10, the default is the current year;
- from December 10 through December 31, the default is the following year;
- from January 1, the default is the new current year.

Table rules:

- rows are all companies assigned to the selected Annual Forecast Entry CSM
  filter, including all selected CSMs when multiple CSMs are selected;
- default sorting is active companies first, inactive companies with Revenue or
  Planned second, inactive companies without Revenue or Planned last;
- the Company, Forecast Ongoing and Confidence
  headers can sort the currently visible Annual rows without changing
  persistence or the selected CSM/year filters;
- each visible Annual Business Unit header can sort the currently visible rows
  from highest to lowest Forecast Ongoing value for that Business Unit. Sorting
  uses saved Forecast Ongoing values when present, and the AI placeholder value
  when no CSM value is saved. Local edits keep their row in place; sorting and
  Active visibility are reapplied only after a successful save;
- inactive companies remain visible with muted styling by default;
- changing a Monthly or Annual row Active checkbox saves that company status
  immediately and updates the row in place without a batch/page reload;
- the Active column can filter the visible Annual rows to all companies, active
  companies only or inactive companies only; this is a client-side table view
  filter and does not modify `company_forecast_status`;
- company names link to Company Detail;
- Annual company rows show only the linked company name in the first column,
  without a company-level Forecast Ongoing total label or CSM label beneath it;
- Monthly Forecast Entry is the default tab when opening `/forecasting/entry`; Annual Forecast Entry loads only after the user selects its tab.
- The company-level Forecast Initial column starts collapsed to keep Forecast Ongoing prominent. An annual-header show/hide control reveals the existing Initial values and inputs on demand and collapses the column again; Forecast Initial is not sortable.
- Logs opens Company Detail at the company logs anchor in a new tab and each
  row action is labelled `See latest logs`;
- the Company and Confidence columns remain visible during horizontal scroll,
  the legend row spans the full horizontal table width, and table headers stay
  fixed during vertical scroll;
- the selected Annual CSM filter summary is shown as a highlighted total row directly
  under the table headers and above the first company row, with no Active, Confidence or Logs value, and with
  Forecast Initial, Forecast Ongoing, visible Business Unit totals, Closed
  Revenue YTD, Planned This Year and ratio values aligned under their columns.
  The highlighted total row stays visible below the sticky headers while users
  scroll down the Annual portfolio;
  when the Active visibility filter is used, this summary reflects the visible
  rows;
- Forecast Entry may display the official `Experience` Business Unit as `UX`
  while preserving `Experience` as the stored Business Unit value;
- Annual Forecast Entry displays Business Unit columns in the same CSM check
  order as Monthly: QA, UX/Experience, Accessibility, Security, FTE, TA, AI,
  OTHER/Other, Express, Community;
- while the Forecast Initial window is editable from January 1 through the
  automatic close date, each visible Business Unit is shown as two adjacent
  columns: `<Business Unit> Forecast Ongoing` and `<Business Unit> Initial
  Forecast`;
- during the automatic December 10-31 preparation window, or during any manual
  Petyr Admin unlock outside the January entry window, each Business Unit starts
  with its Initial Forecast column collapsed behind that Business Unit's
  Forecast Ongoing column. The Forecast Ongoing header keeps the Business Unit
  name, Forecast Ongoing label and sort state together in the sortable control,
  and exposes a separate per-Business Unit button immediately to the right to
  show or hide Initial Forecast only while Initial Forecast is editable. The
  Forecast Ongoing column may widen slightly while that separate button is
  visible;
- when the Forecast Initial window is locked and no admin unlock is active,
  Annual Forecast Entry hides the per-Business Unit Initial Forecast columns and
  does not show the per-Business Unit Initial Forecast expansion buttons;
- Management View Business Unit rows and Business Unit revenue charts display
  Business Units in that same order and with the same visible labels, while
  preserving official stored values (`Experience`, `Other`) internally;
- a button to the right of the legend collapses or shows all Business Unit
  columns, leaving only Active through Confidence and Closed Revenue YTD through
  Logs visible when collapsed;
- editable/manual-entry columns use a subtle manual-entry background so users can
  distinguish CSM-entered or to-be-entered values from consolidated/read-only data;
- numeric Annual Forecast Entry cells display integer values without decimal
  cents; they must be wide enough for values up to eight digits with Italian
  thousands separators, and zero or empty values should use a softer grey
  treatment than populated cells;
- Annual table body rows use compact vertical padding and top-align cell
  content. Saved/AI-confirmed labels and related AI Forecast references render
  on separate lines, and the AI Forecast reference uses the AI legend color;
- active status is manual and stored through `company_forecast_status`.

Annual values:

- FC Initial is stored by company + year in `forecast_annual_entry`;
- FC Initial is editable only from December 10 of year N-1 through January 10 of
  year N, or while Petyr Admin has unlocked that selected target year, then
  read-only;
- FC Ongoing Confidence is stored by company + year and accepts only `01 High`,
  `02 Mid` and `03 Low`;
- confidence is required only when Forecast Ongoing Business Unit values are
  modified without an existing confidence value;
- Business Unit annual forecast values use the official Petyr Business Units and
  remain stored in `forecast_annual`;
- each saved Business Unit value records `value_source=manual` or
  `value_source=ai_confirmed`;
- Business Unit Initial Forecast values are entered separately while the
  Forecast Initial window is open or admin-unlocked and are stored in
  `forecast_annual.initial_forecast`; they are not derived from Forecast
  Ongoing values;
- if a Business Unit Initial Forecast is saved before any Forecast Ongoing value
  exists for the same company/Business Unit/year, Petyr may create an internal
  initial-only annual row. Initial-only rows must be excluded from Forecast
  Ongoing totals, inactive-company Forecast Ongoing exports and Management
  Ongoing Forecast calculations;
- unclicked FC AI placeholders are not saved and do not contribute to FC Ongoing;
- clicked FC AI placeholders are saved as AI-confirmed if the value is not
  changed, or manual if the CSM edits the value;
- FC Ongoing is the sum of saved/confirmed Business Unit annual values.

Annual Revenue / Planned:

- Closed Revenue YTD is selected-year campaign revenue closed through today;
- Planned This Year is selected-year future campaign revenue from tomorrow through
  December 31 for planning-like statuses (`Draft`, `Plan`, `Planned`,
  `Planning`, `Pipeline`, `Tentative`, `Proposal`, `Proposed`), `Setup`,
  `Recruiting` and future `Running` campaigns;
- ratio columns are labelled `Revenue / Forecast Ongoing`,
  `Planned / Forecast Ongoing` and `Uncovered / Forecast Ongoing`;
- both revenue and planned values read from PostgreSQL materialized Redash-derived data, never Redash
  directly.

Audit:

- every effective Annual Forecast Entry save is grouped in
  `forecast_save_session` and written to `forecast_change_log` with source
  `Annual Forecast Entry`;
- audit rows include changed field, previous value, new value, user, timestamp,
  company, year and Business Unit when applicable. BU forecast audit values also
  include whether the new value is manual or AI-confirmed.

---

## 11. Closed revenue YTD

Former labels:

- `Worked YTD`;
- `Worked YQTD`.

New label:

- `Closed revenue YTD`.

Formula:

```text
Closed revenue YTD =
sum of closed campaign revenue from January 1 of selected year to today
```

For Branch:

```text
sum all campaign revenue for companies belonging to that branch
```

For Business Unit:

```text
sum all campaign revenue for that BU
```

For CSM:

```text
sum all campaign revenue for companies assigned to that CSM
```

For Company:

```text
sum all campaign revenue for that company
```

Campaign date:

- use mapped campaign end date when available;
- if date field is missing, do not silently fake the value;
- show diagnostic.

---

## 12. Planned through year end

Planned through year end is not the sum of future CSM forecasts.

It is based on future campaigns already planned in Redash.

Formula:

```text
Planned through year end =
sum of campaign revenue where campaign date > today
and campaign date <= December 31 of selected year
```

Rules:

- use future campaigns with planning-like statuses (`Draft`, `Plan`, `Planned`,
  `Planning`, `Pipeline`, `Tentative`, `Proposal`, `Proposed`), `Setup`,
  `Recruiting` and future `Running`;
- do not use future CSM forecast as planned through year end;
- do not use AI forecast as planned through year end.

---

## 13. Closed revenue + planned

Former label:

- `Worked + planned`.

New label:

- `Closed revenue + planned`.

Formula:

```text
Closed revenue + planned =
Closed revenue YTD + Planned through year end
```

Percentages:

- Branch:
  ```text
  Closed revenue YTD % = Closed revenue YTD / Branch yearly objective
  Closed revenue + planned % = Closed revenue + planned / Branch yearly objective
  ```

- Business Unit:
  ```text
  Closed revenue YTD % = Closed revenue YTD / BU yearly objective
  Closed revenue + planned % = Closed revenue + planned / BU yearly objective
  ```

- CSM:
  do not invent a CSM target. See section 15.

---

## 14. Yearly objectives

Yearly objectives are annual target values entered and updated by management.

They are distinct from:

- annual CSM forecast;
- monthly CSM forecast;
- closed revenue from Redash;
- planned campaign revenue from Redash;
- AI forecast.

Not allowed:

- inventing objective values;
- using annual forecast as an objective;
- deriving objectives from Redash;
- deriving objectives from closed revenue, planned campaigns or AI forecast;
- inventing CSM yearly objectives;
- hardcoding the dynamic Branch list.

### 14.1 Management Objectives section

Branch and Business Unit objectives must be managed in a dedicated management-facing section.

Suggested name:

```text
Management Objectives
```

Suggested location:

```text
Management View, bottom section
```

The legacy direct route `/forecasting/entry/objectives` may remain as a
management-only compatibility route.

Rules:

- the section is intended for management users;
- it must remain separate from monthly CSM forecast editing;
- it must not turn Forecast Entry into an objective editing surface for CSM monthly values;
- objective management has already been added/configured for the current MVP;
- do not add new objective-management tasks unless they address a specific bug;
- the section and API require the Petyr Access Layer permission `petyr:management:write`;
- Forecast Entry Annual Forecast remains CSM-owned and must not embed Management Objectives;
- the old temporary hardcoded password gate has been removed.

### 14.2 Branch Objectives

Branch objectives are annual.

Rules:

- management enters and updates Branch objective values;
- the Branch list remains dynamic and must derive from company ownership;
- source field: `company branch` / canonical `company_branch`;
- if a Branch has no configured objective for the selected year, Management View must show `n/a`;
- missing Branch objectives must produce diagnostics;
- do not invent missing Branch objectives;
- do not use annual forecast as Branch objective.

### 14.3 Business Unit Objectives

Business Unit objectives are annual.

Allowed Business Units:

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

Rules:

- management enters and updates Business Unit objective values;
- the Business Unit list is official and closed;
- if a Business Unit has no configured objective for the selected year, Management View must show `n/a`;
- missing Business Unit objectives must produce diagnostics;
- do not invent missing Business Unit objectives;
- do not derive Business Unit objectives from Redash;
- do not use annual forecast as Business Unit objective.

### 14.4 Calculations using objectives

Branch Yearly Objective feeds:

- Yearly View · Branch;
- `Closed revenue YTD / Yearly Objective`;
- `Closed revenue + planned / Yearly Objective`.

Business Unit Yearly Objective feeds:

- Business Unit View;
- `Closed revenue YTD / BU Yearly Objective`;
- `Closed revenue + planned / BU Yearly Objective`.

Single CSM View must not invent CSM targets.

### 14.5 Objective auditability

Every objective change must be traceable.

Minimum audit fields:

- scope type: `branch` or `business_unit`;
- scope key: branch name or official Business Unit name;
- year;
- previous value;
- new value;
- note;
- updated by, even if temporarily a placeholder until authentication exists;
- timestamp.

Important:

- branches are dynamic;
- yearly objective values can be keyed by branch, but if a new branch appears without objective, show `n/a` and diagnostics;
- Business Unit objective keys must stay within the official closed list.

---

## 15. CSM target logic

There is currently no official yearly objective for individual CSMs.

Therefore:

- do not calculate CSM percentages against fake targets;
- do not invent yearly objectives for CSMs;
- if a denominator is needed, use annual CSM forecast only if clearly labelled;
- otherwise show `n/a`.

This is a business decision still to be validated with Management/Finance.

---

## 16. Management View

Management View is read-only.

It must answer:

- how the year is performing vs objectives;
- how much revenue has already been closed;
- how much revenue is already planned through year end;
- where the business is expected to land by year end;
- which branches are over/underperforming;
- which Business Units are below historical pace;
- which CSM portfolios require attention.

Expected sections in approved rendering:

- Yearly View · Branch;
- Monthly Aggregate;
- Business Unit View;
- Single CSM View;
- Current year trend, visible only to users with `petyr:admin`;
- Revenue per Business Unit, visible only to users with `petyr:admin`.

The view must aggregate real PostgreSQL/Redash data plus Petyr forecast tables.

It must not be an editing area.

Management View consumes Branch and Business Unit objectives but does not edit them.
Objective editing belongs in the separate `Management Objectives` section.

Management View forecast comparison is annual and must show two distinct labels:

- `Initial Forecast` = frozen annual baseline for the selected year and scope;
- `Ongoing Forecast` = current/latest annual forecast for the selected year and scope.

Initial Forecast comes from Annual Forecast Entry. The default Forecast Initial
entry window remains December 10 of year N-1 through January 10 of year N.
Petyr Admin can temporarily unlock a selected target year outside that window;
when unlocked, CSM/IGSM users with `petyr:forecast:write` enter the values
through the same Annual Forecast Entry workflow.

If the frozen baseline is not available, show `n/a` for `Initial Forecast` and
surface a non-invasive diagnostic instead of inventing a baseline.

Management View Monthly Aggregate, Business Unit View and Single CSM View expose
read-only `Export Excel` controls for monthly rows. Exports use the selected
year and current Company Type Filter and must read from the same
PostgreSQL-backed Management read model as the UI.

---

## 17. Yearly View · Branch

The approved visual structure must remain unchanged.

For each branch:

### Branch

Derived dynamically from company ownership `company branch`.

### Yearly Objective

Management-entered annual Branch objective for the selected year.

If missing, show `n/a` and expose a diagnostic for missing Branch objective.

Do not use annual forecast as fallback.

### Initial Forecast

Sum the frozen Initial Forecast values available for company/Business Unit rows
belonging to the Branch for the selected year.

For 2026, use the one-shot imported Initial Forecast values.
From 2027 onward, use the automatic year-end consolidated baseline.
If no frozen baseline exists, show `n/a`.

### Ongoing Forecast

Sum the current/latest annual forecast values available for company/Business Unit rows
belonging to the Branch for the selected year.

Do not use planned future campaigns as forecast.
Do not confuse annual forecast with Yearly Objective.

### Closed revenue YTD

Sum of closed campaign revenue from January 1 to today for companies in the branch.

### Closed revenue YTD %

```text
Closed revenue YTD / Yearly Objective
```

### Closed revenue + planned

```text
Closed revenue YTD + Planned through year end
```

### Closed revenue + planned %

```text
Closed revenue + planned / Yearly Objective
```

---

## 18. Monthly Aggregate

Monthly Aggregate must remain visually identical to the approved rendering.

Mapping:

- Previous-month forecast = CSM forecast of type `previous_month`;
- Ongoing forecast = CSM forecast of type `ongoing`;
- AI Forecast = AI forecast;
- Closed revenue = real monthly campaign revenue from Redash/PostgreSQL.

The internal key currently called `real` can remain `real` if renaming increases risk, but user-facing labels must show `Closed revenue`.

---

## 19. Business Unit View

Business Unit View must remain visually identical to the approved rendering.

For each official Business Unit:

- Yearly Objective = management-entered annual BU objective for the selected year, if available;
- Initial Forecast = frozen Initial Forecast values available for that BU, or `n/a` when the frozen baseline is missing;
- Ongoing Forecast = current/latest annual forecast values available for that BU;
- Closed revenue YTD = Redash revenue from January 1 to today for that BU;
- Closed revenue YTD % = Closed revenue YTD / BU yearly objective;
- Closed revenue + planned = Closed revenue YTD + future planned campaign revenue for that BU;
- Closed revenue + planned % = Closed revenue + planned / BU yearly objective.

If a Business Unit objective is missing, show `n/a` and expose a diagnostic for missing BU objective.

---

## 20. Single CSM View

Single CSM View must remain visually identical to the approved rendering.

For each CSM:

- Initial Forecast = frozen Initial Forecast values available for company/Business Unit rows assigned to that CSM, or `n/a` when the frozen baseline is missing;
- Ongoing Forecast = current/latest annual forecast values available for company/Business Unit rows assigned to that CSM;
- Closed revenue YTD = Redash revenue from January 1 to today for companies assigned to the CSM;
- Closed revenue + planned = Closed revenue YTD + future planned campaign revenue for companies assigned to the CSM.

Since no CSM yearly objective exists:

- do not invent one;
- show `n/a` where a target-based percentage would be misleading;
- if annual CSM forecast is used as denominator, label it clearly.

---

## 21. Current year trend

The chart must remain visually identical.

Mapping:

- `forecastAI` = monthly AI forecast aggregate;
- `forecastMese` = monthly previous-month forecast aggregate;
- `forecastOngoing` = monthly ongoing forecast aggregate, if chart already supports it;
- `real` = monthly closed revenue from Redash/PostgreSQL.

User-facing label:

- `Actual` → `Closed revenue`.

Description:

- `actuals from Redash/campaign revenue` → `closed revenue from Redash/campaign revenue`.

---

## 22. Revenue per Business Unit

The section follows the approved Management View structure unless product explicitly requests a visual refinement.

Mapping:

- bars = closed revenue from Redash by Business Unit and year;
- closed revenue bars use the same color as `Closed revenue` in Current year trend;
- Initial Forecast is shown as a gray forecast marker when available;
- Previous-month forecast is shown as a marker compared with Initial Forecast: green when above Initial Forecast, yellow when below, neutral when aligned or when Initial Forecast is unavailable.

Rules:

- keep the three-year Business Unit comparison;
- separate each Business Unit card into an upper chart area with axes, bars and forecast markers, and a lower numeric values area;
- if historical forecast is missing, omit it or show `n/a` in the numeric area;
- do not invent a fake forecast line;
- do not silently use mock data.

Labels:

- `Actual revenue` → `Closed revenue`;
- `Forecast above Actual` → `Forecast above Closed revenue`;
- `Forecast below Actual` → `Forecast below Closed revenue`.

---

## 23. CSM Overview

CSM Overview is read-only.

It helps CSMs understand:

- which companies require forecast updates;
- which companies have relevant insights;
- which agreements are expiring;
- which companies have high residuals;
- which Business Units are below history;
- current near-term forecast status.

The section formerly labelled Urgent actions is labelled Relevant insights. CSM Overview relevant insights must not include inactive-company or locked-past-month/past-month-logged categories. High agreement residual evidence must point to the active residual agreement whose expiry date is closest to today. The affected-company card shows agreement evidence in the same compact style used by Client View company cards: agreement title, total value, residual, expiry and deal-link availability when available, and must not replace this evidence with the current month label.

It must not be the main editing area.

---

## 24. Company Detail

Company Detail is analytical and read-only for forecast values.

Company Detail uses the shared compact Petyr workspace shell and its integrated section navigation, as do Management View, CSM Overview and Forecast Entry. The shell has the fixed title `Petyr Forecasting Tool`, English authenticated-user status, FAQ and data-refresh controls; it does not repeat a view-specific title or description. Company Detail remains read-only for forecast data edits, but users must be able to change CSM filter, company, previous/next company and year through the Forecast Entry-style navigator backed by the Forecast Entry company ordering and the same canonical current Company Ownership rule used by Forecast Entry Monthly and Annual. The year/load control appears to the left of previous/next company navigation, and previous/next navigation must not repeat the CSM name.
The explicitly labelled Forecast status in the Company Detail header is connected to `company_forecast_status`. Users with `petyr:forecast:write` can change it between Active and Inactive directly from Company Detail; the change autosaves, creates a save session/change log row, and when set to Inactive clears numeric AI Forecast cache rows for that company. This status control does not make monthly or annual forecast values editable in Company Detail.

It must show:

- company;
- assigned CSM context, without repeating the CSM as a primary KPI card;
- explicitly labelled Forecast status next to the Forecast Entry link, autosaved for users with `petyr:forecast:write`;
- active agreements;
- agreement value;
- agreement residual;
- agreement expiry date;
- total Initial Forecast for the selected year as a primary KPI;
- monthly trend, visible only to users with `petyr:admin`;
- Business Unit summary with orange closed revenue, gray Initial Forecast and previous-month forecast markers colored green/yellow against Initial Forecast;
- Business Unit current-year view, visible only to users with `petyr:admin`, showing Business Unit totals with Ongoing Forecast, AI Forecast and Closed Revenue YTD; admins can expand a Business Unit to show the individual selected-year months with closed revenue, previous-month forecast, ongoing forecast and AI Forecast;
- relevant company insights, visible only to users with `petyr:admin` and showing only active rule-based categories;
- company campaigns showing the latest chronologically completed campaign plus running or planned campaigns by default, with all other campaigns behind an explicit expansion control;
- agreements and residual evidence showing agreements whose expiry date is after the moment of viewing by default, with expired or undated agreements behind an explicit expansion control;
- Company logs directly below agreement/residual evidence, containing notes and forecast changes, showing the latest three logs by default with an expansion control for previous logs;
- company note form, placed after Company logs, saving note-only company log entries without changing forecast values;
- company active status;
- admin-only Support details area, including Company context and extra metrics, Revenue by Business Unit detail, Monthly forecast rows, Annual forecast rows and AI forecast cache support tables.

Company Detail must show Company logs, including note-only entries and forecast save sessions, but must not be the main monthly forecast editing area. It must not expose the AI Forecast apply action, numeric AI Forecast row generation or CSM-facing Forecast Intelligence generation; those actions belong outside Company Detail. Company Detail must not load or render the latest successful Forecast Intelligence sentinel row for the selected company and year. Any future company-level intelligence experience must be redesigned in separate documented scope. Admin-only Data diagnostics must be available from the floating bottom-right menu instead of a support card in the body.

Campaign detail should show:

- campaign name;
- status;
- Business Unit;
- linked agreement;
- value/revenue;
- costs;
- GM%;
- campaign link.

Campaign rows in Company Detail must be ordered by End Date descending, with campaigns missing an End Date after dated campaigns.

Agreement display link rule:

- Master Agreements has no direct agreement link;
- if an agreement should be linked, use the deterministic deal link derived from a linked Master Campaigns row;
- if no linked campaign has a deal link, show `n/a`.

Agreement rows and agreement evidence should be ordered by operational expiry priority: active, non-expired agreements first; nearest expiry date first; active agreements without expiry after dated active agreements; expired or inactive agreements after active ones; then residual descending, total value descending and agreement name ascending.

---

## 25. Forecast Entry

Forecast Entry is the only area where monthly forecasts can be edited.

Forecast Entry uses the shared compact Petyr workspace shell and its integrated section navigation. The fixed shell title avoids a duplicated page heading; the Monthly and Annual switch uses the concise labels `Monthly` and `Annual`, and the editor starts directly with its controls and table. It remains the only route that may expose the manual AI Forecast apply action, but the Support tools area and floating Data diagnostics menu are visible only to users with `petyr:admin`. The Monthly forecast tab may expose a CSM-facing Forecast Intelligence section for users with `petyr:forecast:write`; that section renders validated consultative JSON and has no apply controls or OpenRouter prompt/debug output. The normal Monthly and Annual Forecast Entry sections must use one floating bottom-right `Save` button that remains visible while scrolling, replaces inline top/bottom save buttons and turns green for five seconds after an effective save. The existing monthly and annual forecast logic must be preserved unless a later task explicitly selects a bug fix.

When a user clears an editable Monthly or Annual Forecast Ongoing Business Unit
field, Save and Enter persist `0` instead of returning an empty-value error.
After each successful save, Forecast Entry reads the portfolio afresh so the
persisted Business Unit values and the Annual Forecast Ongoing total are shown
immediately and after a page reload.

Forecast Entry Monthly and Annual cards expose read-only `Export Excel`
controls at the right side of their respective filter rows. Monthly export creates one worksheet per month from January through
the current month for the current year, or all 12 months for other selected
years. Annual export includes the selected Annual Entry portfolio and must
include per-Business Unit Initial Forecast columns even when those columns are
hidden in the current UI.

Forecast Entry FAQ lives on a separate page:

```text
/forecasting/entry/faq
```

The shared Petyr workspace header must expose the top-right `?` help control in every workspace section, not only Forecast Entry. The FAQ page must use the same four-section workspace navigation so users can continue to Management, CSM Overview, Company Detail when context exists, or Forecast Entry without losing selected query context when available.
The help control must also show the visible text `FAQ` next to the question mark so the destination is explicit. The FAQ content must explain Forecast Ongoing, Previous Month Forecast, Forecast Initial, change logs and the input deadline windows, in addition to the existing forecast-ordering, editability, deterministic preview and Forecast Intelligence boundaries.

A separate `Management Objectives` section lives at the bottom of Management View.
The legacy route may remain available for management users:

```text
/forecasting/entry/objectives
```

This section is for management-entered annual Branch and Business Unit objectives.
It must remain separate from CSM monthly forecast editing.
The section and its API require `petyr:management:write`. It must not be
presented at the bottom of Forecast Entry Annual Forecast, because Annual
Forecast is the CSM-owned annual forecast.

It must support:

- selecting/filtering CSM;
- selecting Month and Year for Monthly Forecast Entry and pressing `Load` to load a non-default period;
- selecting company;
- navigating previous/next company;
- seeing the company counter;
- editing only the forecast type allowed by the monthly editing rule;
- saving with explicit note;
- saving company active/inactive status;
- showing AI forecast as non-editable reference;
- showing closed revenue as non-editable reference.

The Forecast Entry CSM/company navigator remains sticky while users scroll down
the editor so the active CSM filter, selected company and company navigation stay
available. The workspace header already identifies the page, so the body must
not repeat a second `Forecast Entry` title and explanatory paragraph immediately
below the section navigation.

When the CSM saves, the system must register:

- company;
- CSM;
- year;
- month;
- Business Unit;
- forecast type;
- previous value;
- new value;
- AI forecast visible at save time;
- CSM note;
- timestamp;
- source;
- company active/inactive status;
- user.

Multiple BU edits in one save action must be grouped into one save session.

Forecast Entry logging must include only fields that actually changed:

- if one Business Unit changes, the change log contains only that Business Unit;
- if active/inactive changes, the change log contains only that status change;
- unchanged Business Units must not generate change log rows;
- unchanged forecast values must not be logged just because they were submitted.

---

## 26. Forecast change history

Forecast change history is operational, not just technical audit.

It must be visible in:

- Forecast Entry;
- Company Detail.

Correct structure:

```text
1 save action = 1 save session
1 save session = N modified Business Units
```

A change log row must include at least:

- save session id;
- company;
- Business Unit;
- field name;
- previous value;
- new value;
- AI forecast value at save;
- created by;
- created at.

Change history must be sparse and truthful:

- no row for an unchanged Business Unit;
- no row for unchanged active/inactive status;
- no row for unchanged notes unless note history is explicitly implemented and documented;
- no synthetic rows to make all Business Units appear in a save session.

---

## 27. Company active/inactive

Company active/inactive is not a simple filter.

It is a CSM-owned forecasting status.

It must:

- be saved explicitly;
- be shown in Forecast Entry and Company Detail;
- influence priority ordering;
- not hide inactive companies;
- put inactive companies lower in priority;
- clear numeric AI Forecast cache rows from `ai_forecast_cache` when a company
  is explicitly saved as inactive;
- be tracked in change history/save session.

Inactive companies remain visible. Cleaning AI Forecast cache for an inactive
company must not mutate CSM forecast rows, Annual Forecast rows, Initial
Forecast, Closed revenue, management objectives or Redash-derived data.

External Excel import/export format:

- `active`;
- `inactive`;
- empty cell = do not modify the current status.

The Excel export should show the current known active/inactive status when
available. If it does not, this must be corrected in a dedicated follow-up task.

---

## 28. Forecast Entry priority ordering

Forecast Entry company ordering is not simply alphabetical.

The priority score should consider:

- company active score;
- agreement residual;
- near-expiration score;
- risk score;
- forecast update missing;
- Business Unit below history;
- strong gap between AI forecast and CSM forecast.

Inactive companies should move lower in priority, not disappear.

Detailed ordering rules and current implementation status live in:

```text
docs/petyr/COMPANY_ORDERING.md
```

---

## 29. AI Forecast

AI forecast must be treated as a read-only reference, not as a final value.

Petyr must now move from pure design to a first testable MVP, but the MVP scope
is deliberately controlled:

- AI forecasting is manually triggered;
- the trigger is company by company;
- do not run a global automatic LLM/OpenRouter batch in this phase;
- OpenRouter-backed manual endpoints must not process all companies together;
- the goal is to control OpenRouter cost/credits and test result quality before
  expanding automation.

Accepted deterministic automation:

- Petyr runs a dedicated nightly deterministic-only worker for active companies;
- default schedule: `02:00` in `Europe/Rome`;
- default inter-company delay: `3000ms`;
- target year: current Rome year;
- company scope: all Forecast Entry companies except those explicitly marked inactive;
- inactive cleanup: before processing active companies, delete numeric
  `ai_forecast_cache` rows for companies explicitly marked inactive;
- persistence: `ai_forecast_cache` only;
- model version: daily value such as `petyr_deterministic_preview_v1@YYYY-MM-DD`;
- repeat runs for the same company, Business Unit, year, month and model
  version overwrite the existing AI Forecast cache row instead of skipping it;
- no OpenRouter call, Forecast Intelligence call, CSM forecast write, annual forecast write,
  management objective write, Initial Forecast write, closed revenue write or Redash write.

Petyr Admin may trigger the deterministic Daily AI Forecast for all active
companies as an operational recovery run. That route is not an OpenRouter/LLM
batch and uses no inter-company delay in the browser request.

Granularity:

```text
company + Business Unit + future month + year
```

The first MVP does not create annual AI forecast values. Annual or global AI
forecasting requires a separate documented decision.

AI Forecasting must be hybrid:

```text
deterministic local forecast + local business signals + consultative LLM intelligence
```

Rules:

- Petyr computes every numeric forecast value locally from PostgreSQL-backed historical closed revenue, seasonality, run-rate, planned target-month campaigns, trend/seasonality signals and agreement residual allocation where available;
- Petyr must not calculate numeric AI Forecast rows for a company unless the
  selected year detail has at least one agreement whose expiry date is after the
  current date and whose residual value is greater than 0;
- Petyr must generate numeric AI Forecast rows only for Business Units where
  that selected company has positive historical closed revenue; planned future
  value or generic agreement residual alone must not create an AI Forecast row
  for a Business Unit where the company has never had revenue;
- all monetary forecast values exposed or saved by AI Forecast are rounded to integer EUR; confidence, ratios and attribution shares may remain decimal;
- CSM-entered monthly and annual forecast values are comparison/reference data only and must not be sent to OpenRouter or used to calculate `aiForecastValue`;
- Petyr may keep internal consultative scenarios for deterministic support tooling, but Forecast Intelligence must not request, validate, render, chart or expose rounding/adjustment scenarios;
- the LLM may reference only metrics and signals already present in the payload; it must not invent numbers, recalculate, adjust, smooth, round, override or write forecast values;
- Petyr may perform one server-side strict-JSON retry when OpenRouter returns prose, code fences or otherwise invalid JSON; the retry must still pass the same strict schema and Petyr validation before it can be used;
- Petyr keeps the deterministic target set plus local metrics, planned value, residual allocation, BU attribution and trend signal as server-owned evidence; output with missing required fields, unexpected fields, missing numeric evidence, invented numbers, visible rounding-scenario references or prescriptive operational instructions is invalid;
- AI Forecast output is saved only in `ai_forecast_cache`;
- the manual AI Forecast apply UI is exposed only in Forecast Entry's admin-visible support tool;
- CSM-facing Forecast Intelligence generation is allowed in Forecast Entry Monthly forecast for users with `petyr:forecast:write`, but it is consultative-only and may save/reuse only the sentinel intelligence cache row;
- Company Detail may show numeric `ai_forecast_cache` rows as read-only evidence but must not generate or apply numeric AI Forecast rows;
- AI Forecast must not modify CSM forecast, closed revenue, management objective, Initial Forecast or annual forecast data.

Manual MVP month eligibility:

- AI Forecast must not write past months;
- AI Forecast must not write the current month;
- the fact that the current month is not eligible for writing must not delete or
  clear an already saved current-month AI Forecast cache row;
- AI Forecast can generate or update only future months of the selected year;
- if the selected year is before the current year, there are no eligible months;
- if the selected year is after the current year, all months 1-12 are eligible;
- if the selected year is the current year, only months after the current month
  are eligible.

Deterministic baseline strategies:

- Historical weighted baseline: use company + Business Unit historical closed
  revenue, weighted toward recent months and comparable prior-year periods.
- Monthly seasonality: use same-month history and Business Unit seasonal
  patterns; sparse history must lower confidence and surface as a driver.
- Run-rate: use current-year or trailing-period closed revenue pace as a
  stabilizer, dampened when activity is volatile or sparse.
- Planned campaigns: include only valid future planned campaigns for the target
  month and Business Unit. Planning-like statuses (`Draft`, `Plan`, `Planned`,
  `Planning`, `Pipeline`, `Tentative`, `Proposal`, `Proposed`), `Setup`,
  `Recruiting` and future `Running` are planned future. `Running` with end date
  today or in the past belongs to revenue/closed/current-activity reasoning when
  eligible there. The total valid planned value for the exact company, Business
  Unit and target month is a non-derogable AI Forecast floor; residual
  allocation may cap only the additional agreement-linked signal, never lower
  the final suggestion below that planned value.
- Agreement residual allocation: consider only active agreements with `residual > 0` and future expiry. Link agreements to campaigns by company plus agreement name, estimate remaining months to expiry, allocate residual over time, attribute to Business Units through sanitized title tokens, linked-agreement history, then company+BU history fallback, and cap only the agreement-linked forecast component so it cannot exceed the residual allowance. Linked planned campaigns above the allowance create a local watchout signal.

The LLM intelligence layer:

- receives only the normalized deterministic payload;
- produces only stakeholder notes, risks, watchouts and opportunities, each with payload-backed numeric evidence; it does not produce status, confidence, executive summary, key insights, drivers, forecast cues, chart candidates, data-quality notes or CSM questions;
- may reference only metrics and signals already present in the payload;
- must not provide prescriptive operational instructions;
- must not calculate or propose a final AI Forecast value;
- must not invent evidence, titles, deal names or forecast values from a blank prompt.

Possible AI inputs:

- historical revenue by company;
- historical revenue by Business Unit;
- monthly seasonality;
- previous years’ trend;
- planned campaigns;
- valid planned future campaign status counts/value;
- agreement residual;
- agreement expiry date;
- agreement consumption pace;
- branch trend;
- Business Unit trend.

Expected local forecast-row output:

- Business Unit;
- year;
- month;
- rounded deterministic forecast value;
- planned campaign value for that target month only;
- agreement residual signal and residual allocation;
- BU attribution signal;
- trend/seasonality signal;
- consultative scenarios rounded to 100 EUR steps;
- confidence score;
- short explanation/context;
- drivers;
- generation date;
- model version.

OpenRouter must be asked for strict JSON matching the Forecast Intelligence response contract; server-side validation remains authoritative before any cache write.

Expected normalized forecast-row shape:

```json
{
  "businessUnit": "QA",
  "year": 2026,
  "month": 7,
  "baselineForecast": 1700,
  "roundedForecastValue": 1700,
  "roundingGranularity": 100,
  "plannedCampaignsValue": 2800,
  "agreementResidualAllocation": {
    "residualValue": 3000,
    "allocatedResidualValue": 1000,
    "monthlyResidualCap": 1000,
    "plannedExceedsResidual": true,
    "remainingMonths": 3,
    "attributionMethod": "title_token",
    "matchedTokens": ["qa"],
    "status": "capped"
  },
  "businessUnitAttribution": {
    "method": "title_token",
    "confidence": "high",
    "matchedTokens": ["qa"],
    "share": 1
  },
  "trendSignal": {
    "direction": "growth",
    "ratio": 1.15,
    "summerSlowdown": false,
    "overConsumption": false
  },
  "consultativeScenarios": [
    { "id": "floor_100", "value": 1700 },
    { "id": "nearest_100", "value": 1700 },
    { "id": "ceil_100", "value": 1700 }
  ],
  "aiForecastValue": 1700,
  "confidenceScore": 0.74,
  "drivers": ["monthly_seasonality", "planned_campaigns_target_month", "agreement_residual_allocation"]
}
```

### 29.1 AI Forecast privacy and data minimization

AI forecasting must minimize what is sent to an LLM/OpenRouter.

Detailed design, payload schemas, pseudonym mapping rules, month eligibility,
manual execution behavior and privacy checklist live in:

```text
docs/petyr/AI_FORECASTING_DESIGN.md
```

That document is the implementation reference for future production AI
forecasting work. It does not introduce production LLM calls by itself.

For this first manual MVP, a complete anonymization tool/API is deferred and
must not block an initial controlled company-by-company test. The MVP should
still minimize payloads, avoid unnecessary free text and links, and keep API
keys server-side. Definitive privacy protection is therefore not implemented in
the manual MVP yet; it remains a required future hardening task before broader
production rollout.

When the dedicated anonymization tool/API is available, payloads sent to an
external LLM must not contain:

- company name;
- CSM name;
- campaign name;
- agreement name;
- deal link;
- campaign link;
- other identifying free text.

Use temporary internal pseudonyms instead, for example:

- `company_001`;
- `business_unit_QA`;
- `csm_001`;
- `campaign_001`;
- `agreement_001`.

Rules:

- the pseudonym to real-entity map must remain server-side only;
- AI responses must be reassigned internally to the correct company/Business Unit;
- do not send unnecessary text fields;
- send only minimized numeric and categorical features needed for the forecast;
- AI Forecast must never modify AI forecasts for past months;
- AI Forecast must never modify the current month;
- AI Forecast must generate or update only future months of the selected year;
- OpenRouter API keys must remain server-side and must never be exposed to the browser.

---

## 30. AI notes and alerts

Alerts are hybrid.

### Rule-based alerts

Do not require LLM:

- agreement expiring within 60 days;
- high agreement residual;
- expired agreement with residual;
- inactive company;
- forecast not updated;
- past month locked;
- past campaign not completed, for Company Detail campaigns whose end date is
  today or in the past but whose status is not `Completed`.

`agreement expiring within 60 days` must include only agreements whose expiry
date is today or in the future and within 60 days. Expired agreements must not
generate this warning.

Expired agreements with residual value must be shown in a separate
informational/operational category:

```text
Expired agreement with residual
```

Rules:

- show the residual value;
- do not mix this category with `expiring within 60 days`;
- do not treat it as an expiring-soon warning.

### LLM-based alerts

Can use LLM reasoning:

- historical trend reading;
- Business Unit under-potential suggestions;
- explanation of gaps between CSM forecast, AI forecast and closed revenue;
- commercial or operational opportunities.

Rules:

- alerts must be actionable;
- avoid generic AI notes;
- show the companies affected where possible.

---

## 31. AI model logic

OpenRouter model selection must be managed from the admin UI.

Rules:

- API key comes from `.env`;
- never expose the API key to the browser;
- model list should be loaded from OpenRouter API through a server route;
- selected model should be persisted in Petyr settings;
- fallback must be visible if OpenRouter is unavailable;
- model must be selectable from interface.

OpenRouter-backed AI forecast generation for the first MVP remains manual and company-by-company.

Rules for this cycle:

- no automatic LLM/OpenRouter global batch after Redash sync;
- no OpenRouter-backed manual request that processes all companies together;
- the user/operator selects one company and target year;
- Petyr generates or updates only eligible future months for that company and
  Business Unit scope;
- nightly deterministic-only automation is allowed through `petyr-ai-forecast-worker`;
- Petyr Admin may run the deterministic Daily AI Forecast for all active
  companies as an operational recovery action; that manual browser-triggered
  run uses the same deterministic service and advisory lock as the scheduled
  worker but without the inter-company delay;
- future automated or progressive LLM/OpenRouter batch processing requires a
  separate product and cost-control decision.

---

## 32. Admin temporary area

`/petyr-admin` must exist.

It is used for these visible sections, in display order:

- data health diagnostics;
- feedback ticket queue, status management and Excel export;
- performance test results for sanitized server-side operation measurements;
- operator link to the Redash Ingestor dashboard at `/redash-ingestor`;
- PostgreSQL database backup export/import for server migration and controlled recovery;
- Forecast Initial window unlock by target year;
- deterministic Daily AI Forecast monitoring and manual run;
- AI preview backtest;
- AI Forecast baseline weights;
- OpenRouter model settings;
- Excel monthly forecast import/export as the recommended admin workflow;
- Excel annual Forecast Ongoing import for the 2026 workbook;
- inactive companies annual Forecast Ongoing export;
- one-time 2026 closed revenue alignment.

The visible admin area must not show legacy Initial Forecast baseline/import
workflows, legacy CSV forecast import/export or Redash mapping diagnostics
sections. Existing compatibility endpoints/services may remain for controlled
operations unless a later task explicitly removes backend/API support.

Forecast Initial window admin workflow rules:

- endpoint: `GET /api/petyr/admin/initial-forecast-window`;
- endpoint: `PUT /api/petyr/admin/initial-forecast-window`;
- both endpoints require `petyr:admin`;
- the override is stored in `app_setting` with key
  `petyr_initial_forecast_window_overrides_v1`;
- the admin may unlock or lock one selected Annual Forecast Entry target year;
- unlocked years allow normal users with `petyr:forecast:write` to enter or
  edit Forecast Initial through Annual Forecast Entry;
- locking a year again restores the default December 10-January 10 window and
  must not modify existing Initial Forecast values.

Feedback ticket rules:

- all authenticated users with `petyr:read`, `petyr:feedback:manage` or
  `petyr:admin` can submit feedback from the global bottom-left feedback control;
- categories are `Bug`, `Experience`, `Data issue` and `Other`;
- submitted tickets are stored in `user_feedback_ticket` with status `open`;
- Petyr stores authenticated user identity, current page, feedback message,
  sanitized browser basics and the latest sanitized route/click/form-submit
  activity;
- Petyr must not store form field values, passwords, tokens, uploaded workbook
  contents, raw page HTML, request bodies or API keys in feedback context;
- `/petyr-admin/feedback` requires `petyr:feedback:manage` or `petyr:admin` and lets authorized reviewers review tickets,
  export all tickets to Excel and mark tickets `Open`, `In progress` or
  `Resolved`;
- users with `petyr:feedback:manage` or `petyr:admin` see a `Review feedback`
  extension beside the global Feedback control with the open-ticket count;
- a grant containing only `petyr:feedback:manage` is valid and lands directly on
  `/petyr-admin/feedback`, without granting Forecasting or unrelated Petyr Admin access;
- the admin-only Data diagnostics floating menu may also show the open feedback
  ticket count and link to `/petyr-admin/feedback`.

Database backup workflow rules:

- purpose: move the shared PostgreSQL data hub to a new server or run a controlled recovery;
- export endpoint: `GET /api/petyr/admin/database-backup/export`;
- import endpoint: `POST /api/petyr/admin/database-backup/import`;
- both endpoints require `petyr:admin` and `x-app-secret: APP_INTERNAL_SECRET`;
- export uses a native PostgreSQL SQL dump, not a custom JSON/table export;
- the dump includes Redash snapshots, Redash metadata/materialized tables and Petyr-owned forecast/admin tables in the configured PostgreSQL database;
- import accepts only `.sql` dumps generated by this workflow and runs PostgreSQL restore with stop-on-error behavior;
- restore is destructive when the SQL dump contains clean/drop statements and must be used only on a new target server, disposable environment or controlled recovery after taking a backup;
- restore must not call Redash, OpenRouter or any external service;
- this workflow does not replace the platform production backup standard in `docs/08_operational_commands.md`: Coolify/host-level backups, encrypted offsite copy, daily retention for 5 days, weekly retention for 3 weeks, RPO 24 hours, target RTO 8 hours and no v1 PITR.

Excel admin workflow rules:

- default/focus year is 2026 for historical forecast input;
- export must create a CSM-friendly `.xlsx` workbook with instructions, forecast input, official Business Unit reference, Company Ownership reference and validation rules;
- import reads the `Forecast Input` sheet and writes only CSM-owned monthly forecast fields: previous-month forecast, ongoing forecast, company active status and notes;
- Closed revenue reference is read-only and must never be imported or manually modified in Petyr;
- AI forecast reference is read-only and must never be imported or manually modified by the admin workflow;
- Excel import must create save sessions and change logs coherently with other massive forecast saves;
- validation errors and warnings must be visible in the admin result;
- manager/CSM access scoping is deferred to the future access-control layer and must not be invented ad hoc.

Annual Forecast Ongoing Excel import rules:

- endpoint: `POST /api/petyr/admin/import-annual-forecast-xlsx`;
- the endpoint requires `petyr:admin`;
- the admin UI must run a dry-run validation before apply;
- default/focus year is 2026;
- the workbook source sheet is `ITA_Andamento lavorato VS Forec`;
- import reads only the Business Unit columns after `FORECAST ONGOING`;
- the calculated `FORECAST ONGOING` total is used only to decide inactive status and must not be persisted directly;
- workbook Business Unit headers map to official Petyr values: `QA` -> `QA`, `UX` -> `Experience`, `Accessibility` -> `Accessibility`, `Security` -> `Security`, `FTE` -> `FTE`, `TA` -> `TA`, `AI` -> `AI`, `OTHER` -> `Other`;
- `Community` and `Express` are not touched because the workbook has no columns for them;
- `Customer` is the Petyr company key for this workbook;
- workbook `Company` is optional reference data only and must not be used as a fallback or aggregation key;
- duplicate Customer rows are aggregated before import and reported as warnings;
- rows with importable values and an empty Customer cell are validation errors;
- blank cells in imported Business Unit columns become `0` only when Petyr already has an existing annual value for that Customer + Business Unit + Year; otherwise no zero row is created;
- if the aggregated workbook Forecast Ongoing total for a Customer is zero, save `company_forecast_status.is_active=false`;
- by default, Customers absent from the workbook are not touched;
- Petyr Admin exposes an unchecked opt-in checkbox to mark all canonical Company Ownership companies absent from the workbook as inactive during dry-run/apply;
- positive Forecast Ongoing totals must not force inactive companies back to active;
- persistence writes only `forecast_annual.value` with `value_source=manual`, `status=draft`, and `company_forecast_status` inactive updates;
- the import must not write `forecast_annual.initial_forecast`, `forecast_annual_entry.initial_forecast`, `forecast_annual_entry.ongoing_confidence`, monthly forecast, Closed revenue, AI forecast cache, Redash materialized data or Management Objectives;
- effective changes create `forecast_save_session` and `forecast_change_log` rows with source `Admin Annual Forecast Import`.

Inactive companies annual Forecast Ongoing export rules:

- endpoint: `GET /api/petyr/admin/export-inactive-companies-annual-forecast-xlsx?year=YYYY`;
- the endpoint requires `petyr:admin`;
- default/focus year is 2026;
- the export is read-only and writes no database rows;
- it includes companies explicitly saved as inactive in `company_forecast_status`;
- total saved revenue is the sum of `forecast_annual.value` for the selected year;
- revenue by Business Unit is grouped by the official Petyr Business Units;
- missing saved annual values export as zero for the relevant inactive company/Business Unit;
- unofficial or unknown Business Unit values are normalized to `Other`;
- the export must not use Closed revenue, monthly forecast, AI forecast, Forecast Initial, Redash materialized data or Management Objectives as revenue values.

Monthly import behavior must not be changed outside tasks explicitly dedicated
to monthly import performance/status. New imports for Initial Forecast 2026
must be separate and must not alter the existing monthly import behavior.
Monthly Excel performance/status visibility is limited to sanitized server-side
operation measurements and existing import result counters unless a later task
explicitly changes import behavior.

Performance results rules:

- endpoint: `GET /api/petyr/admin/performance-results`;
- table: `petyr_performance_measurement`;
- visible values: service, operation, status, duration, row count, measured time
  and scalar metadata;
- high-level admin statistics: measured coverage, sample count, success/failure
  samples, overall average duration and per-operation average, median and p95
  duration from recent persisted samples;
- allowed writers: Forecasting app and Redash Ingestor instrumentation helpers;
- forbidden values: raw Redash payloads, uploaded workbook contents, customer
  rows, API keys, secrets and browser DevTools timing values.

Legacy Initial Forecast snapshot operations:

- the old Initial Forecast Excel export/import endpoints have been removed from
  the product API;
- the old protected Initial Forecast consolidation endpoint has been removed
  from the product API;
- `forecast_annual_snapshot` and `forecast_annual_snapshot_change_log` are
  deprecated historical tables and are not product read sources;
- current product behavior must use Annual Forecast Entry only.

---

## 33. Data health

Admin should expose diagnostics for:

- Redash source existence;
- latest snapshot;
- materialized tables;
- row counts;
- columns present;
- missing columns;
- missing mappings;
- empty tables;
- unavailable company ownership;
- missing company branch.

If data is missing, do not silently fallback to mock data.

Expected data health checks:

- if `redash_raw_master_campaigns_latest` does not exist: blocking issue;
- if it exists but has 0 rows: warning/blocking issue;
- if company column is missing: blocking issue;
- if campaign value/revenue column is missing: blocking issue;
- if campaign date/end date is missing: strong warning/blocking issue for YTD/monthly trend;
- if company ownership is missing: warning because current CSM/branch mapping may be unreliable;
- if company branch is missing: warning/blocking issue for branch aggregation.

---

## 34. Approved rendering adapter strategy

The safest implementation strategy is:

1. keep `PetyrMVPRendering.tsx` as the visual component;
2. make it data-driven through props;
3. keep the adapter contract compatible with the approved rendering data shapes;
4. keep the JSX structure unchanged.

Recommended adapter:

```text
apps/forecasting-app/src/services/petyrApprovedRenderingAdapter.ts
```

Recommended function:

```ts
export async function getPetyrApprovedRenderingData(year: number): Promise<PetyrApprovedRenderingData>
```

The adapter should call:

- `getManagementView(year)`;
- `getCsmOverviewWorkspace(year)`;
- other existing Petyr services only if necessary.

It should return structures matching the current rendering shapes, for example:

- `monthlyManagement`;
- `budgetGroupSeries`;
- `branchRows`;
- `businessUnitRows`;
- `managementRows`;
- `csmCustomersBase`;
- `companyProfiles`;
- `diagnostics`.

---

## 35. Data fallback rule

Do not use mock data silently.

Acceptable:

- keep mock data as local dev fallback only if gated by explicit environment flag;
- show diagnostics if real data is missing;
- render real PostgreSQL fallback rows from campaigns, agreements or Petyr forecast tables when company ownership is unavailable, with visible warnings and Branch `Unassigned Branch`;
- return empty states when real data is unavailable.

Not acceptable:

- showing fake production numbers;
- falling back to the original mock without telling the user;
- showing mock customers because company ownership is empty while real PostgreSQL campaign, agreement or forecast rows exist;
- masking missing Redash mappings.

---

## 36. Copy rules

Use these user-facing labels:

- `Worked YTD` → `Closed revenue YTD`;
- `Worked YQTD` → `Closed revenue YTD`;
- `Worked + planned` → `Closed revenue + planned`;
- `Actual` → `Closed revenue`;
- `Actual revenue` → `Closed revenue`;
- `Actual €` → `Closed revenue €`;
- `Forecast above Actual` → `Forecast above Closed revenue`;
- `Forecast below Actual` → `Forecast below Closed revenue`;
- `Actual/progress` → `Closed revenue/progress`;
- `Actual / progress` → `Closed revenue/progress`;
- `Expected actual` → `Expected closed revenue`;
- `actuals from Redash` → `closed revenue from Redash`.

Internal variable names can remain unchanged if renaming would increase implementation risk.

---

## 37. Terms to avoid in user-facing UI

Avoid these labels in visible UI:

- Worked YTD;
- Worked YQTD;
- Worked + planned;
- Actual;
- Actual revenue;
- Actual €;
- Actual/progress;
- Expected actual.

Use `Closed revenue` wording instead.

---

## 37.1 Numeric display formatting

All user-visible Petyr monetary, percentage and decimal values must use Italian
numeric formatting with exactly two decimal digits:

- monetary values: `1.234.567,89 €`;
- percentages: `12,34%`;
- non-monetary decimal values: `1.234,56`.

This applies to charts, chart tooltips, chart labels/legends when they show
values, tables, KPI cards, Forecast Entry summaries, Annual Forecast,
Management Objectives, Company Detail, CSM/Management views and Petyr Admin
import/export summaries.

Missing numeric values must render as `n/a`; real zero values must render as
`0,00` or `0,00 €` depending on context.

Do not apply the two-decimal display rule to technical IDs, years, months,
CPID/campaign/agreement IDs or row/import counts that must remain integers.
Forecast Entry numeric entry cells are also an explicit exception: Monthly
Forecast Entry and Annual Forecast Entry show integer monetary values without
decimal cents while preserving Italian thousands separators.

Excel exports for CSM/management workflows must keep editable/calculable values
numeric and apply compatible number formats for monetary values and percentages
instead of exporting those cells as formatted strings.

---

## 38. Recommended verification commands

Search for remaining mock data sources:

```bash
rg -n "const monthlyManagement|const branchRows|const businessUnitRows|const managementRows|const budgetGroupSeries|const csmCustomersBase|const companyProfiles" apps/forecasting-app/src/components/petyr/PetyrMVPRendering.tsx
```

Search for old labels:

```bash
rg -n "Worked|worked|Actual|actual|actuals|Actuals|Actual/progress|Expected actual|Forecast above Actual|Forecast below Actual" apps/forecasting-app docs
```

Check Redash materialized tables:

```bash
docker compose exec postgres psql -U unguess -d unguess_redash -c "\\dt redash_raw_*"
docker compose exec postgres psql -U unguess -d unguess_redash -c "select count(*) from redash_raw_master_campaigns_latest;"
docker compose exec postgres psql -U unguess -d unguess_redash -c "select count(*) from redash_raw_master_agreements_latest;"
docker compose exec postgres psql -U unguess -d unguess_redash -c "select count(*) from redash_raw_company_ownership_latest;"
```

Build:

```bash
npm run build
```

---

## 39. Definition of done

A Petyr implementation task is done only if:

- the approved UI is visually stable;
- no redesign was introduced;
- Redash/PostgreSQL real data is used where required;
- no mock data is silently used in production;
- branch comes dynamically from company ownership;
- Branch and Business Unit yearly objectives are management-entered annual values, not annual forecast values;
- missing Branch or Business Unit objectives show `n/a` and diagnostics;
- Closed revenue labels are applied in user-facing UI;
- Forecast Entry is the only monthly editing area;
- Company Detail and CSM Overview remain read-only;
- diagnostics are visible or available when data/mapping is missing;
- build passes.
