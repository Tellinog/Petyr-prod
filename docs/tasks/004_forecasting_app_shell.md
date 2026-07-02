# Task 004 - Forecasting app shell

## Objective

Create the first separate forecasting application.

## Location

```txt
apps/forecasting-app/
```

## Requirements

- Next.js + TypeScript.
- Health endpoint.
- Basic `/forecasting` page.
- Dockerfile.
- Reads `DATABASE_URL`.
- Does not call Redash.

## Acceptance criteria

- `npm run build` passes in forecasting app.
- Container starts from root docker compose.
- Page opens at localhost:3001/forecasting.
