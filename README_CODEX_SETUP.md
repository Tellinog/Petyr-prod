# Codex setup guide for UNGUESS Data Platform

## Recommended approach

For this project, use **Codex locally first**.

Reason:
- Docker already works on your machine;
- the Redash ingestor has local `.env` values;
- you can validate builds and Docker behavior immediately;
- it avoids cloud/environment setup complexity while the architecture is still evolving.

Later, move to GitHub + Codex Cloud for PR-style work.

## Step 1 - Create the parent folder

From the directory where you keep projects:

```bash
mkdir unguess-data-platform
cd unguess-data-platform
```

## Step 2 - Copy documentation files

Copy the contents of:

```txt
COPY_INTO_UNGUESS_DATA_PLATFORM_ROOT/
```

into:

```txt
unguess-data-platform/
```

## Step 3 - Move current working project

You currently have a working project called something like:

```txt
unguess-redash-app/
```

Move it into the monorepo as:

```txt
unguess-data-platform/apps/redash-ingestor/
```

Recommended command from the parent of both folders:

```bash
mkdir -p unguess-data-platform/apps
mv unguess-redash-app unguess-data-platform/apps/redash-ingestor
```

If you are on Windows, you can also drag the folder manually in Explorer.

## Step 4 - Keep AGENTS.md files

After the move, make sure these files exist:

```txt
unguess-data-platform/AGENTS.md
unguess-data-platform/apps/redash-ingestor/AGENTS.md
unguess-data-platform/apps/forecasting-app/AGENTS.md
```

The root `AGENTS.md` explains the whole platform.
The app-level `AGENTS.md` files explain app-specific rules.

Codex reads `AGENTS.md` files before working and can layer project-specific instructions. This keeps the agent aligned with your repo and workflow.

## Step 5 - Initialize git at the root

From:

```bash
cd unguess-data-platform
```

Run:

```bash
git init
git add .
git commit -m "Initial UNGUESS data platform structure"
```

## Step 6 - Install Codex CLI

Install Codex CLI:

```bash
npm install -g @openai/codex
```

Then run it from the monorepo root:

```bash
cd unguess-data-platform
codex
```

Run Codex from the root, not from `apps/redash-ingestor`, because it needs to understand that the two apps are connected.

## Step 7 - First prompt to Codex

Use this first:

```txt
Read AGENTS.md and docs/00_start_here.md.

We are migrating the current working UNGUESS Redash ingestion app into a monorepo data platform.

Do not rewrite the application.

First, inspect the repository tree and tell me whether the current redash-ingestor app is correctly located under apps/redash-ingestor and whether the documentation structure is coherent.

Then propose the smallest next step.
```

## Step 8 - Safety workflow

Before every Codex task:

```bash
git status
git add .
git commit -m "Checkpoint before Codex task"
```

After Codex finishes:

```bash
git diff
```

Validate:

```bash
docker compose build
```

If good:

```bash
git add .
git commit -m "Describe the Codex change"
```

If bad:

```bash
git restore .
```

## When to use Codex Cloud

Use Codex Cloud later when:
- the code is in a private GitHub repository;
- you want PRs;
- you want task history;
- you want cloud execution;
- the setup script is stable.

For now, local is better.
