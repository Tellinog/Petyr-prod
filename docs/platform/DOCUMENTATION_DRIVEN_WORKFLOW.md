# Documentation-driven workflow

This repository is a multi-project platform. All work must be documentation-driven.

## Existing source of truth

Before changing anything, read the relevant documents.

### Root / platform

- `AGENTS.md`
- `README.md`
- `docs/00_start_here.md`
- `docs/01_architecture.md`
- `docs/08_operational_commands.md`
- `DECISIONS.md`
- `BACKLOG.md`
- `DEVLOG.md`

### Petyr / Forecasting

- `PETYR_PRODUCT_AND_DATA_LOGIC.md`
- `docs/05_forecasting_product_spec.md`
- `docs/petyr/*`
- `apps/forecasting-app/AGENTS.md`
- `apps/forecasting-app/README.md`

### Redash Ingestor

- `docs/03_redash_sources.md`
- `docs/04_data_model.md`
- `apps/redash-ingestor/AGENTS.md`
- `apps/redash-ingestor/README.md`

### Access Control Platform

- `docs/access-control/SOURCE_OF_TRUTH.md`
- `docs/access-control/ARCHITECTURE.md`
- `docs/access-control/SECURITY.md`
- `docs/access-control/TOOL_INTEGRATION_GUIDE.md`

## Anti-assumption rule

If a dev/LLM finds anything that is:

- unspecified;
- ambiguous;
- inconsistent;
- not documented;
- conflicting between code and documentation;
- derivable only by intuition;

then it must not invent a solution.

It must add a backlog item to the most specific backlog available.

Use:

- `docs/access-control/BACKLOG.md` for Access Control issues;
- `BACKLOG.md` for platform-level issues;
- app/service-specific backlog if present.

## Documentation update rule

Update documentation when changing:

- product logic;
- workflows;
- APIs;
- data models;
- mappings;
- import/export logic;
- UI behaviour;
- integrations;
- diagnostics;
- permissions;
- security;
- deployment;
- relevant copy.

Use:

- `DEVLOG.md` for behavioural or architectural changes;
- `DECISIONS.md` for decisions;
- `BACKLOG.md` for unresolved ambiguity;
- specific docs for the project being changed.

## Existing file protection

Do not modify existing root files unless the task explicitly asks for it.

Especially avoid silent changes to:

- `AGENTS.md`;
- `README.md`;
- `docker-compose.yml`;
- `.env.example`;
- `.gitignore`;
- `PETYR_PRODUCT_AND_DATA_LOGIC.md`;
- Petyr golden master UI files.

When a cross-link is needed but modification is not allowed, create a new handoff document and state the suggested snippet there.
