# apps/redash-ingestor - Codex Instructions

## Purpose

This app is responsible for Redash ingestion and data persistence.

It may:
- call Redash;
- trigger syncs;
- store raw JSON snapshots in PostgreSQL;
- expose source status;
- expose data preview APIs.

It must not contain forecasting product UI beyond technical preview/status pages.

## Important sources

Use for first MVP:
- `master_campaigns` -> `1465`
- `master_agreements` -> `1572`
- `company_ownership` -> `1685`

Do not use unless explicitly requested:
- `hubspot_deals`
- `agreements_campaigns_join`
- `agreements_warnings`

## Rules

- Do not delete raw snapshots.
- Do not call Redash from preview endpoints.
- Preview endpoints read from PostgreSQL.
- Keep ingestion auditability.
- Keep secrets in env variables.

## Validation

From this app directory:

```bash
npm run build
npx prisma generate
```
