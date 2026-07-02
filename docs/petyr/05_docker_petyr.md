# Docker integration for Petyr

The root docker-compose.yml orchestrates the whole platform.

It is not one container.

It starts multiple containers:

```txt
postgres
redash-ingestor
redash-worker
forecasting-app
```

Each app has its own Dockerfile.

```txt
apps/redash-ingestor/Dockerfile
apps/forecasting-app/Dockerfile
```

`forecasting-app` reads PostgreSQL using the same `DATABASE_URL` as the rest of the platform, but it does not own Redash ingestion.

## Local URLs

```txt
http://localhost:3000  -> Redash Ingestor
http://localhost:3001  -> Petyr Forecasting App
```

## Rebuild after Codex changes

If Codex changes Petyr code:

```bash
docker compose build --no-cache forecasting-app
docker compose up
```

If Codex changes root compose:

```bash
docker compose config --services
docker compose up --build
```
