# Current State

This file records the current planned state of the Petyr platform at repository level.

## 2026-07-01 - Petyr Intelligence MVP implemented as isolated module

- Area: Petyr / Intelligence
- Status: First MVP plus scheduled worker implemented.
- Current state: Petyr has Forecasting at `/forecasting`, Petyr Admin at `/petyr-admin`, shared PostgreSQL persistence, a deterministic AI Forecast worker and a separated Petyr Intelligence module at `/intelligence`.
- Implemented state: the `intelligence` module is surfaced as `Petyr Intelligence`, separate from Forecasting in routing, services, database tables, APIs and UI navigation. It is implemented inside the current Petyr app boundary for easy integration, with isolated service code under `apps/forecasting-app/src/services/intelligence`.
- External providers: use Exa for external company signal retrieval and OpenRouter for LLM classification and narrative insight generation.
- Persistence: stores Intelligence runs, raw external search results, deduplicated signal items, Business Unit classifications, generated insights, insight-source links, CSM feedback, provider request logs and calibration reports in the local Petyr PostgreSQL database.
- Forecasting boundary: Petyr Intelligence must not use LLMs for deterministic numeric analysis such as revenue, margin, forecast values, campaign counts or mathematical trends. Those remain owned by SQL, formulas, deterministic services and existing Forecasting logic.
- MVP limits: default first-run limits are low to validate quality and cost before scaling:
  - `INTELLIGENCE_MAX_COMPANIES_PER_RUN=10`
  - `INTELLIGENCE_MAX_RESULTS_PER_COMPANY=5`
  - `INTELLIGENCE_SEARCH_RECENCY_DAYS=30`
  - `INTELLIGENCE_DAILY_BUDGET_REQUESTS=100`
- New routes:
  - `/intelligence`
  - `/intelligence/company/[companyName]`
  - `/petyr-admin/intelligence`
- New migration:
  - `202607010001_add_petyr_intelligence`
- Worker state: the separate `intelligence-scan` worker is implemented as a sidecar process using the Petyr app image. It runs a capped scheduled scan once per day, defaults to disabled, can be enabled/disabled from `/petyr-admin/intelligence`, enforces daily provider request budget from persisted provider logs and records skipped/partial/failed states for Admin visibility.
- Additional migration:
  - `202607010002_add_intelligence_worker_statuses`
