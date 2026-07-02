# DEVLOG

Chronological log of repository changes that affect behaviour, architecture, data, APIs, permissions, deployment, integrations or relevant product logic.

This file is root-level and covers the multi-project platform. Project-specific logs may also exist under `docs/<project>/` or inside app/service folders.

## Format

Each entry must include:


- Area
- Change
- Reason
- Impact
- Files/documents involved
- Follow-up, if any

---

## 2026-06-30

- **Area:** Petyr / Forecast Entry / Monthly sticky scroll context
- **Change:** Changed Monthly Forecast Entry so the sticky area contains only the CSM, Month, Year and Load control row plus the legend. The Monthly Forecast Batch title, period summary and editability notice now scroll away above the sticky controls, and the vertical gap between the legend and table was reduced.
- **Reason:** Product clarified that only the operational controls, legend and table column headers should remain fixed while scrolling the monthly portfolio.
- **Impact:** UI behavior changed only. Monthly read/save APIs, schema, permissions, Redash/PostgreSQL data flow, calculations and audit persistence are unchanged.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/ForecastEntryMonthlyBatchWorkspace.tsx`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `apps/forecasting-app/README.md`, `DEVLOG.md`.
- **Validation:** Build validation status is listed in the task handoff.
- **Follow-up:** None.

- **Area:** Petyr / Forecast Entry / Annual sticky scroll context
- **Change:** Changed Annual Forecast Entry so only the legend row and table header remain sticky inside the annual portfolio scroll area. The Annual Forecast Entry title, CSM/year filters, selected-CSM annual summary row and Forecast Initial window notice now scroll away above the table.
- **Reason:** Product clarified that only the legend and table header should stay visible while scrolling annual forecast rows; the CSM annual total row and Forecast Initial open-window notice should not remain fixed.
- **Impact:** UI behavior changed only. Annual read/save APIs, schema, permissions, Redash/PostgreSQL data flow, calculations, audit persistence and copy are unchanged.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/AnnualForecastEntryBatchWorkspace.tsx`, `docs/05_forecasting_product_spec.md`, `apps/forecasting-app/README.md`, `DEVLOG.md`.
- **Validation:** Build validation status is listed in the task handoff.
- **Follow-up:** None.

## 2026-06-30

- **Area:** Petyr Admin / Daily AI Forecast monitoring
- **Change:** Changed `GET /api/petyr/admin/performance-results` so Petyr Admin loads the latest Daily AI Forecast measurements with a dedicated query instead of deriving them only from the latest 200 global performance samples. The latest-check table now also uses the latest row per expected operation.
- **Reason:** The nightly deterministic Daily AI Forecast run could be hidden in Petyr Admin after enough unrelated performance measurements were recorded later in the day, even though the worker had persisted the run.
- **Impact:** Petyr Admin diagnostics now keep showing the last 20 `Daily AI Forecast run` samples independently from other performance noise. No forecast calculation, AI cache write behavior, permissions, schema, worker schedule or Redash/PostgreSQL data flow changed.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrPerformanceResultsService.ts`, `DEVLOG.md`.
- **Validation:** `npm.cmd run build` passed from `apps/forecasting-app`.
- **Follow-up:** None.

- **Area:** Petyr / Forecast Entry / Monthly table sticky header
- **Change:** Changed Monthly Forecast Entry so the portfolio table has its own vertical scroll area and the two-row table header sticks to the top of that table instead of using fixed viewport offsets below the filter area.
- **Reason:** Product reported that Monthly Forecast Entry headers appeared too low and did not stay fixed together with the filter area while scrolling down the portfolio.
- **Impact:** UI behavior changed only. Monthly read/save APIs, schema, permissions, Redash/PostgreSQL data flow, calculations, audit persistence and copy are unchanged.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/ForecastEntryMonthlyBatchWorkspace.tsx`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `apps/forecasting-app/README.md`, `DEVLOG.md`.
- **Validation:** Static source checks passed for removal of the old monthly header viewport offsets and for the new table scroll container. Build validation status is listed in the task handoff.
- **Follow-up:** Run `npm run build` from `apps/forecasting-app` if the local shell exposes npm.

## 2026-06-30

- **Area:** Petyr / Forecast Entry / Annual table sticky header
- **Change:** Changed Annual Forecast Entry so the portfolio table has its own vertical scroll area and a stronger sticky header layer, keeping the header row (`Customer`, `Active`, `Forecast Initial`, `Forecast Ongoing`, `Confidence`, and following columns) visible while users scroll down the annual portfolio.
- **Reason:** Product requested the first Annual Forecast Entry table row to remain visible during downward scrolling.
- **Impact:** UI behavior changed only. Annual read/save APIs, schema, permissions, Redash/PostgreSQL data flow, calculations, audit persistence and copy are unchanged.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/AnnualForecastEntryBatchWorkspace.tsx`, `apps/forecasting-app/README.md`, `docs/05_forecasting_product_spec.md`, `DEVLOG.md`.
- **Validation:** Static source checks passed for the new annual table scroll container and documentation references. `npm.cmd run build` passed from `apps/forecasting-app`.
- **Follow-up:** None.

- **Area:** Petyr / Forecasting / Company Detail campaign names
- **Change:** Changed the Master Campaigns logical `campaignName` mapping from `project_name` to `customer_title`, while keeping the Company Detail table label `Campaign name` unchanged.
- **Reason:** Product clarified that Redash maps the desired campaign display title counterintuitively to `customer_title`, and using it should fix Company Detail campaign name rendering.
- **Impact:** Company Detail and other Petyr read models that consume the logical campaign name now display names from `redash_raw_master_campaigns_latest.customer_title`. PostgreSQL data flow, Redash source selection, UI labels, schema, permissions and forecast calculations are unchanged.
- **Files/documents involved:** `apps/forecasting-app/src/config/redashFieldMapping.ts`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `DEVLOG.md`.
- **Validation:** Static source checks confirmed `campaignName` now maps to `customer_title`, the Company Detail UI label remains `Campaign name`, and documentation records the mapping. `npm run build` was not run because this mapping-only change has no app dependency changes and prior shell validation in this environment has no npm on PATH.
- **Follow-up:** Run `npm run build` from `apps/forecasting-app` in an environment where npm is available.

- **Area:** Petyr / Forecasting / Company Detail logs and evidence visibility
- **Change:** Updated Company Detail so campaigns show only the latest chronologically completed campaign plus running or planned campaigns by default, with other campaigns behind an expansion control. Agreements now show only rows whose expiry date is after the moment of viewing by default, with expired or undated rows expandable. Renamed Change history to Company logs, changed the description to include notes and forecast changes, and show the latest three logs before expansion. Added a Company note form below Business Unit current-year view and above Relevant company insights; note-only entries save into `forecast_save_session` with source `Company Detail Note` and no forecast value changes.
- **Reason:** Product requested a cleaner Company Detail reading surface and a way for CSMs to add company notes without entering Forecast Entry or modifying forecasts.
- **Impact:** Company Detail UI behavior and note logging changed. No Prisma schema, Redash source, forecast calculation, numeric AI forecast generation, Forecast Entry save contract or direct Redash access changed. The note form requires `petyr:forecast:write` through the server action.
- **Files/documents involved:** `apps/forecasting-app/src/app/forecasting/company/[companyName]/page.tsx`, `apps/forecasting-app/src/services/companyLogNoteService.ts`, `apps/forecasting-app/src/components/petyr/AnnualForecastEntryBatchWorkspace.tsx`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `apps/forecasting-app/README.md`, `DEVLOG.md`.
- **Validation:** Static source checks passed for new labels, expansion controls, docs and anchor references. `npm run build` could not run because `npm` is not available on PATH in this shell.
- **Follow-up:** Run `npm run build` from `apps/forecasting-app` in an environment where npm is available.

## 2026-06-30


- **Area:** Petyr / Forecasting / Company Detail permissions
- **Change:** Restricted the Company Detail support tables `Revenue by Business Unit detail`, `Monthly forecast rows`, `Annual forecast rows` and `AI forecast cache` to users with `petyr:admin`. Non-admin users still see the analytical Company Detail story, company context, campaigns, agreements and change history.
- **Reason:** Product requested those secondary technical/evidence sections to be visible only to admins.
- **Impact:** UI visibility changed only. Company Detail remains read-only; PostgreSQL reads, Redash isolation, forecast calculations, schema, API contracts and save behavior are unchanged.
- **Files/documents involved:** `apps/forecasting-app/src/app/forecasting/company/[companyName]/page.tsx`, `docs/05_forecasting_product_spec.md`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/petyr/03_petyr_business_rules.md`, `apps/forecasting-app/README.md`, `DEVLOG.md`.
- **Validation:** Static source checks passed for the admin-only render guard and documentation updates. `npm run build` could not run: sandboxed execution fails before command start with a bundled bubblewrap digest mismatch, and the escalated shell does not have `npm` on PATH.
- **Follow-up:** Run `npm run build` from `apps/forecasting-app` in an environment where npm is available.
- **Area:** Petyr / Forecasting / Company Detail Business Unit view
- **Change:** Renamed the Company Detail Business Unit section to `Business Unit current-year view`, changed its description to explain that expanding a Business Unit shows the individual months, removed the collapsed `Previous-month forecast` summary chip, and relabelled the collapsed closed revenue total as `Closed Revenue YTD`.
- **Reason:** Product requested clearer Company Detail copy so users understand the collapsed Business Unit rows show current-year totals and the monthly detail is available through expansion.
- **Impact:** UI copy/layout changed only. Company Detail data sources, PostgreSQL reads, Forecast Entry editing, forecast values, AI cache reads, schema, permissions and Redash isolation are unchanged.
- **Files/documents involved:** `apps/forecasting-app/src/app/forecasting/company/[companyName]/page.tsx`, `apps/forecasting-app/src/components/petyr/CompanyBusinessUnitMonthlyView.tsx`, `docs/05_forecasting_product_spec.md`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `apps/forecasting-app/README.md`, `DEVLOG.md`.
- **Validation:** Static source checks passed for updated section title, description, docs references and collapsed chip labels. `npm --version` and `npm run build` could not run because `npm` is not available on PATH in this shell.
- **Follow-up:** Run `npm run build` from `apps/forecasting-app` in an environment where npm is available.

- **Area:** Petyr / Forecasting / Management loading UX
- **Change:** Changed `/forecasting` initial Management loading so the page keeps only the shared workspace header, section navigator and an in-page loader labelled `Updating data ongoing` visible until the Management payload has loaded. The Management dashboard cards, Branch/CSM/Business Unit tables and admin diagnostics render only after the Management data is ready; Forecast Entry and scoped CSM warmups still start afterward in the background.
- **Reason:** Product requested that users do not see an apparently empty Management UI while Branch, CSM and Business Unit data is still loading.
- **Impact:** UI loading behavior changed only. PostgreSQL-backed data sources, Redash isolation, permissions, schema, calculations, save contracts and background warmup order are unchanged.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/PetyrForecastingDataHydrator.tsx`, `apps/forecasting-app/src/components/petyr/PetyrMVPRendering.tsx`, `docs/05_forecasting_product_spec.md`, `apps/forecasting-app/README.md`, `DEVLOG.md`.
- **Validation:** Static `rg` checks confirmed the new loader text, rendering-state wiring and documentation updates, and confirmed the old `Aggiornamento dati in corso...` runtime loader is no longer referenced in the touched components. `npm run build` could not run because `npm`, `npm.cmd`, `node` and `git` are not available on PATH in this shell.
- **Follow-up:** None.

## 2026-06-30

- **Area:** Petyr / Forecast Entry / Annual summary visibility
- **Change:** Added a compact horizontally scrollable Annual Forecast Entry summary row above the legend and table. The row shows the selected CSM total forecast for the selected year and one total for each official Business Unit, calculated from the same live Annual Entry values currently visible in the table.
- **Reason:** Product requested immediate visibility of the CSM annual forecast total and BU-level annual totals while editing annual forecasts.
- **Impact:** UI behavior changed only. Annual read/save APIs, schema, permissions, Redash sources, audit persistence and forecast formulas are unchanged. Untouched AI placeholders remain excluded from totals until accepted or edited, matching Forecast Ongoing behavior.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/AnnualForecastEntryBatchWorkspace.tsx`, `docs/05_forecasting_product_spec.md`, `apps/forecasting-app/README.md`, `DEVLOG.md`.
- **Validation:** Static source checks passed; `npm --version` and build could not run because the local Codex sandbox fails before command execution with `bubblewrap digest mismatch` for the bundled `bwrap`.
- **Follow-up:** Run `npm run build` from `apps/forecasting-app` in an environment where npm can execute.

## 2026-06-29

- **Area:** Petyr / Forecast Entry / Annual table layout
- **Change:** Updated Annual Forecast Entry so table headers stay fixed during vertical scrolling, Customer and Confidence remain visible during horizontal scrolling, editable/manual-entry columns use a subtle manual-entry background, and a legend-row button collapses or shows all Business Unit columns. Renamed Revenue EUR to Closed Revenue YTD, Planned EUR to Planned This Year, ratio columns to explicitly reference Forecast Ongoing, History to Logs, and row log actions to `See latest logs of <company>`.
- **Reason:** Product requested better annual portfolio entry usability while scrolling, clearer distinction between manual forecast inputs and consolidated/read-only data, a compact view without Business Unit columns, and clearer column/action labels.
- **Impact:** UI layout and visible copy changed only. Annual read/save endpoints, persistence, permissions, Redash data flow, calculations, confidence validation and audit behavior are unchanged.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/AnnualForecastEntryBatchWorkspace.tsx`, `docs/05_forecasting_product_spec.md`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/petyr/03_petyr_business_rules.md`, `apps/forecasting-app/README.md`, `DEVLOG.md`.
- **Validation:** Static `rg` checks passed for removed old Annual Entry labels and undefined `annualSummary` references. `cmd.exe /c npm.cmd --version` and therefore `npm run build` could not run because the local Codex sandbox fails before command execution with `bubblewrap digest mismatch` for the bundled `bwrap`.
- **Follow-up:** Run `npm run build` from `apps/forecasting-app` in an environment where the sandbox/runtime can execute npm.

## 2026-06-29

- **Area:** Petyr / Forecast Entry FAQ
- **Change:** Made the shared Forecast Entry FAQ help control explicitly show `FAQ` next to the question mark, and expanded the dedicated FAQ page with entries for Forecast Ongoing, Previous Month Forecast, Forecast Initial, change logs and input deadline windows.
- **Reason:** Product requested the FAQ access point and content to be clearer for forecast terminology and input timing.
- **Impact:** UI copy and help content changed only. Forecast calculations, editability rules, save APIs, audit persistence, permissions, Redash sources and database schema are unchanged.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/PetyrLayoutPrimitives.tsx`, `apps/forecasting-app/src/components/petyr/ForecastEntryFaq.tsx`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `DEVLOG.md`.
- **Validation:** Attempted `npm run build` from `apps/forecasting-app`, but WSL cannot find `npm`. Attempted `powershell.exe -NoProfile -Command "npm.cmd run build"`, but PowerShell cannot find `npm.cmd`. Static text checks confirmed the new FAQ entries, visible `FAQ` help label and documentation updates.
- **Follow-up:** None.

## 2026-06-29

- **Area:** Petyr / Forecast Entry / Monthly period selection
- **Change:** Added Month and Year controls next to the Monthly Forecast Entry CSM filter, with a same-row `Load` button for loading a non-default monthly period. The CSM dropdown still reloads immediately when changed. Monthly batch reads now accept optional `year` and `month`, `/forecasting/entry` preserves them in the URL, and monthly saves validate the selected target period through the existing editability rules instead of forcing only the current server month.
- **Reason:** Product requested current-month visibility by default while allowing users to explicitly load a different month/year from the Monthly Forecast Entry filter row.
- **Impact:** UI behavior and Monthly Forecast Entry target-period handling changed. Past months remain locked by `getForecastEntryMode`; future months use the existing previous-month forecast rule. Redash sources, database schema, permissions, annual entry behavior and CSM dropdown behavior are unchanged.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/ForecastEntryMonthlyBatchWorkspace.tsx`, `apps/forecasting-app/src/services/forecastEntryBatchService.ts`, `apps/forecasting-app/src/app/api/petyr/forecast-entry/batch/route.ts`, `apps/forecasting-app/src/app/forecasting/entry/page.tsx`, `docs/05_forecasting_product_spec.md`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `apps/forecasting-app/README.md`, `DEVLOG.md`.
- **Validation:** Attempted `npm.cmd run build` and `powershell.exe -NoProfile -Command "npm.cmd run build"`, but neither WSL nor PowerShell can find `npm`/`npm.cmd` in this environment. Static `rg` checks passed for removed current-only Monthly Forecast Entry references and updated batch route/page query wiring.
- **Follow-up:** None.

- **Area:** Petyr / Forecasting / CSM company lists
- **Change:** Changed CSM Overview and normal Forecast Entry Monthly/Annual portfolio reads so CSM company lists use every Company Ownership company-CSM association whose `workspace_updated_on` is within the last 6 months. A company can now appear in multiple CSM portfolios when multiple recent workspace associations exist. If no recent workspace associations are available, Petyr falls back to the previous latest-owner-per-company behavior with diagnostics.
- **Reason:** Product requested that companies no longer be assigned to only one CSM solely by the last workspace update date; each CSM list must show the company when that CSM association has a recently updated workspace.
- **Impact:** CSM portfolio list membership changes. Management aggregates, Redash sources, database schema, permissions, save contracts, forecast calculations and direct Redash isolation are unchanged.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrDataService.ts`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `docs/petyr/03_petyr_business_rules.md`, `apps/forecasting-app/README.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Validation:** Passed `npm.cmd run build` and `npm.cmd run test:petyr-data-service` from `apps/forecasting-app`.
- **Follow-up:** None.

- **Area:** Petyr / Forecast Entry / Monthly table layout
- **Change:** Updated Monthly Forecast Entry so the CSM filter area and table headers stay sticky during vertical scrolling, Business Unit Expand/Collapse controls render as button-like controls aligned to the right side of each group header, editable forecast columns use wider header-matched widths, and expanded Business Unit groups always show Previous Month Forecast to the left of Ongoing Forecast with Closed Revenue YTD on the right.
- **Reason:** Product requested clearer affordance for Expand/Collapse, persistent scroll context while entering portfolio forecasts, a stable expanded column order and the Closed Revenue label renamed to Closed Revenue YTD.
- **Impact:** UI behavior and visible copy changed only. Forecast Entry batch read/save endpoints, monthly editability rules, audit sessions, change logs, permissions, calculations and PostgreSQL data ownership are unchanged.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/ForecastEntryMonthlyBatchWorkspace.tsx`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `apps/forecasting-app/README.md`, `DEVLOG.md`.
- **Validation:** Passed `npm.cmd run build` from `apps/forecasting-app`.
- **Follow-up:** None.

- **Area:** Petyr / Forecast Entry / Save controls
- **Change:** Replaced the normal Monthly and Annual Forecast Entry inline save buttons with a single floating bottom-right `Save` button for each active tab. The button stays visible while scrolling, keeps the label `Save`, and turns green for five seconds only after an effective successful save.
- **Reason:** Product requested the Forecast Entry save action to be always visible/actionable and consistently labelled across monthly amount entry and annual forecast entry, without the old top or bottom save buttons.
- **Impact:** UI behavior changed only. Monthly and Annual save endpoints, payloads, validation, audit sessions, change logs, permissions, forecast calculations and PostgreSQL data ownership are unchanged.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/ForecastEntryMonthlyBatchWorkspace.tsx`, `apps/forecasting-app/src/components/petyr/AnnualForecastEntryBatchWorkspace.tsx`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `apps/forecasting-app/README.md`, `DEVLOG.md`.
- **Validation:** Passed `npm.cmd run build` from `apps/forecasting-app`.
- **Follow-up:** None.

- **Area:** Petyr / Admin / Forecast Initial window
- **Change:** Added a Petyr Admin Forecast Initial window control that unlocks or locks selected Annual Forecast Entry target years through `GET/PUT /api/petyr/admin/initial-forecast-window`, stored in `app_setting` as `petyr_initial_forecast_window_overrides_v1`. Annual Forecast Entry read/save now treats an admin-unlocked year as Forecast Initial editable outside the default December 10-January 10 window while preserving the normal locked behavior for other years.
- **Reason:** Product needs admins to let CSM/IGSM users enter Initial Forecast at any time of year, for example in August, without reviving legacy Initial Forecast import or scheduler workflows.
- **Impact:** Admins can reopen Forecast Initial per target year; users with `petyr:forecast:write` then edit through the normal Annual Forecast Entry table. Locking a year restores the default window and does not mutate saved Initial Forecast values. No Prisma schema, Redash source, closed revenue, management objective, AI forecast or monthly forecast behavior changed.
- **Files/documents involved:** `apps/forecasting-app/src/lib/petyr/annualForecastEntryRules.ts`, `apps/forecasting-app/src/services/annualForecastEntryBatchService.ts`, `apps/forecasting-app/src/services/petyrInitialForecastWindowOverrideService.ts`, `apps/forecasting-app/src/app/api/petyr/admin/initial-forecast-window/route.ts`, `apps/forecasting-app/src/components/petyr/PetyrInitialForecastWindowControl.tsx`, `apps/forecasting-app/src/app/petyr-admin/page.tsx`, `apps/forecasting-app/tests/annualForecastEntryRules.test.ts`, `apps/forecasting-app/README.md`, `docs/05_forecasting_product_spec.md`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/petyr/02_petyr_data_model_target.md`, `docs/petyr/03_petyr_business_rules.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Validation:** Passed `npm.cmd run build` from `apps/forecasting-app`.
- **Follow-up:** Admins should lock a target year again after the exceptional Forecast Initial entry period is complete.

- **Area:** Petyr / Forecasting / Company Detail Intelligence
- **Change:** Removed the Forecast Intelligence section from Company Detail, including the page-level persisted sentinel-row read and `Generate Intelligence` rendering. Forecast Entry Monthly keeps its CSM-facing consultative Intelligence flow. Updated Petyr source-of-truth docs to state that Company Detail must not expose Intelligence and added a backlog item for the future redesign outside Company Detail.
- **Reason:** Product requested the Intelligence section inside Company Detail to be removed entirely because it will be reconsidered elsewhere with different modalities.
- **Impact:** Company Detail is read-only as before but no longer shows or regenerates Forecast Intelligence guidance and no longer reads persisted Forecast Intelligence sentinel rows on page load. Numeric AI Forecast cache evidence remains read-only. No schema, Redash source, forecast calculation, save contract or permission model changed.
- **Files/documents involved:** `apps/forecasting-app/src/app/forecasting/company/[companyName]/page.tsx`, `apps/forecasting-app/README.md`, `docs/05_forecasting_product_spec.md`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/petyr/03_petyr_business_rules.md`, `docs/petyr/FORECAST_INTELLIGENCE_LAYER.md`, `docs/petyr/AI_FORECASTING_DESIGN.md`, `DECISIONS.md`, `BACKLOG.md`, `DEVLOG.md`.
- **Validation:** Passed `npm.cmd run test:annual-forecast-entry` and `npm.cmd run build` from `apps/forecasting-app`.
- **Follow-up:** Define the future company-level intelligence surface before rebuilding it.

## 2026-06-29

- **Area:** Petyr / Forecasting / CSM Overview access
- **Change:** Restricted the `/forecasting` CSM Overview section to Petyr admins while it is in development. Non-admin users are kept on Management when `?view=csm` is requested, no longer see the CSM Overview navigator item, do not run the scoped CSM Overview preload, and receive a 403 from rendering-data requests for `view=csm`, `view=csm-scoped` or `view=all`.
- **Reason:** Product requested CSM Overview to be accessible and visible only to admins during development.
- **Impact:** Management, Company Detail and Forecast Entry remain available according to their existing permissions. No data source, forecast calculation, schema, Redash integration or save contract changed.
- **Files/documents involved:** `apps/forecasting-app/src/app/forecasting/page.tsx`, `apps/forecasting-app/src/components/petyr/PetyrForecastingDataHydrator.tsx`, `apps/forecasting-app/src/components/petyr/PetyrMVPRendering.tsx`, `apps/forecasting-app/src/components/petyr/PetyrLayoutPrimitives.tsx`, `apps/forecasting-app/src/app/api/petyr/forecasting/rendering-data/route.ts`, `apps/forecasting-app/README.md`, `docs/05_forecasting_product_spec.md`, `DEVLOG.md`.
- **Validation:** Passed `npm.cmd run build` from `apps/forecasting-app`.
- **Follow-up:** Reopen CSM Overview to non-admin users only after a documented product decision marks the section ready.

## 2026-06-29

- **Area:** Petyr / Forecasting / AI cache read resilience
- **Change:** Changed Petyr numeric AI Forecast cache reads to use a narrow latest-row PostgreSQL projection that excludes `explanation`, `request_payload_summary`, `validated_output` and `error_message`, caps returned rows, and degrades to `aiRows=[]` with a warning when the numeric cache read fails. Company Detail now reuses the already loaded company detail to build rule-based alerts, uses a lightweight ownership/status-based navigation read instead of the full company overview, and adds chart minimum dimensions to avoid Recharts negative-size warnings during sparse/loading states.
- **Reason:** Production Management, CSM Overview and Company Detail were blocked or very slow because broad `prisma.aiForecastCache.findMany()` attempted to hydrate large JSON/text cache payloads and failed with `Failed to convert rust String into napi string`. Company Detail also duplicated its heaviest read and used the full company overview just to populate navigation.
- **Impact:** Management, CSM Overview and Company Detail can render real PostgreSQL campaign/agreement/forecast data even when numeric AI cache rows cannot be read. Forecast Intelligence remains separate and still reads `validatedOutput` only for the selected company/year sentinel rows. No schema, Redash source, save contract, permission or forecast calculation change.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrDataService.ts`, `apps/forecasting-app/src/services/petyrAlertService.ts`, `apps/forecasting-app/src/app/forecasting/company/[companyName]/page.tsx`, `apps/forecasting-app/src/app/forecasting/company/[companyName]/CompanyDetailCharts.tsx`, `apps/forecasting-app/src/components/petyr/PetyrMVPRendering.tsx`, `apps/forecasting-app/src/lib/petyr/numericAiForecastCacheReadModel.ts`, `apps/forecasting-app/tests/petyrDataServiceNumericAiCache.test.ts`, `apps/forecasting-app/README.md`, `docs/05_forecasting_product_spec.md`, `DEVLOG.md`.
- **Validation:** Passed `npm.cmd run test:petyr-data-service` and `npm.cmd run build` from `apps/forecasting-app`.
- **Follow-up:** In production, verify `/petyr-admin` Data Health row counts and sync status for `redash_raw_company_ownership_latest`; when `REDASH_INITIAL_SYNC_ON_BOOTSTRAP=false` on a first deployment, run a manual Redash sync or redeploy/bootstrap with `REDASH_INITIAL_SYNC_ON_BOOTSTRAP=true` so canonical CSM/Branch ownership is materialized.

- **Area:** Petyr / Forecasting / Management-first data loading
- **Change:** Changed `/forecasting` hydration so the browser always requests Management rendering data first, marks the workspace usable, then starts scoped CSM Overview preload for the authenticated/preferred CSM plus Forecast Entry Monthly/Annual warmup in the background. Added `view=csm-scoped` to the protected rendering-data endpoint. Changed normal Forecast Entry so Annual Forecast Entry starts background loading as soon as the Monthly workspace is usable and the Annual tab no longer exposes a separate manual load button.
- **Reason:** Petyr opens on Management, so the first visible dashboard must not wait on CSM Overview, Forecast Entry Annual or full cross-view hydration.
- **Impact:** Perceived loading order changes only. PostgreSQL-backed data sources, Redash isolation, permissions, schema, forecast calculations, save APIs, Company Detail on-demand reads and UI ownership rules remain unchanged.
- **Files/documents involved:** `apps/forecasting-app/src/app/api/petyr/forecasting/rendering-data/route.ts`, `apps/forecasting-app/src/components/petyr/PetyrForecastingDataHydrator.tsx`, `apps/forecasting-app/src/components/petyr/ForecastEntryMonthlyBatchWorkspace.tsx`, `apps/forecasting-app/src/services/petyrApprovedRenderingAdapter.ts`, `docs/05_forecasting_product_spec.md`, `apps/forecasting-app/README.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Validation:** Passed `npm.cmd run build` and `npm.cmd run test:annual-forecast-entry` from `apps/forecasting-app`.
- **Follow-up:** Compare Petyr Admin Performance Results after production-sized traffic to decide whether CSM Overview needs a deeper PostgreSQL query-level scoped read model.

## 2026-06-26

- **Area:** Petyr / Forecasting / Active-view-first data loading
- **Change:** Split `/api/petyr/forecasting/rendering-data` with optional `view=management|csm|all`, updated `/forecasting` hydration to fetch the active view first and then the full payload in the background, and started Forecast Entry Monthly/Annual warmup immediately for users with `petyr:forecast:write`. Warmup now runs Monthly and Annual in parallel and can rely on server-side CSM resolution when the rendering data has not resolved a preferred CSM yet. Added short-lived overview read dedupe and invalidation after Forecast Entry or Management Objective saves. Company Detail and Company Detail alerts now use company-scoped reads instead of the broad overview load path.
- **Reason:** Opening Management or CSM Overview should not wait for non-visible data or delayed Forecast Entry warmup. Company Detail is one company at a time and should not pay the cost of portfolio-level reads.
- **Impact:** Perceived `/forecasting` load order changes, but data sources, Redash isolation, permissions, schema, calculations, save APIs and UI layout remain unchanged. The cache is best-effort, process-local and short-lived.
- **Files/documents involved:** `apps/forecasting-app/src/app/api/petyr/forecasting/rendering-data/route.ts`, `apps/forecasting-app/src/components/petyr/PetyrForecastingDataHydrator.tsx`, `apps/forecasting-app/src/components/petyr/PetyrForecastEntryPreloader.tsx`, `apps/forecasting-app/src/services/petyrApprovedRenderingAdapter.ts`, `apps/forecasting-app/src/services/petyrDataService.ts`, `apps/forecasting-app/src/services/petyrAlertService.ts`, `apps/forecasting-app/src/services/forecastEntryReadCache.ts`, Forecast Entry and Management Objective save paths, `docs/05_forecasting_product_spec.md`, `apps/forecasting-app/README.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Validation:** Passed `npm.cmd run build` from `apps/forecasting-app`. Focused source checks confirmed `/forecasting/page.tsx` still only renders the shell server-side, Forecast Entry preloading no longer waits for rendering-data readiness, and Company Detail no longer uses the global `loadOverviewInputs(...)` path.
- **Follow-up:** Compare `/petyr-admin` Performance Results for rendering, overview, Forecast Entry and Company Detail reads on production-sized portfolios.

## 2026-06-26

- **Area:** Petyr / Admin / Daily AI Forecast monitoring
- **Change:** Added persisted Daily AI Forecast run measurements under operation `Daily AI Forecast run`, including duration, manual/scheduled source, selected/processed/failed company counts, saved/skipped cache rows, model version, run date and advisory-lock skip state. Petyr Admin now shows a dedicated Daily AI Forecast monitoring table and the manual-run control handles non-JSON HTML responses without throwing `Unexpected token '<'`.
- **Reason:** Operators need to see whether each Daily AI Forecast run executed, how long it took, how many companies/rows it affected and whether it was manual or scheduled. The previous client assumed every response was JSON, so auth/proxy/error HTML produced an unhelpful parse error.
- **Impact:** Forecast calculations, schedule defaults, AI cache persistence, Redash data flow and CSM-owned forecast tables are unchanged. The change only improves admin observability and error reporting.
- **Files/documents involved:** `apps/forecasting-app/src/lib/petyr/performance.ts`, `apps/forecasting-app/src/services/petyrNightlyDeterministicAiForecastService.ts`, `apps/forecasting-app/src/worker/nightlyDeterministicAiForecast.ts`, `apps/forecasting-app/src/app/api/petyr/admin/daily-ai-forecast/run/route.ts`, `apps/forecasting-app/src/components/petyr/PetyrDailyAiForecastRunControl.tsx`, `apps/forecasting-app/src/services/petyrPerformanceResultsService.ts`, `apps/forecasting-app/src/app/petyr-admin/page.tsx`, `apps/forecasting-app/README.md`, `docs/05_forecasting_product_spec.md`, `DEVLOG.md`.
- **Validation:** Passed `npm.cmd run build`. Initial build also exposed an unrelated `Button size` type mismatch in the progressive Forecasting hydrator; removed the unsupported prop while preserving the existing button classes.
- **Follow-up:** Re-run the manual Daily AI Forecast control and verify the new monitoring row appears in Petyr Admin after refresh.

- **Area:** Petyr / Forecasting / Progressive initial render
- **Change:** Changed `/forecasting` so the server render only performs Petyr read permission checks and returns a lightweight approved-rendering shell. The full PostgreSQL-backed rendering data now loads after first paint through protected route `GET /api/petyr/forecasting/rendering-data`, with a compact bottom-left loader showing `Aggiornamento dati in corso...` while the refresh is running and a retry action on failure. Forecast Entry preloading now starts only after the real Forecasting data has loaded.
- **Reason:** Large Petyr portfolios could make `petyr.draftapps.it/forecasting` feel stuck because the page waited for Management, CSM, Business Unit and trend data before rendering any UI.
- **Impact:** First paint is no longer blocked by the heavy approved-rendering data read. Data sources, permissions, Redash isolation, Forecast Entry save behavior, calculations, schema and public Forecast Entry API contracts are unchanged.
- **Files/documents involved:** `apps/forecasting-app/src/app/forecasting/page.tsx`, `apps/forecasting-app/src/app/api/petyr/forecasting/rendering-data/route.ts`, `apps/forecasting-app/src/components/petyr/PetyrForecastingDataHydrator.tsx`, `apps/forecasting-app/src/services/petyrApprovedRenderingAdapter.ts`, `apps/forecasting-app/README.md`, `docs/05_forecasting_product_spec.md`, `DEVLOG.md`.
- **Validation:** Static source checks passed: `/forecasting/page.tsx` no longer calls `getPetyrApprovedRenderingData()`, and the new hydrator/API/helper/documentation references are present. `npm run build` could not run because `npm` is not available in this shell.
- **Follow-up:** Verify browser timing on `petyr.draftapps.it/forecasting` and compare user-visible first paint against backend `getPetyrApprovedRenderingData` duration.

## 2026-06-26

- **Area:** Petyr / Management View / Layout
- **Change:** Made `Current year trend` full-width and placed it above a full-width `Revenue per Business Unit` section. Increased the small value-table typography inside `Revenue per Business Unit` from 11px to 12.5px.
- **Reason:** Product requested a wider Management View reading surface and slightly larger Business Unit table text.
- **Impact:** UI layout and typography changed only. No data source, forecast calculation, API contract, permission, schema, Redash integration or persistence behavior changed.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/PetyrMVPRendering.tsx`, `DEVLOG.md`.
- **Validation:** `npm.cmd run build` could not run because `npm.cmd` is not available in PowerShell PATH in this environment. Focused source readback confirmed the Management View card order/width change and the scoped `Revenue per Business Unit` table typography update.
- **Follow-up:** None.


## 2026-06-26

- **Area:** Platform / Docker Compose / Forecasting image reuse
- **Change:** Updated root `docker-compose.yml` so `forecasting-db-sync`, `forecasting-app` and `petyr-ai-forecast-worker` use the same `${COOLIFY_RESOURCE_UUID:-petyr}-forecasting-app` image, with the Docker build declared only on `forecasting-app`.
- **Reason:** Coolify was building the same Forecasting Dockerfile separately for the app, DB sync and AI worker services. The deployment log showed the build reaching the duplicated `petyr-ai-forecast-worker` Next.js build and then exiting with code 255 without an application error, consistent with avoidable duplicate heavy builds on the deployment server.
- **Impact:** Runtime commands, environment variables, service names, dependencies, schema sync behavior and worker behavior are unchanged. Deployments now build the Forecasting image once and reuse it for DB sync and worker execution.
- **Files/documents involved:** `docker-compose.yml`, `DEVLOG.md`.
- **Validation:** `docker compose config --quiet` passed with placeholder required environment values. The local Docker daemon is not available, so a full Docker build could not be run here.
- **Follow-up:** Rerun Coolify deployment and confirm the build log no longer starts a separate `petyr-ai-forecast-worker builder RUN npm run build` step.

## 2026-06-26

- **Area:** Petyr / Forecast Entry / Scoped read warmup performance
- **Change:** Added narrower CSM-scoped read paths for normal Monthly and Annual Forecast Entry batch loading, using `company_ownership` to resolve the selected CSM portfolio before reading only the needed campaign, forecast, status and AI cache rows. Added a short-lived in-memory read cache with in-flight promise dedupe for Forecast Entry batch reads, invalidated after Monthly or Annual saves. Added a silent `/forecasting` background preloader for users whose login display name resolves to exactly one CSM and who have `petyr:forecast:write`.
- **Reason:** Forecast Entry still paid avoidable load cost on large portfolios because the normal batch endpoints could rebuild broad overview inputs before narrowing to the selected CSM. The preloader warms the same public batch endpoints before the user opens `/forecasting/entry`.
- **Impact:** No public API path, response shape, permission, schema, Redash source, save contract or forecast calculation changed. If `company_ownership` is missing or unusable, the batch endpoints fall back to the existing broader read model with diagnostics. Cache is best-effort per process and expires after 60 seconds.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrDataService.ts`, `apps/forecasting-app/src/services/forecastEntryBatchService.ts`, `apps/forecasting-app/src/services/annualForecastEntryBatchService.ts`, `apps/forecasting-app/src/services/forecastEntryReadCache.ts`, `apps/forecasting-app/src/components/petyr/PetyrForecastEntryPreloader.tsx`, `apps/forecasting-app/src/app/forecasting/page.tsx`, Forecast Entry batch API routes, `DEVLOG.md`.
- **Validation:** Passed `npm.cmd run build` from `apps/forecasting-app`. Initial `npm run build` was blocked by PowerShell script execution policy, so validation used `npm.cmd`.
- **Follow-up:** Compare `/petyr-admin` Performance Results for `getForecastEntryBatch`, `getAnnualForecastEntryBatch`, `queryCampaignRows`, `readForecastMonthlyRows` and `readAiForecastCacheRows` on production-sized CSM portfolios.

## 2026-06-26

- **Area:** Petyr / Forecast Entry / Annual entry CSM filter
- **Change:** Restored the visible CSM selector inside Annual Forecast Entry and synchronized it with the Monthly Forecast Entry selector when both sections are loaded.
- **Reason:** Annual Forecast Entry must let users change the CSM from the annual view itself; the monthly CSM filter is not a substitute, even though the two selectors should follow each other.
- **Impact:** UI behavior changed only. Annual read/save APIs, portfolio-scoped read model, persistence, permissions, Year filter and audit behavior are unchanged.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/ForecastEntryMonthlyBatchWorkspace.tsx`, `apps/forecasting-app/src/components/petyr/AnnualForecastEntryBatchWorkspace.tsx`, `docs/05_forecasting_product_spec.md`, `apps/forecasting-app/README.md`, `DEVLOG.md`.
- **Validation:** Passed `npm.cmd run build` from `apps/forecasting-app`. Focused source scan found no remaining documentation/component text saying the Annual CSM selector belongs only to Monthly.
- **Follow-up:** None.

## 2026-06-26

- **Area:** Petyr / Initial Forecast / Annual Forecast Entry
- **Change:** Replaced the legacy Initial Forecast snapshot/scheduler path with Annual Forecast Entry as the canonical source. Added per-Business Unit Initial Forecast storage on `forecast_annual.initial_forecast`; `forecast_annual_entry.initial_forecast` remains the company/year total. Management View, Business Unit summaries and Company Detail now read Initial Forecast from Annual Entry/Annual Forecast data instead of `forecast_annual_snapshot`. Removed the legacy Initial Forecast Excel export/import endpoints, protected consolidation endpoint and related services/components from the product API.
- **Reason:** Product clarified that Initial Forecast is entered in Annual Forecast Entry by IGSM/CSM users during the December 10-January 10 window, then remains fixed while Ongoing Forecast continues to evolve during the year.
- **Impact:** Initial Forecast scheduler and target-year cutoff TODOs are superseded. The physical legacy snapshot tables are deprecated but not dropped in this task to avoid destructive database cleanup without a dedicated backup-backed migration. Existing Annual Entry saves during the Forecast Initial window populate per-Business Unit Initial Forecast values; later saves update Ongoing Forecast without changing Initial Forecast.
- **Files/documents involved:** `apps/forecasting-app/prisma/schema.prisma`, `apps/forecasting-app/src/services/annualForecastEntryBatchService.ts`, `apps/forecasting-app/src/services/petyrDataService.ts`, `apps/forecasting-app/src/services/petyrDataHealthService.ts`, removed legacy Initial Forecast API/service/component files, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `docs/04_data_model.md`, `docs/petyr/02_petyr_data_model_target.md`, `docs/petyr/03_petyr_business_rules.md`, `docs/08_operational_commands.md`, `apps/forecasting-app/README.md`, `BACKLOG.md`, `DECISIONS.md`.
- **Validation:** Passed `npm.cmd run db:generate`, `npm.cmd run test:annual-forecast-entry` and `npm.cmd run build`. Focused `rg` checks found no remaining source/test references to the removed Initial Forecast legacy services or endpoints.
- **Follow-up:** Physically drop deprecated `forecast_annual_snapshot` tables only in a separate backup-backed database cleanup task.

## 2026-06-26

- **Area:** Platform / PostgreSQL / Backup and recovery
- **Change:** Defined the production PostgreSQL backup standard for the shared Petyr/Redash data hub: Coolify/host-level backups, encrypted offsite copy, daily backups retained for 5 days, weekly backups retained for 3 weeks, no other retention tier, RPO 24 hours, target RTO 8 hours and Platform owner responsibility. Clarified that Petyr Admin SQL export/import remains for migration and controlled recovery, not production backup compliance.
- **Reason:** The existing Petyr Admin export/import workflow existed, but retention, encryption, offsite storage, restore drill, PITR expectations and ownership were still an open platform backlog item.
- **Impact:** Documentation and operational policy changed only. No runtime, schema, API, Redash source, forecast logic, permission or deployment configuration changed. PITR/WAL archiving remains out of v1 and is tracked as a future backlog item if RPO below 24 hours is required.
- **Files/documents involved:** `docs/01_architecture.md`, `docs/08_operational_commands.md`, `DEPLOY.md`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `apps/forecasting-app/README.md`, `DECISIONS.md`, `BACKLOG.md`, `DEVLOG.md`.
- **Validation:** Documentation-only task; no build required. Focused repository searches were run for backup, retention, PITR and Petyr Admin database backup references.
- **Follow-up:** Configure the selected production host/Coolify backup mechanism and record the first restore drill evidence outside the repository.

## 2026-06-25

- **Area:** Petyr / Daily AI Forecast / Advisory lock
- **Change:** Cast the two Daily AI Forecast PostgreSQL advisory-lock keys to `int` in the `pg_try_advisory_xact_lock` call.
- **Reason:** Prisma sent the numeric placeholders as `bigint`, which made PostgreSQL look for `pg_try_advisory_xact_lock(bigint, bigint)` and fail because the two-argument advisory lock signature expects integer keys.
- **Impact:** Daily AI Forecast manual and worker runs can acquire the intended transaction-scoped advisory lock instead of failing before company processing starts. Forecast selection, deterministic values, cache persistence and scheduling are unchanged.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrNightlyDeterministicAiForecastService.ts`, `DEVLOG.md`.
- **Validation:** Passed `npm.cmd run build`.
- **Follow-up:** Re-run the Petyr Admin Daily AI Forecast control in the target environment and verify the result counters plus `ai_forecast_cache` rows for the daily model version.

- **Area:** Petyr / Forecast Entry / Batch read performance
- **Change:** Optimized normal Forecast Entry loading by rendering `/forecasting/entry` with only the Monthly batch data initially, lazy-loading Annual Forecast Entry only when the Annual tab is opened, and replacing per-company Monthly/Annual batch read loops with portfolio-scoped PostgreSQL read models. Added persisted server-side performance measurements for `getForecastEntryBatch` and `getAnnualForecastEntryBatch`.
- **Reason:** Large CSM portfolios were slow because Monthly reused `getForecastEntryContext` per company and Annual reused `getCompanyDetail` per company, causing repeated broad PostgreSQL reads and loading both sections before the user selected a tab.
- **Impact:** Forecast save behavior, permissions, Redash data flow, official Business Units, AI placeholder semantics, annual FC Ongoing derivation and audit tables are unchanged. The initial page load now avoids Annual data, and both batch read endpoints use bulk portfolio reads for forecast rows, AI cache, company status and revenue/planned aggregates.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrDataService.ts`, `apps/forecasting-app/src/services/forecastEntryBatchService.ts`, `apps/forecasting-app/src/services/annualForecastEntryBatchService.ts`, `apps/forecasting-app/src/components/petyr/ForecastEntryMonthlyBatchWorkspace.tsx`, `apps/forecasting-app/src/components/ui/tabs.tsx`, `apps/forecasting-app/src/app/forecasting/entry/page.tsx`, `apps/forecasting-app/src/lib/petyr/performance.ts`, `apps/forecasting-app/README.md`, `docs/05_forecasting_product_spec.md`, `BACKLOG.md`, `DEVLOG.md`.
- **Validation:** Static source checks passed for lazy Annual loading, removed per-company batch read patterns and performance operation registration. Could not run `npm run build` or `npm run test:annual-forecast-entry` because this shell has no `npm`/project `node_modules`; Docker validation is unavailable because Docker Desktop WSL integration is disabled.
- **Follow-up:** Review `/petyr-admin` Performance Results against production-sized CSM portfolios. If p95 remains high, evaluate targeted indexes or materialized aggregate views as a separate documented task.

- **Area:** Petyr / Forecast Entry / Monthly and Annual entry UI
- **Change:** Moved the CSM selector inside the Monthly Forecast Entry tab below the Monthly/Annual switch, removed the CSM selector from Annual Forecast Entry, reduced Business Unit column widths in both monthly and annual entry tables, expanded forecast abbreviations to `Forecast`, tightened the Annual Forecast Initial column, and added the AI Forecast value in parentheses next to saved forecast labels when available.
- **Reason:** Product requested a clearer Forecast Entry layout where CSM selection is only shown for Monthly, Business Unit columns are more compact, abbreviations are avoided, and saved values can still be compared with the AI Forecast reference.
- **Impact:** UI layout and copy changed only. Forecast read/save APIs, persistence, permissions, annual year filtering, monthly editability, AI placeholders and audit behavior are unchanged.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/ForecastEntryMonthlyBatchWorkspace.tsx`, `apps/forecasting-app/src/components/petyr/AnnualForecastEntryBatchWorkspace.tsx`, `apps/forecasting-app/src/lib/petyr/annualForecastEntryRules.ts`, `apps/forecasting-app/src/services/annualForecastEntryBatchService.ts`, `apps/forecasting-app/src/app/forecasting/company/[companyName]/page.tsx`, `docs/05_forecasting_product_spec.md`, `apps/forecasting-app/README.md`, `DEVLOG.md`.
- **Validation:** Attempted `npm.cmd run build` from `apps/forecasting-app`, but this environment does not have `npm.cmd` available in WSL or PowerShell PATH. Focused source scans passed for visible forecast-abbreviation removal in the touched Forecast Entry UI and for keeping the CSM selector only in the Monthly component.
- **Follow-up:** None.

- **Area:** Petyr / Admin / Daily AI Forecast diagnostics
- **Change:** Added a read-only preflight check to the protected Daily AI Forecast admin run endpoint. The endpoint now reports missing forecast relations, warning forecast relations, missing Redash relations, empty Redash latest materializations, sanitized original error class/message and relation status metadata. The Petyr Admin manual run control now renders those diagnostics in a readable admin panel on both success and failure.
- **Reason:** The previous generic `does not exist` / `missing` error hid whether a Daily AI Forecast failure came from unapplied Petyr Prisma schema, missing or empty Redash materialized latest tables, optional fallback tables, advisory lock/worker behavior or another database error.
- **Impact:** Forecast logic, scheduling and persistence are unchanged. Daily deterministic AI Forecast still writes numeric suggestions only to `ai_forecast_cache`; `forecast_monthly.ai_forecast_value` and `forecast_annual.ai_forecast_value` remain CSM-save snapshots. The admin response is more diagnostic but continues to include the previous success payload fields.
- **Files/documents involved:** `apps/forecasting-app/src/app/api/petyr/admin/daily-ai-forecast/run/route.ts`, `apps/forecasting-app/src/components/petyr/PetyrDailyAiForecastRunControl.tsx`, `DEVLOG.md`.
- **Validation:** Passed `npm.cmd run build`.
- **Follow-up:** In target environments, verify that the deployed Compose includes `petyr-ai-forecast-worker` and that the latest Redash materialized tables have rows before relying on the overnight run.

- **Area:** Petyr / Company Detail / Forecast Intelligence persistence
- **Change:** Wired Company Detail to load the latest successful persisted Forecast Intelligence sentinel row for the selected company and year, pass it into the client Intelligence section as the initial result, and show `Last generated` metadata near the Intelligence header. The manual `Generate Intelligence` action now forces a fresh OpenRouter-backed generation attempt instead of reusing a same-hash cache hit, updates the visible result only after success, and keeps the previous successful Intelligence visible when a later attempt fails.
- **Reason:** Users expect successful Company Intelligence to survive page reloads while preserving Company Detail as a read-only analytical surface and keeping failed regeneration attempts non-destructive.
- **Impact:** Forecast Intelligence persistence continues to use `ai_forecast_cache` sentinel rows only (`business_unit=__forecast_intelligence__`, `month=0`, `forecast_value=0`). Numeric AI Forecast month 1-12 rows, CSM-owned forecast tables, closed revenue, management objectives, Initial Forecast snapshots and Redash materialized data are not modified.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/PetyrCompanyIntelligenceSection.tsx`, `apps/forecasting-app/src/app/forecasting/company/[companyName]/page.tsx`, `apps/forecasting-app/src/app/forecasting/aiForecastActions.ts`, `apps/forecasting-app/src/services/petyrForecastIntelligenceCacheService.ts`, `apps/forecasting-app/src/services/petyrForecastIntelligenceService.ts`, `apps/forecasting-app/src/services/petyrAiForecastCompanyIntelligenceService.ts`, `apps/forecasting-app/src/types/petyrAiForecastManualAction.ts`, `apps/forecasting-app/tests/aiForecastIntelligence.test.ts`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/04_data_model.md`, `docs/05_forecasting_product_spec.md`, `DEVLOG.md`.
- **Validation:** Passed `npm.cmd run test:ai-forecast` (37/37) and `npm.cmd run build`.
- **Follow-up:** Verify in browser against a real company/year after OpenRouter and PostgreSQL are configured in the target environment.

- **Area:** Petyr / Forecast Entry / Annual batch entry
- **Change:** Added a separate Annual Forecast Entry tab inside normal `/forecasting/entry`, alongside the existing Monthly batch tab. Added Year default/options rules, FC Initial edit-window rules, annual confidence validation, Annual Entry read/save endpoints, a new `forecast_annual_entry` Prisma model for customer + year metadata, `forecast_annual.value_source` for BU value provenance, Annual Entry UI with CSM + Year filters, active-status toggle, FC Initial, derived FC Ongoing, confidence dropdown, official BU columns, FC AI placeholders, Revenue/Planned/Uncovered percentages, History links to Company Detail and bulk Save Changes buttons above and below the table.
- **Reason:** Product requested a CSM-facing Annual Forecast Entry workflow separated from Monthly but available in the normal Forecast Entry page, using Petyr's official Business Units and PostgreSQL-backed Redash-derived data without direct Redash access.
- **Impact:** Annual saves now persist FC Initial and confidence in `forecast_annual_entry`, persist confirmed/manual BU annual values in `forecast_annual`, reject unconfirmed AI placeholders, block FC Initial changes outside December 10 through January 10, require confidence on modified rows, and audit effective annual changes through `forecast_save_session` / `forecast_change_log` with source `Annual Forecast Entry`. Annual Entry Planned includes future `Setup`, `Recruiting` and `Running` campaigns for this workflow only; Management View planned semantics were not changed.
- **Files/documents involved:** `apps/forecasting-app/prisma/schema.prisma`, `apps/forecasting-app/src/lib/petyr/annualForecastEntryRules.ts`, `apps/forecasting-app/src/services/annualForecastEntryBatchService.ts`, `apps/forecasting-app/src/app/api/petyr/forecast-entry/annual-batch/route.ts`, `apps/forecasting-app/src/app/api/petyr/forecast-entry/annual-batch/save/route.ts`, `apps/forecasting-app/src/components/petyr/AnnualForecastEntryBatchWorkspace.tsx`, `apps/forecasting-app/src/components/petyr/ForecastEntryMonthlyBatchWorkspace.tsx`, `apps/forecasting-app/src/app/forecasting/entry/page.tsx`, `apps/forecasting-app/src/app/forecasting/company/[companyName]/page.tsx`, `apps/forecasting-app/tests/annualForecastEntryRules.test.ts`, `apps/forecasting-app/tsconfig.annual-forecast-entry-test.json`, `apps/forecasting-app/package.json`, `README.md`, `apps/forecasting-app/README.md`, `docs/04_data_model.md`, `docs/05_forecasting_product_spec.md`, `docs/petyr/02_petyr_data_model_target.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Validation:** Passed `npm.cmd run db:generate`, `npm.cmd run test:annual-forecast-entry` (8/8) and `npm.cmd run build`.
- **Follow-up:** Apply the updated Petyr schema to the target database with the documented schema sync/migration flow before trying to save Annual Forecast Entry rows in that environment.

## 2026-06-24

- **Area:** Petyr / Forecast Entry / Monthly batch entry
- **Change:** Preserved the previous full Forecast Entry workspace as `/forecasting/entry/old` behind `petyr:admin`, changed normal `/forecasting/entry` to a current server-month CSM batch-entry workspace, added batch read/save endpoints, and added a batch service that writes CSM-validated monthly values through existing `forecast_monthly`, `forecast_save_session` and `forecast_change_log` tables. Normal Forecast Entry now exposes only a CSM filter, official Petyr Business Units, current-month editable forecast cells, read-only Closed Revenue and per-company notes.
- **Reason:** Product wants the normal Forecast Entry page to support fast Monthly Forecast batch entry for CSMs while keeping Annual Forecast, Forecast Intelligence, single-company selection, active/inactive status controls and AI/admin tools available only in the admin-only legacy experience for now.
- **Impact:** Users with `petyr:forecast:write` no longer see the legacy single-company editor, Annual Forecast, Forecast Intelligence, deterministic preview/apply AI controls, import/export or diagnostics on `/forecasting/entry`. AI suggestions in active cells are placeholders until focused/accepted or manually edited; untouched AI placeholders are not saved. Batch save creates one save session per company with effective value changes and rejects note-only updates.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/ForecastEntryWorkspaceOld.tsx`, `apps/forecasting-app/src/components/petyr/ForecastEntryMonthlyBatchWorkspace.tsx`, `apps/forecasting-app/src/app/forecasting/entry/page.tsx`, `apps/forecasting-app/src/app/forecasting/entry/old/page.tsx`, `apps/forecasting-app/src/services/forecastEntryBatchService.ts`, `apps/forecasting-app/src/app/api/petyr/forecast-entry/batch/route.ts`, `apps/forecasting-app/src/app/api/petyr/forecast-entry/batch/save/route.ts`, `docs/05_forecasting_product_spec.md`, `docs/04_data_model.md`, `apps/forecasting-app/README.md`, `DECISIONS.md`, `BACKLOG.md`, `DEVLOG.md`.
- **Validation:** Passed focused source scans for normal route exposure, legacy admin-only route, batch endpoint usage and official Business Unit source. Passed `npm.cmd run build`; direct `npm run build` was blocked by local PowerShell execution policy for `npm.ps1`.
- **Follow-up:** Measure batch read performance on real data and optimize if current broad read/context reuse exceeds documented route thresholds.

## 2026-06-24

- **Area:** Petyr / Forecast Intelligence / Evidence validation
- **Change:** Revised Forecast Intelligence so the raw OpenRouter contract returns `evidence_refs` instead of `numeric_evidence`, added payload version `petyr_forecast_intelligence_payload_v3`, prompt `petyr_forecast_intelligence_prompt_v5`, raw LLM output schema `petyr_forecast_intelligence_llm_output_v5`, added a deterministic evidence registry, enriched UI-compatible `numeric_evidence` server-side from registry display values, added sanitized selected-year CSM change notes to the payload, and preserved signed delta values with `roundSignedMoney`.
- **Reason:** Product wants Forecast Intelligence to generate useful CSM insight text while Petyr remains the owner of forecast values and visible numeric evidence. The previous validator rejected narrative text numbers too aggressively and allowed the model to author numeric evidence directly.
- **Impact:** Free numbers in narrative insight text no longer fail validation by themselves. Unknown evidence refs, missing refs, raw model-generated `numeric_evidence`, markdown, prompt leaks, rounding scenario references and prescriptive language still fail validation. Existing UI cards keep the same four sections and still render `numeric_evidence`, now generated by Petyr.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrForecastIntelligenceService.ts`, `apps/forecasting-app/src/services/petyrAiForecastCompanyIntelligenceService.ts`, `apps/forecasting-app/src/services/petyrAiForecastStrategyService.ts`, `apps/forecasting-app/src/services/petyrAiForecastWeightsService.ts`, `apps/forecasting-app/src/services/petyrAiForecastLlmContractSmoke.ts`, `apps/forecasting-app/tests/aiForecastIntelligence.test.ts`, `docs/petyr/FORECAST_INTELLIGENCE_LAYER.md`, `docs/05_forecasting_product_spec.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Validation:** Passed `npm.cmd run test:ai-forecast` (32/32) and `npm.cmd run build`.
- **Follow-up:** Review real OpenRouter output quality against production-like company payloads.

## 2026-06-24

- **Area:** Petyr / Admin / Performance diagnostics
- **Change:** Restructured the `/petyr-admin` Performance test results section around high-level statistics: average load time, measured coverage, slowest average operation, success/failure sample counts and a per-operation table with average, median, p95, latest duration and sample count before the detailed latest-check table.
- **Reason:** Product asked for clearer high-level readability and average loading-time statistics instead of a primarily row-level diagnostics view.
- **Impact:** Admin performance data remains PostgreSQL-backed and sanitized. No new browser telemetry, raw payload storage, import/export behavior, Redash source behavior or forecast logic changed.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrPerformanceResultsService.ts`, `apps/forecasting-app/src/app/petyr-admin/page.tsx`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `DEVLOG.md`.
- **Follow-up:** Browser-side load metrics such as DOMContentLoaded and main-thread timing remain tracked in backlog.

## 2026-06-24

- **Area:** Petyr / Admin / Performance diagnostics
- **Change:** Added persisted sanitized performance measurements in `petyr_performance_measurement`, mirrored the model in Forecasting and Redash Ingestor Prisma schemas, updated Forecasting and Redash performance helpers to write measurements, instrumented Data Health and monthly Excel export/import, added `GET /api/petyr/admin/performance-results`, and changed `/petyr-admin` Performance test results from static instrumentation coverage to real latest measurements with never-measured states.
- **Reason:** Product requested the previously prepared performance meters to become active and valued inside Petyr Admin instead of requiring server-log inspection.
- **Impact:** Petyr Admin now shows backend/server-side operation durations, row counts, status, measured time and safe scalar metadata. `PETYR_PERF_LOGS` still controls console verbosity only. No raw Redash payload, workbook content, customer rows, browser timing, API key or secret is stored.
- **Files/documents involved:** `apps/forecasting-app/prisma/schema.prisma`, `apps/redash-ingestor/prisma/schema.prisma`, `apps/forecasting-app/src/lib/petyr/performance.ts`, `apps/redash-ingestor/src/lib/performance.ts`, `apps/forecasting-app/src/services/petyrDataHealthService.ts`, `apps/forecasting-app/src/services/petyrMonthlyForecastExcelService.ts`, `apps/forecasting-app/src/services/petyrPerformanceResultsService.ts`, `apps/forecasting-app/src/app/api/petyr/admin/performance-results/route.ts`, `apps/forecasting-app/src/app/petyr-admin/page.tsx`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/04_data_model.md`, `docs/05_forecasting_product_spec.md`, `docs/08_operational_commands.md`, `apps/forecasting-app/README.md`, `DECISIONS.md`, `BACKLOG.md`, `DEVLOG.md`.
- **Follow-up:** Apply the Petyr superset schema in the target database, then load `/petyr-admin`, run Redash sync and Excel workflows to populate measurements. Browser-side performance capture remains a backlog item.

## 2026-06-24

- **Area:** Platform / Coolify deployment / Database bootstrap
- **Change:** Reordered root Compose bootstrap so `forecasting-db-sync` runs first with the Petyr Prisma superset schema, changed `redash-bootstrap` to run only `npm run db:seed`, and made the Redash Ingestor `docker:bootstrap` script seed-only. Updated deployment docs to state that partial Redash Ingestor Prisma schema pushes must not run against the shared PostgreSQL schema.
- **Reason:** Coolify startup failed because `redash-bootstrap` ran `prisma db push` from the Redash Ingestor partial schema and Prisma proposed dropping existing Petyr forecast tables in the shared `public` schema.
- **Impact:** Deploy bootstrap no longer asks Prisma to drop Petyr tables such as `forecast_monthly`, `forecast_annual`, `ai_forecast_cache`, `forecast_change_log`, `forecast_save_session`, `management_objective` or `management_objective_change_log`. Fresh volumes are still initialized by the Petyr schema sync before the Redash source seed and optional Redash initial sync.
- **Files/documents involved:** `docker-compose.yml`, `apps/redash-ingestor/package.json`, `README.md`, `README_INSTALL_DOCKER.md`, `DEPLOY.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Validation:** Passed `docker compose --env-file .env config --quiet` and `docker compose --env-file .env config --services`; Docker emitted the existing non-blocking warning reading `C:\Users\loren\.docker\config.json`. Rendered Compose JSON shows `forecasting-db-sync` depends only on healthy Postgres, `redash-bootstrap` runs `npm run db:seed` after `forecasting-db-sync`, `redash-initial-sync` runs after `redash-bootstrap`, and `platform-home` exposes container port `8080` without host `ports`. Focused source scans found no remaining `npm run docker:bootstrap`, `npm run db:push &&` or `--accept-data-loss` runtime path outside documentation warnings.
- **Follow-up:** On Coolify, redeploy and verify bootstrap logs plus forecast table counts before considering the incident closed.

## 2026-06-24

- **Area:** Petyr / Forecasting App / Error pages
- **Change:** Added branded Petyr fallback pages for 404, browser-facing 400 and 500 errors. Unknown routes now use a structured Petyr 404 page, runtime App Router errors use Petyr-styled 500 fallbacks with retry and Forecasting navigation, and invalid browser auth callback state redirects to `/forecasting/error?code=400` instead of returning raw JSON.
- **Reason:** Product requested non-blank, structured error pages that keep the UNGUESS Petyr visual style and let users return to the Forecasting home page.
- **Impact:** Browser error flows now keep users inside a recognizable Petyr surface with a clear path back to `/forecasting`. API endpoints keep their JSON error responses. No Redash data flow, Prisma schema, permissions, forecast calculation, OpenRouter behavior or environment variable changed.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/PetyrErrorPage.tsx`, `apps/forecasting-app/src/app/not-found.tsx`, `apps/forecasting-app/src/app/error.tsx`, `apps/forecasting-app/src/app/global-error.tsx`, `apps/forecasting-app/src/app/forecasting/error/page.tsx`, `apps/forecasting-app/src/app/auth/callback/route.ts`, `docs/05_forecasting_product_spec.md`, `DEVLOG.md`.
- **Validation:** `npm run build` could not start because `npm` is not available in this shell and local `node_modules` are absent. Docker fallback `docker compose build forecasting-app` could not run because the Docker daemon socket `/var/run/docker.sock` is unavailable. A focused source scan found no `next/document` or `<Html>` imports in Forecasting app source/pages.
- **Follow-up:** None expected unless product wants custom copy for additional HTTP statuses.

## 2026-06-24

- **Area:** Petyr / Access Control / Authentication UX
- **Change:** Added a pending-grant fallback for company-domain users who complete Access Layer authentication but do not yet receive the Petyr `petyr:read` grant. Petyr now clears local auth state and session cookies for invalid callback state and pending-grant callback completion, then renders an Italian fallback page explaining that the administrator has been notified and that Lorenzo Brandi is the access-timing reference.
- **Reason:** Users with a valid company account but no Petyr grant should get a clear, non-technical explanation and should not keep a dirty Petyr session that could interfere after access is granted.
- **Impact:** No granted-user login behavior, permission key, database schema, Redash flow or Access Layer endpoint changed. Pending-grant users are not issued a Petyr session cookie and can return through `/auth/login` after the grant is released to start from a clean session.
- **Files/documents involved:** `apps/forecasting-app/src/lib/petyr/authCore.ts`, `apps/forecasting-app/src/app/auth/callback/route.ts`, `apps/forecasting-app/tests/petyrAuth.test.ts`, `apps/forecasting-app/README.md`, `docs/access-control/COPY_UX.md`, `DEVLOG.md`.
- **Validation:** Could not run in this shell: sandboxed commands fail before startup because of a local bubblewrap digest mismatch, `npm`/`node`/`git` are not on PATH, and Docker Desktop reports that WSL integration is not enabled for this distro.
- **Follow-up:** Confirm the external Access Layer notification/audit path for no-grant login attempts remains enabled in production, since Petyr only renders the user-facing fallback after the exchange response.

## 2026-06-23

- **Area:** Platform / Coolify deployment / Bootstrap and routing
- **Change:** Added public-origin auth redirect helpers for Petyr and Redash Ingestor so post-auth redirects use the configured Access Layer callback URL instead of internal request hosts such as `0.0.0.0:3000`. Made root Compose Coolify-safe by exposing `platform-home:8080` without a host bind, added one-shot `redash-bootstrap`, `forecasting-db-sync` and optional `redash-initial-sync` services, and documented `REDASH_INITIAL_SYNC_ON_BOOTSTRAP=false` as the default. Dockerfiles now install dev dependencies even when build-time `NODE_ENV=production`, and Forecasting no longer advertises Next standalone output while using `next start`.
- **Reason:** Production deploy on Coolify must keep one public origin at `https://petyr.draftapps.it`, avoid host port conflicts with Access Layer, build reliably when Coolify injects production env, and initialize fresh PostgreSQL volumes without manual container exec steps.
- **Impact:** After Access Layer login, Petyr redirects to `https://petyr.draftapps.it/forecasting` instead of an internal container URL. Coolify should route the public domain to `platform-home` container port `8080`; local localhost access now requires `docker-compose.local.yml` or another port-binding override. Fresh deploys run schema/seed bootstrap before long-running apps start; optional initial Redash materialization can be enabled by env.
- **Files/documents involved:** `docker-compose.yml`, `.env.example`, `apps/forecasting-app/Dockerfile`, `apps/redash-ingestor/Dockerfile`, `apps/forecasting-app/next.config.ts`, `apps/forecasting-app/src/lib/petyr/authCore.ts`, `apps/forecasting-app/src/app/auth/*`, `apps/forecasting-app/tests/petyrAuth.test.ts`, `apps/redash-ingestor/src/lib/authCore.ts`, `apps/redash-ingestor/src/app/auth/*`, `apps/redash-ingestor/tests/redashIngestorAuth.test.ts`, `DEPLOY.md`, `README.md`, `README_INSTALL_DOCKER.md`, `docs/01_architecture.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Validation:** Passed `docker compose --env-file .env.example config --quiet` and `docker compose --env-file .env.example config --services`; rendered config includes the bootstrap services and `platform-home` uses `expose: ["8080"]` without host `ports`. Targeted npm auth tests and app builds could not run in this shell because npm/local `node_modules` are unavailable; Docker image builds could not run because the Docker daemon socket `/var/run/docker.sock` is unavailable.
- **Follow-up:** In Coolify, confirm Compose supports `depends_on.condition: service_completed_successfully`; if not, run the same bootstrap commands as explicit pre-start jobs or documented manual deploy steps.

## 2026-06-22

- **Area:** Platform / Coolify deployment / Petyr routing
- **Change:** Prepared the root Compose and env handoff for Coolify deployment on `https://petyr.draftapps.it` with Access Layer at `https://access-layer.draftapps.it`. Compose now reads explicit environment variables instead of requiring `env_file: .env`, removes hardcoded application `DATABASE_URL` values, requires coherent PostgreSQL variables, removes direct published ports for PostgreSQL, Petyr and Redash Ingestor, and keeps only the gateway published. Added a sanitized root `.env.example`, sanitized the old duplicate env example, updated Access Layer callback defaults/descriptors/docs, and allowed `petyr.draftapps.it` for Next.js Server Actions.
- **Reason:** The upcoming Coolify deployment should avoid the same class of drift seen on Access Layer, where Compose env, app `DATABASE_URL`, generated Coolify variables and persistent PostgreSQL volume state disagreed.
- **Impact:** Production operators must provide `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` and a matching URL-encoded `DATABASE_URL` in Coolify. If a PostgreSQL volume was already initialized with different credentials, it must be recreated after backup or accessed with the original credentials. Petyr, Redash Ingestor and PostgreSQL are no longer directly published by root Compose; traffic should enter through `platform-home:8080`.
- **Files/documents involved:** `docker-compose.yml`, `.env.example`, `.env - Copia.example`, `.env`, `.dockerignore`, `apps/forecasting-app/next.config.ts`, `apps/forecasting-app/.env.example`, `apps/redash-ingestor/.env.example`, `apps/forecasting-app/README.md`, `apps/redash-ingestor/README.md`, `petyr/access-layer-tools/*`, `README.md`, `README_INSTALL_DOCKER.md`, `docs/01_architecture.md`, `docs/08_operational_commands.md`, `DEPLOY.md`, `BACKLOG.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Validation:** Passed `docker compose config --services`, `docker compose config --quiet`, and `docker compose --env-file .env.example config --quiet`. Verified `docker-compose.yml` no longer contains `env_file`, `container_name`, `5432:5432`, `3000:3000` or `3001:3000`. Full `docker.exe compose build forecasting-app redash-ingestor` was attempted but interrupted after the Docker build stayed silent for several minutes in the npm dependency install layer; no application error was emitted before interruption. Local npm tests/builds could not run because `node_modules` are not present in the app checkouts.
- **Follow-up:** Configure Coolify variables and Access Layer tool registrations with the documented `draftapps.it` URLs before first production login test.

## 2026-06-22
- **Area:** Petyr / Admin / PostgreSQL backup and restore
- **Change:** Added a `/petyr-admin` Database backup section plus protected export/import endpoints. Export streams a native PostgreSQL SQL dump from `DATABASE_URL`; import accepts a confirmed `.sql` dump and restores it with PostgreSQL stop-on-error behavior. Both endpoints require Petyr `petyr:admin` and `APP_INTERNAL_SECRET`. The Forecasting app runtime image now installs PostgreSQL client tools for `pg_dump` and `psql`.
- **Reason:** Product requested an admin way to export the database and reimport it on a new server to preserve platform data.
- **Impact:** Operators can migrate or recover the shared PostgreSQL data hub, including Redash snapshots/metadata, materialized tables and Petyr forecast/admin data. Restore can drop/recreate database objects from the dump and should be used only on a new target server, disposable environment or controlled recovery after taking a backup. No Prisma schema, Redash source, forecast calculation, OpenRouter behavior or permission key changed.
- **Files/documents involved:** `apps/forecasting-app/Dockerfile`, `apps/forecasting-app/src/app/petyr-admin/page.tsx`, `apps/forecasting-app/src/app/api/petyr/admin/database-backup/export/route.ts`, `apps/forecasting-app/src/app/api/petyr/admin/database-backup/import/route.ts`, `apps/forecasting-app/src/components/petyr/PetyrDatabaseBackupControl.tsx`, `apps/forecasting-app/src/services/petyrDatabaseTransferService.ts`, `apps/forecasting-app/src/services/aiForecastBatchService.ts`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `apps/forecasting-app/README.md`, `docs/08_operational_commands.md`, `docs/01_architecture.md`, `DECISIONS.md`, `BACKLOG.md`, `DEVLOG.md`.
- **Validation:** Passed `npm.cmd ci --no-audit --no-fund`, `npm.cmd run db:generate`, `npm.cmd run test:auth` (11/11), `npm.cmd run test:ai-forecast` (19/19), `npm.cmd run build`, and `docker compose config --services`. `docker compose build forecasting-app` could not run because Docker Desktop's Linux engine pipe was unavailable on the host.
- **Follow-up:** Resolved on 2026-06-26 by the platform PostgreSQL backup standard. PITR/WAL archiving remains a separate future backlog item only if RPO below 24 hours is required.

## 2026-06-22
- **Area:** Platform / Repository hygiene / Coolify deployment
- **Change:** Removed local generated `apps/forecasting-app` dependency/build artifacts from the checkout and tightened Git/Docker ignore rules for dependency folders, Next.js outputs, cache folders, temporary folders, coverage reports and local environment variants.
- **Reason:** GitHub/Coolify deployment should receive source, lockfiles and Docker configuration only, not local `node_modules`, `.next` build output or cache artifacts.
- **Impact:** Repository upload/build context is smaller and cleaner. Docker images still install dependencies and build inside the container from `package.json` / `package-lock.json`; no application runtime behavior, schema, API contract or environment variable name changed.
- **Files/documents involved:** `.gitignore`, `.dockerignore`, `apps/forecasting-app/.dockerignore`, `apps/redash-ingestor/.dockerignore`, `DEVLOG.md`.
- **Validation:** Verified generated `apps/forecasting-app/node_modules`, `.next` and `.tmp` folders are absent after cleanup. Build was not run because this task intentionally removed local dependencies; Coolify/Docker will reinstall them during image build.
- **Follow-up:** Do not upload local `.env` files to GitHub; configure production values in Coolify environment variables.

- **Area:** Platform / Redash Ingestor / Production routing
- **Change:** Aligned Redash Ingestor production operator URL and Access Layer callback under the Petyr production host: `https://petyr.unguess-internal.net/redash-ingestor` and `https://petyr.unguess-internal.net/redash-ingestor/auth/callback`. Updated root Compose defaults, local Compose fallback, Redash Ingestor env example, Redash Ingestor README, Access Layer onboarding descriptor, deployment docs, auth test expectation, backlog and decision log. Also corrected the stale local Petyr callback fallback in `docker-compose.local.yml` from the old `/petyr/auth/callback` path to `https://petyr.unguess-internal.net/auth/callback`.
- **Reason:** Product clarified that Redash Ingestor operator access should stay under the unified Petyr production subdomain rather than `unguess-internal.net`.
- **Impact:** Production DNS/proxy can use `petyr.unguess-internal.net` for both Petyr and the Redash Ingestor operator path. The external Access Layer `redash-ingestor` tool registration and deployed Redash Ingestor env vars must be updated to the new callback. No Redash source, sync logic, database schema, permission keys, forecasting behavior or Access Layer base URL changed.
- **Files/documents involved:** `docker-compose.yml`, `docker-compose.local.yml`, `.env`, `.env.production`, `.env - Copia.example`, `apps/redash-ingestor/.env.example`, `apps/redash-ingestor/README.md`, `apps/redash-ingestor/tests/redashIngestorAuth.test.ts`, `petyr/access-layer-tools/README.md`, `petyr/access-layer-tools/redash-ingestor.tool.json`, `DEPLOY.md`, `BACKLOG.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Validation:** Passed `docker compose config --services` with the existing non-blocking Docker config warning reading `C:\Users\loren\.docker\config.json`; rendered Compose callback environment values now point Petyr to `https://petyr.unguess-internal.net/auth/callback` and Redash Ingestor to `https://petyr.unguess-internal.net/redash-ingestor/auth/callback`. Passed focused callback scan showing no active env/default callback assignment remains under `https://unguess-internal.net`. Local `npm.cmd run test:auth` in `apps/redash-ingestor` could not run because local dependencies are unavailable in that app checkout (`tsc` is not installed).
- **Follow-up:** Update the real Access Layer `redash-ingestor` tool registration so its allowed return URL is `https://petyr.unguess-internal.net/redash-ingestor/auth/callback`; ensure the production reverse proxy routes `/redash-ingestor` through the Petyr host to the Redash Ingestor container.

## 2026-06-21

- **Area:** Platform / Access Layer / Production host
- **Change:** Updated Access Layer production base URL defaults from `https://unguess-internal.net/access-control` to `https://access-layer.unguess-internal.net` for Petyr and Redash Ingestor. Updated root/app env examples, root and local Compose defaults, tool onboarding descriptors, Petyr/Redash Ingestor READMEs, deployment docs, auth tests, backlog and decision log.
- **Reason:** Product clarified that Access Layer will be hosted on the dedicated subdomain `access-layer.unguess-internal.net`.
- **Impact:** Deployed Petyr and Redash Ingestor environments must set the new Access Layer base URLs before production auth works against the dedicated host. Petyr callback remains `https://petyr.unguess-internal.net/auth/callback`; Redash Ingestor callback remains the currently documented `/redash-ingestor/auth/callback` path. No permission keys, session-cookie behavior, database schema, Redash sync logic or forecasting behavior changed.
- **Files/documents involved:** `docker-compose.yml`, `docker-compose.local.yml`, `.env.example`, `apps/forecasting-app/.env.example`, `apps/redash-ingestor/.env.example`, `apps/forecasting-app/README.md`, `apps/redash-ingestor/README.md`, `apps/forecasting-app/tests/petyrAuth.test.ts`, `apps/redash-ingestor/tests/redashIngestorAuth.test.ts`, `petyr/access-layer-tools/*`, `DEPLOY.md`, `BACKLOG.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Validation:** Passed focused `rg` checks showing no remaining `https://unguess-internal.net/access-control` references in active env/default/deploy/test/tool files; the old URL remains only as historical context in `DECISIONS.md` and this log entry. Passed `docker compose config --services` with the existing non-blocking Docker config warning, passed `npm.cmd run test:auth` in `apps/forecasting-app` (11/11), and passed escalated `docker compose build redash-ingestor`. Local `npm.cmd run test:auth` and `npm.cmd run build` in `apps/redash-ingestor` could not run because local `tsc`/`prisma` binaries are unavailable in that app checkout.
- **Follow-up:** Update real deployment secrets/environment variables and external Access Layer tool registrations to use `https://access-layer.unguess-internal.net`.

- **Area:** Petyr / Production routing / Access Layer
- **Change:** Updated Petyr's production host contract from `https://unguess-internal.net/petyr` to `https://petyr.unguess-internal.net`, with Access Layer callback `https://petyr.unguess-internal.net/auth/callback`. Updated example env values, Docker Compose defaults, Access Layer tool descriptor, deploy/app docs, architecture notes and Next.js Server Actions allowed origin.
- **Reason:** Product clarified that production Petyr should run on a dedicated subdomain instead of a `/petyr` subpath on `unguess-internal.net`.
- **Impact:** Production Access Layer registration and deployed environment variables must use the new callback URL before login works on the new host. Petyr route ownership stays unchanged: `/forecasting`, `/petyr-admin`, `/api/petyr/*` and `/auth/*` remain served by `forecasting-app`. No database schema, Redash source, forecast calculation, permission key, AI behavior or local gateway route changed.
- **Files/documents involved:** `apps/forecasting-app/next.config.ts`, `docker-compose.yml`, `.env.example`, `apps/forecasting-app/.env.example`, `petyr/access-layer-tools/petyr.tool.json`, `apps/forecasting-app/README.md`, `DEPLOY.md`, `docs/01_architecture.md`, `BACKLOG.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Validation:** Passed `docker compose config --services` (services rendered; Docker emitted a non-blocking warning reading `C:\Users\loren\.docker\config.json`), `npm.cmd run build` in `apps/forecasting-app`, `npm.cmd run test:auth` in `apps/forecasting-app`, and focused `rg` checks showing the old `/petyr` production URL remains only as historical/new-decision context, not in active env/default/deploy files.
- **Follow-up:** Update the external Access Layer `petyr` tool registration so its allowed return URL is `https://petyr.unguess-internal.net/auth/callback`.

## 2026-06-20

- **Area:** Petyr / Forecast Intelligence v4 cleanup
- **Change:** Versioned Forecast Intelligence prompt/output to v4 so OpenRouter returns only `stakeholder_notes`, `risks`, `watchouts` and `opportunities`, each with payload-backed `numeric_evidence`. Removed old status/confidence/executive-summary/key-insight/driver/forecast-cue/adjustment-candidate rendering from CSM and admin Intelligence surfaces, removed selected-month and eligible-month/provider/as-of technical notices, and removed AI adjustment candidate overlays from charts.
- **Reason:** Product requested a compact Intelligence reading surface focused only on stakeholder notes, watchouts, opportunities and risks, with clear numeric explanation of why each item matters and without unrequested rounding scenarios or diagnostic warnings.
- **Impact:** Existing v3 Forecast Intelligence cache entries are bypassed by the v4 prompt/output schema version. No Prisma schema, Redash source, permissions, CSM forecast save behavior or deterministic forecast math changed. Internal deterministic scenarios may remain in local data but are no longer requested, validated, rendered or charted by Forecast Intelligence.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrForecastIntelligenceService.ts`, `apps/forecasting-app/src/services/petyrForecastIntelligenceCacheService.ts`, `apps/forecasting-app/src/services/petyrAiForecastLlmContractSmoke.ts`, `apps/forecasting-app/src/app/forecasting/aiForecastActions.ts`, `apps/forecasting-app/src/types/petyrAiForecastManualAction.ts`, `apps/forecasting-app/src/components/petyr/PetyrCompanyIntelligenceSection.tsx`, `apps/forecasting-app/src/components/petyr/PetyrAiForecastCompanyAction.tsx`, `apps/forecasting-app/src/components/petyr/ForecastEntryFaq.tsx`, `apps/forecasting-app/tests/aiForecastIntelligence.test.ts`, `docs/petyr/FORECAST_INTELLIGENCE_LAYER.md`, `docs/petyr/AI_FORECASTING_DESIGN.md`, `docs/05_forecasting_product_spec.md`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Validation:** Passed `npm.cmd run test:ai-forecast` (19/19 tests) and `npm.cmd run build`.
- **Follow-up:** Review real v4 OpenRouter outputs with CSM/Finance to tune how much numeric evidence is useful per item.

- **Area:** Petyr / AI Forecasting / Nightly deterministic worker
- **Change:** Fixed the Docker runtime entrypoint for the deterministic AI Forecast worker by replacing top-level `await` in `src/worker/nightlyDeterministicAiForecast.ts` with an explicit async `main()` wrapper.
- **Reason:** Local Docker validation showed `petyr-ai-forecast-worker` restarting because `tsx` could not transform top-level await with the CommonJS output path used at runtime.
- **Impact:** The worker command can now start in Docker and schedule the nightly deterministic run instead of crashing during TypeScript transform. Forecasting app build/test behavior, forecast formulas, OpenRouter behavior and persistence contracts are unchanged.
- **Files/documents involved:** `apps/forecasting-app/src/worker/nightlyDeterministicAiForecast.ts`, `DEVLOG.md`.
- **Validation:** Passed `npm.cmd run test:ai-forecast`, `npm.cmd run test:auth`, `npm.cmd run build`, `docker.exe compose build petyr-ai-forecast-worker`, and `docker.exe compose up -d --no-deps --force-recreate petyr-ai-forecast-worker`. Worker logs show the next deterministic run scheduled instead of the previous TypeScript transform crash.
- **Follow-up:** Keep Docker runtime checks in validation whenever worker entrypoints change.

- **Area:** Redash Ingestor / Local Docker / Access Layer
- **Change:** Updated root Docker Compose so `redash-ingestor` and `redash-worker` use `NODE_ENV: ${NODE_ENV:-production}` instead of forcing `production` unconditionally.
- **Reason:** The documented local `.env.example` uses `NODE_ENV=development` with `REDASH_INGESTOR_AUTH_MODE=disabled`, but the container previously forced production mode and Redash Ingestor correctly rejected disabled auth with a 500 during local validation.
- **Impact:** Local Docker can follow the documented development-auth-disabled setup, while production can still fail closed by setting `NODE_ENV=production` and `REDASH_INGESTOR_AUTH_MODE=access-layer`. No Redash source, sync logic, API contract or secret name changed.
- **Files/documents involved:** `docker-compose.yml`, `DEVLOG.md`.
- **Validation:** Passed `docker.exe compose config --services`, `docker.exe compose up -d --no-deps --force-recreate redash-ingestor redash-worker`, `curl http://localhost:8080/redash-ingestor` with HTTP 200 and `curl http://localhost:8080/redash-ingestor/api/health` with HTTP 200.
- **Follow-up:** Production deployments should explicitly set production auth variables instead of relying on the local `.env.example`.

- **Area:** Petyr / Access Layer / CSM filters
- **Change:** Added Access Layer display-name based preferred CSM resolution and used it as the initial non-binding CSM filter/default route context for Petyr forecasting workspaces and the admin Excel CSM filter when the display name uniquely matches a Company Ownership CSM after trim/case/space/accent normalization.
- **Reason:** Product requested CSM filters to take the logged-in Access Layer user when Petyr can associate that identity with the CSM names already present in PostgreSQL-backed Company Ownership data.
- **Impact:** Matching users land on their own CSM scope by default, while explicit query params and manual filter changes still win. No row-level authorization, permission, Prisma schema, Redash source, forecast save logic, import contract or email-based mapping changed.
- **Files/documents involved:** `apps/forecasting-app/src/lib/petyr/csmIdentity.ts`, `apps/forecasting-app/src/app/forecasting/page.tsx`, `apps/forecasting-app/src/app/forecasting/entry/page.tsx`, `apps/forecasting-app/src/app/api/petyr/forecast-entry/route.ts`, `apps/forecasting-app/src/app/forecasting/company/[companyName]/page.tsx`, `apps/forecasting-app/src/app/petyr-admin/page.tsx`, Petyr CSM filter components, `apps/forecasting-app/tests/petyrAuth.test.ts`, `apps/forecasting-app/tsconfig.auth-test.json`, `docs/05_forecasting_product_spec.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Validation:** Pending in this task handoff.
- **Follow-up:** If Company Ownership later exposes stable CSM emails, evaluate replacing display-name matching with a documented email-to-CSM mapping.

- **Area:** Petyr / AI Forecasting / Nightly deterministic worker
- **Change:** Added a dedicated `petyr-ai-forecast-worker` Docker Compose service and Forecasting app worker command that runs nightly at `01:00` in `Europe/Rome`, processes active Forecast Entry companies one at a time with a default 3000ms delay, computes deterministic preview rows and saves them to `ai_forecast_cache` with daily append-only model versions like `petyr_deterministic_preview_v1@YYYY-MM-DD`.
- **Reason:** Product requested deterministic preview to be generated nightly for all active Petyr companies and saved as AI Forecast, without OpenRouter involvement.
- **Impact:** AI Forecast cache gains deterministic nightly rows for future eligible months. The job does not call OpenRouter or Forecast Intelligence and does not write CSM forecasts, annual forecasts, management objectives, Initial Forecast snapshots, closed revenue, Redash snapshots or Redash materialized tables. The Redash post-sync AI hook remains disabled.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrNightlyDeterministicAiForecastService.ts`, `apps/forecasting-app/src/services/petyrAiForecastCompanyIntelligenceService.ts`, `apps/forecasting-app/src/worker/nightlyDeterministicAiForecast.ts`, `apps/forecasting-app/tests/aiForecastIntelligence.test.ts`, `apps/forecasting-app/package.json`, `apps/forecasting-app/package-lock.json`, `docker-compose.yml`, `.env.example`, `apps/forecasting-app/.env.example`, `apps/forecasting-app/README.md`, `docs/05_forecasting_product_spec.md`, `docs/petyr/AI_FORECASTING_DESIGN.md`, `docs/petyr/FORECAST_INTELLIGENCE_LAYER.md`, `docs/01_architecture.md`, `docs/08_operational_commands.md`, `BACKLOG.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Validation:** Local `npm.cmd run test:ai-forecast` initially could not run because `tsc` was unavailable without `node_modules`. The package lock was refreshed after adding the worker dependency; final validation is recorded in the task handoff.
- **Follow-up:** Keep LLM/OpenRouter batch automation deferred until privacy, rate-limit, cost and quality policies are accepted.

## 2026-06-19

- **Area:** Petyr / Forecast Intelligence / CSM workflow
- **Change:** Added a CSM-facing `Intelligence` section to Forecast Entry's Monthly forecast tab and Company Detail. The new reusable component calls a slim Server Action guarded by `petyr:forecast:write`, reuses the existing dry-run Forecast Intelligence/OpenRouter path, renders only validated consultative JSON and hides apply controls, OpenRouter I/O and raw prompt payloads. Company Detail remains read-only for forecast data and does not generate/apply numeric AI Forecast rows.
- **Reason:** Product requested on-demand company intelligence for CSMs based on Petyr data, prospects and opportunities, without changing forecast ownership or exposing admin diagnostics.
- **Impact:** Users with `petyr:forecast:write` can generate or reuse cached Forecast Intelligence from Forecast Entry and Company Detail. The action may write/reuse only the Forecast Intelligence sentinel cache row in `ai_forecast_cache`; it does not write CSM forecast rows, numeric AI Forecast rows, closed revenue, management objectives, Initial Forecast or annual forecast data.
- **Files/documents involved:** `apps/forecasting-app/src/app/forecasting/aiForecastActions.ts`, `apps/forecasting-app/src/components/petyr/PetyrCompanyIntelligenceSection.tsx`, `apps/forecasting-app/src/components/petyr/ForecastEntryWorkspace.tsx`, `apps/forecasting-app/src/app/forecasting/company/[companyName]/page.tsx`, `apps/forecasting-app/src/types/petyrAiForecastManualAction.ts`, `apps/forecasting-app/README.md`, `docs/05_forecasting_product_spec.md`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/petyr/FORECAST_INTELLIGENCE_LAYER.md`, `docs/petyr/03_petyr_business_rules.md`, `docs/petyr/AI_FORECASTING_DESIGN.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Validation:** Local `npm.cmd run test:ai-forecast`, `npm.cmd run test:auth` and `npm.cmd run build` could not run directly because `node_modules` is not installed (`tsc`/`next` unavailable). Passed Docker validation with `docker.exe compose build forecasting-app`; passed builder-image focused tests with `docker.exe run --rm petyr-forecasting-app-builder-test:latest npm run test:ai-forecast` (12/12) and `docker.exe run --rm petyr-forecasting-app-builder-test:latest npm run test:auth` (7/7).
- **Follow-up:** Consider a dedicated `petyr:intelligence:run` permission only if future product scope needs finer-grained access than `petyr:forecast:write`.

## 2026-06-19

- **Area:** Petyr / Access Control / UI visibility
- **Change:** Hid the floating Data diagnostics menu and operator links, Management View Top 4 positive/negative trend cards and Forecast Entry Support tools from non-admin users. Moved Management Objectives out of Forecast Entry Annual Forecast and into the bottom of Management View for users with `petyr:management:write`. Removed the hardcoded `Pippo` password gate from the Management Objectives UI and API while preserving the management permission requirement.
- **Reason:** Product clarified that technical diagnostic/support surfaces are admin-only and that Management Objectives now belong in Management, protected by the defined access levels rather than a shared temporary password.
- **Impact:** UI visibility and permission behavior changed only inside Petyr. No Prisma schema, Redash source, forecast calculation, annual forecast persistence, monthly save contract, AI forecast API contract or environment variable names changed. Forecast Entry Annual Forecast remains available as the CSM-owned annual forecast.
- **Files/documents involved:** `apps/forecasting-app/src/app/forecasting/page.tsx`, `apps/forecasting-app/src/app/forecasting/entry/page.tsx`, `apps/forecasting-app/src/app/forecasting/company/[companyName]/page.tsx`, `apps/forecasting-app/src/app/api/petyr/management-objectives/route.ts`, `apps/forecasting-app/src/components/petyr/PetyrMVPRendering.tsx`, `apps/forecasting-app/src/components/petyr/ForecastEntryWorkspace.tsx`, `apps/forecasting-app/src/components/petyr/ManagementObjectivesWorkspace.tsx`, `apps/forecasting-app/src/lib/petyr/managementObjectivesAccess.ts`, `apps/forecasting-app/README.md`, `docs/05_forecasting_product_spec.md`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/petyr/03_petyr_business_rules.md`, `BACKLOG.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Validation:** Local `npm.cmd run test:auth` could not complete because `tsc` is unavailable without `node_modules`. Local `npm.cmd run build` could not complete because `next` is unavailable without `node_modules`. Docker fallback could not run in this environment: sandboxed Docker access was denied, and the required escalated Docker build was rejected by the approval/credits guard.
- **Follow-up:** Confirm Access Layer memberships assign `petyr:admin` and `petyr:management:write` to the intended users before production rollout.

## 2026-06-19

- **Area:** Access Control / Redash Ingestor
- **Change:** Prepared `apps/redash-ingestor` as a separate Access Layer-protected operator tool with local development bypass, signed local sessions, login/callback/logout routes, route-level read/sync/source-write/admin permission checks and focused auth tests. Added non-secret root Access Layer tool descriptors for `petyr` and `redash-ingestor`, and mapped root Compose env vars so each service gets its own Access Layer client/callback values.
- **Reason:** `/redash-ingestor` bypasses Petyr and therefore must be protected inside Redash Ingestor while preserving the data flow from Redash to PostgreSQL to Petyr.
- **Impact:** Local development remains usable without login when auth mode is disabled. Production/access-layer mode fails closed when required config is missing. Redash Ingestor read surfaces, manual sync and source writes now have explicit user-facing Access Layer gates; source writes still also require `APP_INTERNAL_SECRET`.
- **Files/documents involved:** `apps/redash-ingestor/src/lib/authCore.ts`, `apps/redash-ingestor/src/lib/auth.ts`, `apps/redash-ingestor/src/app/auth/*`, `apps/redash-ingestor/src/app/api/*`, `apps/redash-ingestor/src/app/page.tsx`, `apps/redash-ingestor/src/app/components/ManualSyncPanel.tsx`, `apps/redash-ingestor/tests/redashIngestorAuth.test.ts`, `docker-compose.yml`, `.env.example`, `apps/redash-ingestor/.env.example`, `apps/redash-ingestor/README.md`, `DEPLOY.md`, `docs/access-control/TOOL_INTEGRATION_GUIDE.md`, `docs/access-control/BACKLOG.md`, `DECISIONS.md`, `petyr/access-layer-tools/*`, `DEVLOG.md`.
- **Validation:** Passed `docker.exe build --target builder -t redash-ingestor-auth-test .` for `apps/redash-ingestor`; passed `docker.exe run --rm redash-ingestor-auth-test npm run test:auth` (7/7 tests); passed `docker.exe compose build redash-ingestor`; passed `docker.exe compose build forecasting-app`. The first Redash Ingestor Docker build had one transient npm `ECONNRESET` and succeeded on retry. Docker emitted existing warnings about secret-like Dockerfile `ENV` names for `REDASH_API_KEY` and `APP_INTERNAL_SECRET`.
- **Follow-up:** Register both tools in the external Access Layer, configure Coolify secrets and verify server networking prevents direct public access to backend app/database ports.

## 2026-06-19

- **Area:** Petyr / Access Control / Authentication
- **Change:** Added Petyr-only Access Layer client preparation: auth configuration, `/auth/login`, `/auth/callback`, `/auth/logout`, signed local Petyr session handling, deterministic local development identity, permission helpers and route/API guards for read, forecast write, management write and admin surfaces. Preserved existing `APP_INTERNAL_SECRET` requirements for protected recovery/internal operations.
- **Reason:** Petyr must be ready to integrate with the externally hosted Access Layer Google SSO service without deploying or modifying the Access Layer package, while keeping local development usable without login.
- **Impact:** Local `NODE_ENV=development` defaults to `PETYR_AUTH_MODE=disabled`, so developers can continue using Petyr without authentication. Production/access-layer mode fails closed when required Access Layer or session settings are missing. The direct `/redash-ingestor` gateway path remains a follow-up because it bypasses Petyr.
- **Files/documents involved:** `apps/forecasting-app/src/lib/petyr/authCore.ts`, `apps/forecasting-app/src/lib/petyr/auth.ts`, `apps/forecasting-app/src/app/auth/*`, Petyr page/API route guards, `apps/forecasting-app/tests/petyrAuth.test.ts`, `apps/forecasting-app/README.md`, `.env.example`, `apps/forecasting-app/.env.example`, `DEPLOY.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Validation:** Passed `docker.exe compose build forecasting-app`; the build generated Prisma Client and completed Next.js compile, type checking and static page generation. Passed focused auth validation with `docker.exe build --target builder -t petyr-forecasting-app-auth-test .` and `docker.exe run --rm petyr-forecasting-app-auth-test npm run test:auth` (7/7 tests). Direct local `npm run test:auth` could not run because `node_modules` is not installed in this checkout and PowerShell blocks `npm.ps1`; validation used Docker instead.

## 2026-06-17

- **Area:** Platform gateway / Next.js Server Actions forwarding
- **Change:** Updated the local `platform-home` Nginx gateway so every proxied Petyr and Redash Ingestor route that previously forwarded `Host` from `$host` now forwards both `Host` and `X-Forwarded-Host` from `$http_host`, preserving the original host and port from `localhost:8080`. Added a defensive Next.js Server Actions allowed-origin configuration for `localhost:8080`, `127.0.0.1:8080` and `unguess-internal.net`.
- **Reason:** Next.js Server Actions reject forwarded requests when `Origin` includes `localhost:8080` but the proxy forwards `x-forwarded-host`/host as `localhost` without the port. This broke the Petyr deterministic AI forecast preview through the unified local gateway.
- **Impact:** Server Actions should receive matching host/origin values through the unified gateway. Existing reverse-proxy headers for real IP, forwarded-for, forwarded-proto, upgrade and connection were preserved. No product logic, AI forecast logic, Prisma schema, database model, Redash source or ingestion behavior changed.
- **Files/documents involved:** `platform-home/nginx.conf`, `apps/forecasting-app/next.config.ts`, `DEVLOG.md`.
- **Validation:** Passed `docker.exe compose config --services`, `docker.exe compose build platform-home`, `docker.exe run --rm unguess-data-platform-platform-home nginx -t`, and `docker.exe compose build forecasting-app`; the Forecasting build recognized the Next.js `serverActions` experiment and completed compile, type checking and static page generation. Recreated `forecasting-app` and `platform-home` with `docker.exe compose up -d --no-deps --force-recreate forecasting-app platform-home`. Verified through `localhost:8080`: `/forecasting` 200, `/petyr-admin` 200, `/api/petyr/admin/data-health` 200, `/redash-ingestor` 200, `/redash-ingestor/` 308 redirect, and a live `/_next/static/css/b848ed302d19bea2.css` asset 200. Browser-click proof for the deterministic preview button could not be completed after the environment rejected further Docker log/browser validation commands due the approval usage limit.
- **Follow-up:** None expected unless local Docker is unavailable for end-to-end route and button verification.

## 2026-06-17

- **Area:** Petyr / Forecast Entry AI preview and Admin backtest
- **Change:** Added visible running and failure feedback to the Forecast Entry AI preview action area, including request context for company, year and deterministic or LLM mode. Refactored the AI preview backtest into a reusable read-only server service, kept the CLI as a wrapper, added a protected Petyr Admin API endpoint and added a Petyr Admin dashboard card that runs the default top-10 May/June 2026 backtest from the browser.
- **Reason:** Product reported that pressing Generate deterministic preview appeared to do nothing and requested an admin card/button to run the existing top-revenue backtest without shelling out to npm.
- **Impact:** Forecast Entry now opens a visible execution state immediately and surfaces client-side Server Action failures instead of silently returning to idle. Petyr Admin can run the read-only calibration workflow through POST /api/petyr/admin/ai-preview-backtest with x-app-secret matching APP_INTERNAL_SECRET. The gateway remains documented on localhost:8080; localhost:80880 is not treated as supported routing. No OpenRouter call, forecast formula change, Prisma schema change, Redash source change, forecast persistence write, AI cache write, materialized table write, audit write or permission model change.
- **Files/documents involved:** apps/forecasting-app/src/components/petyr/PetyrAiForecastCompanyAction.tsx, apps/forecasting-app/src/components/petyr/PetyrAiPreviewBacktestControl.tsx, apps/forecasting-app/src/app/api/petyr/admin/ai-preview-backtest/route.ts, apps/forecasting-app/src/app/petyr-admin/page.tsx, apps/forecasting-app/src/services/petyrAiPreviewBacktestService.ts, apps/forecasting-app/scripts/backtest-ai-preview.ts, apps/forecasting-app/tsconfig.ai-preview-backtest.json, apps/forecasting-app/README.md, docs/05_forecasting_product_spec.md, DEVLOG.md.
- **Validation:** Passed Docker-mounted `npx tsc -p tsconfig.ai-preview-backtest.json` and the requested read-only backtest command for `--as-of=2026-03-15 --year=2026 --months=5,6 --top-revenue --limit=10`; it selected the top 10 companies and produced per-row plus aggregate comparison tables. Passed `npm run test:ai-forecast`: 12/12 tests passed. Verified `http://localhost:8080/petyr-admin` and `http://localhost:8080/forecasting/entry` return HTTP 200 through the local gateway; `80880` is not a valid TCP port. Docker-mounted `npm run build` passed Next.js compile and type checking, then failed during static prerender on the pre-existing Next.js `/404`/`/_error` issue: `<Html> should not be imported outside of pages/_document`.
- **Follow-up:** Define accepted forecast accuracy thresholds before treating the backtest as a production pass/fail gate.


## 2026-06-16

- **Area:** Platform gateway / Petyr AI Forecast deterministic preview
- **Change:** Standardized the local unified gateway on port 8080 by changing Docker Compose to publish `platform-home` as `8080:8080` and updating current operational docs from `localhost:8090` to `localhost:8080`. Kept `forecasting-app`, `redash-ingestor` and `redash-worker` as separate services behind the gateway. Preserved the resilient Petyr model-setting fallback so deterministic AI Forecast preview can still run local math when `app_setting` is unavailable.
- **Reason:** Product requested rethinking the previous gateway-port alignment after the three surfaces were unified and explicitly chose port 8080 for Docker/local uniformity. Product also reported deterministic Forecasting preview failures after the unification work.
- **Impact:** Local users should use `http://localhost:8080/forecasting`, `http://localhost:8080/petyr-admin` and `http://localhost:8080/redash-ingestor`. Existing `localhost:8090` bookmarks or running containers must be replaced. No Prisma schema, Redash source, forecast formula, CSM forecast write behavior, AI cache apply contract or secrets changed.
- **Files/documents involved:** `docker-compose.yml`, `platform-home/nginx.conf`, `README.md`, `README_INSTALL_DOCKER.md`, `DEPLOY.md`, `docs/01_architecture.md`, `docs/08_operational_commands.md`, `apps/forecasting-app/README.md`, `apps/redash-ingestor/README.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Validation:** Passed `docker.exe compose config --services` and a rendered Compose port check showing `platform-home` publishes target `8080` as `8080`. Passed `docker.exe compose build platform-home` and `docker.exe compose build forecasting-app`. Passed `docker.exe run --rm unguess-data-platform-platform-home nginx -t`. Recreated only `platform-home` with `docker.exe compose up -d --no-deps --force-recreate platform-home`; `docker.exe compose ps` now shows `0.0.0.0:8080->8080/tcp`. Verified HTTP `200` for `http://localhost:8080/forecasting`, `http://localhost:8080/petyr-admin` and `http://localhost:8080/redash-ingestor`. Verified `/redash-ingestor/` now redirects once to `/redash-ingestor` instead of looping. Passed `npm run test:ai-forecast` in Docker: 12/12 tests passed.
- **Follow-up:** None for this local workspace; the gateway container was already recreated on port 8080. Other environments should recreate `platform-home` after pulling these changes so Docker releases any old 8090 binding and publishes 8080.

- **Area:** Petyr / AI preview backtest
- **Change:** Added a read-only `npm run backtest:ai-preview` calibration command for Petyr Forecasting. The command selects top-revenue companies through a supplied as-of date, runs the existing deterministic AI preview strategy with that as-of date, filters requested target months and compares predicted values with closed revenue currently available in PostgreSQL.
- **Reason:** Product requested a way to test the AI preview as if the system were on 2026-03-15 and compare May/June 2026 forecast candidates with real closed revenue.
- **Impact:** Operational validation tooling and documentation only. No OpenRouter call, Prisma schema change, forecast formula change, CSM forecast write, AI cache write, Redash source change, materialized table update, audit log write, permission change or secret handling change.
- **Files/documents involved:** apps/forecasting-app/scripts/backtest-ai-preview.ts, apps/forecasting-app/scripts/run-compiled-backtest-ai-preview.cjs, apps/forecasting-app/tsconfig.ai-preview-backtest.json, apps/forecasting-app/package.json, apps/forecasting-app/README.md, docs/05_forecasting_product_spec.md, DEVLOG.md.
- **Validation:** Passed targeted `npx tsc -p tsconfig.ai-preview-backtest.json` and `node scripts/run-compiled-backtest-ai-preview.cjs --help` in the Forecasting Docker image with updated source mounted. Passed the requested read-only backtest against Compose PostgreSQL for `--as-of=2026-03-15 --year=2026 --months=5,6 --top-revenue --limit=10`; it selected the top 10 companies and produced per-row and aggregate comparison tables without writes. Passed `npm run test:ai-forecast`: 12/12 tests passed. Fallback mounted-source `npm run build` compiled and type-checked, then failed during static page generation on an existing Next.js `/500` prerender issue: `<Html> should not be imported outside of pages/_document`.
- **Follow-up:** Use the output for calibration review only until Management/Finance define accepted error thresholds and baseline weights.

## 2026-06-16

- **Area:** Petyr / Redash performance instrumentation
- **Change:** Added lightweight, environment-gated server-side performance instrumentation for Petyr read services and Redash Ingestor sync/materialization paths. Petyr Admin now includes a dedicated admin-only Performance test results area showing instrumentation coverage and whether PETYR_PERF_LOGS is enabled; detailed timings and row counts remain in server logs only. Added the missing @aws-sdk/client-s3 package required by the existing ExcelJS/unzipper dependency stack so the Forecasting production bundle resolves after the prior unzipper override.
- **Reason:** Product requested measurable visibility into the performance risks from the Petyr audit without changing forecast formulas, Redash ingestion semantics or customer data handling.
- **Impact:** Diagnostics/logging and admin status UI only. No Prisma schema, forecast formula, Excel import/export data logic, Redash source, customer payload, API key handling, sync source selection or Petyr product/data logic changed. The dependency addition only satisfies an existing Excel bundle import; workbook import/export logic is unchanged. Verbose logs are disabled by default unless PETYR_PERF_LOGS=true.
- **Files/documents involved:** apps/forecasting-app/src/lib/petyr/performance.ts, apps/forecasting-app/src/services/petyrDataService.ts, apps/forecasting-app/src/services/petyrApprovedRenderingAdapter.ts, apps/forecasting-app/src/app/petyr-admin/page.tsx, apps/forecasting-app/.env.example, apps/forecasting-app/package.json, apps/forecasting-app/package-lock.json, apps/redash-ingestor/src/lib/performance.ts, apps/redash-ingestor/src/services/syncService.ts, apps/redash-ingestor/src/services/redashRawMaterializer.ts, apps/redash-ingestor/.env.example, .env.example, DEVLOG.md.
- **Validation:** Passed docker.exe compose build forecasting-app redash-ingestor. Redash Ingestor completed Prisma generate, Next.js compile/type checking and static generation. Forecasting completed Prisma generate, Next.js compile/type checking, static generation and image export after adding @aws-sdk/client-s3 for the existing ExcelJS/unzipper bundle import.
- **Follow-up:** Use PETYR_PERF_LOGS=true only for focused diagnostics sessions and compare logged duration/row-count output against the performance audit risks.

## 2026-06-16

- **Area:** Petyr / Forecast Entry AI Forecast preview and gateway port audit
- **Change:** Made the Petyr OpenRouter model-setting read resilient for manual AI Forecast runs. If `app_setting` is missing or temporarily unreadable, Forecast Entry now uses the documented `OPENROUTER_DEFAULT_MODEL` fallback and surfaces a diagnostic instead of blocking `Generate deterministic preview` before local forecast math can run. Audited user-facing localhost port references and confirmed the only remaining `8080` reference is the internal Docker gateway mapping `8090:8080`; user-facing docs and routes remain on `http://localhost:8090` or relative paths.
- **Reason:** Product reported that deterministic AI Forecast preview no longer generated and clarified that local unified access must not send users to the old port 8080. Deterministic preview must stay independent from OpenRouter and from non-critical model-setting table availability.
- **Impact:** Deterministic dry-run preview can proceed with local forecast math when the model setting table is unavailable, while still reporting the fallback diagnostic. No Prisma schema, Redash source, forecast formula, API secret, CSM forecast save behavior, AI cache apply contract or gateway host port changed.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrAiModelSettingsService.ts`, `apps/forecasting-app/src/services/petyrAiForecastCompanyIntelligenceService.ts`, `apps/forecasting-app/tests/aiForecastIntelligence.test.ts`, `apps/forecasting-app/tsconfig.ai-forecast-test.json`, `DEVLOG.md`.
- **Validation:** Passed `docker.exe compose config` and `docker.exe compose config --services`. Full `docker.exe compose build forecasting-app` was started but interrupted after the dependency install layer stayed silent for several minutes; no application error was produced before interruption. Passed fallback `npm run build` inside the existing `unguess-data-platform-forecasting-app` image with the changed source files mounted, including Next.js compile, type checking, static page generation and route output. Passed `npm run test:ai-forecast` in the same image with changed files mounted: 12/12 tests passed, including model-setting fallback coverage.
- **Follow-up:** None.


- **Area:** Petyr / Forecasting App dependency hygiene
- **Change:** Added `apps/forecasting-app/package-lock.json` and narrowly scoped npm `overrides` for the ExcelJS dependency stack so Docker installs resolve maintained transitive packages instead of the deprecated packages reported in the build log: `rimraf@2.7.1`, `fstream@1.0.12`, `inflight@1.0.6`, `lodash.isequal@4.5.0`, `glob@7.2.3` and `uuid@8.3.2`. The resolved tree keeps `exceljs@4.4.0` as the workbook API while overriding its transitive `archiver`, `fast-csv`, `unzipper` and `uuid` ranges, plus legacy `archiver-utils`/`fstream` nested ranges.
- **Reason:** The Docker build completed, but npm emitted deprecation warnings from the Excel workbook dependency stack. Product requested applying safe fixes that remove the warnings without causing workbook regressions.
- **Impact:** Dependency resolution and Docker install reproducibility only. No Petyr UI behavior, Excel workbook format, import/export route contract, forecast calculation, Prisma schema, Redash source, API behavior, permissions, secrets or deployment environment variable changed.
- **Files/documents involved:** `apps/forecasting-app/package.json`, `apps/forecasting-app/package-lock.json`, `BACKLOG.md`, `DEVLOG.md`.
- **Validation:** Passed `npm ci --ignore-scripts --no-audit --no-fund` in a temporary Node 20 container copy of `apps/forecasting-app`. `npm ls rimraf fstream inflight lodash.isequal glob uuid --all` then showed only `uuid@11.1.1` under `exceljs`; the deprecated packages from the reported warning list were absent. A final `docker.exe compose build forecasting-app` could not be rerun in the previous task because the approval reviewer hit a usage limit.
- **Follow-up:** Run `docker.exe compose build forecasting-app` when approvals are available to confirm the full Docker build still passes with the committed lockfile and overrides.

## 2026-06-16

- **Area:** Access Control / Petyr online exposure audit
- **Change:** Audited the current unified Petyr gateway, Petyr admin routes, Redash Ingestor routes and access-control documentation before exposing the platform to colleagues on an online server. Added access-control backlog blockers for temporary server-level protection, route permission mapping, Redash Ingestor operator/sync protection and direct backend port exposure.
- **Reason:** The platform currently provides unified local routing, but OAuth2 Proxy/Auth API integration is not implemented and the current routes must not be exposed publicly without protection.
- **Impact:** Documentation/backlog only. No authentication, authorization, gateway behavior, app code, Prisma schema, Redash source, API implementation or environment variable value changed.
- **Files/documents involved:** docs/access-control/BACKLOG.md, DEVLOG.md.
- **Validation:** Documentation and route inspection only; no build required because no application code changed.
- **Follow-up:** Define the temporary online-server protection and Petyr route permission matrix before opening the unified host to colleagues.

## 2026-06-16

- **Area:** Petyr / Forecasting diagnostics navigation
- **Change:** Updated the floating Data diagnostics menu so its footer shows explicit actions for Open Petyr Admin, Open Data Health and Open Redash Ingestor. The Petyr Admin and Data Health actions continue to route to /petyr-admin, and the Redash Ingestor action routes to /redash-ingestor through the unified platform gateway.
- **Reason:** Users need the bottom-right diagnostics menu to clearly expose Petyr Admin as an understandable action while preserving direct operator access to the routed Redash Ingestor dashboard.
- **Impact:** UI/navigation copy only. Existing diagnostics counts, blocking/warning/info sections, diagnostic generation, product/data logic, permissions, Redash API boundaries and PostgreSQL-backed data flow did not change.
- **Files/documents involved:** apps/forecasting-app/src/components/petyr/PetyrFloatingDiagnosticsMenu.tsx, DEVLOG.md.
- **Validation:** Direct host npm run build could not start because npm is not installed in this shell. docker.exe compose build --no-cache forecasting-app passed, including dependency install, Prisma generate, Dockerfile npm run build, Next.js compile, type checking, static page generation and image export.
- **Follow-up:** None.

## 2026-06-16

- **Area:** Petyr / Admin UI
- **Change:** Added a dedicated Redash Ingestor section to /petyr-admin with a prominent link to the routed dashboard path /redash-ingestor. The existing Data Health, OpenRouter model settings, Excel forecast import/export and 2026 closed revenue alignment sections remain in place.
- **Reason:** Operators need a clear entry point from Petyr Admin to the separate Redash Ingestor dashboard without duplicating Redash Ingestor UI code or making Forecasting call Redash directly.
- **Impact:** UI/navigation only. No Redash API call, Prisma schema, data model, Redash source, secret handling, import/export behavior, forecast calculation or backfill behavior changed.
- **Files/documents involved:** apps/forecasting-app/src/app/petyr-admin/page.tsx, DEVLOG.md.
- **Validation:** Host npm run build could not start because npm is not installed in this shell, and Windows npm is also unavailable. docker.exe compose build forecasting-app passed, including the Dockerfile RUN npm run build step, Next.js compile, type checking, static page generation and image export. A follow-up docker.exe compose run --rm --no-deps forecasting-app npm run build could not be executed because the approval review timed out twice.
- **Follow-up:** None.

## 2026-06-15

- **Area:** Platform / Gateway routing
- **Change:** Adapted `platform-home` into the local gateway/reverse proxy. The gateway redirects `/` to `/forecasting`, routes `/forecasting`, `/petyr-admin`, `/api/petyr/*` and Petyr `/_next/*` assets to `forecasting-app`, and routes `/redash-ingestor` plus `/redash-ingestor/api/*` to `redash-ingestor`. Added a non-secret Redash Ingestor base-path build/runtime setting and a Petyr Admin link to the Redash Ingestor dashboard.
- **Reason:** Product requested one user-facing host for Petyr unified access while keeping `forecasting-app`, `redash-ingestor` and `redash-worker` as separate services.
- **Impact:** Local users can access Petyr Forecasting, Petyr Admin and Redash Ingestor through `http://localhost:8090`. Forecasting still reads PostgreSQL-backed data and does not call Redash directly. Direct app ports remain available for local debugging. No Prisma schema, Redash source, secret handling or data-flow ownership changed.
- **Files/documents involved:** `docker-compose.yml`, `.env.example`, `platform-home/nginx.conf`, `platform-home/index.html`, `apps/redash-ingestor/Dockerfile`, `apps/redash-ingestor/next.config.ts`, `apps/redash-ingestor/src/lib/basePath.ts`, `apps/redash-ingestor/src/app/page.tsx`, `apps/redash-ingestor/src/app/components/ManualSyncPanel.tsx`, `apps/redash-ingestor/.env.example`, `apps/redash-ingestor/README.md`, `apps/forecasting-app/src/app/petyr-admin/page.tsx`, `apps/forecasting-app/README.md`, `README.md`, `README_INSTALL_DOCKER.md`, `DEPLOY.md`, `docs/01_architecture.md`, `docs/05_forecasting_product_spec.md`, `docs/08_operational_commands.md`, `DECISIONS.md`, `BACKLOG.md`, `DEVLOG.md`.
- **Validation:** Passed `docker compose config` and `docker compose config --services`. Passed `docker.exe compose build platform-home redash-ingestor forecasting-app` and a follow-up `docker.exe compose build platform-home` after the Nginx DNS-resolution hardening. Passed `docker.exe run --rm unguess-data-platform-platform-home nginx -t`. Linux `docker compose build ...` could not reach `/var/run/docker.sock`, so Docker Desktop was used through `docker.exe`.
- **Follow-up:** Choose the production hostname and access-control proxy stack before deploying this routing model outside local Docker.

## 2026-06-15

- **Area:** Platform / Petyr unified access architecture
- **Change:** Documented the accepted Petyr unified access architecture: one gateway/reverse proxy exposes Petyr Forecasting, Petyr Admin and the internal Redash Ingestor operator surface under one host while preserving separate `forecasting-app` and `redash-ingestor` services.
- **Reason:** Product accepted that Petyr should feel like one user-facing application without merging service code, Prisma schemas or Redash ingestion responsibilities.
- **Impact:** Documentation only. No application code, Docker configuration, Prisma schema, Redash source, API implementation, secrets or ports changed. Forecasting remains prohibited from calling Redash directly; Petyr Admin remains the bridge from Forecasting diagnostics to operator-level Redash Ingestor troubleshooting.
- **Files/documents involved:** `docs/01_architecture.md`, `DECISIONS.md`, `BACKLOG.md`, `DEVLOG.md`.
- **Validation:** Documentation inspection only; no build required.
- **Follow-up:** Implement the gateway/reverse proxy routing in a later code/config task, including the Petyr Admin link to the Redash Ingestor dashboard.

## 2026-06-15

- **Area:** Redash Ingestor / Worker scheduling
- **Change:** Changed the default Redash worker daily sync time from `07:00` to `01:30` with timezone `Europe/Rome`, including Docker Compose defaults, environment examples and ingestor configuration fallback.
- **Reason:** Product requested that the Redash ingestor sync all enabled Redash tables every night at 1:30 AM.
- **Impact:** The `redash-worker` container now schedules the daily automatic full enabled-source sync at 01:30 Europe/Rome unless `SYNC_DAILY_TIME` is explicitly overridden in `.env`. Manual sync endpoints, Redash sources, PostgreSQL schema, materialization logic, Petyr AI automation and secrets did not change.
- **Files/documents involved:** `.env.example`, `docker-compose.yml`, `apps/redash-ingestor/.env.example`, `apps/redash-ingestor/src/lib/config.ts`, `apps/redash-ingestor/README.md`, `docs/01_architecture.md`, `DEVLOG.md`.
- **Validation:** Pending in this task handoff.
- **Follow-up:** Update any deployed `.env` file that already sets `SYNC_DAILY_TIME=07:00`, because explicit environment values override the new default.

## 2026-06-15

- **Area:** Petyr / Admin UI
- **Change:** Reordered `/petyr-admin` so Data Health and OpenRouter model settings appear first, then Excel forecast import/export and 2026 closed revenue alignment. Removed the visible Initial Forecast baseline, legacy CSV forecast import/export and Redash field mapping diagnostics sections from the admin page.
- **Reason:** Product requested a tighter Petyr Admin section focused on health, model settings and current operational workflows.
- **Impact:** UI composition and documentation only. Existing backend endpoints/services for Initial Forecast, CSV compatibility and mapping diagnostics were not deleted. No Prisma schema, Redash source, forecast calculation, import/export server logic, API contract or permissions changed.
- **Files/documents involved:** `apps/forecasting-app/src/app/petyr-admin/page.tsx`, `apps/forecasting-app/README.md`, `docs/05_forecasting_product_spec.md`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `DEVLOG.md`.
- **Validation:** Pending in this task handoff.
- **Follow-up:** Decide separately whether the hidden legacy/admin endpoints should be removed or kept for controlled operator recovery.

## 2026-06-15

- **Area:** Petyr / Forecast Entry Annual Forecast UI
- **Change:** Moved Annual Forecast data diagnostics out of the Annual Forecast card body and into the shared floating `Data diagnostics` menu. Aligned the Annual Forecast year filter sizing and loading disabled state with the existing Forecast Entry filter pattern.
- **Reason:** Product requested Annual Forecast warnings to appear only in the floating Data Diagnostic control and requested filter-section alignment with the Monthly Forecast area.
- **Impact:** UI presentation only. Annual forecast loading, save draft, consolidation, monthly Forecast Entry save behavior, APIs, Prisma schema, Redash sources, forecast calculations and permissions did not change.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/ForecastEntryWorkspace.tsx`, `DEVLOG.md`.
- **Validation:** Passed `docker.exe compose build forecasting-app`, including Prisma generate, Next.js production compile, type checking, static page generation and image export. Direct Linux `npm run build` could not start because `npm` is not installed in this shell.
- **Follow-up:** None.

## 2026-06-15

- **Area:** Petyr / Forecast Intelligence v3
- **Change:** Versioned Forecast Intelligence prompt and output schema to v3, removed `data_quality_notes` and `questions_for_csm` from the OpenRouter contract and UI, tightened the prompt toward non-obvious guidance on timing, agreement consumption, residual pressure, opportunities and watchouts, and added validated `forecast_adjustment_candidates` that can only select existing local consultative scenarios. The Charts tab now compares deterministic forecast values with any AI-selected candidate scenario at monthly and Business Unit aggregate level.
- **Reason:** Product requested OpenRouter output that helps CSMs notice risks or opportunities they may miss rather than summarizing obvious data, data quality or follow-up questions, while evaluating numeric AI retouches only as a comparison before confirming the behavior.
- **Impact:** Forecast Intelligence cache version changes and v2 cached outputs are bypassed. Official numeric forecast values remain deterministic/local; AI adjustment candidates are chart-only comparison data and are not saved as authoritative forecast overrides. No Prisma schema, Redash source, CSM forecast save behavior or permissions changed.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrForecastIntelligenceService.ts`, `apps/forecasting-app/src/types/petyrAiForecastManualAction.ts`, `apps/forecasting-app/src/components/petyr/PetyrAiForecastCompanyAction.tsx`, `apps/forecasting-app/src/components/petyr/ForecastEntryFaq.tsx`, `apps/forecasting-app/src/services/petyrAiForecastLlmContractSmoke.ts`, `apps/forecasting-app/tests/aiForecastIntelligence.test.ts`, `docs/05_forecasting_product_spec.md`, `docs/petyr/AI_FORECASTING_DESIGN.md`, `docs/petyr/FORECAST_INTELLIGENCE_LAYER.md`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Validation:** Passed `docker.exe compose build forecasting-app`, including Prisma generate, Next.js production compile, type checking, static page generation and image export. Passed `docker.exe compose run --rm --no-deps` with Windows-path mounts for `tests` and `tsconfig.ai-forecast-test.json`, running `npm run test:ai-forecast`: 10/10 tests passed. Direct Linux `npm` is not installed in this shell.
- **Follow-up:** Review real OpenRouter v3 outputs in Charts before deciding whether AI-selected candidates should ever become confirmed forecast values.

## 2026-06-15

- **Area:** Petyr / CSM Overview relevant insights
- **Change:** Removed the month/year badge from affected-company rows in CSM Overview Relevant insights so rows no longer show low-value labels such as `June 2026`.
- **Reason:** Product requested removing the visible month label because it did not add useful context in affected-company rows.
- **Impact:** UI presentation only. Relevant insight grouping, alert logic, PostgreSQL read models, forecast calculations, API contracts, Prisma schema, Redash sources, save behavior and permissions did not change.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrApprovedRenderingAdapter.ts`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `DEVLOG.md`.
- **Validation:** Direct Linux `npm run build` could not start because `npm` is not installed in this shell. `docker.exe compose build forecasting-app` generated the Prisma client and compiled Next.js successfully, then failed during type checking on an existing Forecast Intelligence type mismatch in `apps/forecasting-app/src/app/forecasting/aiForecastActions.ts` where `PetyrForecastIntelligenceOutput` is missing `data_quality_notes` and `questions_for_csm` for `PetyrAiForecastIntelligenceActionResult`.
- **Follow-up:** None.

## 2026-06-15

- **Area:** Petyr / Forecast Entry UI
- **Change:** Removed the duplicate body-level `Forecast Entry` title and description below the workspace section navigation, removed the CSM name helper from previous/next company navigation, removed the `ordering: forecast urgency` label from the company selector, and made the Forecast Entry CSM/company navigator sticky while scrolling through the editor.
- **Reason:** Product requested a cleaner Forecast Entry header area and persistent access to the selected CSM/company filters during long-page scrolling.
- **Impact:** UI behavior and copy only. Forecast Entry remains the only monthly editing area; no data service, forecast calculation, API contract, Prisma schema, Redash source, save behavior, AI generation/apply behavior or permissions changed.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/ForecastEntryWorkspace.tsx`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `DEVLOG.md`.
- **Validation:** Passed `docker.exe compose build forecasting-app`, including `npx prisma generate`, Next.js production compile, type checking, static page generation and image export. Direct Linux `npm run build` was not available because `npm` is not installed in this shell.
- **Follow-up:** None.

## 2026-06-15

- **Area:** Petyr / Management View UI
- **Change:** Cleaned up Management View copy by removing the aggregate selector evaluation note, monthly/yearly option descriptions, duplicate Business Unit and Single CSM section labels, and low-value badges. Removed the duplicate Branch code in Monthly Aggregate branch rows. Updated Revenue per Business Unit so each Business Unit separates the upper chart area from lower numeric values, uses the Current year trend Closed revenue color for closed-revenue bars, shows Initial Forecast as a gray marker and colors Previous-month forecast markers green/yellow based on comparison with Initial Forecast.
- **Reason:** Product requested a lighter, less repetitive Management view and a clearer Business Unit revenue chart layout.
- **Impact:** UI/read-model presentation only. Existing PostgreSQL-backed Management data, forecast calculations, Redash sources, Prisma schema, API routes, save behavior and permissions did not change. The approved rendering adapter now passes Initial Forecast and Previous-month Forecast separately for the Revenue per Business Unit chart.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/PetyrMVPRendering.tsx`, `apps/forecasting-app/src/services/petyrApprovedRenderingAdapter.ts`, `apps/forecasting-app/src/types/petyrApprovedRendering.ts`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `DEVLOG.md`.
- **Validation:** Passed `docker.exe compose build forecasting-app`, including `npx prisma generate`, Next.js production compile, type checking, static page generation and image export. Direct `npm run build` was not available because `npm` is not installed in this shell.
- **Follow-up:** None.

## 2026-06-15

- **Area:** Petyr / Company Detail UI and read model
- **Change:** Updated Company Detail navigation so year/load sits to the left of previous/next company navigation, removed the ordering badge next to Company, removed the CSM helper from previous/next, and made the header status badge explicit as Forecast status. Replaced the primary CSM KPI card with selected-year total Initial Forecast, added Initial Forecast to the Company Detail Business Unit summary read model, changed Revenue per Business Unit to orange closed-revenue bars, gray Initial Forecast bars and green/yellow previous-month forecast markers, renamed Company alert actions to Relevant company insights and hid zero-count categories, and moved Change history directly below Agreements and residual evidence with only the latest two sessions visible by default plus expandable older history.
- **Reason:** Product requested a clearer Company Detail analytical layout focused on forecast baselines and active insights rather than repeated CSM/context labels.
- **Impact:** UI/read-model behavior changed only for Company Detail. Initial Forecast is read from existing `forecast_annual_snapshot` rows through the existing Initial Forecast reader; no Prisma schema, migration, API route, Redash source, forecast save behavior, AI generation/apply behavior or persistence target changed.
- **Files/documents involved:** `apps/forecasting-app/src/app/forecasting/company/[companyName]/page.tsx`, `apps/forecasting-app/src/app/forecasting/company/[companyName]/CompanyDetailCharts.tsx`, `apps/forecasting-app/src/components/petyr/CompanyDetailNavigator.tsx`, `apps/forecasting-app/src/services/petyrDataService.ts`, `docs/05_forecasting_product_spec.md`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `STATUS_UI_ALIGNMENT_AND_AI_FORECAST.md`, `DEVLOG.md`.
- **Validation:** Direct Linux `npm run build` was unavailable because `npm` is not installed and no local `node_modules` exists. `docker.exe compose build forecasting-app` passed, including `npx prisma generate`, Next.js production compile, type checking, static page generation and image export.
- **Follow-up:** None.

## 2026-06-15

- **Area:** Petyr / CSM Overview relevant insights
- **Change:** Renamed the CSM Overview `Urgent actions` section to `Relevant insights`, removed inactive-company and locked-past-month categories from the CSM-facing insight/alert surfaces, moved the repeated Client View read-only/Forecast Entry edit copy into the Client View description, and aligned agreement evidence chips in relevant insight cards with the compact Client View agreement evidence style.
- **Reason:** Product requested clearer CSM Overview wording, fewer low-value urgent action categories and more immediately interpretable agreement detail.
- **Impact:** UI presentation and documentation only. CSM Overview and Company Detail remain read-only, Forecast Entry remains the only monthly edit route, and no Prisma schema, Redash source, API contract, forecast calculation or persistence behavior changed.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/CsmOverviewWorkspace.tsx`, `apps/forecasting-app/src/components/petyr/PetyrMVPRendering.tsx`, `apps/forecasting-app/src/components/petyr/PetyrLayoutPrimitives.tsx`, `apps/forecasting-app/src/services/petyrApprovedRenderingAdapter.ts`, `docs/05_forecasting_product_spec.md`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `DEVLOG.md`.
- **Validation:** Direct `npm run build` could not start because Linux `npm` is not installed in this shell. `docker.exe compose build forecasting-app` passed, including `npx prisma generate`, Next.js production compile, type checking, static page generation and image export.
- **Follow-up:** None.

## 2026-06-12

- **Area:** Petyr / Deterministic AI Forecast and Forecast Intelligence v2
- **Change:** Updated Petyr AI Forecast so numeric forecast rows remain deterministic/local, monetary values are integer EUR, and local consultative scenarios are rounded to 100 EUR steps. Added local trend signals for recent growth, over-consumption and summer slowdown; added historical-guided agreement residual allocation over remaining agreement months; added sanitized Business Unit title-token attribution with linked-history and company-history fallback; versioned Forecast Intelligence payload/prompt/output to v2; replaced LLM `recommended_actions`/`follow_up_questions` with opportunities, watchouts, forecast cues and CSM questions. Updated UI, smoke contract and focused validator tests accordingly.
- **Reason:** Product clarified that the LLM should detect opportunities and watchouts over Petyr-computed evidence, not generate final forecast numbers or prescribe operational fixes. Agreement residuals must not be over-consumed in early months or leak raw agreement/campaign/deal titles to OpenRouter.
- **Impact:** Forecast values saved to `ai_forecast_cache` remain local deterministic values. v1 Forecast Intelligence cache entries are invalidated by new schema/prompt versions and input hashes. OpenRouter payloads include residual allocation, trend, attribution and consultative scenario signals but not raw title text. The validator rejects invented numbers, legacy v1 fields and prescriptive language.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrAiForecastStrategyService.ts`, `apps/forecasting-app/src/services/petyrAiForecastCompanyIntelligenceService.ts`, `apps/forecasting-app/src/services/petyrForecastIntelligenceService.ts`, `apps/forecasting-app/src/services/petyrAiForecastLlmContractSmoke.ts`, `apps/forecasting-app/src/app/forecasting/aiForecastActions.ts`, `apps/forecasting-app/src/components/petyr/PetyrAiForecastCompanyAction.tsx`, `apps/forecasting-app/src/components/petyr/ForecastEntryFaq.tsx`, `apps/forecasting-app/src/types/petyrAiForecastManualAction.ts`, `apps/forecasting-app/tests/aiForecastIntelligence.test.ts`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `docs/petyr/AI_FORECASTING_DESIGN.md`, `docs/petyr/FORECAST_INTELLIGENCE_LAYER.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Validation:** Local Linux `npm` is not installed, so direct `npm run test:ai-forecast` could not start. `docker.exe compose build forecasting-app` passed, including `npx prisma generate`, Next.js production compile, type-checking and route generation. `docker.exe compose run --rm --no-deps` with mounted test files ran `npm run test:ai-forecast` successfully: 10/10 tests passed.
- **Follow-up:** Calibrate BU alias lists and trend/residual thresholds with Management/Finance after reviewing real forecast runs.

- **Area:** Petyr / Agreement and campaign ordering
- **Change:** Updated Petyr agreement ordering so active, non-expired agreements appear first by nearest expiry, with residual, total value and agreement name tie-breakers. Company Detail campaign rows now sort by End Date descending with missing End Date rows last. CSM Overview high agreement residual evidence now uses the active residual agreement expiring closest to today, shows that agreement's total value/residual/expiry/deal evidence, and no longer uses the current-month chip or redundant high-active-residual copy for that card.
- **Reason:** Product requested agreement evidence to prioritize agreements closest to expiry, High Agreement Residuals cards to show the relevant agreement total value instead of the current month, and Company Detail campaigns to show the most future End Date first.
- **Impact:** UI/read-model ordering and evidence copy only. No Prisma schema, Redash source, API route contract, forecast editing, AI generation, persistence target, permissions or Docker configuration changed.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrDataService.ts`, `apps/forecasting-app/src/services/petyrAlertService.ts`, `apps/forecasting-app/src/components/petyr/CsmOverviewWorkspace.tsx`, `apps/forecasting-app/src/app/forecasting/company/[companyName]/page.tsx`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `docs/petyr/03_petyr_business_rules.md`, `docs/petyr/COMPANY_ORDERING.md`, `DEVLOG.md`.
- **Validation:** Direct `npm run build` and `npx prisma generate` could not start because Linux `npm`/`npx` are not installed in this shell. Fallback `docker.exe compose build forecasting-app` passed Docker context load, dependency cache reuse, `npx prisma generate` and Next.js production compile, then failed during type checking on an unrelated existing AI Forecast type mismatch in `apps/forecasting-app/src/app/forecasting/aiForecastActions.ts` where `PetyrForecastIntelligenceOutput` is missing `recommended_actions` and `follow_up_questions` for `PetyrForecastIntelligenceActionResult`.
- **Follow-up:** Resolved by the Petyr Forecast Intelligence v2 entry above; the later `docker.exe compose build forecasting-app` validation passed.

- **Area:** Petyr / 2026 closed revenue backfill alignment
- **Change:** Updated the protected one-time 2026 closed-revenue alignment so monthly closed Redash revenue through the selected execution date is copied into both `forecast_monthly.forecast_type=previous_month` and `forecast_monthly.forecast_type=ongoing` with the same real value. The operation still writes annual `forecast_annual` rows for Management View Ongoing Forecast, and the admin UI/CLI dry-run report now separates Previous Month, Ongoing and annual changed-row counts while showing the changed monthly field in the preview.
- **Reason:** Product requested that real 2026 revenue up to the admin execution date align both monthly forecast columns, not only Ongoing Forecast.
- **Impact:** Applying the admin operation can now overwrite matching 2026 monthly Previous Month Forecast rows in addition to monthly Ongoing Forecast rows and annual Ongoing Forecast rows. Route, `APP_INTERNAL_SECRET`, dry-run-first/apply confirmation, Redash materialized data, Initial Forecast snapshots, AI forecast cache, Management Objectives, schema and scheduler behavior did not change.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrClosedRevenueOngoingBackfillService.ts`, `apps/forecasting-app/scripts/backfill-2026-closed-revenue-to-ongoing-forecast.mjs`, `apps/forecasting-app/src/components/petyr/PetyrClosedRevenueOngoingBackfillControl.tsx`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `docs/08_operational_commands.md`, `apps/forecasting-app/README.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Validation:** Pending in this task handoff.
- **Follow-up:** Run the admin dry-run against the target database and confirm Previous Month and Ongoing monthly previews show equal next values before applying once.

## 2026-06-11

- **Area:** Petyr / Forecast Entry FAQ navigation
- **Change:** Moved Forecast Entry FAQ from the bottom of `/forecasting/entry` to the dedicated `/forecasting/entry/faq` page, extracted the FAQ into a reusable Petyr component, and made the workspace header `?` help control available from Management, CSM Overview, Company Detail and Forecast Entry. The FAQ page uses the shared workspace shell so the four-section navigation stays available, and the help link preserves Forecast Entry/Company Detail query context when available. Updated stale FAQ wording to match the current interpretation-only Forecast Intelligence boundary.
- **Reason:** Product requested the FAQ as a separate page, accessed through the existing question-mark pattern in every section, with the workspace section header/navigation still available on the FAQ page.
- **Impact:** UI routing/navigation and explanatory copy only. No forecast formulas, save behavior, API contract, Prisma schema, Redash source, OpenRouter request, persistence target or permissions changed.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/PetyrLayoutPrimitives.tsx`, `apps/forecasting-app/src/components/petyr/ForecastEntryWorkspace.tsx`, `apps/forecasting-app/src/components/petyr/ForecastEntryFaq.tsx`, `apps/forecasting-app/src/app/forecasting/entry/faq/page.tsx`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `DEVLOG.md`.
- **Validation:** Passed `docker.exe compose build forecasting-app`, including `npx prisma generate`, Next.js compile, type checking and static page generation. Recreated the `forecasting-app` service with `docker.exe compose up -d forecasting-app`. Verified HTTP `200` for `/forecasting`, `/forecasting?view=csm`, `/forecasting/company/Test%20Company?year=2026`, `/forecasting/entry` and `/forecasting/entry/faq`; rendered HTML confirms the `?` FAQ link appears in each section, the FAQ page keeps the four section nav labels, and the Forecast Entry page no longer contains the FAQ body. Direct `npm run build` was not run because `npm` is not installed in the shell.
- **Follow-up:** None.

- **Area:** Petyr / DB visibility, Data Health and 2026 backfill dry-run
- **Change:** Fixed the 2026 closed-revenue backfill dry-run alias handling so camelCase output aliases such as `companyName`, `campaignCsmName` and `workspaceCreatedOn` no longer pass through strict PostgreSQL identifier validation, while table/column identifiers remain lowercase-only. Updated the approved rendering adapter so empty/incomplete Company Ownership no longer blocks Management/CSM rendering when real PostgreSQL campaign, agreement or forecast rows exist; it renders real fallback company rows, keeps Company Detail links based on encoded real company names, and downgrades ownership gaps to warnings. Added PostgreSQL-only Redash sync status to `/petyr-admin` Data Health and a warning when real fallback rendering is active. Standardized the fallback Branch label as `Unassigned Branch`.
- **Reason:** Product reported dry-run failure on `Unsafe PostgreSQL identifier: companyName`, empty Petyr diagnostics when Company Ownership has no rows, inaccessible Company Detail from fallback contexts, missing DB visibility and unclear sync status.
- **Impact:** No Prisma schema, migration, scheduler, Redash direct call, Redash source, APP_INTERNAL_SECRET flow, dry-run-first/apply confirmation contract or mock fallback was added. Petyr now uses real PostgreSQL fallback data when available and remains blocking only when required PostgreSQL data is missing or empty.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrClosedRevenueOngoingBackfillService.ts`, `apps/forecasting-app/src/services/petyrApprovedRenderingAdapter.ts`, `apps/forecasting-app/src/services/petyrDataHealthService.ts`, `apps/forecasting-app/src/services/petyrDataService.ts`, `apps/forecasting-app/src/services/petyrCompanyOwnershipService.ts`, `apps/forecasting-app/src/app/petyr-admin/page.tsx`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `apps/forecasting-app/README.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Validation:** Passed `node.exe --check apps/forecasting-app/scripts/backfill-2026-closed-revenue-to-ongoing-forecast.mjs`, parsed `apps/forecasting-app/package.json`, verified the old reported blocking/mock fallback messages are absent, ran `docker.exe compose ps` successfully, and passed `docker.exe compose build forecasting-app` including `npx prisma generate`, Next.js compile, type checking, static page generation and image export. Direct Linux `docker compose ps` could not connect to `/var/run/docker.sock`, and direct `npm run build` could not run because `npm` is not installed in the shell.
- **Follow-up:** Run the protected `/petyr-admin` dry-run against the target database, verify the Redash sync status rows and row counts with running Compose services, then apply the 2026 backfill once if the preview matches Finance expectations.

## 2026-06-10

- **Area:** Platform Docker builds / npm install resilience
- **Change:** Hardened the `deps` stages in the Redash Ingestor and Petyr Dockerfiles by configuring npm fetch retries, longer retry timeouts and a three-attempt retry loop around `npm ci`/`npm install`.
- **Reason:** Docker builds can fail during dependency installation with transient npm network resets such as `ECONNRESET`, especially because these apps currently build without committed lockfiles and the install layer can run for many minutes.
- **Impact:** Build/deployment resilience only. Runtime commands, app code, Redash sources, Prisma schemas, API contracts, secrets and production environment variable names did not change. A persistent npm outage can still fail after the third attempt.
- **Files/documents involved:** `apps/redash-ingestor/Dockerfile`, `apps/forecasting-app/Dockerfile`, `DEVLOG.md`.
- **Validation:** Passed `docker.exe compose build redash-ingestor` and `docker.exe compose build forecasting-app`. The Redash Ingestor build ran dependency install, Prisma generate, Next.js build and image export successfully. The Petyr build executed the modified dependency install layer and completed image export, with later builder layers reused from cache.
- **Follow-up:** Consider adding committed lockfiles for both apps in a separate dependency-management task so Docker can use reproducible `npm ci` installs by default.

## 2026-06-10

- **Area:** Petyr / Forecasting App build and dependency hygiene
- **Change:** Fixed the Forecast Entry FAQ build failure by removing the native HTML `title` prop conflict from shared Petyr layout primitives that accept React titles, and narrowed current-run AI forecast rows to official Petyr Business Units for cache save reporting. Updated the direct Recharts dependency from the deprecated 2.x branch to Recharts 3.8.1.
- **Reason:** Docker `npm run build` failed during Next.js type checking, first on `PetyrSectionTitle.title` receiving JSX and then on AI forecast cache report Business Unit typing. The Docker install also warned that Recharts 2.x is no longer active.
- **Impact:** Type-only/runtime dependency hygiene. No Forecast Entry UI copy, forecast formulas, API contracts, Prisma schema, Redash sources, cache persistence behavior or OpenRouter request logic intentionally changed. Remaining deprecated install warnings come from the current ExcelJS workbook stack and are tracked in backlog instead of being hidden behind unvalidated overrides.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/PetyrLayoutPrimitives.tsx`, `apps/forecasting-app/src/services/petyrAiForecastCompanyIntelligenceService.ts`, `apps/forecasting-app/package.json`, `BACKLOG.md`, `DEVLOG.md`.
- **Validation:** Passed `docker.exe compose build forecasting-app`. The build ran `npx prisma generate`, `npm run build`, Next.js type checking, static page generation and image export successfully. Initial Linux `docker compose build forecasting-app` could not run because `/var/run/docker.sock` was unavailable, so validation used Docker Desktop through `docker.exe`.
- **Follow-up:** Resolve the new backlog item for Excel workbook dependency deprecation warnings by evaluating ExcelJS replacement or tested overrides separately.

## 2026-06-10

- **Area:** Petyr / Admin 2026 Ongoing Forecast alignment
- **Change:** Added a protected `/petyr-admin` section named `2026 closed revenue alignment` with dry-run and apply buttons, backed by `/api/petyr/admin/backfill-2026-ongoing-from-closed` and a reusable Petyr backfill service. The UI requires `APP_INTERNAL_SECRET`, shows counts, warnings and preview rows, and only enables apply after a dry-run result.
- **Reason:** Product needs the one-time 2026 closed revenue to Ongoing Forecast DB alignment but shell command execution is not practical in the current environment.
- **Impact:** Admin UI/API execution path only for the same one-time 2026 repair. Applying can overwrite matching 2026 monthly ongoing forecast and annual forecast values with closed revenue aggregates and writes forecast save/change audit rows. No schema, Redash source, CSM workflow, recurring scheduler, Initial Forecast snapshot, AI cache or Management Objective behavior changed.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrClosedRevenueOngoingBackfillService.ts`, `apps/forecasting-app/src/app/api/petyr/admin/backfill-2026-ongoing-from-closed/route.ts`, `apps/forecasting-app/src/components/petyr/PetyrClosedRevenueOngoingBackfillControl.tsx`, `apps/forecasting-app/src/app/petyr-admin/page.tsx`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `apps/forecasting-app/README.md`, `docs/08_operational_commands.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Validation:** Passed `node.exe --check apps/forecasting-app/scripts/backfill-2026-closed-revenue-to-ongoing-forecast.mjs`, parsed `apps/forecasting-app/package.json` as valid JSON and verified no stale docs still describe the operation as non-UI/API. Could not run `npm run build`, `npx prisma generate` or TypeScript checks in this checkout because project dependencies are not installed, no lockfile is present, `node`/`npm` are not in PATH, no bundled TypeScript is available and Docker daemon is not running.
- **Follow-up:** Run the admin dry-run in the target Petyr environment, review warnings/previews, then apply once if the preview matches expectations.

## 2026-06-10

- **Area:** Petyr / Forecast Intelligence OpenRouter layer
- **Change:** Refactored the Petyr company AI Forecast OpenRouter path into an interpretation-only Forecast Intelligence layer. Petyr now computes deterministic forecast rows, three-year history signals, local scenarios, deltas, risks and data-quality flags before any OpenRouter call. OpenRouter receives a normalized payload with prompt versioning and input hashing, returns strict JSON only, is validated server-side, retries invalid JSON/schema output once, and stores success/failure state in `ai_forecast_cache`. Forecast Intelligence cache rows use `business_unit=__forecast_intelligence__`, `month=0` and `forecast_value=0`, while numeric readers filter those rows out. The Forecast Entry UI now exposes Generate AI forecast and renders validated executive summary, status, confidence, insights, drivers, risks, recommended actions, stakeholder note, data-quality notes and follow-up questions separately from deterministic numeric forecast rows.
- **Reason:** Product required OpenRouter to stop calculating or modifying forecasts and become only a structured business-analysis layer over local deterministic output.
- **Impact:** OpenRouter can no longer set `aiForecastValue` or final adjustments. Failed or unavailable AI saves failure diagnostics and leaves deterministic preview available. Confirmed apply persists deterministic numeric rows only after valid or cached Forecast Intelligence output. Data model docs now describe the cache metadata and sentinel row.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrForecastIntelligenceService.ts`, `apps/forecasting-app/src/services/petyrForecastIntelligenceCacheService.ts`, `apps/forecasting-app/src/services/petyrAiForecastCompanyIntelligenceService.ts`, `apps/forecasting-app/src/services/petyrAiForecastCompanyPreviewService.ts`, `apps/forecasting-app/src/app/forecasting/aiForecastActions.ts`, `apps/forecasting-app/src/components/petyr/PetyrAiForecastCompanyAction.tsx`, `apps/forecasting-app/src/types/petyrAiForecastManualAction.ts`, `apps/forecasting-app/src/services/petyrDataService.ts`, `apps/forecasting-app/src/services/petyrMonthlyForecastExcelService.ts`, `apps/forecasting-app/prisma/schema.prisma`, `apps/forecasting-app/tests/aiForecastIntelligence.test.ts`, `apps/forecasting-app/tsconfig.ai-forecast-test.json`, `docs/petyr/FORECAST_INTELLIGENCE_LAYER.md`, `docs/petyr/AI_FORECASTING_DESIGN.md`, `docs/05_forecasting_product_spec.md`, `docs/01_architecture.md`, `docs/04_data_model.md`, `docs/petyr/02_petyr_data_model_target.md`, `docs/petyr/03_petyr_business_rules.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Validation:** Added mocked service tests for valid JSON, invalid JSON retry, missing required fields, AI unavailable, cached output reuse and deterministic fallback without AI. Full validation results are recorded in the task handoff.
- **Follow-up:** Apply the updated Prisma schema to the target database so the new cache metadata columns exist before real Forecast Intelligence calls are used.


## 2026-06-10

- **Area:** Petyr / 2026 Ongoing Forecast data alignment
- **Change:** Added a DB-only one-time backfill command `npm run backfill:2026-ongoing-from-closed` that dry-runs by default and writes only with `--apply`. The script aggregates already closed 2026 Redash master campaign revenue by Company, Business Unit and month, copies it into `forecast_monthly` rows with `forecast_type=ongoing`, aggregates the same closed revenue into `forecast_annual` rows used by Management View Ongoing Forecast, and creates forecast save/change audit rows for applied changes.
- **Reason:** Product requested a one-time 2026 database alignment so closed real revenue already completed is reported as Ongoing Forecast. This must not become a future feature or recurring process.
- **Impact:** Applying the script can overwrite matching 2026 monthly ongoing forecast and annual forecast values with closed revenue aggregates. No Prisma schema, Redash source, UI route, API endpoint, scheduler, Initial Forecast snapshot, Redash materialized closed revenue, AI forecast cache or Management Objective behavior changed.
- **Files/documents involved:** `apps/forecasting-app/scripts/backfill-2026-closed-revenue-to-ongoing-forecast.mjs`, `apps/forecasting-app/package.json`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `docs/04_data_model.md`, `docs/08_operational_commands.md`, `apps/forecasting-app/README.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Validation:** Passed `node.exe --check apps/forecasting-app/scripts/backfill-2026-closed-revenue-to-ongoing-forecast.mjs` and parsed `apps/forecasting-app/package.json` as valid JSON. Could not run `npm run build` or `npx prisma generate` in this checkout because `node`/`npm` are not in PATH and dependencies are not installed (`node_modules` and lockfiles are absent).
- **Follow-up:** Run the dry-run against the target database, review counts/previews/warnings, then run the same command with `--apply` once for 2026 if the preview matches expectations.

## 2026-06-10

- **Area:** Petyr / CSM Overview UI
- **Change:** Refined the `/forecasting?view=csm` CSM Overview so urgent-action affected lists initially show only the first four rows with an expand/collapse control, affected company names link directly to Company Detail, Client View has a company filter beside the optional month selector, and company cards use one combined agreement evidence chip for agreement title, total agreement value, residual and expiry while omitting the CSM chip.
- **Reason:** Product requested that large urgent-action lists stop disrupting the layout and that CSM users can jump directly to company detail and scan agreement values/dates without ambiguity when reviewing Client View company cards.
- **Impact:** UI behavior only in Petyr CSM Overview. No Prisma schema, Redash source, PostgreSQL read model, Forecast Entry save behavior, API contract, AI Forecast logic or permissions changed. CSM Overview remains read-only.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/PetyrMVPRendering.tsx`, `docs/05_forecasting_product_spec.md`, `DEVLOG.md`.
- **Follow-up:** None.

## 2026-06-10

- **Area:** Petyr / Forecast Entry FAQ verification
- **Change:** Verified the Forecast Entry FAQ implementation and adjusted the shared workspace header so the `?` help control remains anchored in the top-right corner of the Forecast Entry title card across responsive layouts.
- **Reason:** Product requested verification that the FAQ access point was complete; the desktop placement was correct, but the responsive card needed a tighter top-right placement.
- **Impact:** UI positioning only. No formulas, API contracts, database schema, Redash sources, AI Forecast persistence behavior or OpenRouter request contract changed.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/PetyrLayoutPrimitives.tsx`, `DEVLOG.md`.
- **Follow-up:** Run the Forecast Entry page in a browser once local npm or Docker daemon access is available.

## 2026-06-09

- **Area:** Petyr / Forecast Entry FAQ
- **Change:** Added a top-right `?` help control to the Forecast Entry workspace header and an in-page FAQ section explaining forecast urgency ordering, monthly editability, deterministic AI Forecast preview, baseline calculations, agreement residual pressure, rule-based alerts and AI/LLM validation boundaries.
- **Reason:** Product requested an accessible FAQ for the algorithmic logic behind Forecast Entry ordering, deterministic preview and AI/LLM behavior.
- **Impact:** UI help/copy only. No formulas, route contracts, database schema, Redash sources, save behavior, AI Forecast persistence behavior or OpenRouter request contract changed.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/PetyrLayoutPrimitives.tsx`, `apps/forecasting-app/src/components/petyr/ForecastEntryWorkspace.tsx`, `docs/05_forecasting_product_spec.md`, `DEVLOG.md`.
- **Follow-up:** Revisit the FAQ copy when Forecast Entry canonical ordering weights, expiry scoring and real business risk score are finalized.

## 2026-06-08

- **Area:** Petyr / AI Forecast OpenRouter response handling
- **Change:** Changed OpenRouter response extraction so structured `message.parsed` is validated before fallback text content, increased the manual AI Forecast output token budget, tightened the prompt/JSON Schema for concise explanation and advice fields, and required useful model caveats to be returned as structured warnings instead of prose. Added explicit detection for provider-truncated structured output.
- **Reason:** Real dry-run OpenRouter previews could fail after the allowed retry when the provider returned explanatory text before JSON, code-fenced/partial output, or a parsed structured object alongside non-JSON `message.content`.
- **Impact:** No route, database schema or persistence target changed. Dry-run OpenRouter preview still writes no rows; valid parsed structured output can now be accepted as `llm_current_run`, while prose outside JSON and truncated output remain invalid and fall back to deterministic preview with diagnostics. Non-dry-run apply still saves only fully validated future-month rows to `ai_forecast_cache`.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrAiForecastCompanyPreviewService.ts`, `apps/forecasting-app/src/services/petyrAiForecastLlmContract.ts`, `docs/05_forecasting_product_spec.md`, `docs/petyr/AI_FORECASTING_DESIGN.md`, `DEVLOG.md`.
- **Follow-up:** Run a real OpenRouter preview with the configured model and verify whether structured `message.parsed` is returned consistently; if not, consider selecting a model/provider with stronger structured-output behavior.

- **Area:** Petyr / AI Forecast OpenRouter provider routing
- **Change:** Removed the `temperature` request parameter from manual OpenRouter forecast calls and increased the request timeout for slower Pro reasoning models. The request now keeps the strict structured-output parameters required by Petyr without adding unsupported optional sampling parameters.
- **Reason:** `openai/gpt-5.5-pro` supports structured output on OpenRouter but does not advertise `temperature` as a supported parameter. With `provider.require_parameters=true`, OpenRouter returned HTTP 404 because no endpoint could satisfy every requested parameter.
- **Impact:** Dry-run OpenRouter preview and confirmed apply can route to `openai/gpt-5.5-pro` while preserving strict JSON Schema validation and no-write dry-run behavior. No route contract, DB schema or persistence target changed.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrAiForecastCompanyPreviewService.ts`, `docs/05_forecasting_product_spec.md`, `DEVLOG.md`.
- **Follow-up:** Re-test a real `openai/gpt-5.5-pro` preview and monitor latency/cost because Pro output is expensive and can be slower than the previous default.

- **Area:** Petyr / AI Forecast OpenAI structured-output schema compatibility
- **Change:** Simplified the `response_format` JSON Schema sent to OpenRouter/OpenAI so it only uses provider-compatible structural constraints: required fields, object shape, primitive types and enums. Numeric ranges, confidence bounds, non-empty strings, string lengths and target-set completeness remain enforced by the existing Petyr server-side validator after the response is returned.
- **Reason:** `openai/gpt-5.5-pro` returned HTTP 400 because the provider rejected JSON Schema keywords such as `minimum` on `number` fields.
- **Impact:** OpenRouter can submit the structured-output request to OpenAI without provider schema rejection, while Petyr still rejects invalid negative values, out-of-range confidence, empty text, bad months, duplicate/missing targets and persistence-unsafe output before preview use or cache writes. No route contract, DB schema or persistence target changed.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrAiForecastLlmContract.ts`, `docs/05_forecasting_product_spec.md`, `DEVLOG.md`.
- **Follow-up:** Re-test a real `openai/gpt-5.5-pro` preview; if another provider-specific schema keyword is rejected, keep the provider schema structural and move that rule to server-side validation.


## 2026-06-08

- **Area:** Petyr / Workspace header copy
- **Change:** Replaced the shared `Forecasting MVP visual rendering` header title and generic description with section-specific explanatory copy for Management, CSM Overview, Company Details and Forecast Entry.
- **Reason:** Product requested that the top card explain what each page view offers so users can understand the page immediately.
- **Impact:** UI copy only. No layout, routing, data service, API, forecast logic, Prisma schema, Redash source or persistence behavior changed.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/PetyrLayoutPrimitives.tsx`, `docs/05_forecasting_product_spec.md`, `DEVLOG.md`.
- **Follow-up:** None.

## 2026-06-06

- **Area:** Petyr / AI Forecast OpenRouter strict JSON retry
- **Change:** Added robust OpenRouter structured-output extraction for `message.parsed` or object content and one server-side strict-JSON retry when the first OpenRouter response fails Petyr validation. The retry still uses the same structured-output request, schema validation, deterministic target-set validation and privacy checks.
- **Reason:** Real OpenRouter preview runs can still fail with `$: Response must be strict valid JSON with no surrounding text` when a provider/model returns prose or markdown despite structured-output settings.
- **Impact:** No route or DB schema contract changed. Preview can recover from one malformed model answer; if the retry still fails, deterministic preview remains the fallback. Non-dry-run save/apply still writes nothing unless the final response passes strict validation.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrAiForecastCompanyPreviewService.ts`, `docs/05_forecasting_product_spec.md`, `docs/petyr/AI_FORECASTING_DESIGN.md`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Follow-up:** Run a real OpenRouter preview with the configured model and inspect whether the retry path is still needed frequently; if so, choose a model/provider with more reliable structured-output support.

## 2026-06-05

- **Area:** Petyr / Unified navigation and Company Detail alignment
- **Change:** Unified Petyr navigation around a shared workspace shell for Management View, CSM Overview, Company Detail and Forecast Entry. Company Detail now uses a Forecast Entry-style CSM/company/year navigator backed by getForecastEntryCompanies ordering, includes an expandable Business Unit month-by-month view, removes the AI Forecast generation action, keeps AI cache read-only, and moves Data diagnostics to the floating menu. Forecast Entry now uses the shared shell and floating diagnostics while keeping AI Forecast generation/apply as its support tool.
- **Reason:** Product requested continuous route-aware navigation and visual coherence across Petyr sections, while preserving Company Detail as analytical/read-only and Forecast Entry as the operational edit and AI generation surface.
- **Impact:** UI/read-model behavior changed only inside apps/forecasting-app. No DB schema, Redash source, Forecast Entry save contract, annual forecast save contract, OpenRouter contract or Prisma migration changed. Company Detail filters reload route context and do not save forecast data.
- **Files/documents involved:** apps/forecasting-app/src/components/petyr/PetyrLayoutPrimitives.tsx, apps/forecasting-app/src/components/petyr/PetyrFloatingDiagnosticsMenu.tsx, apps/forecasting-app/src/components/petyr/PetyrMVPRendering.tsx, apps/forecasting-app/src/components/petyr/ForecastEntryWorkspace.tsx, apps/forecasting-app/src/components/petyr/CompanyDetailNavigator.tsx, apps/forecasting-app/src/components/petyr/CompanyBusinessUnitMonthlyView.tsx, apps/forecasting-app/src/app/forecasting/page.tsx, apps/forecasting-app/src/app/forecasting/company/[companyName]/page.tsx, apps/forecasting-app/src/services/petyrDataService.ts, PETYR_PRODUCT_AND_DATA_LOGIC.md, docs/05_forecasting_product_spec.md, docs/petyr/03_petyr_business_rules.md, docs/petyr/COMPANY_ORDERING.md, STATUS_UI_ALIGNMENT_AND_AI_FORECAST.md, DECISIONS.md, DEVLOG.md.
- **Follow-up:** Run cd apps/forecasting-app && npm run build in an environment where npm is available; manually check /forecasting?view=management, /forecasting?view=csm, /forecasting/company/<company>?year=YYYY and /forecasting/entry?...

- **Area:** Petyr / AI Forecast LLM value comparison
- **Change:** Changed manual OpenRouter preview handling so a validated LLM preview becomes the current preview row set instead of remaining only in debug output, added source-aware forecast rows, added an `LLM value` UI tab comparing deterministic baseline to post-LLM forecast deltas, and added server-side checks that reject OpenRouter output when target rows are missing or duplicated, or when returned baseline, planned value or residual evidence does not match the deterministic candidates.
- **Reason:** The first AI Forecast evaluation phase needs to show what value OpenRouter adds over the deterministic calculation, including adaptation, reasoning, deductions and CSM-facing cues, while keeping deterministic evidence authoritative.
- **Impact:** No route or database schema contract changed. Deterministic preview remains the fallback when OpenRouter is not requested, missing or invalid. Validated OpenRouter preview rows are visible as `llm_current_run` rows and selected-year aggregates reflect the post-LLM values. Missing or duplicated target rows and invalid candidate evidence produce validation diagnostics and no cache writes.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrAiForecastCompanyPreviewService.ts`, `apps/forecasting-app/src/app/forecasting/aiForecastActions.ts`, `apps/forecasting-app/src/types/petyrAiForecastManualAction.ts`, `apps/forecasting-app/src/components/petyr/PetyrAiForecastCompanyAction.tsx`, `docs/05_forecasting_product_spec.md`, `docs/petyr/AI_FORECASTING_DESIGN.md`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Follow-up:** Run the full Next.js build in an environment with npm or Docker daemon access; compare real company runs to decide whether to persist richer LLM reasoning fields.

- **Area:** Petyr / AI Forecasting OpenRouter contract
- **Change:** Extended the manual company AI Forecast LLM payload with historical closed revenue and selected-year real closed/planned aggregates, removed CSM monthly and annual forecast values from the OpenRouter prompt, added strict OpenRouter JSON Schema response formatting with provider parameter enforcement, and tightened server-side validation against unexpected response fields.
- **Reason:** AI Forecast generation must use real Redash-derived evidence and deterministic measurements, not CSM-entered forecast values, and OpenRouter must be constrained to the exact JSON shape Petyr validates.
- **Impact:** `POST /api/petyr/ai-forecast/company` keeps the same route contract. Dry-run/debug payloads now show the real evidence sent to the prompt builder and the explicit CSM forecast exclusion policy. Non-dry-run OpenRouter calls require structured-output-capable providers and still write only validated future-month rows to `ai_forecast_cache`.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrAiForecastLlmContract.ts`, `apps/forecasting-app/src/services/petyrAiForecastCompanyPreviewService.ts`, `apps/forecasting-app/src/services/petyrAiForecastStrategyService.ts`, `apps/forecasting-app/src/services/petyrAiForecastLlmContractSmoke.ts`, `docs/05_forecasting_product_spec.md`, `docs/petyr/AI_FORECASTING_DESIGN.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Follow-up:** Confidence threshold, complete anonymization, rich output persistence and append-only cache history remain tracked in backlog.

## 2026-05-29

- **Area:** Petyr / Final validation copy consistency
- **Change:** Removed the legacy `Worked YTD` wording from the Company Detail primary KPI label and aligned the UI alignment status document with the final `Closed revenue YTD` label.
- **Reason:** Petyr source-of-truth copy rules require user-facing revenue labels to use `Closed revenue` terminology and avoid legacy `Worked` labels.
- **Impact:** Copy/documentation consistency only. Company Detail remains read-only; no data services, calculations, persistence, AI Forecast behavior, Redash sources or API contracts changed.
- **Files/documents involved:** `apps/forecasting-app/src/app/forecasting/company/[companyName]/page.tsx`, `STATUS_UI_ALIGNMENT_AND_AI_FORECAST.md`, `DEVLOG.md`.
- **Validation:** Direct `npm run build` could not start because `npm` is unavailable in this shell. Docker fallback `docker compose build forecasting-app` could not run because the Docker daemon socket was unavailable (`/var/run/docker.sock`).
- **Follow-up:** None.

- **Area:** Petyr / AI Forecast UI explainability
- **Change:** Refactored the manual company AI Forecast support component into compact explainability tabs for Overview, Algorithms & signals, Year & Business Unit, Charts, OpenRouter I/O and Apply diagnostics. The UI now renders the backend explainability contract, selected-year aggregates, Recharts monthly/BU charts and sanitized current-run OpenRouter diagnostics while preserving deterministic dry-run as the default and keeping Apply behind explicit confirmation.
- **Reason:** Product requested AI Forecast explainability and observability in the UI without changing formulas, persistence targets or the secondary placement inside Forecast Entry and Company Detail.
- **Impact:** UI behavior changed only inside the read-only AI Forecast support tool. AI Forecast values remain non-editable; CSM-owned forecast tables, formulas, eligible-month rules and AI cache persistence targets were not intentionally changed. Prompt/response diagnostics remain current-run UI data and are not persisted.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/PetyrAiForecastCompanyAction.tsx`, `apps/forecasting-app/src/app/forecasting/aiForecastActions.ts`, `docs/petyr/AI_FORECASTING_DESIGN.md`, `DEVLOG.md`.
- **Validation:** Direct `cd apps/forecasting-app && npm run build` could not start because `npm` is unavailable in this shell. Docker fallback `docker compose build forecasting-app` could not run because the Docker daemon socket was unavailable (`/var/run/docker.sock`). Source-level checks were performed, but a full build remains pending in an environment with npm or Docker daemon access.
- **Follow-up:** Complete anonymization/minimization hardening, calibrated Management/Finance weights, rich-output persistence decisions and BU-attributed residual pressure decisions before broader rollout.


## 2026-05-27

- **Area:** Petyr / AI Forecasting regression hardening
- **Change:** Disabled the legacy `POST /api/petyr/admin/ai-forecast-batch` route and underlying batch service for the manual MVP so they now return/fail with a disabled response, disabled the Redash Ingestor post-sync AI batch trigger, changed the after-sync default to off, and changed manual company AI Forecast persistence so existing `ai_forecast_cache` rows for the same company, Business Unit, year, month and model version are skipped instead of overwritten.
- **Reason:** Final regression check confirmed that AI Forecasting must remain manual company-by-company, must not expose or trigger a global/all-company batch path, and must avoid rewriting existing AI cache generations while append-only cache versioning remains undecided.
- **Impact:** Manual `POST /api/petyr/ai-forecast/company` remains the supported AI Forecast MVP path. Validated future-month rows can still be created in `ai_forecast_cache`; existing cache rows are reported as skipped with reason `skipped_existing_cache`. Redash sync no longer attempts to run AI generation after a successful sync. No CSM forecast, closed revenue, management objective, Initial Forecast, annual forecast, Prisma schema, Redash source or UI layout behavior changed.
- **Files/documents involved:** `apps/forecasting-app/src/app/api/petyr/admin/ai-forecast-batch/route.ts`, `apps/forecasting-app/src/services/aiForecastBatchService.ts`, `apps/forecasting-app/src/services/petyrAiForecastCompanyPreviewService.ts`, `apps/redash-ingestor/src/services/postSyncAiForecastService.ts`, `apps/redash-ingestor/src/lib/config.ts`, `.env.example`, `docs/01_architecture.md`, `docs/04_data_model.md`, `docs/05_forecasting_product_spec.md`, `docs/petyr/01_petyr_architecture.md`, `DEVLOG.md`.
- **Validation:** Direct `npx prisma generate` and `npm run build` could not start because `npx`/`npm` are unavailable in this shell. `docker compose build forecasting-app` passed with Docker daemon escalation; the Docker build ran `npx prisma generate` and `npm run build`. `docker compose build redash-ingestor` also passed after the post-sync trigger change.
- **Follow-up:** Keep the future AI cache append-only/versioning decision, richer output persistence and anonymization tool/API backlog items open before broader production rollout.

- **Area:** Petyr / Manual AI Forecast UI
- **Change:** Historical note: this entry previously introduced the manual `Generate AI forecast` action in both Company Detail and Forecast Entry for the selected company and selected year. The 2026-06-05 unified navigation decision supersedes that UI scope: Company Detail no longer exposes generation/apply and Forecast Entry remains the only operational AI Forecast UI. The action uses a server-side Petyr action so browser code never receives `APP_INTERNAL_SECRET`, generates a default dry-run preview without database writes, displays Business Unit/month forecast rows with baseline, AI Forecast, confidence, explanation, advice and residual coverage warning, and exposes `Apply AI forecast` only after a preview plus explicit user confirmation. Confirmed apply calls the existing manual non-dry-run company service and reports saved, skipped and validation-error counts.
- **Reason:** Product requested a non-invasive manual action to generate AI Forecast for one company from Company Detail and/or Forecast Entry without introducing global batches or saving before confirmation.
- **Impact:** UI behavior changed only for `/forecasting/company/[companyName]` and `/forecasting/entry`. No redesign, Prisma schema, Redash source, Forecast Entry save rules, CSM forecast, closed revenue, management objective, Initial Forecast or annual forecast behavior changed. Preview remains dry-run and writes nothing; apply may write only validated future-month rows to `ai_forecast_cache`.
- **Files/documents involved:** `apps/forecasting-app/src/app/forecasting/aiForecastActions.ts`, `apps/forecasting-app/src/components/petyr/PetyrAiForecastCompanyAction.tsx`, `apps/forecasting-app/src/types/petyrAiForecastManualAction.ts`, `apps/forecasting-app/src/app/forecasting/company/[companyName]/page.tsx`, `apps/forecasting-app/src/components/petyr/ForecastEntryWorkspace.tsx`, `docs/05_forecasting_product_spec.md`, `DEVLOG.md`.
- **Validation:** Direct `npm run build` could not start because `npm` is unavailable in this shell. `docker compose build forecasting-app` passed with escalation for Docker buildx filesystem access; the Docker build ran `npx prisma generate` and `npm run build`.
- **Follow-up:** Complete the future anonymization tool/API, rich-output persistence and append-only cache versioning decisions before broader production rollout.

## 2026-05-26

- **Area:** Petyr / AI Forecasting manual company cache persistence
- **Change:** Extended protected `POST /api/petyr/ai-forecast/company` so `dryRun=false` runs the manual single-company OpenRouter path, validates strict LLM JSON output, applies future-month and explanation/advice privacy checks, and writes only validated future-month rows to `ai_forecast_cache` inside a transaction. The response now reports saved rows, skipped rows, validation errors and model version. Rows are upserted only at the selected company + Business Unit + future month + year + model version grain; past and current months are excluded before any write.
- **Reason:** Product requested that the manual AI Forecast endpoint can persist validated AI results while preserving CSM-owned forecast, closed revenue, annual forecast and management objective boundaries.
- **Impact:** Manual non-dry-run AI Forecast runs may create or update `ai_forecast_cache` rows for eligible future months. No UI, Prisma schema, Redash source, `forecast_monthly`, `forecast_annual`, closed revenue, management objective or Initial Forecast behavior changed. `dryRun=true` remains the default and still writes nothing.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrAiForecastCompanyPreviewService.ts`, `docs/05_forecasting_product_spec.md`, `docs/08_operational_commands.md`, `docs/petyr/AI_FORECASTING_DESIGN.md`, `DEVLOG.md`.
- **Validation:** Direct `npm run build` could not start because `npm` is unavailable in this shell. `docker compose build forecasting-app` passed with escalation for Docker buildx filesystem access; the Docker build ran `npx prisma generate` and `npm run build`.
- **Follow-up:** Complete the future anonymization tool/API and rich-output persistence/versioning decisions before broader production rollout.

- **Area:** Petyr / AI Forecasting manual company preview endpoint
- **Change:** Added protected `POST /api/petyr/ai-forecast/company` for the manual AI Forecast MVP. The endpoint requires `x-app-secret: APP_INTERNAL_SECRET`, accepts one `companyName` and one target `year`, defaults `dryRun=true`, rejects array/global company input, builds deterministic company + Business Unit + eligible future-month candidates with business signals, validates the dry-run preview through the Petyr AI Forecast response validator, and returns `wroteToDatabase=false`. Optional `llmPreview=true`/`useLlmPreview=true`/`includeLlmPreview=true` can request a server-side OpenRouter dry-run reasoning preview when configured. `dryRun=false` returns a clear not-implemented error.
- **Reason:** Product requested a manual single-company AI Forecast preview endpoint that does not run a global batch and does not write database rows in dry-run mode.
- **Impact:** New API route and service only. No UI, Prisma schema, Redash source, CSM forecast, closed revenue, management objective, Initial Forecast, annual forecast or `ai_forecast_cache` persistence behavior changed. Dry-run preview reads PostgreSQL-backed Petyr data and model settings; optional LLM preview may call OpenRouter only when explicitly requested and configured.
- **Files/documents involved:** `apps/forecasting-app/src/app/api/petyr/ai-forecast/company/route.ts`, `apps/forecasting-app/src/services/petyrAiForecastCompanyPreviewService.ts`, `docs/05_forecasting_product_spec.md`, `docs/08_operational_commands.md`, `DEVLOG.md`.
- **Validation:** Direct `npm run build` could not start because `npm` is unavailable in this shell. `docker compose build forecasting-app` passed with escalation for Docker buildx filesystem access; the Docker build ran `npx prisma generate` and `npm run build`.
- **Follow-up:** `dryRun=false` persistence was implemented later on 2026-05-26; richer-output persistence policy and final production privacy hardening remain future work.

- **Area:** Petyr / AI Forecasting LLM reasoning contract
- **Change:** Added pure prompt-contract and output-validation helpers for the future LLM reasoning layer. The builder receives deterministic baseline candidates, planned campaign signals, agreement residual pressure signals, current CSM forecast context and optional annual forecast context, then emits strict JSON-only model messages anchored to eligible future months and official Business Units. The validator accepts only strict JSON matching the Petyr response schema, official Business Units, the selected year, future months only, non-negative numeric values, `confidenceScore` in `0..1` or `null`, required explanation/advice and driver fields. Added a smoke helper for the contract path.
- **Reason:** The manual AI Forecasting MVP needs a validatable LLM prompt/response contract before enabling any automatic save or broader OpenRouter workflow.
- **Impact:** Internal functions only. No UI, API route, Prisma schema, OpenRouter call, database write, `ai_forecast_cache` persistence, CSM forecast, closed revenue, management objective, Initial Forecast or annual forecast behavior changed.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrAiForecastLlmContract.ts`, `apps/forecasting-app/src/services/petyrAiForecastLlmContractSmoke.ts`, `docs/05_forecasting_product_spec.md`, `docs/petyr/AI_FORECASTING_DESIGN.md`, `BACKLOG.md`, `DEVLOG.md`.
- **Validation:** Direct `npm run build` could not start because `npm` is unavailable in this shell. `docker compose build forecasting-app` passed with escalation for Docker buildx filesystem access; the Docker build ran `npx prisma generate` and `npm run build`.
- **Follow-up:** Wire the contract into the manual company-by-company OpenRouter path only after the request boundary and no-overwrite cache behavior are explicitly selected for implementation.

- **Area:** Petyr / AI Forecasting deterministic candidates
- **Change:** Enriched read-only deterministic forecast candidates with the business signal fields requested for the manual MVP: `plannedCampaignsValue`, `activeAgreementResidual`, `monthsToExpiry`, `estimatedCoverageUntilExpiry`, `residualCoverageGap`, `residualPressureLevel` and `adviceCandidate`. Agreement residual pressure now treats an agreement as active only when its expiry date is today or in the future and residual value is greater than zero, so expired residuals do not create active pressure. Planned campaign value remains limited to valid future `Setup` and `Recruiting` campaigns, with `Running` excluded from planned future.
- **Reason:** Forecast candidates need to expose the main deterministic business signals before any future LLM reasoning layer consumes them.
- **Impact:** Internal read-model/service enrichment only. No UI, Prisma schema, database writes, `ai_forecast_cache` writes, OpenRouter/LLM call, CSM forecast, closed revenue, management objective, Initial Forecast or annual forecast behavior changed.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrAiForecastStrategyService.ts`, `DEVLOG.md`.
- **Validation:** `docker compose build forecasting-app` passed; the Docker build ran `npx prisma generate` and `npm run build`. Direct `npm run build` was not run because `npm` is unavailable in this shell.
- **Follow-up:** If Management/Finance later wants low/medium/high residual-pressure thresholds instead of the documented deterministic none/covered/gap states, capture that as a new product decision before changing the level scale.

- **Area:** Petyr / AI Forecasting deterministic baseline
- **Change:** Added the read-only deterministic AI Forecast strategy service for the manual company-by-company MVP. The service builds candidate forecasts for one selected company, every official Business Unit and only eligible future months of the selected year. It computes historical weighted baseline, monthly seasonality, run-rate, valid planned future campaign value and company-level agreement residual pressure signals, and returns technical data-quality flags and explanation parts without calling an LLM, writing `ai_forecast_cache`, changing UI, changing API contracts or processing global batches.
- **Reason:** Product requested the deterministic baseline engine that anchors future AI Forecasting output before any LLM reasoning layer is used.
- **Impact:** New internal service only. No Prisma schema, database writes, UI, OpenRouter call, cache persistence, CSM forecast, closed revenue, management objective, Initial Forecast or annual forecast behavior changed. Exact business tuning for baseline weights remains a backlog calibration item.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrAiForecastStrategyService.ts`, `BACKLOG.md`, `DEVLOG.md`.
- **Validation:** Direct `npm run build` could not run because `npm` is unavailable in this shell. `docker compose build forecasting-app` passed; the Docker build ran `npx prisma generate` and `npm run build`.
- **Follow-up:** Calibrate deterministic baseline weights and residual-pressure adjustment with Management/Finance before treating the formula as a business-approved forecast policy.

- **Area:** Petyr / AI Forecasting MVP documentation
- **Change:** Updated the AI Forecasting source of truth from theoretical design toward a manual, company-by-company MVP. Documented the exact grain (`company + Business Unit + future month + year`), manual single-company trigger, no global automatic post-sync batch, hybrid strategy, deterministic baseline strategies, planned campaign status handling, agreement residual pressure, LLM reasoning duties, future-month-only eligibility, expected MVP JSON output, and the deferred complete anonymization tool/API. Realigned architecture/operations docs that still described automatic post-sync AI batch execution.
- **Reason:** Product requested an operational, explainable AI Forecasting MVP specification without implementing LLM calls, sending real data externally or changing UI.
- **Impact:** Documentation only. No code, UI, Prisma schema, database migration, API implementation or external LLM call changed. The definitive anonymization protection remains unimplemented and tracked as future privacy hardening.
- **Files/documents involved:** `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/petyr/AI_FORECASTING_DESIGN.md`, `docs/01_architecture.md`, `docs/05_forecasting_product_spec.md`, `docs/petyr/01_petyr_architecture.md`, `docs/08_operational_commands.md`, `BACKLOG.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Follow-up:** Implement the future anonymization tool/API before broader production rollout, decide rich-output persistence for baseline/signals/advice/drivers and keep any automated/global AI batching behind a later documented decision.

- **Area:** Petyr / Initial Forecast consolidation
- **Change:** Updated the Initial Forecast consolidation service and protected endpoint to use `Europe/Rome` as the default business timezone, treat January 1 in that timezone as the only implicit automatic target date, and require an explicit target `year` for controlled manual recovery outside January 1. Locked Initial Forecast snapshots are now skipped by normal imports/consolidations, with overwrite allowed only through an explicit protected admin recovery flag `overrideLocked=true`. The 2026 Initial Forecast Excel import now reports locked rows as skipped instead of overwriting them.
- **Reason:** Product confirmed the annual Initial Forecast consolidation rule: January 1 in `Europe/Rome`, frozen baseline remains immutable, Ongoing Forecast remains separate and mutable, and locked Initial Forecast rows must not be overwritten except by explicit admin override.
- **Impact:** No UI, monthly forecast, schema, Ongoing Forecast, Yearly Objective, closed revenue, management objective or AI forecast behavior was intentionally changed. Consolidation still reads `forecast_annual` as the source and writes only `forecast_annual_snapshot` / `forecast_annual_snapshot_change_log`.
- **Files/documents involved:** `.env.example`, `apps/forecasting-app/src/lib/petyr/config.ts`, `apps/forecasting-app/src/services/petyrInitialAnnualForecastService.ts`, `apps/forecasting-app/src/services/petyrInitialForecastExcelService.ts`, `apps/forecasting-app/src/app/api/petyr/admin/consolidate-initial-forecast/route.ts`, `apps/forecasting-app/README.md`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/04_data_model.md`, `docs/05_forecasting_product_spec.md`, `docs/08_operational_commands.md`, `docs/petyr/02_petyr_data_model_target.md`, `docs/petyr/03_petyr_business_rules.md`, `BACKLOG.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Validation:** `npm run build` could not start because `npm` is unavailable in this shell. `docker compose build forecasting-app` could not run in the sandbox because Docker buildx needs write access to `/home/kali/.docker/buildx`; the escalation request was rejected by the environment. Static `rg` checks verified the new timezone, January 1, locked-row and override references in code/docs.
- **Follow-up:** Run `docker compose build forecasting-app` or `cd apps/forecasting-app && npm run build` in an environment with Node/npm or Docker build access.

- **Area:** Petyr / Forecast Entry MVP visual alignment
- **Change:** Realigned the dedicated Forecast Entry route to the Petyr MVP Rendering structure while preserving the real editing workflow. The page now uses the MVP-style Forecast Entry hierarchy: section header, CSM/company/year/month navigator card with previous/next company controls, Monthly/Annual forecast tabs, monthly Business Unit cards with the active editable CSM-owned forecast field, read-only Closed revenue and AI Forecast references, company active/inactive status, save note, grouped change history, annual Business Unit cards, and Management Objectives at the bottom of the Annual Forecast area. Added a direct Company Detail link from Forecast Entry.
- **Reason:** Product requested graphical/layout alignment of Forecast Entry to the approved Petyr MVP Rendering without reverting to mock data, changing forecast semantics, or losing editing behavior.
- **Impact:** UI/layout only for `/forecasting/entry`. Forecast Entry still reads and saves through the existing Petyr services and APIs, keeps Closed revenue and AI Forecast read-only, preserves monthly editability rules, note enforcement, active/inactive handling, change history, annual forecast saves/consolidation and the temporary Management Objectives gate. No Prisma schema, API contract, data import/export logic, Redash source usage or forecast calculations changed.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/ForecastEntryWorkspace.tsx`, `DEVLOG.md`.
- **Validation:** `docker compose build forecasting-app` passed; the Docker build ran `npx prisma generate` and `npm run build` inside the forecasting app image.
- **Follow-up:** None.

- **Area:** Petyr / Company Detail MVP visual alignment
- **Change:** Realigned the dedicated Company Detail route to the Petyr MVP Rendering visual structure: MVP-style section title/context card, KPI cards, side-by-side monthly trend and Revenue per Business Unit charts using the same Recharts visual language, MVP-style alert cards, rounded table containers, campaign evidence table and grouped change-history cards. Kept Company Detail read-only and preserved all existing real data bindings from `getCompanyDetail(...)` and `getPetyrCompanyAlerts(...)`, including company overview, CSM, active/inactive status, active/expired agreement evidence, residuals, derived agreement/deal links, Business Unit revenue, campaigns, campaign status/BU/value/cost/GM/link, monthly forecasts, annual forecasts, AI forecast cache and change history.
- **Reason:** Product requested Company Detail graphical/layout alignment to the approved Petyr MVP Rendering while retaining the already implemented service-backed data and avoiding mock/static fallback.
- **Impact:** UI/layout only for `/forecasting/company/[companyName]`. No Petyr service, API contract, Prisma schema, import/export behavior, forecast semantics, Redash source usage or routing behavior changed. Empty states remain explicit when real data is unavailable.
- **Files/documents involved:** `apps/forecasting-app/src/app/forecasting/company/[companyName]/page.tsx`, `apps/forecasting-app/src/app/forecasting/company/[companyName]/CompanyDetailCharts.tsx`, `DEVLOG.md`.
- **Validation:** `docker compose build forecasting-app` passed; the Docker build ran `npx prisma generate` and `npm run build` inside the forecasting app image.
- **Follow-up:** None.

- **Area:** Petyr / Documentation source of truth
- **Change:** Realigned Petyr documentation for the current product decisions: Company Detail and Forecast Entry are visual/layout alignment work against the Petyr MVP Rendering golden master; Management Objectives are already added/configured and new objective tasks should be limited to specific bugs; manager-only RBAC and Excel import performance are out of scope for this cycle; Initial Forecast consolidation from 2027 onward now uses January 1 in `Europe/Rome`; AI Forecasting MVP is manual, company-by-company, hybrid baseline/signals/LLM reasoning, future-month-only and cache-only; complete anonymization is deferred to a future tool/API while remaining a production hardening TODO.
- **Reason:** Product decisions changed after the previous Petyr source-of-truth update and needed to be captured before any implementation work.
- **Impact:** Documentation only. No application code, UI, Prisma schema, database migration, import behavior or external AI call was changed.
- **Files/documents involved:** `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/petyr/AI_FORECASTING_DESIGN.md`, `docs/05_forecasting_product_spec.md`, `docs/petyr/03_petyr_business_rules.md`, `docs/petyr/00_petyr_context.md`, `README.md`, `apps/forecasting-app/README.md`, `BACKLOG.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Follow-up:** Resolve the future anonymization service/tool, AI model/confidence/output-validation/cache-versioning TODOs and Initial Forecast scheduler/target-year cutoff TODOs before broader production rollout.

## 2026-05-25

- **Area:** Petyr / AI Forecasting design
- **Change:** Added a dedicated AI Forecasting design document covering anonymized/minimized LLM inputs, forbidden identifying fields, deterministic temporary pseudonyms, server-side pseudonym mapping, payload and response schemas, future-month eligibility, `ai_forecast_cache` persistence rules, progressive batch strategy, failure handling, logging and privacy checklist. Linked the design from the Petyr product source of truth, added an accepted privacy/month-scope decision and opened backlog TODOs for model selection, confidence threshold, batch size, output validation and append-only cache versioning.
- **Reason:** Petyr AI Forecasting must be designed seriously before implementation, especially around privacy, data minimization and protection from modifying past or historical AI forecast months.
- **Impact:** Documentation only. No production LLM calls were implemented, no existing AI forecast behavior was modified, no data was sent externally and no database schema changed.
- **Files/documents involved:** `docs/petyr/AI_FORECASTING_DESIGN.md`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/04_data_model.md`, `docs/05_forecasting_product_spec.md`, `BACKLOG.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Follow-up:** Resolve the AI Forecasting backlog TODOs before enabling production AI forecast generation.

- **Area:** Petyr / Management View diagnostics placement
- **Change:** Removed inline denominator/diagnostic note rendering from the Management View Branch and Business Unit aggregate rows while keeping `Initial Forecast` and `Ongoing Forecast` values in the approved management cards and Yearly Branch table. Diagnostics continue to flow through the floating `Data diagnostics` menu and `/petyr-admin` Data Health.
- **Reason:** Management View diagnostics must not appear as tabular/row columns; forecast comparison should stay visible without confusing Initial/Ongoing Forecast with Yearly Objective.
- **Impact:** The Management View remains read-only and keeps the existing aggregate layout as stable as possible. Missing Initial Forecast snapshots still render as `n/a` and emit non-invasive diagnostics through the existing diagnostics surfaces.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/PetyrMVPRendering.tsx`, `apps/forecasting-app/src/services/petyrApprovedRenderingAdapter.ts`, `apps/forecasting-app/src/types/petyrApprovedRendering.ts`, `DEVLOG.md`.
- **Follow-up:** None.

- **Area:** Petyr / Company Detail revenue by Business Unit
- **Change:** Added an inline `Revenue by Business Unit` chart to the dedicated Company Detail route using the existing `getCompanyDetail(companyName, year)` Business Unit summary. The chart shows closed revenue bars by Business Unit, adds forecast-vs-closed comparison bars only when annual or monthly forecast data exists, and keeps the numeric table underneath with planned future and forecast source values.
- **Reason:** Users need Business Unit revenue evidence directly in Company Detail without navigating away, while Company Detail remains read-only.
- **Impact:** Company Detail now visualizes PostgreSQL/Redash-derived Business Unit revenue in-page and shows a diagnostic empty state when no closed revenue or forecast values exist for charting. No forecast editing, schema, import/export or Redash integration behavior changed.
- **Files/documents involved:** `apps/forecasting-app/src/app/forecasting/company/[companyName]/page.tsx`, `docs/05_forecasting_product_spec.md`, `DEVLOG.md`.
- **Follow-up:** None.

- **Area:** Petyr / Forecast Entry sparse save hardening
- **Change:** Hardened Forecast Entry save handling so no-op saves return `No changes detected` without creating a `forecast_save_session`, unchanged Business Unit values and unchanged active/inactive status are skipped before audit logging, status-only saves update `company_forecast_status` and write only the status change log, and status history now records the resolved previous active/inactive value.
- **Reason:** Forecast Entry change history must stay sparse and truthful: only effective Business Unit value changes and real active/inactive status changes should be saved or logged.
- **Impact:** Save attempts with no effective changes no longer create noisy sessions or status updates. Active/inactive-only saves remain possible without forecast value changes. Forecast note enforcement remains tied to real monthly forecast value changes.
- **Files/documents involved:** `apps/forecasting-app/src/services/forecastEntryService.ts`, `apps/forecasting-app/src/components/petyr/ForecastEntryWorkspace.tsx`, `DEVLOG.md`.
- **Follow-up:** None.

- **Area:** Petyr / Forecast Entry and admin export status audit
- **Change:** Updated monthly Excel and legacy CSV forecast exports to emit known company forecast status as `active` or `inactive`, leaving the status cell blank only when no status is configured. Forecast Entry now saves active/inactive-only changes without requiring modified forecast values, writes a `forecast_change_log` row with `field_name=companyActiveStatus` only when the status actually changes, and submits/logs only Business Units whose editable forecast value was changed by the user.
- **Reason:** Product defined the external Excel/CSV status format as `active`, `inactive`, or blank = do not modify, while internal DB/API remains boolean. Forecast Entry history must stay sparse and truthful for active/inactive changes and Business Unit edits.
- **Impact:** Exported workbooks/templates show the current known status. A status-only Forecast Entry save produces only the status change log, and a one-BU edit produces only that BU log. Unchanged BU values and unchanged active/inactive status are not logged.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrMonthlyForecastExcelService.ts`, `apps/forecasting-app/src/services/petyrMonthlyTemplateExportService.ts`, `apps/forecasting-app/src/services/forecastEntryService.ts`, `apps/forecasting-app/src/components/petyr/ForecastEntryWorkspace.tsx`, `apps/forecasting-app/src/app/forecasting/company/[companyName]/page.tsx`, `BACKLOG.md`, `DEVLOG.md`.
- **Follow-up:** None.

- **Area:** Petyr / Admin Excel monthly forecast import
- **Change:** Refined the optimized Excel monthly import so note text cannot turn an otherwise unchanged `active`/`inactive` row into a real import. Status rows now upsert and log only when the submitted status value differs from `company_forecast_status.is_active`; note-only rows and rows whose only difference is status reason text remain unchanged/skipped. The generated workbook validation copy now states that note-only rows do not create imports.
- **Reason:** Monthly Excel import must process only real editable value changes, keep unchanged imports fast, and avoid creating upserts or change-log rows for unchanged forecast/status values.
- **Impact:** `active` still writes `company_forecast_status.is_active = true`, `inactive` still writes `false`, blank still leaves status untouched, and invalid status values still return readable validation errors. Closed revenue, AI Forecast and monthly forecast semantics are unchanged.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrMonthlyForecastImportService.ts`, `apps/forecasting-app/src/services/petyrMonthlyForecastExcelService.ts`, `DEVLOG.md`.
- **Follow-up:** None.

## 2026-05-22

- **Area:** Petyr / Agreement links and alerts
- **Change:** Derived Company Detail agreement links from linked Master Campaigns deal links, exposed `agreementDealLink` on agreement read models, removed the obsolete Master Agreements link warning, and added the `expiredAgreementWithResidual` rule-based alert category. Expired agreements with positive residual now stay out of `agreement expiring within 60 days`, appear as a separate alert/action category with Italian-formatted residual amounts, and can show the derived deal link when available.
- **Reason:** Master Agreements has no usable agreement URL, while users can operate from linked campaign deal links; expired residuals need visibility without being mixed into expiring-soon warnings.
- **Impact:** Company Detail agreement rows now show `Deal link` or `n/a`, Company Detail has a read-only rule-based alerts section, CSM Overview/approved urgent actions can surface expired residuals separately, and Petyr still reads only PostgreSQL materialized data.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrDataService.ts`, `apps/forecasting-app/src/services/petyrAlertService.ts`, `apps/forecasting-app/src/services/petyrApprovedRenderingAdapter.ts`, `apps/forecasting-app/src/services/petyrDataHealthService.ts`, `apps/forecasting-app/src/app/forecasting/company/[companyName]/page.tsx`, `apps/forecasting-app/src/components/petyr/CsmOverviewWorkspace.tsx`, `apps/forecasting-app/src/components/petyr/PetyrMVPRendering.tsx`, `apps/forecasting-app/src/types/petyrApprovedRendering.ts`, `docs/petyr/COMPANY_ORDERING.md`, `BACKLOG.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Follow-up:** Revisit the agreement link tie-breaker only if future normalized facts expose canonical agreement, campaign or deal ids.

- **Area:** Petyr / Initial Forecast baseline
- **Change:** Added dedicated Initial Forecast persistence with `forecast_annual_snapshot` and `forecast_annual_snapshot_change_log`, a separate Initial Forecast Excel export/import flow under `/petyr-admin`, dedicated API routes for export/import, and a protected manual consolidation endpoint backed by `consolidateInitialAnnualForecast(year)`. Management View now reads `Initial Forecast` from frozen snapshot rows while `Ongoing Forecast` continues to read current/latest `forecast_annual` rows.
- **Reason:** 2026 needs a one-time manually compiled Initial Forecast baseline, and 2027+ needs a frozen baseline that does not mutate as ongoing annual forecasts change.
- **Impact:** Monthly forecast Excel import/export is unchanged. Initial Forecast imports write only annual snapshot/audit rows and do not update monthly forecast, ongoing annual forecast, closed revenue, AI forecast cache or Management Objectives. This entry's original December 31 scheduling note has been superseded by the January 1 `Europe/Rome` decision documented on 2026-05-26; the real scheduler mechanism remains a backlog item.
- **Files/documents involved:** `apps/forecasting-app/prisma/schema.prisma`, `apps/forecasting-app/src/services/petyrInitialAnnualForecastService.ts`, `apps/forecasting-app/src/services/petyrInitialForecastExcelService.ts`, `apps/forecasting-app/src/services/petyrDataService.ts`, `apps/forecasting-app/src/services/petyrDataHealthService.ts`, `apps/forecasting-app/src/app/api/petyr/admin/export-initial-forecast-xlsx/route.ts`, `apps/forecasting-app/src/app/api/petyr/admin/import-initial-forecast-xlsx/route.ts`, `apps/forecasting-app/src/app/api/petyr/admin/consolidate-initial-forecast/route.ts`, `apps/forecasting-app/src/components/petyr/PetyrInitialForecastExcelWorkflow.tsx`, `apps/forecasting-app/src/app/petyr-admin/page.tsx`, `apps/forecasting-app/README.md`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/04_data_model.md`, `docs/05_forecasting_product_spec.md`, `docs/petyr/02_petyr_data_model_target.md`, `docs/petyr/03_petyr_business_rules.md`, `BACKLOG.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Follow-up:** Select and implement the production scheduler/timezone for automatic year-end consolidation.

- **Area:** Petyr / Data diagnostics UI
- **Change:** Moved `/forecasting` rendering diagnostics out of the main dashboard body into a fixed bottom-right `Data diagnostics` menu. The closed menu shows warning counts and highlights blocking issues; the open panel groups blocking issues, warnings and info diagnostics in a scrollable panel and links to `/petyr-admin` Data Health.
- **Reason:** Data diagnostics must remain available without taking over the Management View forecasting workspace.
- **Impact:** No data services, calculations, Admin/Data Health diagnostics, imports, exports or database schema changed. The approved `/forecasting` dashboard body is less invasive while preserving diagnostic visibility.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/PetyrFloatingDiagnosticsMenu.tsx`, `apps/forecasting-app/src/components/petyr/PetyrMVPRendering.tsx`, `docs/05_forecasting_product_spec.md`, `DEVLOG.md`.
- **Follow-up:** None.

- **Area:** Petyr / Dashboard navigation
- **Change:** Changed the top-level `/forecasting` menu so `Company Detail` and `Forecast Entry` open the complete dedicated routes directly instead of rendering partial golden-master preview tabs. The dashboard now pre-populates Forecast Entry with the first available company/CSM/current year/current month context and opens Company Detail with the selected-year query when company data exists. Updated related link copy to use `Edit forecast` from Company Detail and `View full company detail` for residual preview links.
- **Reason:** Users should reach the real operational Forecast Entry and full analytical Company Detail from the dashboard menu without a confusing second step or partial read-only preview that resembles an editable/detail workspace.
- **Impact:** Management View and CSM Overview rendering remain unchanged. Monthly forecast editing stays centralized in `/forecasting/entry`, and Company Detail remains the complete read-only company evidence page.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/PetyrMVPRendering.tsx`, `apps/forecasting-app/src/app/forecasting/company/[companyName]/page.tsx`, `docs/05_forecasting_product_spec.md`, `DEVLOG.md`.
- **Follow-up:** None.

- **Area:** Petyr / Documentation source of truth
- **Change:** Realigned Petyr documentation with the current data-bound state and added product decisions for Initial Forecast 2026 bootstrap, automatic Initial Forecast freezing from 2027 onward, agreement/deal link derivation from Master Campaigns, expired agreements with residual, active/inactive Excel semantics, changed-only Forecast Entry logging, monthly import stability, company ordering and AI Forecast privacy/anonymization.
- **Reason:** Product decisions emerged that affect future Petyr behavior and must live in repository Markdown before implementation.
- **Impact:** Documentation only. No application code, UI, Prisma schema, database migration or import behavior changed in this task.
- **Files/documents involved:** `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `docs/petyr/00_petyr_context.md`, `docs/petyr/01_petyr_architecture.md`, `docs/petyr/03_petyr_business_rules.md`, `docs/petyr/04_codex_prompts_petyr.md`, `docs/petyr/COMPANY_ORDERING.md`, `apps/forecasting-app/AGENTS.md`, `BACKLOG.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Follow-up:** Resolve scheduler/timezone/manual-fallback TODOs; implement the separate 2026 Initial Forecast import; verify active/inactive export status; implement agreement/deal link derivation and expired-residual alert category.

- **Area:** Petyr / Local Prisma schema sync
- **Change:** Added explicit local/dev npm helpers for Prisma schema synchronization before Petyr builds: `db:generate`, `db:sync` and `build:sync`. Updated Management Objective missing-table diagnostics to point to `npm run db:sync`. Kept `build` unchanged and kept `db:push` on Petyr's safe wrapper instead of raw `prisma db push`.
- **Reason:** Local databases can lag behind the Prisma schema, producing warnings such as missing `management_objective` tables; operators should not need to remember separate Prisma commands before every local/dev build.
- **Impact:** No product logic, Prisma schema or production/CI build behavior changed. Local/dev users can run `npm run build:sync` from `apps/forecasting-app` when they explicitly want Prisma client generation, safe DB push and build in one command.
- **Files/documents involved:** `apps/forecasting-app/package.json`, `apps/forecasting-app/src/services/petyrManagementObjectiveService.ts`, `apps/forecasting-app/src/services/petyrDataHealthService.ts`, `apps/forecasting-app/src/app/petyr-admin/page.tsx`, `README.md`, `apps/forecasting-app/README.md`, `DEPLOY.md`, `docs/04_data_model.md`, `docs/05_forecasting_product_spec.md`, `docs/08_operational_commands.md`, `docs/petyr/02_petyr_data_model_target.md`, `DEVLOG.md`.
- **Follow-up:** None.

- **Area:** Petyr / Numeric formatting runtime compatibility
- **Change:** Replaced Petyr's user-visible number formatter dependency on `Intl.NumberFormat` with deterministic Italian grouping and decimal rendering in the shared Petyr formatter.
- **Reason:** Regression testing in the Alpine Node runtime showed `Intl.NumberFormat("it-IT")` rendering decimal commas but omitting thousands separators, producing values such as `4146,45 â‚¬` instead of `4.146,45 â‚¬`.
- **Impact:** Monetary, percentage, decimal and integer formatter helpers now render thousands with `.` and decimals with `,` consistently across runtimes. No UI layout or product logic changed.
- **Files/documents involved:** `apps/forecasting-app/src/lib/petyr/formatters.ts`, `DEVLOG.md`.
- **Follow-up:** None.

- **Area:** Petyr / Numeric formatting and Excel export
- **Change:** Centralized Petyr numeric formatting so user-visible monetary values, percentages and decimal values render with Italian separators and exactly two decimals (`1.234.567,89 â‚¬`, `12,34%`, `1.234,56`). Applied the formatter across Management View, Yearly Branch, Monthly Aggregate, Business Unit View, Single CSM View, Revenue per Business Unit, CSM Overview, Forecast Entry, Annual Forecast, Management Objectives, Company Detail, Petyr Admin summaries, alert/tooltip text and chart value labels. Updated the Excel monthly forecast workbook to keep numeric cells numeric while applying a compatible euro-suffix money format.
- **Reason:** Petyr needs one consistent product formatting rule for financial, percentage and decimal values across UI, charts, imports/exports and summaries.
- **Impact:** Missing numeric values render as `n/a`; real zero values render as `0,00` or `0,00 â‚¬`. Technical IDs, years, months and row/import counts remain integer-style where appropriate. Excel forecast values stay importable/editable as numeric cells.
- **Files/documents involved:** `apps/forecasting-app/src/lib/petyr/formatters.ts`, `apps/forecasting-app/src/components/petyr/PetyrMVPRendering.tsx`, `apps/forecasting-app/src/components/petyr/ForecastEntryWorkspace.tsx`, `apps/forecasting-app/src/components/petyr/CsmOverviewWorkspace.tsx`, `apps/forecasting-app/src/components/petyr/ManagementObjectivesWorkspace.tsx`, `apps/forecasting-app/src/components/petyr/PetyrMonthlyForecastExcelWorkflow.tsx`, `apps/forecasting-app/src/components/petyr/PetyrAiModelSettingsForm.tsx`, `apps/forecasting-app/src/app/forecasting/company/[companyName]/page.tsx`, `apps/forecasting-app/src/app/petyr-admin/page.tsx`, `apps/forecasting-app/src/services/petyrApprovedRenderingAdapter.ts`, `apps/forecasting-app/src/services/petyrAlertService.ts`, `apps/forecasting-app/src/services/petyrDataService.ts`, `apps/forecasting-app/src/services/petyrMonthlyForecastExcelService.ts`, `apps/forecasting-app/src/services/petyrMonthlyForecastImportService.ts`, `apps/forecasting-app/src/services/forecastEntryService.ts`, `apps/forecasting-app/src/services/annualForecastService.ts`, `apps/forecasting-app/src/services/petyrManagementObjectiveService.ts`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/petyr/03_petyr_business_rules.md`, `DEVLOG.md`.
- **Follow-up:** None.

- **Area:** Petyr / Agreement alerts and urgent actions
- **Change:** Tightened agreement expiry alert generation so `agreement expiring within 60 days` includes only agreements with expiry date from today through the next 60 days. Expired agreements are excluded from the standard expiring-soon urgent action, high-residual operational alerts now use active non-expired agreement residual values, and Company Detail displays `Expired` for agreements whose expiry date is already in the past while keeping those rows visible.
- **Reason:** Expired agreements are already too late for the standard operational â€œagreement expiringâ€ warning and must remain historical/status data instead of urgent actions.
- **Impact:** CSM Overview urgent actions and rule-based Petyr alerts no longer surface already-expired agreements as expiring soon or high-residual operational actions. Company Detail continues to show expired agreement rows with clear status.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrDataService.ts`, `apps/forecasting-app/src/services/petyrAlertService.ts`, `apps/forecasting-app/src/services/petyrApprovedRenderingAdapter.ts`, `docs/05_forecasting_product_spec.md`, `docs/petyr/03_petyr_business_rules.md`, `BACKLOG.md`, `DEVLOG.md`.
- **Follow-up:** Product later accepted the separate `Expired agreement with residual` category on 2026-05-22; implementation remains a future task.

- **Area:** Petyr / Management View annual forecast comparison
- **Change:** Replaced the single Management View `Forecast` display with `Initial Forecast` and `Ongoing Forecast` for Yearly View Â· Branch, Business Unit View and Single CSM View, and removed the tabular `Diagnostic` column from the Yearly Branch table. Management aggregate data now exposes `initialForecast` and `ongoingForecast`; `Ongoing Forecast` uses current `forecast_annual` rows when available, while `Initial Forecast` renders as `n/a` until the frozen baseline source is implemented.
- **Reason:** Product needed to compare an initial annual baseline with the current/latest annual forecast without confusing either value with Yearly Objective or inventing missing baselines. The baseline source was later clarified as 2026 one-shot bootstrap and 2027+ automatic freeze.
- **Impact:** Management View keeps the approved golden master structure as stable as possible while adding the requested annual forecast comparison. Diagnostics remain available through the existing Data diagnostics panel and `/petyr-admin` Data Health warning, not as a table column.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrDataService.ts`, `apps/forecasting-app/src/services/petyrApprovedRenderingAdapter.ts`, `apps/forecasting-app/src/types/petyrApprovedRendering.ts`, `apps/forecasting-app/src/components/petyr/PetyrMVPRendering.tsx`, `apps/forecasting-app/src/services/petyrDataHealthService.ts`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `docs/petyr/03_petyr_business_rules.md`, `BACKLOG.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Follow-up:** Implement the documented 2026 bootstrap and 2027+ automatic freeze before replacing `n/a` with frozen Initial Forecast values.

## 2026-05-21

- **Area:** Petyr / Company Detail
- **Change:** Extended `getCompanyDetail(companyName, year)` so Company Detail exposes year-filtered Company Campaigns and a richer Revenue by Business Unit summary. The BU summary now includes closed revenue, planned future Redash campaign revenue, a forecast value when annual or monthly forecast rows exist, and a visible diagnostic when missing/unknown/non-official campaign Business Units are grouped as `Other`. Company Campaigns now show campaign status, Business Unit, agreement name/link when available, value/revenue, costs, GM%, start/end dates and campaign link, with agreement shown as `n/a` when absent.
- **Reason:** Company Detail must be directly useful without forcing users to navigate elsewhere for revenue by Business Unit or company campaign evidence.
- **Impact:** Company Detail remains read-only and continues to read PostgreSQL/Redash materialized data plus Petyr forecast tables. Campaign rows are filtered by selected year using mapped campaign end date; if no campaigns match, the page shows `No campaigns found for this company and selected year.` instead of placeholder rows.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrDataService.ts`, `apps/forecasting-app/src/app/forecasting/company/[companyName]/page.tsx`, `BACKLOG.md`, `DEVLOG.md`.
- **Follow-up:** Product later decided on 2026-05-22 that agreement/deal links must be derived from linked Master Campaigns deal links; implementation remains a future task.

- **Area:** Petyr / Forecast Entry Management Objectives
- **Change:** Exposed the full `Management Objectives` workflow inline at the bottom of Forecast Entry's Annual Forecast area, replacing the bottom link-only entry point. The default block shows title, description, password input and unlock button; the exact temporary password `Pippo` unlocks Branch Objectives and Business Unit Objectives, while wrong passwords keep objectives hidden with a clear error. The same reusable component still powers `/forecasting/entry/objectives`, and the objective API now checks the hardcoded temporary password instead of `PETYR_MANAGEMENT_OBJECTIVES_PASSWORD`.
- **Reason:** Management needs to enter annual Branch and Business Unit objectives directly from the Annual Forecast area before manager-only RBAC exists.
- **Impact:** Branch objectives still come dynamically from Company Ownership, Business Unit objectives still use the official list, missing values still display `n/a`, saves continue to persist in `management_objective` / `management_objective_change_log`, and Management View can use saved objectives. The hardcoded password is provisional, client-visible, not a sensitive secret and not real security.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/ForecastEntryWorkspace.tsx`, `apps/forecasting-app/src/components/petyr/ManagementObjectivesWorkspace.tsx`, `apps/forecasting-app/src/app/forecasting/entry/objectives/page.tsx`, `apps/forecasting-app/src/lib/petyr/managementObjectivesAccess.ts`, `.env.example`, `apps/forecasting-app/.env.example`, `apps/forecasting-app/README.md`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `PETYR_DOCUMENTATION_AND_HANDOFF_RULES.md`, `docs/05_forecasting_product_spec.md`, `docs/petyr/03_petyr_business_rules.md`, `BACKLOG.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Follow-up:** Replace the temporary `Pippo` gate with manager-only RBAC from the shared access-control layer.

- **Area:** Petyr / Forecast Entry UX and Management Objectives access
- **Change:** Made `/forecasting/entry` directly navigable without manually supplied query parameters, added CSM selection plus previous/next company navigation to Forecast Entry, kept monthly editability driven by the centralized timing rule with clearer locked/editable messaging, moved the Management Objectives entry point to the bottom of the Annual Forecast area, and temporarily protected Management Objectives page/API access with `PETYR_MANAGEMENT_OBJECTIVES_PASSWORD`.
- **Reason:** Forecast Entry must be the obvious and only monthly CSM forecast editing area, while CSM Overview, Company Detail, Management View, Closed revenue and AI Forecast remain read-only. Management Objectives need to stay visually connected to Annual Forecast without being confused with CSM annual forecast values.
- **Impact:** Users can open `/forecasting/entry` and choose CSM, company, year and month in the page. Editable months expose only the allowed forecast field; locked months show the reason. Annual Forecast remains in Forecast Entry, and Management Objectives require the temporary password until manager-only RBAC is implemented.
- **Files/documents involved:** `apps/forecasting-app/src/app/forecasting/entry/page.tsx`, `apps/forecasting-app/src/components/petyr/ForecastEntryWorkspace.tsx`, `apps/forecasting-app/src/app/forecasting/entry/objectives/page.tsx`, `apps/forecasting-app/src/components/petyr/ManagementObjectivesWorkspace.tsx`, `apps/forecasting-app/src/app/api/petyr/management-objectives/route.ts`, `apps/forecasting-app/src/lib/petyr/managementObjectivesAccess.ts`, `.env.example`, `apps/forecasting-app/.env.example`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `docs/petyr/03_petyr_business_rules.md`, `apps/forecasting-app/README.md`, `BACKLOG.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Follow-up:** Replace the temporary password gate with manager-only RBAC when the shared access-control layer is available.

- **Area:** Petyr / Data diagnostics and planned future revenue
- **Change:** Removed the obsolete `master_campaigns.branch` mapping and campaign-branch fallback so Branch attribution comes only from Company Ownership `company_branch`, tightened planned future revenue to include only `Setup` and `Recruiting`, excluded `Running`, `Completed`, `Aborted` and unknown/missing statuses from planned future diagnostics, and made Management Objective table/missing-objective warnings more actionable with schema commands and the Management Objectives route.
- **Reason:** Current diagnostics were noisy and, in the planned-future path, could include future campaign rows that product has confirmed are not planned future revenue.
- **Impact:** Management Branch grouping now uses Company Ownership when available and otherwise falls back to `Unassigned`. Closed revenue + planned no longer includes unknown planned-future statuses by fallback. Missing objective warnings remain non-blocking but point users to `/forecasting/entry/objectives`; missing objective tables now tell operators to run `npx prisma generate` and `npm run db:push` locally or deploy reviewed migrations.
- **Files/documents involved:** `apps/forecasting-app/src/config/redashFieldMapping.ts`, `apps/forecasting-app/src/services/petyrDataService.ts`, `apps/forecasting-app/src/services/petyrDataHealthService.ts`, `apps/forecasting-app/src/services/petyrManagementObjectiveService.ts`, `apps/forecasting-app/src/app/petyr-admin/page.tsx`, `apps/forecasting-app/src/app/api/petyr/admin/data-health/route.ts`, `docs/05_forecasting_product_spec.md`, `docs/petyr/03_petyr_business_rules.md`, `BACKLOG.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Follow-up:** None for the current status taxonomy. Add a new documented decision if the business later wants more statuses included in planned future.

- **Area:** Petyr / Admin Excel forecast import
- **Change:** Optimized the Excel monthly forecast import path so `Forecast Input` rows with only identifying/template values are skipped before canonicalization, existing forecast/status rows are loaded in batch before opening a transaction, unchanged values no longer trigger upserts or change logs, no-change imports return a clear "No changes detected. Nothing was imported." result, changed rows are written in controlled chunks, and the admin Excel UI now shows importable/changed/unchanged row counts plus duration.
- **Reason:** Excel imports were functionally correct but could spend several minutes processing the full workbook and issuing per-row/per-cell DB work even when only one editable value changed.
- **Impact:** Closed revenue and AI Forecast remain read-only and ignored by import. Forecast semantics and the approved Management View/golden master rendering are unchanged. Invariant workbooks complete without save sessions, upserts or change logs; single-change imports write only the changed value and its audit row.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrMonthlyForecastExcelService.ts`, `apps/forecasting-app/src/services/petyrMonthlyForecastImportService.ts`, `apps/forecasting-app/src/components/petyr/PetyrMonthlyForecastExcelWorkflow.tsx`, `DEVLOG.md`.
- **Follow-up:** Consider moving very large admin imports to an asynchronous job with polling if operators still need browser-visible progress during long real-change batches.

- **Area:** Petyr / Closed revenue semantics
- **Change:** Aligned Company Overview, CSM Overview, Company Detail monthly trend and Business Unit revenue summaries with the existing Management closed-revenue eligibility rule. These read models now exclude future planned campaigns and clearly invalid/planning-only statuses from Closed revenue/YTD values, matching the Management aggregate behavior that sums closed campaign revenue only from the selected year's start through today.
- **Reason:** Final Petyr verification found that Management aggregates were already using the correct Closed revenue YTD filter, while some supporting read models still counted all selected-year campaign rows as closed revenue.
- **Impact:** Approved UI layout and rendering structure are unchanged. Read-only Closed revenue values in supporting views now better match the documented source of truth; planned future revenue remains separate and continues to use Redash planned campaign logic only for Closed revenue + planned.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrDataService.ts`, `DEVLOG.md`.
- **Follow-up:** None.

- **Area:** Petyr / CSM Overview rule-based urgent actions
- **Change:** Updated the approved `/forecasting` golden master adapter so CSM Overview urgent actions are built from the deterministic `petyrAlertService` alert output instead of the simplified workspace action buckets. The rendering now receives source-backed rule-based alert groups for agreement expiry within 60 days, high residuals, inactive companies, missing forecast updates, locked past months, Business Units below historical pace and CSM forecast below AI forecast when those data points exist. Empty scopes show a neutral "No urgent actions for the selected scope." state.
- **Reason:** Recent audit found that the golden master CSM Overview still used local/simplified action items while source-backed rule-based alert data already existed.
- **Impact:** The approved card/list structure remains read-only and unchanged visually, but urgent action content now comes from PostgreSQL-backed services through the adapter. No LLM-generated alerts were added.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrApprovedRenderingAdapter.ts`, `apps/forecasting-app/src/types/petyrApprovedRendering.ts`, `apps/forecasting-app/src/components/petyr/PetyrMVPRendering.tsx`, `DEVLOG.md`.
- **Follow-up:** None.

- **Area:** Petyr / Forecast Entry traceability
- **Change:** Made the CSM save note mandatory when Forecast Entry saves effective monthly forecast value changes. The client now shows a clear error and skips the save request when changed forecast values have an empty note, and the save service rejects changed monthly forecast payloads with HTTP 400 when `note` is empty, `null` or whitespace. Notes continue to be stored on `forecast_save_session`.
- **Reason:** Audit found that Forecast Entry already creates save sessions and change logs but allowed monthly forecast changes without the CSM context required for traceability.
- **Impact:** Forecast Entry monthly forecast changes cannot be saved without a CSM note. Closed revenue and AI Forecast remain read-only, read-only routes do not require notes, and monthly editability timing is unchanged.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/ForecastEntryWorkspace.tsx`, `apps/forecasting-app/src/services/forecastEntryService.ts`, `docs/05_forecasting_product_spec.md`, `DEVLOG.md`.
- **Follow-up:** None.

## 2026-05-15

- **Area:** Petyr / Data quality diagnostics
- **Change:** Centralized planned future campaign eligibility in `isValidPlannedFutureCampaign(...)`, excluded known invalid future campaign statuses from Planned through year end, added diagnostics for missing/unrecognized/fallback-included/excluded planned future statuses, and made Business Unit fallback to `Other` explicit in Petyr service diagnostics, Data Health warnings and Excel closed-revenue reference export warnings.
- **Reason:** Recent audit found that Closed revenue + planned could include cancelled/non-valid future campaigns and that missing/unknown Business Units were normalized to `Other` without an explicit diagnostic.
- **Impact:** Approved UI layout and rendering structure are unchanged. Planned future revenue no longer includes clearly invalid future campaign statuses. Missing, unknown or unofficial Business Unit values still fall back to `Other` functionally, but now surface as warnings/diagnostics instead of being silent.
- **Files/documents involved:** `apps/forecasting-app/src/lib/petyr/constants.ts`, `apps/forecasting-app/src/services/petyrDataService.ts`, `apps/forecasting-app/src/services/petyrDataHealthService.ts`, `apps/forecasting-app/src/services/petyrMonthlyForecastExcelService.ts`, `docs/05_forecasting_product_spec.md`, `BACKLOG.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Follow-up:** Confirm the exact Redash campaign status taxonomy for valid planned future revenue, then tighten the fallback if the business wants a closed allowlist.

- **Area:** Petyr / Golden master rendering truthfulness
- **Change:** Neutralized misleading static insight copy in `PetyrMVPRendering.tsx`, replaced fake AI-note generation from local risk/status strings with explicit AI-note unavailable states, wired CSM urgent actions from the PostgreSQL-backed CSM overview service, marked Company Detail and Forecast Entry golden-master tabs as partial previews where full campaign/history/AI cache data is not loaded, and changed the local `buildProgressMetrics` fallback so it no longer uses future CSM forecast as planned-through-year-end.
- **Reason:** Recent audit found that the approved Petyr rendering was data-bound but still contained static/preview text that could be interpreted as real trend, AI or opportunity analysis.
- **Impact:** The approved visual structure remains intact, but unavailable narrative insights, AI notes, company campaign rows and company-level historical Business Unit rows now show neutral unavailable/preview states instead of fake or ambiguous analysis. Real planned-through-year-end values still come from adapter/service metrics; local fallback renders `n/a`.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/PetyrMVPRendering.tsx`, `apps/forecasting-app/src/services/petyrApprovedRenderingAdapter.ts`, `apps/forecasting-app/src/types/petyrApprovedRendering.ts`, `DEVLOG.md`.
- **Follow-up:** Connect Company Detail preview sections to full `getCompanyDetail` data or keep directing users to the dedicated `/forecasting/company/[companyName]` route; connect AI-note rendering only after AI cache/alert-service notes exist.

- **Area:** Petyr / Admin Excel forecast import-export
- **Change:** Added Excel-first monthly forecast export/import for `/petyr-admin` with `GET /api/petyr/admin/export-monthly-forecast-xlsx` and `POST /api/petyr/admin/import-monthly-forecast-xlsx`. The workbook defaults the admin UI to 2026, contains `Instructions`, `Forecast Input`, `Reference - Business Units`, `Reference - Companies` and `Validation Rules`, includes read-only Closed revenue and AI forecast references, and imports only CSM-owned previous-month forecast, ongoing forecast, company active status and notes. CSV import/export remains available as a legacy/advanced workflow.
- **Reason:** Admin users need a cleaner CSM-friendly Excel workflow for historical 2026 input and bulk monthly forecast updates instead of CSV as the primary format.
- **Impact:** Excel imports create Petyr forecast save sessions and change logs with source `Admin Excel Import`; Closed revenue from Redash and AI Forecast cache values are never imported or overwritten. Import validation now rejects negative forecast values and reports warnings/problem-row previews for Excel uploads.
- **Files/documents involved:** `apps/forecasting-app/package.json`, `apps/forecasting-app/src/services/petyrMonthlyForecastExcelService.ts`, `apps/forecasting-app/src/services/petyrMonthlyForecastImportService.ts`, `apps/forecasting-app/src/services/petyrCompanyOwnershipService.ts`, `apps/forecasting-app/src/app/api/petyr/admin/export-monthly-forecast-xlsx/route.ts`, `apps/forecasting-app/src/app/api/petyr/admin/import-monthly-forecast-xlsx/route.ts`, `apps/forecasting-app/src/components/petyr/PetyrMonthlyForecastExcelWorkflow.tsx`, `apps/forecasting-app/src/app/petyr-admin/page.tsx`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `apps/forecasting-app/README.md`, `DECISIONS.md`, `BACKLOG.md`, `DEVLOG.md`.
- **Follow-up:** Define RBAC/row-level access scoping and any stronger worksheet protection rules before exposing this workflow outside trusted internal admin usage.

- **Area:** Petyr / Management View objective binding
- **Change:** Tightened Management View objective handling so Branch and Business Unit denominators come only from persisted `management_objective` rows, dynamic Branches from Company Ownership are seeded into management aggregates, missing Branch/BU objectives produce non-blocking diagnostics, and missing Yearly View Branch objectives render as `n/a` instead of `â‚¬0`. Extended Data Health with Management Objective counts by year and current-year Branch/BU missing-objective lists.
- **Reason:** Management View must consume objectives saved through Management Objectives, keep forecast values separate from management targets and avoid invented percentages when objectives are absent.
- **Impact:** Annual forecast remains the Forecast column and is not used as an objective. Branch/BU percentages are calculated only when the saved objective is greater than zero. Single CSM View still has no invented CSM target. `/petyr-admin` now surfaces objective coverage alongside Redash/materialization diagnostics.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrDataService.ts`, `apps/forecasting-app/src/services/petyrDataHealthService.ts`, `apps/forecasting-app/src/app/api/petyr/admin/data-health/route.ts`, `apps/forecasting-app/src/app/petyr-admin/page.tsx`, `apps/forecasting-app/src/components/petyr/PetyrMVPRendering.tsx`, `docs/05_forecasting_product_spec.md`, `DEVLOG.md`.
- **Follow-up:** Management/Finance still needs to enter missing yearly objective values through Management Objectives; manager-only RBAC remains tracked separately.

- **Area:** Petyr / Management Objectives implementation
- **Change:** Added `/forecasting/entry/objectives` as a separate Management Objectives area linked from Forecast Entry, with year selection, Branch objectives from Company Ownership, official Business Unit objectives, per-row value/note saves and neutral RBAC notice. Added `GET/POST /api/petyr/management-objectives`, `management_objective` persistence, `management_objective_change_log` audit rows and wired management aggregate denominators to persisted Branch/Business Unit objectives.
- **Reason:** Annual Branch and Business Unit objectives must be entered by management, remain separate from CSM forecasts and be auditable.
- **Impact:** Objective values now persist and can be updated without redesigning the approved Management View. Missing objectives still render as `n/a`; annual CSM forecast values are not used as objectives. Manager-only access enforcement remains deferred.
- **Files/documents involved:** `apps/forecasting-app/prisma/schema.prisma`, `apps/forecasting-app/src/app/forecasting/entry/objectives/page.tsx`, `apps/forecasting-app/src/app/api/petyr/management-objectives/route.ts`, `apps/forecasting-app/src/components/petyr/ManagementObjectivesWorkspace.tsx`, `apps/forecasting-app/src/components/petyr/ForecastEntryWorkspace.tsx`, `apps/forecasting-app/src/services/petyrManagementObjectiveService.ts`, `apps/forecasting-app/src/services/petyrCompanyOwnershipService.ts`, `apps/forecasting-app/src/services/petyrDataService.ts`, `docs/04_data_model.md`, `docs/05_forecasting_product_spec.md`, `docs/petyr/02_petyr_data_model_target.md`, `docs/petyr/03_petyr_business_rules.md`, `apps/forecasting-app/README.md`, `DECISIONS.md`, `BACKLOG.md`, `DEVLOG.md`.
- **Follow-up:** Implement manager-only RBAC for Management Objectives once the shared access-control layer is available.

- **Area:** Petyr / Management Objectives source of truth
- **Change:** Updated Petyr documentation so annual Branch and Business Unit objectives are management-entered values, not hardcoded config, annual forecast values or Redash-derived values. Documented the dedicated `Management Objectives` area, dynamic Branch list from Company Ownership, official closed Business Unit list, missing-objective `n/a` diagnostics and objective auditability requirements.
- **Reason:** Product direction changed from temporary hardcoded or unset yearly objectives to management-owned objective entry and updates.
- **Impact:** No runtime, UI or database schema changes in this task. Future implementation must add objective persistence, audit logging and manager-only access protection before exposing objective editing as a production workflow.
- **Files/documents involved:** `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `PETYR_DOCUMENTATION_AND_HANDOFF_RULES.md`, `docs/05_forecasting_product_spec.md`, `docs/petyr/02_petyr_data_model_target.md`, `docs/petyr/03_petyr_business_rules.md`, `BACKLOG.md`, `DECISIONS.md`, `DEVLOG.md`.
- **Follow-up:** Management Objectives storage/API/UI has been implemented. Manager-only RBAC, CSM/Manager/Admin roles and protected objective routes/APIs remain open.

## 2026-05-14

- **Area:** Petyr / Approved rendering data binding
- **Change:** Added a PostgreSQL-backed approved rendering adapter for `/forecasting`, wired `PetyrMVPRendering.tsx` through props/context, removed the inline mock constants as the primary rendering source, and surfaced adapter diagnostics when Redash materialized data or mappings are unavailable. The embedded Forecast Entry preview no longer performs local monthly edits; it links to the dedicated Forecast Entry route.
- **Reason:** Final Petyr alignment verification found that the approved rendering was still mounted without adapter data and could silently show illustrative values.
- **Impact:** `/forecasting` keeps the approved tab/layout structure while using Petyr services for management aggregates, CSM/company lists and Business Unit series. Missing data now renders diagnostics/empty values instead of silent mock values; monthly editing remains centralized in `/forecasting/entry`.
- **Files/documents involved:** `apps/forecasting-app/src/app/forecasting/page.tsx`, `apps/forecasting-app/src/components/petyr/PetyrMVPRendering.tsx`, `apps/forecasting-app/src/services/petyrApprovedRenderingAdapter.ts`, `apps/forecasting-app/src/types/petyrApprovedRendering.ts`, `apps/forecasting-app/AGENTS.md`, `DEVLOG.md`.
- **Follow-up:** Keep the existing backlog item open for restoring or replacing the missing `PETYR_DOCUMENTATION_AND_HANDOFF_RULES.md` source document.

- **Area:** Petyr / UI copy and diagnostics
- **Change:** Replaced user-facing `Worked` and `Actual` revenue wording with `Closed revenue` wording across Petyr management rendering, Forecast Entry annual progress label, CSM Overview alert labels, alert explanations, data diagnostics, AI dry-run diagnostics and Petyr documentation descriptions.
- **Reason:** Petyr's source of truth defines Redash campaign revenue as closed revenue and requires visible UI/copy to avoid the legacy `Worked`/`Actual` labels.
- **Impact:** No data semantics, layout, class names, chart structure, internal keys, database fields or forecast logic changed. Existing `worked*`, `actualRevenue` and `actuals` technical identifiers remain where renaming would be a refactor risk.
- **Files/documents involved:** `apps/forecasting-app/src/components/petyr/PetyrMVPRendering.tsx`, `apps/forecasting-app/src/components/petyr/ForecastEntryWorkspace.tsx`, `apps/forecasting-app/src/components/petyr/CsmOverviewWorkspace.tsx`, `apps/forecasting-app/src/services/petyrAlertService.ts`, `apps/forecasting-app/src/services/petyrDataService.ts`, `apps/forecasting-app/src/services/aiForecastBatchService.ts`, `apps/forecasting-app/src/lib/forecastEntryMode.ts`, `apps/forecasting-app/src/lib/forecasting/calendarRules.ts`, `apps/forecasting-app/AGENTS.md`, `docs/04_data_model.md`, `docs/petyr/00_petyr_context.md`, `docs/petyr/03_petyr_business_rules.md`, `DEVLOG.md`.
- **Follow-up:** Keep the existing backlog item open for restoring or replacing the missing `PETYR_DOCUMENTATION_AND_HANDOFF_RULES.md` source document.

- **Area:** Petyr / Forecast Entry and Company Detail
- **Change:** Re-enabled `/forecasting/entry` and `/forecasting/company/[companyName]` as real dynamic pages instead of redirects. Forecast Entry now requires explicit `companyName`, `csmName`, `year` and `month` search params, loads `getForecastEntryData(...)`, shows an empty state when params are missing/invalid, and renders the existing `ForecastEntryWorkspace`. Company Detail now loads `getCompanyDetail(companyName, year)`, renders read-only company analytics, Redash/PostgreSQL campaign and agreement data, monthly and annual forecast tables, AI forecast cache, diagnostics and forecast change history, with a link back to Forecast Entry for monthly edits.
- **Reason:** Petyr's source of truth requires Forecast Entry to be the only monthly forecast editing area and Company Detail to be analytical/read-only while still exposing real service data and history.
- **Impact:** `/forecasting/entry?...` and `/forecasting/company/<companyName>` no longer redirect to `/forecasting`; closed revenue and AI forecast values remain read-only; Forecast Entry save continues to use `/api/petyr/forecast-entry/save`; Management View and the approved `PetyrMVPRendering.tsx` were not changed.
- **Files/documents involved:** `apps/forecasting-app/src/app/forecasting/entry/page.tsx`, `apps/forecasting-app/src/app/forecasting/company/[companyName]/page.tsx`, `apps/forecasting-app/src/components/petyr/ForecastEntryWorkspace.tsx`, `docs/05_forecasting_product_spec.md`, `DEVLOG.md`.
- **Follow-up:** Keep the existing backlog item open for restoring or replacing the missing `PETYR_DOCUMENTATION_AND_HANDOFF_RULES.md` source document.

- **Area:** Petyr / Temporary admin workspace
- **Change:** Aligned the `/petyr-admin` page copy with the documented temporary admin purpose and made Redash field mapping diagnostics explicitly show `table missing` alongside `missing column`, `unmapped` and `mapped` counts.
- **Reason:** The admin page must surface all requested diagnostic states clearly while remaining separate from the approved Management View rendering.
- **Impact:** `/petyr-admin` remains server-rendered and now more directly matches the acceptance criteria for data health and mapping diagnostics. No `/forecasting` UI, approved rendering, adapters, data-binding, imports, exports or OpenRouter secrets were changed.
- **Files/documents involved:** `apps/forecasting-app/src/app/petyr-admin/page.tsx`, `DEVLOG.md`.
- **Follow-up:** Keep the existing backlog item open for restoring or replacing the missing `PETYR_DOCUMENTATION_AND_HANDOFF_RULES.md` source document.

- **Area:** Petyr / Temporary admin workspace
- **Change:** Re-enabled `/petyr-admin` as a server-rendered temporary admin page with Data Health, monthly template CSV export, monthly forecast CSV import, OpenRouter model settings and Redash field mapping diagnostics.
- **Reason:** Petyr's source of truth requires the temporary admin area to exist and not redirect to `/forecasting`, using the already implemented Petyr admin services and API routes.
- **Impact:** Internal users can now access admin diagnostics and forecast import/export workflows from `/petyr-admin`; the approved `/forecasting` rendering remains unchanged.
- **Files/documents involved:** `apps/forecasting-app/src/app/petyr-admin/page.tsx`, `apps/forecasting-app/src/components/petyr/PetyrMonthlyTemplateExportControl.tsx`, `DEVLOG.md`.
- **Follow-up:** Protect `/petyr-admin` with the future access-control layer before exposing Petyr beyond trusted internal environments.

- **Area:** Petyr / Data health diagnostics
- **Change:** Added a reusable Petyr data health service and `GET /api/petyr/admin/data-health` endpoint to inspect Redash source metadata, latest snapshots, expected materialized tables, row counts, available columns, logical field mappings, Company Ownership branch/CSM availability, blocking issues and warnings.
- **Reason:** Petyr needs a clear diagnostic of the real Redash Ingestor -> PostgreSQL materialized tables -> Petyr services -> UI data flow before `/petyr-admin` is re-enabled.
- **Impact:** No approved rendering changes. Petyr now exposes a server-side JSON diagnostic that marks missing/empty master campaigns and required closed-revenue columns as blocking while keeping agreements, ownership and optional GM/cost/link gaps as warnings.
- **Files/documents involved:** `apps/forecasting-app/src/services/petyrDataHealthService.ts`, `apps/forecasting-app/src/app/api/petyr/admin/data-health/route.ts`, `docs/05_forecasting_product_spec.md`, `docs/08_operational_commands.md`.
- **Follow-up:** Wire the reusable data health result into `/petyr-admin` once the admin area is enabled.

- **Area:** Petyr / Management data semantics
- **Change:** Added a dedicated yearly objectives config module and updated management aggregates so yearly objectives are read only from that config, annual forecast rows remain forecast values, planned-through-year-end uses campaign end dates, and company ownership fallback diagnostics are more explicit.
- **Reason:** Align Petyr with the product/data source of truth: annual forecast is not a yearly objective, CSM targets must not be invented, and campaign end date is the operational campaign date for closed/planned revenue.
- **Impact:** Branch and Business Unit percentages show `n/a` until approved hardcoded objective values are added; CSM denominators remain absent by default; management diagnostics now surface ownership fallback cases more clearly.
- **Files/documents involved:** `apps/forecasting-app/src/lib/petyr/yearlyObjectives.ts`, `apps/forecasting-app/src/services/petyrDataService.ts`, `docs/05_forecasting_product_spec.md`, `BACKLOG.md`.
- **Follow-up:** Fill approved branch/Business Unit yearly objective values after Management/Finance confirms them.

- **Area:** Platform documentation / Access Control
- **Change:** Added documentation-first overlay for the Access Control Platform.
- **Reason:** Define a controlled authentication, authorization and audit layer for future UNGUESS internal tools and agents without modifying the existing Petyr/Data Platform structure.
- **Impact:** No runtime impact. The repository now has a documented path for implementing OAuth2 Proxy + Auth API + audit logging.
- **Files/documents involved:** `docs/access-control/*`, `docs/platform/DOCUMENTATION_DRIVEN_WORKFLOW.md`, `docs/tasks/006_access_control_platform_bootstrap.md`.
- **Follow-up:** Validate stack/DB choice for `services/auth-api` before writing code.

## 2026-06-24

- **Area:** Petyr / AI Forecasting / Daily deterministic forecast
- **Change:** Moved the deterministic Daily AI Forecast default schedule from `01:00` to `02:00` in `Europe/Rome`. Added a protected Petyr Admin manual run for all active companies, backed by the same deterministic worker service and `APP_INTERNAL_SECRET`. Added global Petyr Admin baseline weights for historical weighted baseline, monthly seasonality and run-rate, with compatible fallback until configured. Changed the final deterministic AI Forecast value to round to the nearest 100 EUR while keeping planned statuses rigid and unchanged.
- **Reason:** Product requested a later overnight schedule, manual recovery from Petyr Admin, configurable Management/Finance weights and forecast values rounded to the centinaio rather than the euro.
- **Impact:** Daily AI Forecast rows saved to `ai_forecast_cache` use nearest-100 deterministic values and daily append-only model versions. Manual reruns skip rows already present for the same daily model version. Planned campaign eligibility remains `Setup` and `Recruiting` only. No CSM forecast, annual forecast, objective, closed revenue or Redash data writes are introduced.
- **Files/documents involved:** `docker-compose.yml`, `.env.example`, `apps/forecasting-app/.env.example`, `apps/forecasting-app/src/worker/nightlyDeterministicAiForecast.ts`, `apps/forecasting-app/src/services/petyrNightlyDeterministicAiForecastService.ts`, `apps/forecasting-app/src/services/petyrAiForecastStrategyService.ts`, `apps/forecasting-app/src/services/petyrAiForecastWeightsService.ts`, `apps/forecasting-app/src/app/api/petyr/admin/daily-ai-forecast/run/route.ts`, `apps/forecasting-app/src/app/api/petyr/admin/ai-forecast-weights/route.ts`, `apps/forecasting-app/src/app/petyr-admin/page.tsx`, `apps/forecasting-app/src/components/petyr/PetyrDailyAiForecastRunControl.tsx`, `apps/forecasting-app/src/components/petyr/PetyrAiForecastWeightsForm.tsx`, `apps/forecasting-app/tests/aiForecastIntelligence.test.ts`, `DECISIONS.md`, `DEVLOG.md`.
- **Validation:** Passed `docker.exe compose config --services` and `docker.exe compose config --quiet`. `npm run test:ai-forecast` and `npm run build` could not run because neither WSL nor Windows PATH exposes npm in this environment and the checkout has no local `node_modules`; Docker daemon is also unavailable for containerized validation.
- **Follow-up:** Management/Finance should review forecast calibration output and save the accepted global weights in Petyr Admin.
