# Petyr installation in UNGUESS Data Platform

This package adds `apps/forecasting-app`, the base Petyr app.

## 1. Copy files

Copy the content of this package folder:

```txt
COPY_INTO_UNGUESS_DATA_PLATFORM_ROOT/
```

into the root of your existing repository:

```txt
unguess-data-platform/
```

After copying, you should have:

```txt
unguess-data-platform/apps/forecasting-app/
```

## 2. Add env values

In the root `.env`, add or verify:

```env
DATABASE_URL=postgresql://unguess:unguess_password@postgres:5432/unguess_redash?schema=public
OPENROUTER_API_KEY=replace_me
OPENROUTER_DEFAULT_MODEL=openai/gpt-4.1-mini
PETYR_APP_NAME=Petyr
PETYR_DEFAULT_YEAR=current
PETYR_TIMEZONE=Europe/Rome
```

The OpenRouter key can remain placeholder until AI work starts.
`PETYR_DEFAULT_YEAR=current` means Petyr uses the server's current calendar year as the default forecast year. Set a numeric value, for example `PETYR_DEFAULT_YEAR=2027`, only when you want to pin the default year explicitly.

## 3. Add Petyr to root docker-compose.yml

Add this service to the root `docker-compose.yml`:

```yaml
  forecasting-app:
    build:
      context: ./apps/forecasting-app
      dockerfile: Dockerfile
    container_name: unguess-forecasting-app
    command: npm run start
    env_file:
      - .env
    environment:
      DATABASE_URL: postgresql://unguess:unguess_password@postgres:5432/unguess_redash?schema=public
    depends_on:
      - postgres
    ports:
      - "3001:3000"
```

Do not remove `redash-ingestor` or `redash-worker`.

## 4. Build

From root:

```bash
docker compose build --no-cache forecasting-app
```

Then:

```bash
docker compose up
```

## 5. Open Petyr

```txt
http://localhost:3001/forecasting
```

## 6. Check health

```txt
http://localhost:3001/api/health
```

## 7. Check DB preview

```txt
http://localhost:3001/api/petyr/redash-preview?source=master_campaigns&limit=5
```

If this endpoint works, Petyr can read the same PostgreSQL database populated by Redash Ingestor.
