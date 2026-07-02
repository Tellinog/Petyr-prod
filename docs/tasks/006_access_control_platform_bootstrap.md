# Task 006 — Bootstrap Access Control Platform documentation and implementation plan

## Context

The existing repository is `unguess-data-platform`, a Dockerized monorepo with Redash Ingestor, Petyr Forecasting and platform-home.

Access Control must integrate without restructuring existing apps and without changing existing product/data logic.

## Required reading

Before doing anything, read:

```txt
AGENTS.md
README.md
docs/platform/DOCUMENTATION_DRIVEN_WORKFLOW.md
docs/access-control/SOURCE_OF_TRUTH.md
docs/access-control/ARCHITECTURE.md
docs/access-control/SECURITY.md
docs/access-control/API.md
docs/access-control/TOOL_INTEGRATION_GUIDE.md
```

## Task

Validate the Access Control Platform documentation overlay and prepare an implementation plan.

Do not write application code yet.

## Requirements

- Do not modify existing files unless explicitly requested.
- Do not modify `docker-compose.yml` yet.
- Do not implement Google Groups.
- Do not implement Google IAP.
- Do not hardcode user emails.
- Identify any conflicts with existing repo architecture.
- Add unresolved items to `docs/access-control/BACKLOG.md` or root `BACKLOG.md`.

## Expected output

A short implementation plan covering:

1. recommended Auth API stack;
2. DB/schema placement;
3. first pilot tool;
4. required proxy setup;
5. first middleware package shape;
6. first smoke tests;
7. files expected to change in the implementation task.

## Acceptance criteria

- No existing runtime files changed.
- Documentation conflicts, if any, are listed.
- `DECISIONS.md` is updated only if a decision is made explicitly.
- Next implementation task is narrow and actionable.
