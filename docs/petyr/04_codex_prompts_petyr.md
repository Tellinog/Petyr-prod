# Codex prompts for Petyr

## Prompt 1 - Validate Petyr base

```txt
Read AGENTS.md and docs/petyr/00_petyr_context.md.

Task:
Validate the Petyr base app inside apps/forecasting-app.

Do not change product logic yet.

Check:
- app builds;
- /forecasting renders the approved data-bound UI with diagnostics/empty states when source data is missing;
- /api/health works;
- /api/petyr/redash-preview can read PostgreSQL if data exists.

If something is broken, make the smallest fix.

Acceptance criteria:
- npm run build passes inside apps/forecasting-app.
```

## Prompt 2 - Add Petyr to root Docker Compose

```txt
Read AGENTS.md and README_PETYR_INSTALL.md.

Task:
Update the root docker-compose.yml to include forecasting-app.

Requirements:
- Keep postgres, redash-ingestor and redash-worker unchanged.
- Add forecasting-app using build context ./apps/forecasting-app.
- Expose it on localhost:3001.
- Use the shared root .env.
- Use DATABASE_URL pointing to postgres:5432.
- Do not touch apps/redash-ingestor logic.

Acceptance criteria:
- docker compose config --services includes forecasting-app.
- docker compose build forecasting-app passes.
```

## Prompt 3 - Extend Petyr data service from PostgreSQL

```txt
Read docs/petyr/01_petyr_architecture.md and docs/petyr/03_petyr_business_rules.md.

Task:
Extend src/services/petyrDataService.ts in apps/forecasting-app.

Goal:
Add or refine PostgreSQL-derived read models without changing the approved rendering.

Requirements:
- Read latest materialized tables for master_campaigns, master_agreements and company_ownership from PostgreSQL.
- Do not call Redash.
- Return the documented company, CSM, management or admin diagnostic read model needed by the task.
- Add or update only the documented endpoint required by the task.
- Do not create new database tables unless the task explicitly selects a documented schema/backlog item.

Acceptance criteria:
- npm run build passes.
- Endpoint handles missing snapshots gracefully.
```

## Prompt 4 - Centralize forecast editability

```txt
Read docs/petyr/03_petyr_business_rules.md.

Task:
Use src/lib/forecasting/calendarRules.ts as the single source for monthly forecast editability.

Requirements:
- Do not duplicate the rule in React components.
- Add unit-like assertions or simple helper tests if project structure supports it.
- Keep current UI behavior aligned with the approved rendering.

Acceptance criteria:
- npm run build passes.
```

## Prompt 5 - Prepare forecast persistence schema proposal

```txt
Read docs/petyr/02_petyr_data_model_target.md.

Task:
Create a migration proposal document for Petyr forecast tables.

Do not change Prisma schema yet.

Output:
- docs/petyr/05_forecast_tables_migration_proposal.md
- include table names, fields, relationships, and rollout plan.
```
