# Task 001 - Prepare monorepo

## Objective

Prepare the repository root for a multi-service UNGUESS data platform.

## Context

The current working app should become:

```txt
apps/redash-ingestor/
```

A future forecasting app will live in:

```txt
apps/forecasting-app/
```

## Requirements

- Do not rewrite current app.
- Keep current app working.
- Ensure root AGENTS.md exists.
- Ensure docs exist.

## Acceptance criteria

- Repository has `apps/redash-ingestor`.
- Repository has root `AGENTS.md`.
- Repository has `docs/`.
- Git status is clean after commit.
