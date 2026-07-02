# Codex workflow

## Where to run Codex

Run Codex from the monorepo root:

```bash
cd unguess-data-platform
codex
```

Do not run it from only one app unless the task is strictly local to that app.

Reason:
Codex must understand:
- `apps/redash-ingestor`;
- `apps/forecasting-app`;
- shared docs;
- root Docker Compose;
- cross-service data flow.

## Recommended mode

Use Codex CLI locally first.

Why:
- the Docker setup runs on your machine;
- local `.env` works;
- faster debugging;
- no cloud setup complexity during early architecture work.

## Git safety

Before each Codex task:

```bash
git status
git add .
git commit -m "Checkpoint before Codex task"
```

After the task:

```bash
git diff
```

If it is good:

```bash
git add .
git commit -m "Meaningful message"
```

If it is wrong:

```bash
git restore .
```

## Good task format

Use:

```txt
Read AGENTS.md and the relevant docs before changing files.

Context:
...

Task:
...

Requirements:
...

Acceptance criteria:
...

Do not:
...
```

## Bad task format

Avoid vague prompts like:

```txt
Build the forecasting app.
```

Too broad.

Prefer:

```txt
Create /api/redash/preview in apps/redash-ingestor without changing Prisma schema.
```
