# DECISIONS

Lightweight decision log for architectural and product decisions.

Each decision should include:

- Date
- Context
- Decision
- Alternatives discarded
- Reason
- Consequences

---

## 2026-06-29 - Use recent workspace associations for Petyr CSM company lists

- **Status:** Accepted.
- **Context:** Petyr CSM company lists previously deduplicated Company Ownership to one CSM per company by choosing the row with the latest workspace update. Product clarified that each CSM portfolio must show every company with that CSM association when the related workspace was updated in the last 6 months.
- **Decision:** CSM Overview and normal Forecast Entry Monthly/Annual portfolio lists use company-CSM associations from `company_ownership` whose `workspace_updated_on` is within the last 6 months. A company may appear under multiple CSMs when multiple recent workspace associations exist. If no recent associations are available, Petyr may fall back to the latest owner per company with diagnostics.
- **Alternatives discarded:** Keeping only the latest workspace owner per company; using historical campaign/agreement CSM as the first-choice portfolio mapping; changing Management View aggregate ownership in the same task.
- **Reason:** The product workflow needs CSM portfolio lists to reflect recent workspace associations, not only the single most recently updated workspace.
- **Consequences:** CSM-facing company lists can include the same company in multiple CSM portfolios. Management aggregates remain on the existing deduplicated current-owner mapping to avoid double-counting unless a later product decision changes aggregate semantics.
- **Related docs:** `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `docs/petyr/03_petyr_business_rules.md`, `apps/forecasting-app/README.md`, `apps/forecasting-app/src/services/petyrDataService.ts`, `DEVLOG.md`.

## 2026-06-29 - Allow Petyr Admin to unlock Forecast Initial by target year

- **Status:** Accepted.
- **Context:** Annual Forecast Entry makes Forecast Initial editable only from December 10 of year N-1 through January 10 of year N, then freezes Initial Forecast while Ongoing Forecast can continue changing. Product needs admins to reopen that Initial Forecast entry window at any time, for example in August, so CSMs can enter missing initial values without a legacy import or scheduler path.
- **Decision:** Petyr Admin can unlock or lock Forecast Initial per Annual Forecast Entry target year. The override is stored in `app_setting` under `petyr_initial_forecast_window_overrides_v1`; no new table is added. When a year is unlocked, normal users with `petyr:forecast:write` can edit Forecast Initial from Annual Forecast Entry outside the default window. Locking the year restores the default December 10-January 10 rule and does not mutate saved Initial Forecast values.
- **Alternatives discarded:** A global all-years unlock; an unlock with automatic expiry; admin-only Forecast Initial entry outside the normal CSM workflow; a new dedicated table for v1.
- **Reason:** Per-year unlock matches the operational exception without changing the canonical Annual Forecast Entry workflow or creating a parallel Initial Forecast import path.
- **Consequences:** Forecast Initial remains frozen by default. Admin unlock state becomes a product setting, Annual Forecast Entry read/save must consider it, and admins should lock the year again once the exceptional entry period is over.
- **Related docs:** `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `docs/petyr/02_petyr_data_model_target.md`, `docs/petyr/03_petyr_business_rules.md`, `apps/forecasting-app/README.md`, `DEVLOG.md`.

## 2026-06-29 - Remove Forecast Intelligence from Company Detail

- **Status:** Accepted.
- **Context:** Company Detail previously exposed a CSM-facing Forecast Intelligence section for users with `petyr:forecast:write`, backed by the existing sentinel `ai_forecast_cache` row. Product clarified that the Intelligence section inside Company Detail must be removed entirely and redesigned elsewhere with different modalities.
- **Decision:** Company Detail must not render the Intelligence section, expose `Generate Intelligence`, or load persisted Forecast Intelligence sentinel rows for the selected company/year. Forecast Entry Monthly may continue to expose the CSM-facing consultative Intelligence flow; numeric AI Forecast cache evidence can remain read-only in Company Detail.
- **Alternatives discarded:** Keeping the current section hidden by permission; keeping persisted Intelligence visible without generation; moving the section inside another Company Detail card in the same task; redesigning the future intelligence experience without documented scope.
- **Reason:** The current Company Detail Intelligence placement is no longer product-approved and would create misleading surface area while the future experience is being reconsidered.
- **Consequences:** Company Detail gets lighter and no longer performs the extra Forecast Intelligence sentinel read. Future company-level intelligence must be specified in documentation/backlog before implementation.
- **Supersedes:** The Company Detail portion of `2026-06-19 - Expose CSM-safe Forecast Intelligence in Forecast Entry and Company Detail`.
- **Related docs:** `apps/forecasting-app/src/app/forecasting/company/[companyName]/page.tsx`, `docs/05_forecasting_product_spec.md`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/petyr/03_petyr_business_rules.md`, `docs/petyr/FORECAST_INTELLIGENCE_LAYER.md`, `docs/petyr/AI_FORECASTING_DESIGN.md`, `apps/forecasting-app/README.md`, `BACKLOG.md`, `DEVLOG.md`.

## 2026-06-29 - Load Petyr Management first and defer non-visible reads

- **Status:** Accepted.
- **Context:** Petyr opens on Management, but the previous active-view-first pass still allowed a complete `view=all` hydration immediately after the first payload and the normal Forecast Entry page still started Annual Forecast Entry only when the Annual tab was opened. Product clarified that Management must be the first usable data surface, while CSM Overview and Forecast Entry Monthly/Annual should warm in the background.
- **Decision:** `/forecasting` loads `view=management` first, marks the workspace usable, then starts scoped CSM Overview preload for the authenticated/preferred CSM through `view=csm-scoped` plus Forecast Entry Monthly/Annual warmup for forecast writers. The browser no longer hydrates `view=all` as the immediate second step. Normal Forecast Entry starts Annual Forecast Entry loading as soon as the Monthly workspace is usable, while Company Detail remains selected-company/year on-demand.
- **Alternatives discarded:** Keeping `view=all` as the second browser fetch; keeping Annual Forecast Entry as a manual tab-triggered load; preloading all CSM Overview customers before Management is usable; preloading Company Detail for every company; changing schema or materializing new aggregate tables in this task.
- **Reason:** The first visible product value is Management. Non-visible portfolio data should improve later navigation without blocking the Management dashboard.
- **Consequences:** CSM Overview warmup is scoped to the preferred CSM first. Forecast Entry Annual may be ready before the tab opens, or may show a passive loading/unavailable state if the background request is still running. Existing PostgreSQL data sources, Redash isolation, permissions, forecast calculations, save contracts and schema remain unchanged.
- **Related docs:** `apps/forecasting-app/src/app/api/petyr/forecasting/rendering-data/route.ts`, `apps/forecasting-app/src/components/petyr/PetyrForecastingDataHydrator.tsx`, `apps/forecasting-app/src/components/petyr/PetyrForecastEntryPreloader.tsx`, `apps/forecasting-app/src/components/petyr/ForecastEntryMonthlyBatchWorkspace.tsx`, `apps/forecasting-app/src/services/petyrApprovedRenderingAdapter.ts`, `docs/05_forecasting_product_spec.md`, `apps/forecasting-app/README.md`, `DEVLOG.md`.

## 2026-06-26 - Make Annual Forecast Entry the canonical Initial Forecast source

- **Status:** Accepted.
- **Context:** Older Petyr documentation and code treated Initial Forecast as a frozen snapshot populated by a 2026 Excel bootstrap or a future January 1 scheduler. Annual Forecast Entry later introduced the operational CSM/IGSM workflow where Forecast Initial is entered from December 10 through January 10, while Ongoing Forecast can continue changing afterward.
- **Decision:** Annual Forecast Entry is the canonical Initial Forecast workflow. Store the company/year Forecast Initial total in `forecast_annual_entry.initial_forecast` and store per-company, per-Business Unit Initial Forecast values in `forecast_annual.initial_forecast`. Keep Ongoing Forecast in `forecast_annual.value`. The Forecast Initial window closes after January 10; no separate Initial Forecast scheduler is required. Remove the legacy Initial Forecast Excel endpoints and protected consolidation endpoint from the product API. Deprecate `forecast_annual_snapshot` and `forecast_annual_snapshot_change_log` as historical legacy tables rather than dropping them automatically.
- **Alternatives discarded:** Keeping the January 1 scheduler and snapshot table as product source; keeping the 2026 Initial Forecast Excel import/export as a supported recovery path; physically dropping snapshot tables in the same task without a dedicated backup-backed cleanup.
- **Reason:** The current product workflow is Annual Forecast Entry. Using it as the source avoids duplicate Initial Forecast semantics and gives Management View and Business Unit views the BU-level values they require.
- **Consequences:** Product reads no longer use `forecast_annual_snapshot`. Annual Entry saves during the Forecast Initial window populate per-BU Initial values; later saves update Ongoing Forecast without changing Initial Forecast. A separate backlog item tracks eventual physical removal of deprecated snapshot tables.
- **Supersedes:** `2026-05-26 — Consolidate Petyr Initial Forecast on January 1 Europe/Rome`, `2026-05-26 — Lock Petyr Initial Forecast snapshots after consolidation`, `2026-05-22 — Persist Petyr Initial Forecast in dedicated annual snapshot tables`, `2026-05-22 — Bootstrap Petyr Initial Forecast 2026 through one-shot Excel import`, and `2026-05-22 — Automatically freeze Petyr Initial Forecast from 2027 onward`.
- **Related docs:** `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `docs/04_data_model.md`, `docs/petyr/02_petyr_data_model_target.md`, `docs/petyr/03_petyr_business_rules.md`, `apps/forecasting-app/README.md`, `BACKLOG.md`, `DEVLOG.md`.

## 2026-06-26 - Define production PostgreSQL backup standard

- **Status:** Accepted.
- **Context:** Petyr Admin exposes native PostgreSQL SQL dump export/import for server migration and controlled recovery, but that browser-mediated workflow was explicitly not the final production backup policy. The shared PostgreSQL database is the platform data hub for Redash snapshots, materialized Redash tables and Petyr forecast/admin data.
- **Decision:** Production PostgreSQL backups are a platform responsibility owned by the Platform owner and must be configured at Coolify/host or equivalent database-backup level. The v1 standard is daily backups retained for 5 days, weekly backups retained for 3 weeks, no other retention tier, encrypted offsite copy, RPO 24 hours and target RTO 8 hours. Petyr Admin SQL export/import remains for migration, manual pre-change safety exports and controlled recovery only. PITR/WAL archiving is not included in v1 and requires a later decision if RPO below 24 hours is required.
- **Alternatives discarded:** Treating Petyr Admin downloads as production backups; retaining backups only on the same host; adding an additional retained tier; defining PITR before the business requires sub-24-hour RPO.
- **Reason:** Host/database-level backups with encrypted offsite copies protect the shared data hub without coupling production retention and restore duties to a browser workflow. The chosen retention is intentionally compact and matches the current conservative recovery target.
- **Consequences:** Production exposure must verify the backup mechanism, offsite copy and restore drill evidence. No app endpoint, Prisma schema, database model, Redash source, forecast calculation or access-control permission changes. A separate backlog item tracks PITR/WAL archiving if stricter recovery objectives are later required.
- **Related docs:** `docs/01_architecture.md`, `docs/08_operational_commands.md`, `DEPLOY.md`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `apps/forecasting-app/README.md`, `BACKLOG.md`, `DEVLOG.md`.

## 2026-06-25 - Add CSM Annual Forecast Entry as a separate normal Forecast Entry tab

- **Status:** Accepted.
- **Context:** Normal `/forecasting/entry` had recently been narrowed to a current-month CSM batch workflow while the old full single-company Forecast Entry stayed available at `/forecasting/entry/old` for admins. Product now asked for a new CSM-facing Annual Forecast Entry section inside the normal Forecast Entry page, separate from Monthly, with CSM + Year filters, portfolio-wide annual entry, FC Initial windowing, confidence, AI placeholders and auditability.
- **Decision:** Keep Monthly Forecast Entry as the current-month batch tab and add Annual Forecast Entry as a separate tab in the same normal `/forecasting/entry` workspace. Annual customer + year metadata is stored in `forecast_annual_entry`, Business Unit annual forecast values stay in `forecast_annual` with `value_source=manual|ai_confirmed`, and effective annual saves reuse `forecast_save_session` / `forecast_change_log` with source `Annual Forecast Entry` so Company Detail remains the operational history surface.
- **Alternatives discarded:** Reopening the old full single-company Annual Forecast to CSMs; storing all annual values in a new duplicate BU table; treating unclicked AI placeholders as saved annual values; changing the global Management View planned-through-year-end calculation.
- **Reason:** Product needs a fast portfolio annual entry workflow for CSMs while preserving existing Monthly behavior and existing Management View semantics. The existing `forecast_annual` grain already matches company + Business Unit + year, so only customer/year metadata and value-source tracking were missing.
- **Consequences:** `/forecasting/entry` now contains both Monthly and Annual tabs. Annual FC Initial is editable only from December 10 of the previous year through January 10 of the selected year. Annual Planned includes future `Setup`, `Recruiting` and `Running` campaigns only in the Annual Forecast Entry read model, per the explicit task, while the broader Management View planned calculation remains unchanged until a separate product decision revises it. Deployments must apply the updated Petyr Prisma superset schema before saving annual entry metadata.
- **Related docs:** `apps/forecasting-app/prisma/schema.prisma`, `apps/forecasting-app/src/services/annualForecastEntryBatchService.ts`, `apps/forecasting-app/src/components/petyr/AnnualForecastEntryBatchWorkspace.tsx`, `docs/04_data_model.md`, `docs/05_forecasting_product_spec.md`, `apps/forecasting-app/README.md`, `DEVLOG.md`.

## 2026-06-24 - Preserve old Forecast Entry as admin-only legacy and make normal Entry CSM batch

- **Status:** Accepted.
- **Context:** The existing Forecast Entry combined single-company monthly editor, Annual Forecast, Forecast Intelligence, company selector, active/inactive controls, AI/admin tools and change history in one operational page. Product now wants normal `/forecasting/entry` to become a current-month CSM batch-entry surface while preserving the old full experience for admin-only access.
- **Decision:** Preserve the old full Forecast Entry experience at `/forecasting/entry/old` behind `petyr:admin`. Normal `/forecasting/entry` becomes a current server-month CSM batch-entry workspace requiring `petyr:forecast:write`, using batch read/save endpoints and exposing only the CSM filter, official Petyr Business Units, current-month editable forecast cells, read-only Closed Revenue and per-company notes.
- **Alternatives discarded:** Removing Annual Forecast and Forecast Intelligence code; keeping the full single-company editor visible to CSM users; exposing AI/admin tools to users with only `petyr:read` plus `petyr:forecast:write`; changing Prisma schema for batch-specific metadata in this step.
- **Reason:** The CSM workflow needs faster monthly portfolio entry without admin-only tools, while the complete historical editor remains useful for admin inspection and controlled legacy operations.
- **Consequences:** Batch saves reuse existing `forecast_monthly`, `forecast_save_session` and `forecast_change_log` tables. One save creates one session per company with effective changes. AI suggestions remain placeholders until accepted or edited by the CSM. Future performance optimization may be needed if the v1 batch read path is too broad on production-size datasets.
- **Related docs:** `apps/forecasting-app/src/app/forecasting/entry/page.tsx`, `apps/forecasting-app/src/app/forecasting/entry/old/page.tsx`, `apps/forecasting-app/src/services/forecastEntryBatchService.ts`, `docs/05_forecasting_product_spec.md`, `DEVLOG.md`, `BACKLOG.md`.

## 2026-06-24 - Petyr owns Forecast Intelligence numeric evidence display

- **Status:** Accepted.
- **Context:** Forecast Intelligence generation was failing because validation checked every number in narrative text against a payload-number whitelist, while the model also generated `numeric_evidence` directly. Product wants useful CSM insight text without letting OpenRouter own forecast values or visible numeric evidence.
- **Decision:** LLM owns insight text and evidence refs; Petyr owns forecast values and numeric evidence display. Forecast Intelligence payloads use `petyr_forecast_intelligence_payload_v3`, prompt `petyr_forecast_intelligence_prompt_v5` and raw LLM output schema `petyr_forecast_intelligence_llm_output_v5`. The payload includes a deterministic evidence registry of citeable server-owned values and sanitized CSM change notes for qualitative context. OpenRouter returns only `evidence_refs`; Petyr validates those refs and enriches the UI-compatible output with server-generated `numeric_evidence`.
- **Alternatives discarded:** Continuing to let the LLM write `numeric_evidence`; validating every number in all narrative text; removing numbers from all insight text; exposing rounding/adjustment scenarios as citeable evidence.
- **Reason:** CSMs need narrative pattern, risk, opportunity and watchout analysis, but official forecast numbers and visible numeric evidence must remain deterministic, auditable and server-owned.
- **Consequences:** Old Forecast Intelligence cache entries are bypassed by the new prompt/payload/schema versions. Free numbers in narrative text no longer fail validation by themselves, but unknown evidence refs, raw model-provided `numeric_evidence`, markdown, prompt leaks, rounding scenario references and prescriptive language still fail validation. Signed deltas such as negative deterministic-minus-planned values remain available when server-derived and present in the evidence registry.
- **Related docs:** `docs/petyr/FORECAST_INTELLIGENCE_LAYER.md`, `docs/05_forecasting_product_spec.md`, `apps/forecasting-app/src/services/petyrForecastIntelligenceService.ts`, `apps/forecasting-app/src/services/petyrAiForecastCompanyIntelligenceService.ts`, `DEVLOG.md`.

## 2026-06-24 - Persist sanitized Petyr performance measurements in PostgreSQL

- **Status:** Accepted.
- **Context:** Petyr Admin had a Performance test results panel, but the prepared instrumentation only emitted optional server logs through `PETYR_PERF_LOGS`; the admin page could not show active or valued measurements.
- **Decision:** Store sanitized server-side performance measurements in the shared PostgreSQL table `petyr_performance_measurement`, defined in the Petyr Prisma superset schema and mirrored in Redash Ingestor for writes. Forecasting and Redash Ingestor helpers may write service, operation, status, duration, row count, timestamp and scalar metadata. Petyr Admin exposes the latest values through `GET /api/petyr/admin/performance-results`.
- **Alternatives discarded:** Continuing with server logs only; parsing container logs from Petyr Admin; storing raw request, workbook or Redash payload data; adding browser timing collection in this server-side task.
- **Reason:** A small database-backed diagnostic table makes the existing admin panel actionable while preserving the documented PostgreSQL-centered architecture and avoiding customer data or secret exposure.
- **Consequences:** Operators can see whether each documented server-side check has been measured and when. Browser DevTools metrics remain manual/external until a separate runner or client telemetry decision is made. Deployments must apply the Petyr superset schema before persisted performance results appear.
- **Related docs:** `apps/forecasting-app/prisma/schema.prisma`, `apps/redash-ingestor/prisma/schema.prisma`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/04_data_model.md`, `docs/05_forecasting_product_spec.md`, `docs/08_operational_commands.md`.

## 2026-06-24 - Run shared DB bootstrap from Petyr superset schema before Redash seed

- **Status:** Accepted.
- **Context:** Coolify deploy on commit `3d7219291cddd25254357a1c8d24e0b329758ce5` failed during container startup because `redash-bootstrap` ran `prisma db push` from `apps/redash-ingestor`, whose Prisma schema is partial, against the shared PostgreSQL `public` schema that also contains Petyr forecast tables.
- **Decision:** The root Compose bootstrap order is `forecasting-db-sync` first, then `redash-bootstrap`, then optional `redash-initial-sync`. `forecasting-db-sync` is the only one-shot service that may apply the shared static database schema, using the Petyr Prisma superset schema and safe wrapper. `redash-bootstrap` is seed-only and must not run `prisma db push` against the shared schema.
- **Alternatives discarded:** Passing `--accept-data-loss`; letting Redash Ingestor's partial schema mutate the shared `public` schema; splitting Redash and Petyr into separate schemas/databases in this hotfix.
- **Reason:** A partial Prisma schema can interpret valid Petyr tables as unmanaged tables to drop. The Petyr superset schema is already documented as the source for shared static tables and is the least invasive way to keep fresh-volume bootstrap automatic without risking forecast data.
- **Consequences:** Existing forecast tables such as `forecast_monthly`, `forecast_annual`, `ai_forecast_cache` and `management_objective` are preserved during deploy. Fresh volumes are still initialized automatically before app startup. A future separation into schemas/databases remains possible only after reviewing Petyr read models.
- **Related docs:** `docker-compose.yml`, `apps/redash-ingestor/package.json`, `README.md`, `README_INSTALL_DOCKER.md`, `DEPLOY.md`, `DEVLOG.md`.

## 2026-06-23 - Make Petyr Coolify compose bootstrap and gateway-safe

- **Status:** Accepted.
- **Context:** Coolify deployment under `https://petyr.draftapps.it` exposed two production issues: auth redirects could derive `0.0.0.0:3000` from container request URLs, and publishing `platform-home` on host port `8080` can conflict with other Coolify/Access Layer services. Fresh PostgreSQL volumes also needed manual schema bootstrap and seed commands before Petyr was usable.
- **Decision:** Auth completion redirects derive the public origin from the configured Access Layer callback URL. Root production Compose exposes `platform-home` on container port `8080` without a host port bind, and adds one-shot `redash-bootstrap`, `forecasting-db-sync` and optional `redash-initial-sync` services. The first Redash sync is opt-in through `REDASH_INITIAL_SYNC_ON_BOOTSTRAP=true`. Forecasting keeps `next start` by removing Next standalone output, while app Dockerfiles always install build-time dev dependencies with `--include=dev`.
- **Alternatives discarded:** Using `request.url` for final browser redirects behind Coolify; binding `8080:8080` in production compose; running Prisma schema changes inside every long-running app startup; making Redash API availability mandatory for every deploy.
- **Reason:** Coolify should route the public domain to one gateway container without leaking internal container hosts or host ports, while schema preparation remains explicit, idempotent and separate from app startup.
- **Consequences:** Coolify must target service `platform-home` on container port `8080`. Local localhost access needs `docker-compose.local.yml` or another override. On fresh volumes, bootstrap services run before apps/workers start; if `REDASH_INITIAL_SYNC_ON_BOOTSTRAP=true`, Redash sync failure blocks startup by design.
- **Related docs:** `DEPLOY.md`, `README.md`, `README_INSTALL_DOCKER.md`, `docs/01_architecture.md`, `docker-compose.yml`, `.env.example`, `apps/forecasting-app/Dockerfile`, `apps/redash-ingestor/Dockerfile`, `DEVLOG.md`.

## 2026-06-22 - Deploy Petyr on draftapps.it through Coolify

- **Status:** Accepted.
- **Context:** Petyr is moving to Coolify under `https://petyr.draftapps.it` and must use the external Access Layer at `https://access-layer.draftapps.it`. A prior Access Layer deployment showed that PostgreSQL credentials can drift between Compose variables, application `DATABASE_URL`, Coolify-generated values and already-initialized persistent volumes.
- **Decision:** Production Petyr must use `https://petyr.draftapps.it` as the public host, with Petyr callback `https://petyr.draftapps.it/auth/callback` and Redash Ingestor callback `https://petyr.draftapps.it/redash-ingestor/auth/callback`. Access Layer base URLs must use `https://access-layer.draftapps.it`. Root Compose no longer injects a required `.env` file into containers, no longer hardcodes app `DATABASE_URL`, and publishes only the gateway service by default. `DATABASE_URL` must be provided explicitly and must match the PostgreSQL credentials used to initialize the volume.
- **Alternatives discarded:** Keeping the previous `unguess-internal.net` production defaults; relying on `env_file: .env` in Coolify; publishing direct app/PostgreSQL ports from the root production Compose; allowing app containers to silently fall back to hardcoded database credentials.
- **Reason:** Coolify should receive explicit environment variables and route only the gateway, while PostgreSQL authentication should either match the initialized volume or fail during configuration instead of producing a backend restart loop.
- **Consequences:** Existing Access Layer tool registrations must be updated to the new callback URLs. If an existing Coolify PostgreSQL volume was initialized with old credentials, operators must preserve those credentials or recreate the resource/volume after backup. Direct local debug ports require an explicit local override or app-level dev server.
- **Supersedes:** The production host portions of `2026-06-21 - Host Access Layer on access-layer.unguess-internal.net`, `2026-06-21 - Host Petyr on petyr.unguess-internal.net in production`, and `2026-06-22 - Route Redash Ingestor through the Petyr production host`.
- **Related docs:** `DEPLOY.md`, `docker-compose.yml`, `.env.example`, `apps/forecasting-app/next.config.ts`, `apps/forecasting-app/.env.example`, `apps/redash-ingestor/.env.example`, `petyr/access-layer-tools/*`, `README.md`, `README_INSTALL_DOCKER.md`, `DEVLOG.md`.

## 2026-06-22 - Use PostgreSQL-native dumps for Petyr Admin database migration

- **Status:** Accepted.
- **Context:** Operators need a way from Petyr Admin to export the current shared database and import it on a new server so Redash-derived snapshots, materialized tables and Petyr forecast/admin data are preserved.
- **Decision:** Petyr Admin database migration uses native PostgreSQL SQL dumps generated with `pg_dump` and restored with `psql` stop-on-error behavior. The export/import endpoints are protected by Petyr `petyr:admin` plus `APP_INTERNAL_SECRET`. The dump is database-level, not a custom Petyr JSON format, and it does not call Redash or OpenRouter.
- **Alternatives discarded:** Custom table-by-table JSON export/import through Prisma; exporting only Petyr forecast tables; making restore available without the internal secret; making this the final production backup policy.
- **Reason:** PostgreSQL-native dumps preserve the shared data hub without duplicating schema logic in application code, while the double gate and explicit confirmation match the risk of importing destructive SQL.
- **Consequences:** The Forecasting app runtime image must include PostgreSQL client tools. Browser-mediated admin export/import is acceptable for migration/control operations, but production backup compliance is handled by the later platform standard recorded on 2026-06-26.
- **Related docs:** `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `docs/01_architecture.md`, `docs/08_operational_commands.md`, `apps/forecasting-app/README.md`, `BACKLOG.md`, `DEVLOG.md`.

## 2026-06-22 - Route Redash Ingestor through the Petyr production host

- **Status:** Accepted.
- **Context:** Redash Ingestor is exposed as an operator path behind the same Petyr gateway, but older production callback defaults still used `https://unguess-internal.net/redash-ingestor/auth/callback`.
- **Decision:** Redash Ingestor production operator access must use `https://petyr.unguess-internal.net/redash-ingestor`, with Access Layer callback `https://petyr.unguess-internal.net/redash-ingestor/auth/callback`. Redash Ingestor remains a separate Access Layer tool and service; only its public operator host/path is aligned under the Petyr gateway domain.
- **Alternatives discarded:** Keeping Redash Ingestor under `https://unguess-internal.net/redash-ingestor`; creating a separate Redash Ingestor subdomain in this task; merging Redash Ingestor into Petyr.
- **Reason:** Petyr unified access is the accepted production gateway model, and keeping Redash Ingestor under the same production host avoids an extra DNS/proxy surface for the operator path while preserving service separation.
- **Consequences:** Deployed Redash Ingestor environment variables and Access Layer tool registration must use the new callback before production login works. DNS/proxy setup for Petyr must route `/redash-ingestor` and `/redash-ingestor/*` to the Redash Ingestor service. No Redash source, sync logic, permission key or PostgreSQL data flow changed.
- **Supersedes:** The Redash Ingestor callback/host exception in `2026-06-21 - Host Access Layer on access-layer.unguess-internal.net`.
- **Related docs:** `DEPLOY.md`, `apps/redash-ingestor/README.md`, `apps/redash-ingestor/.env.example`, `petyr/access-layer-tools/redash-ingestor.tool.json`, `docker-compose.yml`, `docker-compose.local.yml`, `BACKLOG.md`, `DEVLOG.md`.

## 2026-06-21 - Host Access Layer on access-layer.unguess-internal.net

- **Status:** Accepted.
- **Context:** Petyr and Redash Ingestor Access Layer defaults still pointed to `https://unguess-internal.net/access-control`, while production Access Layer is intended to run on a dedicated host.
- **Decision:** The production Access Layer public and internal base URL defaults are `https://access-layer.unguess-internal.net` for both Petyr and Redash Ingestor. Petyr remains on `https://petyr.unguess-internal.net` with callback `https://petyr.unguess-internal.net/auth/callback`. This decision originally left Redash Ingestor on `https://unguess-internal.net/redash-ingestor/auth/callback`; that exception is superseded by `2026-06-22 - Route Redash Ingestor through the Petyr production host`.
- **Alternatives discarded:** Keeping Access Layer under `https://unguess-internal.net/access-control`; changing Petyr callback again; changing Redash Ingestor public operator URL in the same task.
- **Reason:** A dedicated Access Layer host keeps the authentication service origin explicit and aligns tool integrations with the intended production deployment shape.
- **Consequences:** Tool descriptors, example environment files, Docker Compose defaults and deployment docs now use `access-layer.unguess-internal.net` for Access Layer base URLs. Existing deployed environment variables and tool registrations must be updated before production login uses the new host.
- **Related docs:** `DEPLOY.md`, `.env.example`, `apps/forecasting-app/.env.example`, `apps/redash-ingestor/.env.example`, `apps/forecasting-app/README.md`, `apps/redash-ingestor/README.md`, `petyr/access-layer-tools/*`, `docker-compose.yml`, `BACKLOG.md`, `DEVLOG.md`.

## 2026-06-21 - Host Petyr on petyr.unguess-internal.net in production

- **Status:** Accepted.
- **Context:** The previous Access Layer preparation assumed production Petyr would be mounted under `https://unguess-internal.net/petyr`, with callback `https://unguess-internal.net/petyr/auth/callback`. Product clarified that production must be designed for the dedicated host `petyr.unguess-internal.net`.
- **Decision:** Production Petyr must use `https://petyr.unguess-internal.net` as its public origin. The Access Layer callback for the Petyr tool is `https://petyr.unguess-internal.net/auth/callback`. Petyr's internal application routes remain `/forecasting`, `/petyr-admin`, `/api/petyr/*` and `/auth/*`; do not add a Next.js `/petyr` base path for the forecasting app.
- **Alternatives discarded:** Continuing to mount Petyr at `https://unguess-internal.net/petyr`; adding a Next.js `basePath` of `/petyr`; changing Redash Ingestor or Access Layer ownership in the same task.
- **Reason:** A dedicated Petyr host keeps the production origin explicit and avoids coupling Petyr's route model to a shared-domain subpath.
- **Consequences:** Petyr Access Layer descriptors, example environment values, Docker Compose defaults, deploy docs and Next.js Server Actions allowed origins now point to `petyr.unguess-internal.net`. Existing Access Layer registrations and OAuth return URLs using `/petyr/auth/callback` must be updated before production login will work on the new host.
- **Supersedes:** The Petyr production URL/callback portion of `2026-06-19 - Prepare Petyr for external Access Layer authentication`.
- **Related docs:** `DEPLOY.md`, `apps/forecasting-app/README.md`, `.env.example`, `apps/forecasting-app/.env.example`, `petyr/access-layer-tools/petyr.tool.json`, `docker-compose.yml`, `docs/01_architecture.md`, `BACKLOG.md`, `DEVLOG.md`.

## 2026-06-20 - Compact Petyr Forecast Intelligence to four numeric-evidence sections

- **Status:** Accepted.
- **Context:** Product asked Forecast Intelligence to stop showing technical warnings, status/confidence/as-of/eligible-month/provider-call metadata, selected-month eligibility notices, no-change disclaimers, rounding scenarios and other unrequested sections.
- **Decision:** Version Forecast Intelligence prompt/output to v4. OpenRouter must return only `stakeholder_notes`, `risks`, `watchouts` and `opportunities`, and every item must include payload-backed `numeric_evidence`. The validator rejects old v3 fields, invented numbers, missing numeric evidence and visible rounding/adjustment scenario references such as `floor_100`, `nearest_100`, `ceil_100` or rounding scenarios. CSM and admin Intelligence UIs render only the four compact sections.
- **Alternatives discarded:** Hiding old fields only in the CSM UI; keeping chart-comparison adjustment candidates; keeping status/confidence metadata in admin Intelligence; continuing to accept v3 cached output.
- **Reason:** The useful CSM/admin reading surface should be compact and actionably commercial, with amounts and timing visible for each note, without exposing internal diagnostics or scenario mechanics.
- **Consequences:** Existing v3 Forecast Intelligence cache entries are bypassed by the new prompt/output schema version. Internal deterministic scenarios may remain for local calculations, but Forecast Intelligence no longer requests, validates, renders or charts them.
- **Related docs:** `docs/petyr/FORECAST_INTELLIGENCE_LAYER.md`, `docs/petyr/AI_FORECASTING_DESIGN.md`, `docs/05_forecasting_product_spec.md`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `DEVLOG.md`.

## 2026-06-20 - Preselect Petyr CSM filters from Access Layer display name

- **Status:** Accepted.
- **Context:** Product wants CSM filters across Petyr to start from the logged-in Access Layer user when possible, while preserving existing permission behavior and Company Ownership as the canonical Company -> CSM source.
- **Decision:** Petyr resolves a preferred CSM by normalizing the authenticated Access Layer `displayName` and matching it against canonical `csm_name` values from PostgreSQL-backed Company Ownership/read models. The match ignores case, repeated spaces and accents, and is accepted only when it resolves to exactly one canonical CSM. Matching users get that CSM as the initial filter/default route context; explicit query parameters and user changes still win.
- **Alternatives discarded:** Adding row-level restrictions for CSM users; matching by email without a documented Company Ownership email field; adding a new database mapping table for this MVP; using fuzzy/name-token matching.
- **Reason:** The Access Layer currently provides email and display name, while Petyr's forecasting ownership data stores CSM names. Exact normalized display-name matching gives a low-risk default without changing access control, schema or Redash ingestion.
- **Consequences:** CSM users with matching Access Layer names land directly on their CSM scope in Petyr filters and default links. Users without a unique match keep the previous defaults. This is convenience, not authorization.
- **Related docs:** `docs/05_forecasting_product_spec.md`, `apps/forecasting-app/README.md`, `DEVLOG.md`.

## 2026-06-20 - Run deterministic Petyr AI Forecast nightly for active companies

- **Status:** Accepted.
- **Context:** Product wants deterministic preview generated every night for all active Petyr Forecasting companies, starting at 02:00 in `Europe/Rome`, with about 3 seconds between companies, and saved as AI Forecast.
- **Decision:** Add a dedicated Petyr time-based worker, separate from Redash sync, that runs nightly at `PETYR_AI_FORECAST_DAILY_TIME=02:00`, targets the current `Europe/Rome` year, filters out only explicitly inactive companies, computes local deterministic preview rows and saves them to `ai_forecast_cache` with daily append-only model versions like `petyr_deterministic_preview_v1@YYYY-MM-DD`. The worker does not call OpenRouter or Forecast Intelligence and does not write CSM forecasts, annual forecasts, objectives, Initial Forecast, closed revenue or Redash materialized data.
- **Alternatives discarded:** Re-enabling the legacy global AI batch endpoint; triggering AI Forecast after Redash sync; calling OpenRouter for every company overnight; overwriting prior AI Forecast cache rows.
- **Reason:** Deterministic local forecast values are auditable, cost-free and already the numeric source of truth. A separate worker gives operations predictable scheduling without coupling Petyr forecast generation to Redash ingestion.
- **Consequences:** Nightly deterministic AI Forecast automation is allowed for active companies. Broader LLM/OpenRouter batch automation remains deferred until privacy, cost, rate-limit and quality policies are explicitly accepted.
- **Related docs:** `apps/forecasting-app/README.md`, `docs/05_forecasting_product_spec.md`, `docs/petyr/AI_FORECASTING_DESIGN.md`, `docs/petyr/FORECAST_INTELLIGENCE_LAYER.md`, `docs/01_architecture.md`, `docs/08_operational_commands.md`, `BACKLOG.md`, `DEVLOG.md`.

## 2026-06-19 - Expose CSM-safe Forecast Intelligence in Forecast Entry and Company Detail

- **Status:** Accepted.
- **Context:** Product asked for an `Intelligence` section in Forecast Entry Monthly forecast and Company Detail where CSMs can press a button, call OpenRouter for the selected company and read AI-generated guidance on data, outlook and opportunities.
- **Decision:** Users with `petyr:forecast:write` may run a CSM-facing `Generate Intelligence` action in Forecast Entry Monthly forecast and Company Detail. The action reuses the dry-run Forecast Intelligence path, may save/reuse only the sentinel `ai_forecast_cache` intelligence row and renders only validated consultative JSON. Company Detail remains read-only for forecast data and still cannot generate/apply numeric AI Forecast rows. The admin-visible Forecast Entry support tool remains the only UI that exposes deterministic preview, full AI Forecast diagnostics and explicit numeric apply.
- **Alternatives discarded:** Keeping Intelligence admin-only; exposing numeric AI Forecast apply in Company Detail; creating a new Access Layer permission before the product needs finer-grained control.
- **Reason:** CSMs need actionable consultative guidance in their normal workflow, while forecast values, raw prompt/debug visibility and OpenRouter secret handling must stay governed by existing server-side controls.
- **Consequences:** Forecast Entry and Company Detail now include a CSM-safe Intelligence UI. The UI hides OpenRouter I/O, raw prompt payloads and apply controls. OpenRouter calls remain server-side and forecast math remains local/deterministic.
- **Related docs:** `docs/05_forecasting_product_spec.md`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/petyr/FORECAST_INTELLIGENCE_LAYER.md`, `docs/petyr/03_petyr_business_rules.md`, `apps/forecasting-app/README.md`, `DEVLOG.md`.

## 2026-06-19 - Gate Petyr diagnostics, support tools and objectives by Access Layer permissions

- **Status:** Accepted.
- **Context:** Petyr now has Access Layer-backed permissions for read, forecast write, management write and admin surfaces. Product asked to hide data diagnostics and support tools from non-admin users, and to move Management Objectives out of Forecast Entry Annual Forecast into Management.
- **Decision:** Petyr shows the floating Data diagnostics menu, diagnostic operator links, Management View Top 4 trend cards and Forecast Entry Support tools only to users with `petyr:admin`. Petyr shows Management Objectives at the bottom of Management View only to users with `petyr:management:write`; the compatibility route `/forecasting/entry/objectives` and `GET/POST /api/petyr/management-objectives` keep the same management permission. The hardcoded `Pippo` gate is removed.
- **Alternatives discarded:** Keeping the temporary password in addition to Access Layer permission; hiding all Annual Forecast from non-admin users; leaving objectives embedded in Forecast Entry.
- **Reason:** Access Layer permissions are now the real authorization boundary, while Forecast Entry Annual Forecast must remain a CSM-owned annual forecast rather than a management objective editor.
- **Consequences:** Non-admin users no longer see technical diagnostics or AI support tooling in Petyr workspaces. Management users can manage objectives without a shared password. Historical decisions about the temporary Management Objectives password are superseded by this permission-based behavior.
- **Related docs:** `apps/forecasting-app/README.md`, `docs/05_forecasting_product_spec.md`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/petyr/03_petyr_business_rules.md`, `BACKLOG.md`, `DEVLOG.md`.

## 2026-06-19 - Redash Ingestor is a separate Access Layer tool

- **Status:** Accepted.
- **Context:** `/redash-ingestor` is routed directly to `apps/redash-ingestor` and bypasses Petyr. Protecting only Petyr cannot secure the Redash operator dashboard, preview APIs or manual sync endpoints.
- **Decision:** Register and protect Redash Ingestor as its own Access Layer tool, separate from the `petyr` tool. Redash Ingestor owns `redash-ingestor:read`, `redash-ingestor:sync`, `redash-ingestor:sources:write` and `redash-ingestor:admin`; Petyr owns its Petyr permissions and continues to consume only PostgreSQL-backed data.
- **Alternatives discarded:** Treating Redash Ingestor as a Petyr sub-permission only; making Petyr proxy Redash Ingestor product data; replacing `APP_INTERNAL_SECRET` during this task.
- **Reason:** The Redash operator surface has its own risk profile and deployment boundary. Keeping it separate preserves the documented flow `Redash -> redash-ingestor -> PostgreSQL -> Petyr`.
- **Consequences:** Root `petyr/access-layer-tools/` carries non-secret onboarding descriptors for both tools. Source create/update keeps the existing `APP_INTERNAL_SECRET` recovery/internal control in addition to Access Layer permission until a later explicit task changes it.
- **Related docs:** `apps/redash-ingestor/README.md`, `DEPLOY.md`, `docs/access-control/TOOL_INTEGRATION_GUIDE.md`, `DEVLOG.md`.

## 2026-06-19 - Prepare Petyr for external Access Layer authentication

- **Status:** Accepted; Access Layer base URL and Petyr production URL/callback superseded on 2026-06-21.
- **Context:** Product wants Petyr ready to use the externally supplied Access Layer Google SSO service, but the Access Layer package must remain separate and must not be deployed, copied or modified by this Petyr task. Local Petyr development must remain possible without authentication.
- **Decision:** Petyr implements only the tool-side Access Layer protocol: login redirect, callback state validation, one-time-code exchange, local signed Petyr session and permission checks. The external Access Layer remains hosted separately at `https://unguess-internal.net/access-control`; production Petyr is expected at `https://unguess-internal.net/petyr`; Petyr's callback is `https://unguess-internal.net/petyr/auth/callback`. `PETYR_AUTH_MODE` defaults to disabled in local development and must be `access-layer` in production.
- **Alternatives discarded:** Importing the Access Layer zip into the Petyr monorepo; deploying Access Layer from this task; requiring Google login for normal local Petyr development; replacing existing `APP_INTERNAL_SECRET` recovery gates in the same change.
- **Reason:** This prepares Petyr for centralized authentication while preserving separation of responsibility, local velocity and the existing recovery safeguards.
- **Consequences:** Production Petyr fails closed if Access Layer configuration is incomplete. Petyr route/API permission checks are ready for Access Layer grants, but `/redash-ingestor` still needs gateway or ingestor-level protection because it bypasses Petyr.
- **Related docs:** `apps/forecasting-app/README.md`, `DEPLOY.md`, `.env.example`, `DEVLOG.md`.

## 2026-06-16 - Standardize local unified Petyr gateway on port 8080

- **Status:** Accepted.
- **Context:** After unifying Petyr Forecasting, Petyr Admin and Redash Ingestor under one local gateway, product reported confusion and runtime issues caused by the local user-facing port changing between 8080 and 8090. Product now explicitly requires the unified local address to use port 8080 for Docker as well.
- **Decision:** Local Docker exposes the `platform-home` gateway on `http://localhost:8080`. The gateway continues to route `/forecasting`, `/petyr-admin`, `/api/petyr/*`, `/redash-ingestor` and `/redash-ingestor/api/*` to the separate backend services. The gateway container still listens internally on 8080, so Compose maps `8080:8080`. Direct backend ports `3000` and `3001` remain local debugging conveniences only, not the user-facing Petyr address.
- **Alternatives discarded:** Keeping `8090` as the user-facing gateway port; exposing each app as a separate user-facing port; merging service code to force a single process.
- **Reason:** Using one visible port removes ambiguity while preserving the accepted gateway architecture and service boundaries.
- **Consequences:** Operational docs, Docker Compose and local usage guides must point to `http://localhost:8080`. Existing deployments or browser bookmarks using `8090` must be updated or the old container binding stopped before restarting Compose.
- **Related docs:** `README.md`, `README_INSTALL_DOCKER.md`, `DEPLOY.md`, `docs/01_architecture.md`, `docs/08_operational_commands.md`, `DEVLOG.md`.

## 2026-06-15 - Expose Petyr as one unified app through a gateway while keeping services separate

- **Status:** Accepted.
- **Context:** Petyr users need one coherent application entrypoint instead of separate browser ports for Forecasting, Petyr Admin and Redash Ingestor diagnostics. The repository is still a Dockerized multi-service platform where Redash ingestion and forecasting have separate responsibilities, and Forecasting must never call Redash directly.
- **Decision:** Petyr unified access is provided by a gateway/reverse proxy in front of the services. `forecasting-app` continues to serve `/forecasting`, `/petyr-admin` and `/api/petyr/*`. `redash-ingestor` remains a separate internal service for Redash sync, dashboard and technical APIs, exposed through the gateway at `/redash-ingestor` and `/redash-ingestor/api/*` only for internal/operator access. Forecasting continues to read PostgreSQL or future stable internal data APIs and must not call Redash APIs directly. Petyr Admin must be reachable from the floating Data Diagnostics menu in Forecasting pages, and Petyr Admin must provide a path to the Redash Ingestor dashboard for operator troubleshooting.
- **Alternatives discarded:** Merging Redash Ingestor into `forecasting-app`; moving Redash Ingestor files into Petyr; merging Prisma schemas as part of access unification; keeping Petyr users on separate user-facing ports/domains; allowing Forecasting to call Redash directly for convenience.
- **Reason:** A gateway gives users one application surface while preserving ingestion auditability, service ownership, PostgreSQL-first data flow and future access-control boundaries.
- **Consequences:** The next implementation should add or adapt a gateway/reverse proxy route layer without changing application code ownership. Local Docker adapts `platform-home` into the gateway/reverse proxy. Direct backend port exposure should be treated as local/debug convenience, not the long-term user-facing model. Production domain names and exact proxy technology remain deployment choices tracked separately.
- **Related docs:** `docs/01_architecture.md`, `BACKLOG.md`, `DEVLOG.md`.

## 2026-06-15 — Focus Petyr Forecast Intelligence on non-obvious guidance and chart-only numeric candidates

- **Status:** Accepted.
- **Context:** Product clarified that OpenRouter output must not merely summarize visible data, data quality or obvious trends, and must not return CSM questions. The useful AI value is consultative guidance on risks and opportunities that a CSM may miss, including agreement timing, agreement consumption and watchouts. Product also wants to evaluate whether AI can suggest a numeric retouch to deterministic values before deciding whether to confirm that behavior.
- **Decision:** Version Forecast Intelligence prompt/output to v3. OpenRouter must keep the introductory company-level narrative but focus on non-obvious insights, risks, opportunities, watchouts, forecast cues and stakeholder note. Data-quality notes and CSM questions are removed from the validated output contract and UI. OpenRouter may return `forecast_adjustment_candidates` only by selecting an existing local consultative scenario for the same Business Unit and month; those candidates are displayed in Charts for comparison only and are not official forecast values or persisted numeric overrides.
- **Alternatives discarded:** Keeping data-quality notes and CSM questions in the output; letting OpenRouter freely invent adjusted forecast numbers; immediately making AI retouches authoritative or writable to CSM forecast rows.
- **Reason:** The AI layer should add judgement over deterministic evidence without duplicating what the UI already shows, while preserving auditability of official forecast math until numeric AI retouches are explicitly approved.
- **Consequences:** v2 Forecast Intelligence cache entries are bypassed by the new prompt/output version. The validator rejects old output fields and rejects adjustment candidates that do not match a local consultative scenario. Charts can compare deterministic forecast values against AI-selected candidate scenarios before a future product decision decides whether any numeric adjustment should become official.
- **Related docs:** `docs/petyr/FORECAST_INTELLIGENCE_LAYER.md`, `docs/petyr/AI_FORECASTING_DESIGN.md`, `docs/05_forecasting_product_spec.md`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `DEVLOG.md`.

## 2026-06-12 — Version Petyr Forecast Intelligence as deterministic numbers plus consultative intelligence

- **Status:** Accepted.
- **Context:** Product feedback clarified that Petyr must not let the LLM generate final forecast values. The CSM needs integer-EUR deterministic forecasts, residual-aware agreement allocation over the remaining contract life and LLM support focused on opportunities, watchouts and questions rather than obvious missing-data notices or operational instructions.
- **Decision:** Petyr AI Forecast values remain deterministic/local. Monetary values exposed or saved by AI Forecast are rounded to integer EUR; consultative scenarios are locally computed at 100 EUR granularity. Active future agreement residuals are allocated over remaining months and attributed to Business Units through sanitized title tokens, linked-agreement history, then company+BU history fallback. OpenRouter receives payload version `petyr_forecast_intelligence_payload_v2`; the original v2 output wording was superseded on 2026-06-15 by `petyr_forecast_intelligence_output_v3`, which removes CSM questions and adds chart-only adjustment candidates.
- **Alternatives discarded:** Letting OpenRouter choose the final forecast value; sending raw agreement/campaign/deal titles to the model; consuming an entire multi-year agreement residual in the first forecast year; keeping prescriptive LLM recommended actions.
- **Reason:** Forecast numbers need auditability and residual discipline, while the LLM is more useful as a consultative lens over already-computed signals. Sanitized token attribution preserves business-unit intent without exposing raw commercial titles.
- **Consequences:** v1 Forecast Intelligence cache entries are bypassed by the new payload/prompt/output versions and input hash. The validator rejects invented numbers, unexpected v1 fields and prescriptive operational language. Planned campaigns remain a floor only in their own target month. Future calibration of thresholds or alias lists requires a documented product decision.
- **Related docs:** `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `docs/petyr/AI_FORECASTING_DESIGN.md`, `docs/petyr/FORECAST_INTELLIGENCE_LAYER.md`, `DEVLOG.md`.

## 2026-06-10 — Make Petyr Forecast Intelligence interpretation-only

- **Status:** Accepted.
- **Context:** The manual Petyr AI Forecast path produced reliable deterministic previews but OpenRouter preview generation was fragile and blurred responsibility for forecast values. Product requires Petyr local math to remain the only source of truth.
- **Decision:** Refactor the OpenRouter layer into Forecast Intelligence. Petyr computes deterministic values, trends, scenarios, deltas, risks and data-quality signals locally. OpenRouter receives only a normalized payload plus strict instructions and returns validated JSON business analysis. It must not calculate, recalculate, adjust, smooth, round, override or invent forecast values.
- **Alternatives discarded:** Keeping row-level LLM-generated `aiForecastValue`; accepting provider prose or markdown fallback; letting OpenRouter repair or change local forecast numbers; creating a separate cache table for this phase.
- **Reason:** Reliability and auditability require one numeric authority. Using the existing `ai_forecast_cache` with prompt versioning and input hashing keeps reuse/invalidation explicit while preserving deterministic fallback.
- **Consequences:** Forecast Intelligence JSON and failure states are stored in `ai_forecast_cache` using a sentinel `business_unit=__forecast_intelligence__`, `month=0`, `forecast_value=0`. Numeric AI forecast readers must exclude that sentinel and read only successful months 1-12. The UI renders deterministic rows separately from AI interpretation sections.
- **Related docs:** `docs/petyr/FORECAST_INTELLIGENCE_LAYER.md`, `docs/petyr/AI_FORECASTING_DESIGN.md`, `docs/05_forecasting_product_spec.md`, `docs/01_architecture.md`, `docs/04_data_model.md`, `docs/petyr/02_petyr_data_model_target.md`, `docs/petyr/03_petyr_business_rules.md`, `DEVLOG.md`.


## 2026-06-10 — Backfill 2026 closed revenue into Petyr Previous Month and Ongoing Forecast once

- **Status:** Accepted.
- **Context:** Product needs the 2026 Petyr data aligned by reporting already closed Redash revenue as Previous Month Forecast and Ongoing Forecast at DB level for months up to the selected execution date. This is required only once for historical 2026 cleanup and must not become future behavior.
- **Decision:** Add a dry-run-first protected Petyr Admin Area operation, backed by a server-side API and CLI fallback, that copies already closed 2026 Redash campaign revenue through the selected execution date into monthly `forecast_monthly` previous-month and ongoing rows with equal real values, and into `forecast_annual` rows that feed Management View Ongoing Forecast. The operation is restricted to 2026 and requires explicit apply confirmation to write.
- **Alternatives discarded:** Adding a CSM-facing/product workflow; creating a recurring scheduler; changing Redash materialized closed revenue; updating Initial Forecast snapshots; deriving future-year ongoing forecasts automatically from closed revenue.
- **Reason:** The alignment is a controlled historical data repair, not a product workflow. Exposing it in `/petyr-admin` removes shell-command dependency while preserving normal Petyr forecast ownership after 2026 cleanup.
- **Consequences:** Applying the admin operation or CLI fallback may overwrite existing 2026 monthly previous-month, monthly ongoing and annual forecast values for matching Company + Business Unit scopes with closed revenue aggregates. It writes forecast save/change audit rows, but does not write Initial Forecast snapshots, Redash materialized tables, AI forecast cache or Management Objectives.
- **Related docs:** `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `docs/04_data_model.md`, `docs/08_operational_commands.md`, `apps/forecasting-app/README.md`, `DEVLOG.md`.

## 2026-06-06 — Retry malformed Petyr OpenRouter JSON once under strict validation

- **Status:** Accepted.
- **Context:** A real OpenRouter preview run can still return prose, markdown fences or otherwise non-JSON content even when Petyr sends strict `response_format` and provider parameter enforcement. The user-facing failure appears as `$: Response must be strict valid JSON with no surrounding text.`
- **Decision:** Petyr may perform one server-side strict-JSON retry after an invalid OpenRouter response. The retry must use the same structured-output request settings and must pass the same JSON schema, deterministic target-set, baseline/planned/residual evidence and privacy validation before any preview row is accepted or cache write occurs.
- **Alternatives discarded:** Accepting model prose by extracting JSON locally; writing invalid output to cache; disabling strict validation; retrying indefinitely.
- **Reason:** One retry handles common provider/model formatting failures while preserving strict auditable validation and preventing malformed output from influencing AI Forecast rows.
- **Consequences:** OpenRouter cost can increase by at most one extra call for invalid LLM attempts. If the retry still fails, Petyr returns deterministic fallback for preview or no write for save/apply, with validation diagnostics.
- **Related docs:** `docs/05_forecasting_product_spec.md`, `docs/petyr/AI_FORECASTING_DESIGN.md`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `DEVLOG.md`.

## 2026-06-05 — Unify Petyr route navigation and scope AI generation to Forecast Entry

- **Status:** Accepted.
- **Context:** Management View and CSM Overview already used a shared explanatory header and section navigation. Company Detail and Forecast Entry still forced users through back-link navigation, Company Detail had no CSM/company/year navigator, and Company Detail still exposed AI Forecast generation.
- **Decision:** Petyr uses a shared workspace shell across Management View, CSM Overview, Company Detail and Forecast Entry. Company Detail uses the same Forecast Entry company catalog and priority ordering for CSM filter, company selection, previous/next and year reload. Data diagnostics move to the floating bottom-right menu on Company Detail and Forecast Entry. Manual AI Forecast generation/apply is exposed only in Forecast Entry; Company Detail shows `ai_forecast_cache` as read-only evidence.
- **Alternatives discarded:** Keeping Company Detail route-only with a back link; residual-only ordering in the dedicated Company Detail route; exposing AI generation in both Company Detail and Forecast Entry; keeping diagnostics as support cards in the page body.
- **Reason:** The product needs continuous navigation and visual coherence without changing data edit ownership. Forecast Entry remains the operational edit/generate area, while Company Detail remains analytical and read-only.
- **Consequences:** No schema, Redash source, API save contract or OpenRouter contract changes are introduced. Company Detail and Forecast Entry now share navigation semantics and diagnostics placement. Future AI Forecast UI changes must preserve Forecast Entry as the only generation/apply surface unless a later documented decision changes the ownership model.
- **Related docs:** `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `docs/petyr/03_petyr_business_rules.md`, `docs/petyr/COMPANY_ORDERING.md`, `STATUS_UI_ALIGNMENT_AND_AI_FORECAST.md`, `DEVLOG.md`.

## 2026-06-05 — Exclude CSM forecasts from Petyr OpenRouter forecast generation

- **Status:** Accepted.
- **Context:** The manual AI Forecast OpenRouter path must reason from real observed data and deterministic measurements. CSM-entered forecasts are useful comparison data in Petyr UI, but they can bias model output if included as input evidence for the AI forecast itself.
- **Decision:** Petyr OpenRouter AI forecast generation must include deterministic baseline candidates, historical closed revenue, selected-year closed/planned aggregates, planned campaign signals and agreement residual pressure signals. It must not send CSM-entered monthly forecast or annual forecast values to OpenRouter and must not use those values in deterministic candidate calculation. CSM forecasts may remain visible in UI aggregates as comparison/reference only.
- **Alternatives discarded:** Sending current CSM monthly forecasts as LLM context; sending annual CSM forecasts as LLM context; letting OpenRouter use CSM forecast values as a target anchor; relying only on prompt prose instead of provider-level structured output.
- **Reason:** AI forecast should be an independent system suggestion grounded in real Redash-derived evidence and auditable deterministic calculations, not a rephrasing or amplification of CSM-owned forecast input.
- **Consequences:** The OpenRouter request uses strict JSON Schema `response_format` plus provider parameter support enforcement. Server-side validation remains authoritative and rejects invalid JSON, unexpected fields, unknown Business Units, ineligible months, duplicate or missing target rows, and returned baseline/planned/residual evidence that does not match the deterministic candidates before any preview row is accepted or cache write occurs.
- **Related docs:** `docs/05_forecasting_product_spec.md`, `docs/petyr/AI_FORECASTING_DESIGN.md`, `DEVLOG.md`.

## 2026-05-26 — Lock Petyr Initial Forecast snapshots after consolidation

- **Status:** Accepted.
- **Context:** Initial Forecast is the frozen annual baseline and must not drift after the January 1 `Europe/Rome` consolidation or the 2026 bootstrap import.
- **Decision:** Petyr treats `forecast_annual_snapshot.locked_at` as the immutability marker for Initial Forecast. Normal imports and consolidations skip already locked snapshots instead of overwriting them. A protected admin recovery operation may overwrite locked snapshots only when it explicitly passes `overrideLocked=true`.
- **Alternatives discarded:** Re-consolidating over locked baselines by default; letting Ongoing Forecast updates refresh Initial Forecast; silently using annual forecast as both Initial and Ongoing Forecast.
- **Reason:** Management View needs a stable baseline that remains distinct from mutable Ongoing Forecast and Yearly Objective.
- **Consequences:** The manual consolidation endpoint remains available for controlled recovery, but normal reruns are idempotent against locked rows. Production scheduling is still tracked separately.
- **Related docs:** `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/04_data_model.md`, `docs/05_forecasting_product_spec.md`, `docs/petyr/02_petyr_data_model_target.md`, `docs/petyr/03_petyr_business_rules.md`, `docs/08_operational_commands.md`, `DEVLOG.md`.

## 2026-05-26 — Scope Petyr AI Forecasting as manual hybrid MVP

- **Status:** Accepted.
- **Context:** Petyr must move from pure AI Forecasting design toward a first operational MVP, while controlling OpenRouter cost/credits and testing output quality.
- **Decision:** The first AI Forecasting MVP is manual, company-by-company and scoped to `company + Business Unit + future month + year`. Petyr must not run a global automatic batch and must not process all companies together in this phase. AI Forecasting must be hybrid: deterministic baseline + business signals + LLM reasoning layer. The LLM must not invent numbers without baseline and signals. AI output may persist only to `ai_forecast_cache` and must not update CSM forecast, closed revenue, management objectives, Initial Forecast or annual forecast data. AI Forecast must never update past months or the current month.
- **Alternatives discarded:** Automatic global post-sync batch; all-company processing; LLM-only number generation; writing AI output into CSM-owned forecast tables or management objective data; updating the current month.
- **Reason:** Manual company-by-company execution limits cost exposure, makes quality review practical and preserves CSM/management-owned data boundaries.
- **Consequences:** AI batch sizing is deferred. Existing AI design/docs must describe the manual MVP first, with future automation requiring a later documented decision.
- **Related docs:** `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/petyr/AI_FORECASTING_DESIGN.md`, `docs/05_forecasting_product_spec.md`, `docs/petyr/03_petyr_business_rules.md`, `BACKLOG.md`, `DEVLOG.md`.

## 2026-05-26 — Define Petyr AI Forecast MVP baselines and output contract

- **Status:** Accepted.
- **Context:** The manual AI Forecasting MVP needs to be operational and explainable, not just a generic LLM prompt over company data.
- **Decision:** Petyr must compute deterministic baseline strategies before LLM reasoning: historical weighted baseline, monthly seasonality, run-rate, planned campaigns and agreement residual pressure. Planned future campaigns include valid future planned rows such as `Setup` and `Recruiting`; `Running` is excluded from planned future and belongs only to closed/current revenue activity when eligible. Agreement residual pressure considers active agreements with `residual > 0` and future expiry, then checks whether future forecast coverage closes the residual gap. The 2026-06-10 Forecast Intelligence decision supersedes the earlier row-level LLM value proposal. OpenRouter no longer proposes `aiForecastValue`; it receives the deterministic payload and returns structured interpretation JSON only.
- **Alternatives discarded:** LLM-only forecasting; treating `Running` as planned future; using expired residuals as future residual pressure; hiding residual gaps; returning only a number without drivers or advice.
- **Reason:** A hybrid, explainable output lets CSMs compare AI suggestions with real pipeline, agreement pressure and historical pace while preserving trust in deterministic evidence.
- **Consequences:** The expected MVP JSON includes `businessUnit`, `year`, `month`, `baselineForecast`, `plannedCampaignsValue`, `agreementResidualSignal`, `aiForecastValue`, `confidenceScore`, `explanation`, `advice` and `drivers`. Durable persistence for the richer driver fields remains a backlog decision because the current cache table does not store every field separately.
- **Related docs:** `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/petyr/AI_FORECASTING_DESIGN.md`, `BACKLOG.md`, `DEVLOG.md`.

## 2026-05-26 — Defer complete AI anonymization tool for first manual MVP

- **Status:** Accepted.
- **Context:** Petyr should eventually prevent company, CSM, campaign, agreement names and links from being sent to an external LLM/OpenRouter payload, but the first manual MVP needs to start controlled testing before a dedicated anonymization tool/API exists.
- **Decision:** Complete anonymization through a dedicated tool/API is deferred for the first manual company-by-company MVP and must not block the first controlled AI test. Petyr should still minimize payloads, omit links/free-text where practical and keep API keys server-side. Once the anonymization tool/API is available, LLM payloads must no longer include company names, CSM names, campaign names, agreement names, deal links, campaign links or other identifying text.
- **Alternatives discarded:** Blocking all manual AI testing until a complete anonymization service exists; sending broad raw Redash payloads, links or notes to the LLM; treating the temporary MVP exception as a permanent privacy policy.
- **Reason:** The MVP needs controlled quality/cost validation while preserving a clear path to stricter production privacy.
- **Consequences:** Add a backlog TODO for the anonymization service/tool. Broader production rollout remains blocked on privacy hardening.
- **Related docs:** `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/petyr/AI_FORECASTING_DESIGN.md`, `BACKLOG.md`, `DEVLOG.md`.

## 2026-05-26 — Consolidate Petyr Initial Forecast on January 1 Europe/Rome

- **Status:** Accepted.
- **Context:** The previous source of truth used a December 31 23:00 consolidation and left timezone open. Product now confirms the business timezone and changes the consolidation timing.
- **Decision:** From 2027 onward, Petyr Initial Forecast consolidation runs on January 1 in `Europe/Rome`. It saves the current annual forecast as the Initial Forecast for the year that has just started, or for the annual cycle explicitly defined by the consolidation service.
- **Alternatives discarded:** December 31 23:00 with unspecified timezone; UTC or Europe/Berlin by default; manual recurring imports after 2026.
- **Reason:** `Europe/Rome` is the business timezone for this forecast cycle, and January 1 better expresses the year-opening Initial Forecast baseline.
- **Consequences:** The production scheduler mechanism remains a separate backlog item. The exact target-year/cutoff semantics are still tracked as a TODO before implementation.
- **Related docs:** `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `docs/petyr/03_petyr_business_rules.md`, `BACKLOG.md`, `DEVLOG.md`.

## 2026-05-26 — Keep current Petyr alignment cycle visual and docs-only

- **Status:** Accepted.
- **Context:** Company Detail and Forecast Entry need to align visually to the Petyr MVP Rendering, while Management Objectives have already been added/configured and Excel import performance is outside the current cycle.
- **Decision:** Company Detail and Forecast Entry functional content is considered substantially correct; current work is visual/layout alignment to the Petyr MVP Rendering golden master, not a creative redesign or logic rewrite. Do not add new Management Objectives tasks except specific bug fixes. Manager-only RBAC and Excel import performance work are outside this cycle, and the temporary Management Objectives gate/current protection must not block this alignment.
- **Alternatives discarded:** Redesigning Company Detail or Forecast Entry; rewriting forecast logic during visual alignment; adding new objective/RBAC work in this package; adding Excel import performance tasks in this cycle.
- **Reason:** The task must keep scope tight and preserve the approved visual rendering and existing functional behavior.
- **Consequences:** Documentation now separates visual alignment from data/logic changes and marks RBAC/import performance as deferred for this cycle.
- **Related docs:** `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `docs/petyr/03_petyr_business_rules.md`, `BACKLOG.md`, `DEVLOG.md`.

## 2026-05-25 — Formalize privacy-first Petyr AI Forecasting design

- **Status:** Accepted; updated by `2026-05-26 — Scope Petyr AI Forecasting as manual hybrid MVP` and `2026-05-26 — Defer complete AI anonymization tool for first manual MVP`.
- **Context:** Petyr will later send company forecast features to an external LLM/OpenRouter model, but the AI Forecasting design must protect privacy, minimize data and prevent accidental changes to past or historical AI forecast output before production calls are implemented.
- **Decision:** Petyr AI Forecasting must not send identifying text to the model. Company names, CSM names, campaign names, agreement names, deal links, campaign links, identifying notes and other potentially sensitive free text are forbidden in LLM payloads. Petyr must use temporary deterministic pseudonyms such as `company_001`, `business_unit_QA`, `campaign_001` and `agreement_001`; the pseudonym-to-real-entity mapping must remain server-side only. AI Forecast generation may target only eligible future months of the selected year, must not modify past months, and must not overwrite historical AI Forecast generations.
- **Alternatives discarded:** Sending raw operational names or links to the LLM; keeping the pseudonym map client-side; logging prompt payloads with identifying data; letting the LLM decide which months can be updated; overwriting past or historical AI forecast rows during batch generation.
- **Reason:** Useful forecast features can be represented as minimized numeric/categorical signals without exposing unnecessary identifying data or mutating historical forecast evidence.
- **Consequences:** Future AI Forecast implementation must follow `docs/petyr/AI_FORECASTING_DESIGN.md`, validate/sanitize output before persistence, reconcile model output server-side, save only to `ai_forecast_cache`, and resolve open TODOs for model choice, confidence thresholds, batch size, output validation and append-only cache versioning before production rollout.
- **Related docs:** `docs/petyr/AI_FORECASTING_DESIGN.md`, `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/04_data_model.md`, `docs/05_forecasting_product_spec.md`, `BACKLOG.md`, `DEVLOG.md`.

## 2026-05-22 — Use stable campaign ordering for derived agreement deal links

- **Status:** Accepted.
- **Context:** Master Agreements has no usable agreement URL, and linked Master Campaigns can contain multiple deal links for the same agreement. Product requires the first available linked campaign deal link in deterministic order.
- **Decision:** Derive `agreementDealLink` from linked Master Campaigns rows matched by normalized company plus agreement name. Sort candidate campaigns by campaign end date, then start date, campaign name, campaign link, and finally materialized `row_index`; use the first non-empty campaign deal link. If no linked campaign has a link, render `n/a`.
- **Alternatives discarded:** Inventing agreement URLs; using a direct Master Agreements link; calling Redash from Petyr; relying on database return order; using unavailable agreement id, campaign id, or deal id columns.
- **Reason:** The ordering uses only currently materialized PostgreSQL data and stays deterministic without adding a new Redash source or schema dependency.
- **Consequences:** Agreement links shown in Petyr are operational deal links derived from campaign rows. If future normalized facts expose canonical agreement/deal ids, this tie-breaker can be revisited with a new documented decision.
- **Related docs:** `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/petyr/03_petyr_business_rules.md`, `BACKLOG.md`, `DEVLOG.md`.

## 2026-05-22 — Persist Petyr Initial Forecast in dedicated annual snapshot tables

- **Status:** Accepted.
- **Context:** Initial Forecast is a frozen annual CSM forecast baseline and must remain distinct from mutable/current Ongoing Forecast in `forecast_annual`, Yearly Objectives, closed revenue and AI forecast.
- **Decision:** Store Initial Forecast baselines in `forecast_annual_snapshot` with `snapshot_type=initial`, and audit every effective creation/overwrite in `forecast_annual_snapshot_change_log`. The 2026 Excel bootstrap uses source `manual_excel_2026`; future consolidation uses source `year_end_consolidation`; controlled non-2026 admin recovery can use source `admin`.
- **Alternatives discarded:** Reusing `forecast_annual`; treating earliest/current annual forecast as Initial Forecast; reusing monthly forecast import/change-log tables for annual baseline writes.
- **Reason:** A dedicated snapshot table preserves the frozen baseline while allowing Ongoing Forecast to continue changing safely.
- **Consequences:** Prisma schema, Management View reads, Initial Forecast Excel import/export and future consolidation service use the snapshot table. A real automatic scheduler remains a separate backlog item; schedule timing was later updated to January 1 `Europe/Rome`.
- **Related docs:** `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/04_data_model.md`, `docs/05_forecasting_product_spec.md`, `docs/petyr/02_petyr_data_model_target.md`, `docs/petyr/03_petyr_business_rules.md`, `BACKLOG.md`.

## 2026-05-22 — Bootstrap Petyr Initial Forecast 2026 through one-shot Excel import

- **Status:** Accepted.
- **Context:** 2026 has no historical Initial Forecast in Petyr because the baseline should have been defined during 2025.
- **Decision:** Handle 2026 through a one-shot Excel export/import flow. CSMs manually compile Initial Forecast 2026, and the import writes only Initial Forecast values without overwriting Ongoing Forecast.
- **Alternatives discarded:** Treating the first current `forecast_annual` value as the 2026 baseline; reusing the monthly import; overwriting Ongoing Forecast during bootstrap.
- **Reason:** 2026 needs an explicit bootstrap that preserves the distinction between frozen Initial Forecast and current Ongoing Forecast.
- **Consequences:** A dedicated implementation task is required. The existing monthly import behavior must remain unchanged.
- **Related docs:** `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `BACKLOG.md`.

## 2026-05-22 — Automatically freeze Petyr Initial Forecast from 2027 onward

- **Status:** Superseded by `2026-05-26 — Consolidate Petyr Initial Forecast on January 1 Europe/Rome`.
- **Context:** Initial Forecast should become a stable year-opening baseline and must not keep changing as Ongoing Forecast evolves.
- **Decision:** Original superseded decision: from 2027 onward, freeze Initial Forecast automatically every December 31 at 23:00 using the annual forecast in force at that moment. Later ongoing updates must not modify the frozen baseline.
- **Alternatives discarded:** Continuing annual manual imports; using the first arbitrary save of the year; allowing Ongoing Forecast updates to mutate Initial Forecast.
- **Reason:** A scheduled year-end freeze creates a consistent baseline without recurring manual spreadsheet operations.
- **Consequences:** Scheduler mechanism and exact target-year/cutoff semantics remain open TODOs before implementation.
- **Related docs:** `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/petyr/03_petyr_business_rules.md`, `BACKLOG.md`.

## 2026-05-22 — Derive agreement display links from campaign deal links

- **Status:** Accepted.
- **Context:** Master Agreements does not contain a usable agreement link, while Master Campaigns contains the useful deal link.
- **Decision:** To display a link for an agreement, Petyr must inspect campaigns linked to that agreement and use the first available campaign deal link in deterministic order. If none exists, show `n/a`.
- **Alternatives discarded:** Expecting an agreement URL from Master Agreements; inventing a URL; calling Redash directly from Petyr to resolve links.
- **Reason:** This uses the available Redash-derived data without violating the PostgreSQL-first architecture.
- **Consequences:** Petyr data mapping/rendering derives agreement display links from campaign rows and renders `n/a` when no linked campaign deal link exists.
- **Related docs:** `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/petyr/03_petyr_business_rules.md`, `BACKLOG.md`.

## 2026-05-22 — Separate expired agreement residuals from expiring-soon warnings

- **Status:** Accepted.
- **Context:** Expired agreements should not create `expiring within 60 days` warnings, but expired agreements with remaining residual still need visibility.
- **Decision:** Keep expired agreements out of expiring-soon warnings and show expired residuals in a separate category named `Expired agreement with residual`, including the residual value.
- **Alternatives discarded:** Hiding expired residuals entirely; mixing expired agreements into `expiring within 60 days`; treating expired residuals as active high-residual operational alerts.
- **Reason:** The category is operationally useful but has a different meaning and urgency from upcoming expiry.
- **Consequences:** Petyr alert/action services surface expired residuals separately from expiring-soon warnings.
- **Related docs:** `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/05_forecasting_product_spec.md`, `BACKLOG.md`.

## 2026-05-22 — Keep Petyr monthly import stable and log only effective changes

- **Status:** Accepted.
- **Context:** Product clarified that monthly import behavior should not change except in dedicated monthly import performance/status tasks, and Forecast Entry logs must stay sparse.
- **Decision:** The external Excel active-status vocabulary remains `active`, `inactive`, and blank = do not modify. Monthly import behavior stays unchanged outside dedicated tasks. Forecast Entry and import change logs must include only effective changes: changed Business Units, changed active/inactive status or other fields that actually changed.
- **Alternatives discarded:** Logging every submitted Business Unit; changing monthly import while adding Initial Forecast 2026; using blank active-status cells as inactive.
- **Reason:** Sparse logs preserve audit readability, and stable monthly import behavior prevents accidental data-flow regressions.
- **Consequences:** Active-status export behavior must be verified in a future task.
- **Related docs:** `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/petyr/03_petyr_business_rules.md`, `BACKLOG.md`.

## 2026-05-22 — Anonymize and minimize Petyr AI Forecasting payloads

- **Status:** Accepted as future privacy target; implementation timing updated by `2026-05-26 — Defer complete AI anonymization tool for first manual MVP`.
- **Context:** Future AI Forecasting may send forecast features to an external LLM/OpenRouter, creating privacy and data-minimization requirements.
- **Decision:** LLM payloads must exclude company, CSM, campaign and agreement names, deal/campaign links and other identifying text. Petyr must use temporary server-side pseudonyms and send only minimized numeric/categorical features. AI Forecast may update only future months of the selected year, never past months or the current month.
- **Alternatives discarded:** Sending raw operational names/links to the LLM; keeping pseudonym mapping client-side; allowing AI batches to rewrite historical forecasts.
- **Reason:** Forecasting can use useful features without exposing unnecessary identifying data or mutating historical AI output.
- **Consequences:** AI prompt/build logic needs explicit anonymization and month-scope controls before production AI forecasting expands. Complete anonymization timing was later deferred for the first manual MVP, and the current month is now excluded.
- **Related docs:** `PETYR_PRODUCT_AND_DATA_LOGIC.md`, `docs/petyr/03_petyr_business_rules.md`.

## 2026-05-22 — Split Petyr Management View forecast into Initial and Ongoing annual forecasts

- **Status:** Accepted for labels; baseline-source details superseded by `2026-05-22 — Bootstrap Petyr Initial Forecast 2026 through one-shot Excel import` and `2026-05-22 — Automatically freeze Petyr Initial Forecast from 2027 onward`.
- **Context:** Management View previously exposed a single Forecast value for Branch, Business Unit and CSM aggregates. Product needs to compare a frozen annual baseline for the selected year/scope against the current latest annual forecast, while keeping Yearly Objective as the management target.
- **Decision:** Show `Initial Forecast` and `Ongoing Forecast` in Management View rows/tables. `Initial Forecast` now means the frozen annual baseline for the selected year and perimeter; `Ongoing Forecast` means the current/latest annual forecast for that same year and perimeter. If the frozen baseline is unavailable, render `n/a` and surface diagnostics/admin warnings instead of inventing a baseline.
- **Alternatives discarded:** Reusing Yearly Objective as forecast baseline; using planned future campaigns as forecast; using current annual forecast as both Initial and Ongoing when history is unavailable; keeping the generic `Forecast` column.
- **Reason:** The forecast comparison must stay distinct from management targets and must not fabricate historical baselines.
- **Consequences:** `Ongoing Forecast` uses current annual forecast values when available. 2026 requires a separate bootstrap, and 2027+ requires automatic year-end freezing before `Initial Forecast` can be reliably populated.

## 2026-05-21 — Use hardcoded temporary password for Petyr Management Objectives

- **Status:** Accepted.
- **Context:** Product wants management-entered Branch and Business Unit objectives accessible from the bottom of Forecast Entry's Annual Forecast area before the shared manager-only RBAC layer exists.
- **Decision:** Render Management Objectives inline at the bottom of the Annual Forecast area and on `/forecasting/entry/objectives`, gated by the exact temporary hardcoded password `Pippo`. The API keeps the same temporary header check so objective reads/saves require the same value.
- **Alternatives discarded:** Continuing to require `PETYR_MANAGEMENT_OBJECTIVES_PASSWORD`; implementing RBAC in this task; leaving only a link to the objective route; leaving objective editing fully open.
- **Reason:** The explicit product request is for a temporary hardcoded password with uppercase `P`, while also documenting that it is not real security and not a sensitive secret.
- **Consequences:** No environment secret is configured for this gate. The password exists in code and can be visible client-side, so it must not be reused or treated as authorization. Manager-only RBAC remains the required final control.
- **Supersedes:** `2026-05-21 — Temporarily password-gate Petyr Management Objectives`.

## 2026-05-21 — Temporarily password-gate Petyr Management Objectives

- **Status:** Superseded by `2026-05-21 — Use hardcoded temporary password for Petyr Management Objectives`.
- **Context:** Forecast Entry must remain the clear monthly CSM editing area, while Management Objectives need to stay connected to the Annual Forecast area without becoming an unprotected management target editor before the shared access-control layer is available.
- **Decision:** Protect `/forecasting/entry/objectives` data loading/saving and `GET/POST /api/petyr/management-objectives` with the temporary environment password `PETYR_MANAGEMENT_OBJECTIVES_PASSWORD`. Keep the password gate separate from CSM Forecast Entry and present Management Objectives at the bottom of the Annual Forecast area.
- **Alternatives discarded:** Leaving Management Objectives fully open until RBAC; mixing management objective editing into monthly Forecast Entry; hardcoding a shared password in code.
- **Reason:** Product now requires temporary password protection and clearer placement, while repository rules forbid hardcoded secrets.
- **Consequences:** Operators must configure `PETYR_MANAGEMENT_OBJECTIVES_PASSWORD` before using Management Objectives. This is not a replacement for final manager-only RBAC, which remains an open access-control backlog item.

## 2026-05-21 — Use a closed allowlist for Petyr planned future campaign statuses

- **Status:** Accepted.
- **Context:** Planned through year end previously excluded clearly invalid future campaign statuses but still included missing or unrecognized statuses through a diagnostic fallback while the Redash taxonomy was pending confirmation.
- **Decision:** Planned future campaign revenue includes only future campaign rows whose status is `Setup` or `Recruiting`. `Running`, `Completed`, `Aborted`, `Cancelled`, `Canceled`, `Deleted`, `Rejected`, `Lost` and `Archived` are excluded from planned future. Missing or unknown statuses are diagnosed and excluded until a new business decision explicitly adds them. `Running` remains eligible only for closed revenue/revenue logic when the campaign date and closed-revenue rules make it coherent there.
- **Alternatives discarded:** Keeping the fallback that included unknown statuses; treating `Running` as planned future; keeping broad planned-like token matching such as draft/planned/pipeline/confirmed.
- **Reason:** Product has confirmed that planned future must represent only genuinely planned future rows and must not silently inflate management totals with unknown or already-running/closed/lost statuses.
- **Consequences:** Closed revenue + planned can decrease where future rows were previously included by fallback. Data diagnostics now report excluded missing/unknown statuses as action items instead of including them.
- **Supersedes:** `2026-05-15 — Use diagnostic invalid-status exclusion for Petyr planned future revenue`.

## 2026-05-15 — Use diagnostic invalid-status exclusion for Petyr planned future revenue

- **Context:** Planned through year end must use future Redash campaigns by campaign end date and must not include cancelled, deleted, void, lost, rejected, archived or equivalent campaign rows. The complete Redash status taxonomy is not yet documented as a closed business allowlist.
- **Decision:** Centralize planned future campaign eligibility in `isValidPlannedFutureCampaign(...)`. Exclude known invalid status tokens, include documented/current planned-like status tokens, and include missing or unrecognized statuses only through an explicit diagnostic fallback while the taxonomy is confirmed.
- **Alternatives discarded:** Continuing to include every future campaign regardless of status; blocking all missing or unrecognized statuses without a confirmed allowlist; using CSM forecast, AI forecast or annual forecast as planned-through-year-end.
- **Reason:** This removes the high-severity known-invalid inclusion risk while avoiding an undocumented hard allowlist that could undercount valid planned Redash campaigns.
- **Consequences:** Cancelled/non-valid future campaigns are excluded from Closed revenue + planned. Missing or unknown future campaign statuses now surface in diagnostics and remain tracked by a backlog item until Finance/Operations confirms the exact Redash status taxonomy.

## 2026-05-15 — Use ExcelJS for Petyr admin forecast workbooks

- **Context:** Petyr Admin needs CSM-friendly `.xlsx` export/import for 2026 historical monthly forecast input while keeping CSV compatibility.
- **Decision:** Add `exceljs` to `apps/forecasting-app` and use it for workbook generation/parsing. The workbook structure is `Instructions`, `Forecast Input`, `Reference - Business Units`, `Reference - Companies` and `Validation Rules`.
- **Alternatives discarded:** Keeping CSV as the primary format; hand-rolling OpenXML/ZIP generation and parsing; using mock workbook data.
- **Reason:** `exceljs` is a stable Node.js library that supports multiple sheets, styling, freeze panes, autofilter, column widths, number formats and workbook parsing without requiring Petyr to call Redash directly.
- **Consequences:** Petyr Admin can produce readable `.xlsx` templates and import `Forecast Input` while leaving Closed revenue and AI Forecast read-only. Docker/npm install must fetch the new dependency when building `apps/forecasting-app`.

## 2026-05-15 — Persist Petyr management objectives in dedicated tables

- **Context:** Petyr now needs runtime editing for annual Branch and Business Unit objectives from the Management Objectives area.
- **Decision:** Store current objective values in `management_objective` and write every save to `management_objective_change_log`. Scope is limited to `branch` and `business_unit`; Branch keys are validated against Company Ownership with `Unassigned Branch` allowed, and Business Unit keys are validated against the official closed list.
- **Alternatives discarded:** Reusing annual CSM forecast rows; keeping the empty hardcoded yearly objective config; writing objective changes only to generic forecast change logs.
- **Reason:** Objectives are management targets, not CSM forecasts. Dedicated tables keep the denominator source explicit and preserve objective-specific auditability.
- **Consequences:** Petyr Management View can read persisted Branch/Business Unit denominators without changing the approved rendering. Manager-only RBAC remains deferred to the access-control layer and must protect the route/API later.

## 2026-05-15 — Petyr yearly objectives are management-entered values

- **Context:** Petyr previously treated Branch and Business Unit yearly objectives as temporary hardcoded configuration or as missing values. Management now needs a dedicated way to insert and update annual objectives.
- **Decision:** Branch and Business Unit yearly objectives are annual values entered by management through a dedicated `Management Objectives` area linked from Forecast Entry, for example `/forecasting/entry/objectives`. Branch keys remain dynamic from Company Ownership `company_branch`; Business Unit keys remain limited to the official closed list.
- **Alternatives discarded:** Keeping objectives hardcoded in code config; using annual CSM forecasts as objectives; deriving objective values from Redash, closed revenue, planned campaigns or AI forecast.
- **Reason:** Objectives are management targets, not observed revenue or CSM forecast outputs. Keeping them explicit prevents fake denominators and preserves auditability.
- **Consequences:** Management View shows `n/a` and diagnostics when a Branch or Business Unit objective is missing. Objective edits require audit fields for scope, year, previous/new value, note, updater and timestamp. Manager-only RBAC and objective route/API protection are deferred until the access-control layer is implemented.

## 2026-05-14 — Access control must be additive to the existing data platform

- **Context:** The existing `unguess-data-platform` repo already contains Petyr, Redash Ingestor, platform-home and documentation. Access control must integrate without restructuring the repo.
- **Decision:** Add Access Control Platform documentation and future project entry points as an overlay: `docs/access-control/`, `services/auth-api/`, `apps/access-control-admin/`, `packages/auth-client/`.
- **Alternatives discarded:** Creating a separate standalone scaffold; replacing root `README.md`/`AGENTS.md`; moving existing apps.
- **Reason:** Avoid breaking the current working platform and preserve documentation-driven continuity.
- **Consequences:** Existing files are not changed. Cross-links from existing `README.md`/`AGENTS.md` can be added later only through an explicit task.

## 2026-05-14 — Use OAuth2 Proxy for Google login, not Google IAP

- **Context:** Internal tools need Google Workspace login, but the platform is not hosted on Google Cloud.
- **Decision:** Use OAuth2 Proxy or an equivalent OAuth/OIDC reverse proxy in front of web apps.
- **Alternatives discarded:** Google Identity-Aware Proxy as primary path; custom password login.
- **Reason:** OAuth2 Proxy works outside Google Cloud and can authenticate via Google OAuth/OpenID Connect.
- **Consequences:** The platform must enforce a strong network boundary: app backends must not be reachable directly if they trust proxy headers.

## 2026-05-14 — Do not use Google Groups in the initial access-control model

- **Context:** Google Groups could map users to roles but would add Workspace/Admin SDK complexity.
- **Decision:** Manage tool authorization in an internal Auth API using users, tools, memberships, roles and permissions.
- **Alternatives discarded:** Google Groups as primary source of authorization.
- **Reason:** The MVP needs simple, controllable, project-level authorization without Workspace admin complexity.
- **Consequences:** A future Google Groups sync can be added later, but it is out of scope for the first implementation.

## 2026-05-14 — Tool authorization is server-side and permission-based

- **Context:** Frontends can hide buttons, but security decisions must not happen in the UI.
- **Decision:** Every protected backend endpoint must check authorization through middleware or a shared client library.
- **Alternatives discarded:** Email allowlists inside frontend code; hardcoded user checks inside each app.
- **Reason:** Prevent drift and inconsistent access rules across tools.
- **Consequences:** `packages/auth-client` should expose reusable helpers such as `requirePermission()` and `auditEvent()`.

## 2026-06-24 - Move Petyr Daily AI Forecast to 02:00 and expose protected manual run

- **Status:** Accepted.
- **Context:** The deterministic Daily AI Forecast worker could miss the intended overnight run if a container started after the scheduled time. Product also requested a protected Petyr Admin recovery control, forecast values rounded to the nearest 100 EUR and configurable Management/Finance baseline weights.
- **Decision:** The Daily AI Forecast default schedule is `02:00` in `Europe/Rome`. Petyr Admin exposes a protected all-active-companies manual run that reuses the same deterministic worker service and writes only missing `ai_forecast_cache` rows for the daily model version. Deterministic AI Forecast final values round to the nearest 100 EUR. Baseline weights are a global Petyr Admin setting over historical weighted baseline, monthly seasonality and run-rate only; planned campaigns remain a floor and residual remains allocation/cap pressure. Until weights are saved, Petyr keeps the compatible positive-signal average fallback.
- **Alternatives discarded:** Running the manual control for one company only; changing planned campaign status eligibility; weighting planned or residual as uplift signals; blocking Daily AI Forecast until weights are configured.
- **Reason:** The 02:00 schedule gives more room after data operations, the manual run provides operator recovery, nearest-100 rounding matches product expectation and configurable weights allow Management/Finance calibration without hiding the existing fallback.
- **Consequences:** Operators can run Daily AI Forecast from `/petyr-admin` with `APP_INTERNAL_SECRET`. Re-running on the same day skips duplicate rows by `company + BU + year + month + model_version`. Actual approved Management/Finance values still need to be saved in Admin after review.
- **Related docs:** `apps/forecasting-app/README.md`, `docs/05_forecasting_product_spec.md`, `docs/petyr/AI_FORECASTING_DESIGN.md`, `docs/petyr/FORECAST_INTELLIGENCE_LAYER.md`, `docs/08_operational_commands.md`, `DEVLOG.md`.
