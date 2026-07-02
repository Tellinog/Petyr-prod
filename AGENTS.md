# UNGUESS Data Platform - Codex Instructions

## Project identity

This repository is the future-proof data platform for UNGUESS.

It is designed as a Dockerized multi-service platform where:
- Redash data ingestion is one service;
- Forecasting product UI/API is another service;
- PostgreSQL is the shared data hub;
- future services and agents can consume the same Redash-derived data.

## Target architecture

Correct data flow:

```txt
Redash
  ↓
apps/redash-ingestor
  ↓
PostgreSQL raw snapshots
  ↓
PostgreSQL normalized facts / internal APIs
  ↓
apps/forecasting-app
  ↓
Forecasting UI / AI agent
```

Forecasting must not call Redash directly.

Forecasting reads:
1. from PostgreSQL;
2. or from stable internal APIs exposed by the data layer;
3. never from Redash APIs directly.

## Apps

### apps/redash-ingestor

Purpose:
- call Redash APIs;
- store raw JSON payloads in PostgreSQL;
- expose technical endpoints for sync, status, preview and diagnostics;
- optionally expose read-only data APIs for downstream apps.

Current important Redash sources:
- `master_campaigns` -> Redash query `1465`
- `master_agreements` -> Redash query `1572`
- `company_ownership` -> Redash query `1685`

Do not use these sources unless explicitly requested:
- `hubspot_deals` -> `1586`
- `agreements_campaigns_join` -> `1574`
- `agreements_warnings` -> `1593`

### apps/forecasting-app

Purpose:
- provide the product-facing forecasting workspace;
- consume data from PostgreSQL or stable internal APIs;
- provide company, CSM, monthly forecast and management views;
- later support AI-generated forecasts, manual forecast entry, notes and revision logs.

## Technical stack

Preferred stack:
- TypeScript
- Next.js
- Prisma
- PostgreSQL
- Docker
- Docker Compose
- shared packages only when needed

## Repository rules

- Keep this as a monorepo.
- Do not duplicate database schema logic casually.
- Prefer a shared Prisma schema or shared package when both apps need the same DB model.
- Use environment variables, never hardcode secrets.
- Never commit real `REDASH_API_KEY`, database passwords, tokens or production URLs with credentials.
- Use `.env.example` placeholders.

## Docker rules

The target setup has one `docker-compose.yml` at repository root.

Container naming direction:
- `postgres`
- `redash-ingestor`
- `redash-worker`
- `forecasting-app`

Each app can have its own Dockerfile.

PostgreSQL is the shared persistent service.

## Data rules

Raw Redash data must remain auditable.

Raw snapshots are useful for:
- debug;
- traceability;
- comparing syncs;
- reconstructing previous source states.

Forecasting UI should consume service-level or normalized data, not raw Redash JSON directly.

## Coding rules

- Keep changes minimal and task-focused.
- Read `docs/` before implementing product logic.
- If changing architecture, update `docs/01_architecture.md`.
- If changing Redash sources, update `docs/03_redash_sources.md`.
- If changing DB schema, update `docs/04_data_model.md`.
- If adding forecasting functionality, update `docs/05_forecasting_product_spec.md`.
- Ensure builds pass for impacted apps.

## Validation commands

Use app-specific commands where possible.

For the current ingestor app:

```bash
cd apps/redash-ingestor
npm run build
npx prisma generate
```

For Docker validation from the repository root:

```bash
docker compose build
docker compose up
```

## Working style

Before making changes:
1. inspect current tree;
2. identify affected app;
3. explain intended file changes briefly;
4. implement;
5. run the smallest meaningful validation command;
6. report diff summary and any failed validation honestly.

## Product direction

The first forecasting MVP should prioritize:
1. reliable Redash data ingestion;
2. visible data preview;
3. clean company-level forecasting data service;
4. first `/forecasting` workspace;
5. later normalized facts;
6. later manual forecast entry;
7. later AI forecast suggestions;
8. later revision logs and notes.

# Documentation-driven workflow for all projects

This repository is documentation-driven.

Every app, service, package, agent, workflow, integration or tool inside this root must be developed starting from its documentation source of truth.

The dev/LLM must not start from intuition, code inspection alone, assumptions, or inferred behavior.

Before modifying code, configuration, flows, data models, API contracts, UI behavior, copy, permissions, security rules, integrations, deploy logic or tests, the dev/LLM must identify and read the relevant documentation for the project being modified.

## 1. Mandatory root documentation preflight

Before working on any project, always read:

1. `AGENTS.md`
2. `README.md`
3. `docs/platform/DOCUMENTATION_DRIVEN_WORKFLOW.md`, if present
4. `BACKLOG.md`
5. `DECISIONS.md`
6. `DEVLOG.md`, when the task may change behavior or architecture

These files define repository-wide rules, handoff standards, unresolved issues and architectural decisions.

## 2. Mandatory project documentation preflight

After reading the root documentation, identify the target project.

A project may live in one of these locations:

- `apps/<project-name>/`
- `services/<service-name>/`
- `packages/<package-name>/`
- `platform-home/`
- `docs/<project-name>/`
- another documented folder declared in `README.md` or `AGENTS.md`

Then read the project-specific source of truth.

The source of truth may be declared in one or more of these files:

- `docs/<project-name>/SOURCE_OF_TRUTH.md`
- `apps/<project-name>/README.md`
- `services/<service-name>/README.md`
- `packages/<package-name>/README.md`
- `<PROJECT_NAME>_PRODUCT_AND_DATA_LOGIC.md`
- `<PROJECT_NAME>_DOCUMENTATION_AND_HANDOFF_RULES.md`
- project-specific `AGENTS.md`
- project-specific `BACKLOG.md`
- project-specific `DECISIONS.md`

If the project documentation exists, it overrides assumptions from code.

If no project documentation exists, the dev/LLM must not invent missing product, data, security, permission, API, UX or workflow rules. It must create or update the relevant backlog with the missing documentation need.

## 3. Source of truth hierarchy

When multiple instructions exist, use this priority order:

1. explicit task instructions from the user;
2. root `AGENTS.md`;
3. project-specific source of truth;
4. root `DECISIONS.md`;
5. project-specific `DECISIONS.md`;
6. root/project `BACKLOG.md`;
7. existing code behavior, only when not conflicting with documentation.

If code and documentation conflict, documentation wins until the conflict is resolved by a documented decision.

The dev/LLM must:
- report the conflict;
- avoid making autonomous product decisions;
- add a backlog entry;
- continue only on the parts clearly defined by documentation.

## 4. Anti-assumption rule

If the dev/LLM finds a point that is:

- unspecified;
- ambiguous;
- inconsistent;
- undocumented;
- conflicting between code and documentation;
- only inferable by intuition;
- dependent on business rules not written in the repository;

it must not invent the answer.

It must add a backlog entry in the appropriate location:

- root `BACKLOG.md`, for cross-project or platform-level issues;
- `docs/<project-name>/BACKLOG.md`, for project-level issues;
- `apps/<project-name>/BACKLOG.md`, if that is where the project keeps its backlog;
- `services/<service-name>/BACKLOG.md`, for service-specific issues;
- `packages/<package-name>/BACKLOG.md`, for package-specific issues.

Each backlog entry must include:

- Area
- Problem / question
- Impact
- Status
- Proposal or next action

## 5. What can be modified

The dev/LLM may modify files only when the change is supported by:

- the task request;
- the documented source of truth;
- an existing documented decision;
- an explicit backlog item selected for implementation.

The dev/LLM must not modify without explicit instruction:

- authentication or authorization behavior;
- permission models;
- database schema;
- migrations;
- external integrations;
- API contracts;
- production deploy configuration;
- environment variable names;
- data import/export logic;
- security-sensitive code;
- analytics definitions;
- business calculations;
- user-facing terminology;
- role mappings;
- workflow automations.

## 6. Documentation update rule

Whenever a change affects behavior, the dev/LLM must update documentation in the same task.

Update `DEVLOG.md` when changing:

- product logic;
- flows;
- APIs;
- data models;
- mappings;
- imports or exports;
- UI behavior;
- integrations;
- diagnostics;
- permissions;
- relevant copy;
- architecture;
- deployment;
- security.

Update `DECISIONS.md` when taking or implementing a relevant architectural, product or security decision.

Update `BACKLOG.md` when encountering ambiguity, deferred scope, unresolved conflicts or missing information.

Update project docs when the change affects a specific project.

## 7. Handoff rule

At the end of every task, the dev/LLM must provide a handoff summary containing:

- docs read;
- files changed;
- behavior changed;
- decisions added or referenced;
- backlog items added or resolved;
- tests run;
- known limitations;
- suggested next step.

If no behavior changed, state that no `DEVLOG.md` entry was required.

## 8. Google Docs and external documents

External documents, including Google Docs, Notion pages, Slack threads, emails or PDFs, may be used for human collaboration and context.

However, Codex and implementation work must treat repository Markdown files as the operational source of truth.

If an external document contains requirements that affect implementation, those requirements must be copied or summarized into the repository documentation before implementation starts.

The repository documentation is the source of truth for development.

## 9. Required behavior for Codex / LLM agents

When receiving a task, Codex or any LLM agent must first respond with:

1. which project it believes the task belongs to;
2. which root docs it will read;
3. which project docs it will read;
4. whether the task is sufficiently documented;
5. whether implementation can proceed or whether backlog clarification is needed.

The agent must not start implementing until this preflight is complete.
