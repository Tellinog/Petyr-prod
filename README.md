# UNGUESS Data Platform

Repository Dockerizzata per costruire la data platform UNGUESS.

## Stato attuale

Implementato:

- `apps/redash-ingestor`: servizio che legge Redash e salva snapshot JSON in PostgreSQL;
- `apps/forecasting-app`: workspace Petyr Forecasting;
- `platform-home`: gateway/reverse proxy locale per l'accesso unificato;
- root `docker-compose.yml` con PostgreSQL, Redash Ingestor, Redash Worker, Petyr e gateway;
- `petyr-ai-forecast-worker`: worker notturno per salvare la deterministic preview come AI Forecast;
- preview dati salvati a database.
- schema Prisma Petyr per forecast mensile, annuale, sessioni di salvataggio,
  metadati annuali customer/year, change log, stato company e cache AI.

## Avvio rapido

```bash
cp .env.example .env
# compila REDASH_API_KEY, APP_INTERNAL_SECRET e le credenziali PostgreSQL coerenti
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

Apri l'accesso unificato locale:

```txt
http://localhost:8080/forecasting       -> Petyr Forecasting
http://localhost:8080/petyr-admin       -> Petyr Admin
http://localhost:8080/redash-ingestor   -> Redash Ingestor dashboard tecnico
```

La root `http://localhost:8080` reindirizza a `/forecasting` quando usi il compose locale. Il compose root e orientato a Coolify: espone `platform-home:8080` alla rete Docker senza bindare una porta host. Per sviluppo locale usa `docker-compose.local.yml` o un override esplicito; in produzione Coolify deve puntare il dominio al servizio `platform-home` sulla porta container `8080`.

## Nota sul database condiviso

Nel setup multi-app, PostgreSQL e' condiviso tra Redash Ingestor, Petyr e i
servizi futuri. I singoli container applicativi non devono eseguire
automaticamente `prisma db push`, `docker:bootstrap` o script come `safeDbPush`
a ogni startup: uno schema Prisma parziale puo' interpretare le tabelle di un
altro servizio come estranee e tentare di eliminarle.

La preparazione dello schema e gestita da step controllati di bootstrap: in root
compose `forecasting-db-sync` applica per primo lo schema Prisma superset di
Petyr, poi `redash-bootstrap` esegue solo il seed idempotente delle sorgenti
Redash. Nessun servizio con schema Prisma parziale deve eseguire `db push` sullo
schema PostgreSQL condiviso. La prima sync Redash resta opzionale con
`REDASH_INITIAL_SYNC_ON_BOOTSTRAP=true`.

Guida completa:

```txt
README_INSTALL_DOCKER.md
```

Schema database Petyr:

```bash
cd apps/forecasting-app
npm run db:sync
```

`apps/forecasting-app/prisma/schema.prisma` is the Prisma superset schema for
the shared static tables: Redash Ingestor models plus Petyr forecast models.
The Redash latest raw tables are still materialized by the ingestor at sync time.
Use `npm run db:push` instead of raw `npx prisma db push` so the script preserves
the materialized `redash_raw_*_latest` tables while Prisma updates static tables.
For local/dev builds after Prisma schema changes, use:

```bash
cd apps/forecasting-app
npm run build:sync
```

`build:sync` first runs the safe Petyr schema sync and then `next build`. Keep
the plain `npm run build` command for production and CI unless a reviewed deploy
step explicitly applies database changes first.
