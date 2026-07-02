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
- CSM notes;
- save sessions;
- change history;
- AI forecast cache;
- AI model settings;
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
- CSM portfolio/company lists must not assign each company only to the single
  latest workspace owner when `company_ownership` exposes multiple workspaces;
- for CSM Overview and Forecast Entry portfolio lists, include every
  company-CSM association whose workspace was updated in the last 6 months,
  using `workspace_updated_on` from `company_ownership`;
- if no recent workspace associations are available, Petyr may fall back to the
  latest owner per company with diagnostics instead of returning mock data;
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
- map missing or unknown BU values to `Other`;
- add diagnostics for unknown values;
- preserve the official list in views and filters.

Objective rules:

- only the official Business Unit list above can receive yearly objectives;
- Business Unit yearly objectives are annual management-entered values;
- do not derive Business Unit objectives from Redash;
- do not invent Business Unit objectives.

---

## 8. Forecast types

Petyr must manage four distinct values.

### 8.1 Previous-month forecast

This is the forecast inserted by the CSM before or at the beginning of the reference month.

Editable:

- current month until day 15 included;
- future months.

Read-only:

- past months.

### 8.2 Ongoing forecast

This is the revised forecast during the month, when the CSM has more information.

Editable:

- current month only, from day 16 onward.

Not editable:

- past months;
- future months.

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
- if month = current month and day <= 15: edit previous-month forecast;
- if month = current month and day > 15: edit ongoing forecast;
- if month > current month: edit previous-month forecast.

Past months are never editable.

Monthly Forecast Entry table rules:

- Business Unit groups start collapsed and show only the active editable field;
- Expand/Collapse must look like an actionable button and sit at the far right
  of the Business Unit group header;
- the Monthly table uses its own vertical scroll area; the CSM, Month, Year and
  Load control row plus the legend stay sticky above it, while the Monthly
  section title, period summary and editability notice scroll away. Monthly
  table headers stay fixed at the top of the table while users scroll down the
  portfolio;
- when a Business Unit is expanded, Previous Month Forecast is shown to the left
  of Ongoing Forecast and Closed Revenue YTD is shown to the right of Ongoing
  Forecast;
- editable monthly forecast columns should be wide enough for their header
  labels;
- Closed Revenue YTD is read-only.

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
- during that window, saved Business Unit annual values also populate
  `forecast_annual.initial_forecast` for the same company, Business Unit and
  year;
- the company/year total in `forecast_annual_entry.initial_forecast` is the sum
  of those saved Business Unit Initial values;
- from January 11 onward, Forecast Initial is read-only and remains fixed unless
  the selected target year is admin-unlocked;
- later Annual Entry changes update Ongoing Forecast in `forecast_annual.value`
  without changing `forecast_annual.initial_forecast`;
- the old Initial Forecast Excel bootstrap, snapshot table read path and
  automatic scheduler/consolidation endpoint are deprecated and must not be used
  for product behavior.

### 10.2 Annual Forecast Entry

Normal `/forecasting/entry` contains a separate Annual Forecast Entry section
for CSMs, distinct from the Monthly Forecast Entry section.

Filters:

- CSM, using the same CSM ownership/preselection logic as Monthly Forecast Entry;
- Year, starting at 2026 and including at least 2026 and 2027.

Year rules:

- options never include years before 2026;
- each year progressively exposes the following year;
- before December 10, the default is the current year;
- from December 10 through December 31, the default is the following year;
- from January 1, the default is the new current year.

Table rules:

- rows are all customers assigned to the selected CSM;
- sorting is active customers first, inactive customers with Revenue or Planned
  second, inactive customers without Revenue or Planned last;
- inactive customers remain visible with muted styling;
- customer names link to Company Detail;
- Logs opens Company Detail at the company logs anchor in a new tab and each
  row action is labelled `See latest logs of <company>`;
- the Customer and Confidence columns remain visible during horizontal scroll,
  and table headers stay fixed during vertical scroll;
- a button to the right of the legend collapses or shows all Business Unit
  columns, leaving only Active through Confidence and Closed Revenue YTD through
  Logs visible when collapsed;
- editable/manual-entry columns use a subtle manual-entry background so users can
  distinguish CSM-entered or to-be-entered values from consolidated/read-only data;
- active status is manual and stored through `company_forecast_status`.

Annual values:

- FC Initial is stored by customer + year in `forecast_annual_entry`;
- FC Initial is editable only from December 10 of year N-1 through January 10 of
  year N, or while Petyr Admin has unlocked that selected target year, then
  read-only;
- FC Ongoing Confidence is stored by customer + year and accepts only `01 High`,
  `02 Mid` and `03 Low`;
- confidence is required when a row is modified;
- Business Unit annual forecast values use the official Petyr Business Units and
  remain stored in `forecast_annual`;
- each saved Business Unit value records `value_source=manual` or
  `value_source=ai_confirmed`;
- unclicked FC AI placeholders are not saved and do not contribute to FC Ongoing;
- clicked FC AI placeholders are saved as AI-confirmed if the value is not
  changed, or manual if the CSM edits the value;
- FC Ongoing is the sum of saved/confirmed Business Unit annual values.

Annual Revenue / Planned:

- Closed Revenue YTD is selected-year campaign revenue closed through today;
- Planned This Year is selected-year future campaign revenue from tomorrow through
  December 31 for statuses `Setup`, `Recruiting` and `Running` in the Annual
  Forecast Entry workflow;
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

- use future planned/confirmed/draft campaigns according to the status logic implemented in the data service;
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
- Current year trend;
- Revenue per Business Unit.

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

Company Detail is analytical and read-only.

Company Detail uses the shared Petyr workspace shell with the same descriptive header card and section navigation as Management View, CSM Overview and Forecast Entry. It remains read-only for forecast data edits, but users must be able to change CSM filter, company, previous/next company and year through the Forecast Entry-style navigator backed by the Forecast Entry company ordering. The year/load control appears to the left of previous/next company navigation, and previous/next navigation must not repeat the CSM name.

It must show:

- company;
- assigned CSM context, without repeating the CSM as a primary KPI card;
- explicitly labelled Forecast status next to the Forecast Entry link;
- active agreements;
- agreement value;
- agreement residual;
- agreement expiry date;
- total Initial Forecast for the selected year as a primary KPI;
- monthly trend;
- Business Unit summary with orange closed revenue, gray Initial Forecast and previous-month forecast markers colored green/yellow against Initial Forecast;
- Business Unit current-year view showing Business Unit totals with Ongoing Forecast, AI Forecast and Closed Revenue YTD; users can expand a Business Unit to show the individual selected-year months with closed revenue, previous-month forecast, ongoing forecast and AI Forecast;
- relevant company insights, showing only active rule-based categories;
- company note form below Business Unit current-year view and above Relevant company insights, saving note-only company log entries without changing forecast values;
- company campaigns showing the latest chronologically completed campaign plus running or planned campaigns by default, with all other campaigns behind an explicit expansion control;
- agreements and residual evidence showing agreements whose expiry date is after the moment of viewing by default, with expired or undated agreements behind an explicit expansion control;
- Company logs directly below agreement/residual evidence, containing notes and forecast changes, showing the latest three logs by default with an expansion control for previous logs;
- company active status;
- admin-only Revenue by Business Unit detail, Monthly forecast rows, Annual forecast rows and AI forecast cache support tables.

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

Forecast Entry uses the shared Petyr workspace shell with the same descriptive header card and section navigation as Management View, CSM Overview and Company Detail. It remains the only route that may expose the manual AI Forecast apply action, but the Support tools area and floating Data diagnostics menu are visible only to users with `petyr:admin`. The Monthly forecast tab may expose a CSM-facing Forecast Intelligence section for users with `petyr:forecast:write`; that section renders validated consultative JSON and has no apply controls or OpenRouter prompt/debug output. The normal Monthly and Annual Forecast Entry sections must use one floating bottom-right `Save` button that remains visible while scrolling, replaces inline top/bottom save buttons and turns green for five seconds after an effective save. The existing monthly and annual forecast logic must be preserved unless a later task explicitly selects a bug fix.

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
- be tracked in change history/save session.

Inactive companies remain visible.

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
- manual endpoints must not process all companies together;
- the goal is to control OpenRouter cost/credits and test result quality before
  expanding automation.

Accepted deterministic automation:

- Petyr runs a dedicated nightly deterministic-only worker for active companies;
- default schedule: `01:00` in `Europe/Rome`;
- default inter-company delay: `3000ms`;
- target year: current Rome year;
- company scope: all Forecast Entry companies except those explicitly marked inactive;
- persistence: `ai_forecast_cache` only;
- model version: daily append-only value such as `petyr_deterministic_preview_v1@YYYY-MM-DD`;
- no OpenRouter call, Forecast Intelligence call, CSM forecast write, annual forecast write,
  management objective write, Initial Forecast write, closed revenue write or Redash write.

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
  month and Business Unit. `Setup` and `Recruiting` are planned future;
  `Running` is not planned future and belongs only to revenue/closed/current
  activity reasoning when eligible there.
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
- past month locked.

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
- no manual request that processes all companies together;
- the user/operator selects one company and target year;
- Petyr generates or updates only eligible future months for that company and
  Business Unit scope;
- nightly deterministic-only automation is allowed through `petyr-ai-forecast-worker`;
- future automated or progressive LLM/OpenRouter batch processing requires a
  separate product and cost-control decision.

---

## 32. Admin temporary area

`/petyr-admin` must exist.

It is used for these visible sections, in display order:

- data health diagnostics;
- performance test results for sanitized server-side operation measurements;
- operator link to the Redash Ingestor dashboard at `/redash-ingestor`;
- PostgreSQL database backup export/import for server migration and controlled recovery;
- Forecast Initial window unlock by target year;
- deterministic Daily AI Forecast monitoring and manual run;
- AI preview backtest;
- AI Forecast baseline weights;
- OpenRouter model settings;
- Excel monthly forecast import/export as the recommended admin workflow;
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
