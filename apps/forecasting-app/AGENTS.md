# apps/forecasting-app - Codex Instructions

## Product name

The forecasting app is called Petyr.

## Scope

This app is the product-facing forecasting workspace for UNGUESS.

It must consume data from:
- PostgreSQL;
- or stable internal APIs exposed by the data layer.

Canonical company CSM owner and branch data comes from the Redash-derived
`company_ownership` source, materialized as `redash_raw_company_ownership_latest`.

It must never call Redash directly.

## Current app state

The current implementation contains:
- approved visual rendering at `/forecasting`;
- PostgreSQL-backed adapter data for `src/components/petyr/PetyrMVPRendering.tsx`;
- API health check;
- initial PostgreSQL preview endpoint for Redash snapshots.

## Near-term goal

Keep the approved rendering data-bound through PostgreSQL-backed Petyr services,
tighten diagnostics where source data is missing, and preserve the golden master
layout unless product explicitly asks for a UI change.

Do not remove the approved layout without explicit instruction.

## Business rules to preserve

- CSM Overview is read-only.
- Forecast Entry is the only monthly forecast editing area.
- Company Detail is analytical and read-only, but shows change history.
- Monthly forecast editing depends on the day of month.
- Annual forecast has draft and consolidated states.
- Every save must create a save session and change log.
- Multiple BU edits in one save must be grouped in one save session.
- Company active/inactive is saved with the forecast, not used as a simple filter.
- AI forecast is not editable.
- Closed revenue comes from Redash and is not editable.
- Business Units must use the official list.

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

## Technical rules

- Keep product logic out of React components when possible.
- Add services under `src/services`.
- Add reusable rules under `src/lib/forecasting`.
- Do not call Redash from this app.
- Use `DATABASE_URL` from environment.
- Do not hardcode API keys.
- OpenRouter integration must use `OPENROUTER_API_KEY` from env.

## Validation

Run:

```bash
npm run build
```

If Prisma was touched:

```bash
npx prisma generate
```
