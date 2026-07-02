# Codex prompts

## Prompt 1 - Inspect monorepo

```txt
Read AGENTS.md and docs/00_start_here.md.

Inspect the repository tree.

Tell me:
1. whether apps/redash-ingestor exists and contains the current working app;
2. whether apps/forecasting-app exists;
3. whether the root documentation and AGENTS.md structure is coherent;
4. what the smallest safe next implementation step should be.

Do not modify files.
```

## Prompt 2 - Disable unused Redash sources visually

```txt
Read AGENTS.md and docs/03_redash_sources.md.

Task:
Update apps/redash-ingestor so the homepage shows only enabled Redash sources.

Requirements:
- Do not change Prisma schema.
- Do not delete existing sources.
- Add no dependencies.
- Ensure npm run build passes inside apps/redash-ingestor.

Acceptance criteria:
- Disabled RedashSource records do not appear on homepage.
```

## Prompt 3 - Add Redash preview API

```txt
Read AGENTS.md and docs/03_redash_sources.md.

Task:
In apps/redash-ingestor, add:
GET /api/redash/preview?source=master_campaigns&limit=50

It must read the latest RedashSnapshot for the given source from PostgreSQL and return:
- source key
- source name
- fetchedAt
- rowsCount
- columns
- rows limited by the limit query parameter

Payload paths:
- payload.query_result.data.columns
- payload.query_result.data.rows

Requirements:
- Do not call Redash.
- Do not change Prisma schema.
- source missing -> 400.
- source unknown -> 404.
- missing snapshot -> return empty columns and rows.
- npm run build must pass.
```

## Prompt 4 - Create forecasting app shell

```txt
Read AGENTS.md and docs/01_architecture.md and docs/05_forecasting_product_spec.md.

Task:
Create apps/forecasting-app as a separate Next.js TypeScript app.

Requirements:
- It must have a Dockerfile.
- It must expose a health endpoint.
- It must have a basic /forecasting page.
- It must not call Redash.
- It must be prepared to read from PostgreSQL using DATABASE_URL.
- Keep styling minimal.

Do not wire complex forecasting logic yet.
```

## Prompt 5 - Root docker compose

```txt
Read AGENTS.md and docs/01_architecture.md.

Task:
Create or update root docker-compose.yml so it can run:
- postgres
- redash-ingestor web
- redash-worker
- forecasting-app

Requirements:
- Reuse existing ingestor Dockerfile if possible.
- The forecasting app should expose port 3001 locally.
- The redash ingestor should expose port 3000 locally.
- PostgreSQL should be shared.
- Use env_file where appropriate.
- Do not hardcode secrets.
```

## Prompt 6 - Forecasting company preview service

```txt
Read AGENTS.md and docs/04_data_model.md and docs/05_forecasting_product_spec.md.

Task:
In apps/forecasting-app, create a first company preview API:
GET /api/forecasting/companies-preview

It must read from PostgreSQL and use the latest snapshots for:
- master_campaigns
- master_agreements

For now return:
- companyName
- campaignsCount
- agreementsCount
- sampleCampaignRows
- sampleAgreementRows

Requirements:
- Do not call Redash.
- Do not create normalized tables yet.
- Handle missing snapshots gracefully.
- Build must pass.
```
