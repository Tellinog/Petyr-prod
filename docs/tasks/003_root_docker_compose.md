# Task 003 - Root Docker Compose

## Objective

Create a root docker-compose setup for the data platform.

## Services

- postgres
- redash-ingestor
- redash-worker
- forecasting-app

## Requirements

- Ingestor available at localhost:3000.
- Forecasting app available at localhost:3001.
- PostgreSQL shared by both apps.
- Use `.env` and `.env.example`.
- No secrets committed.

## Acceptance criteria

- `docker compose up --build` starts all implemented services.
- Forecasting app may be a placeholder if not implemented yet.
- Existing ingestor still works.
