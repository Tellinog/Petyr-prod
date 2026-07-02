# UNGUESS Redash Ingestor

Questo servizio è parte della root `unguess-data-platform`.

## Scopo

- chiamare Redash;
- salvare i JSON grezzi in PostgreSQL;
- mostrare stato sync e preview dei dati salvati;
- alimentare i futuri servizi, inclusa la Forecasting App.

## Avvio corretto

Non avviare questo servizio da questa cartella con un compose locale.

Usa il `docker-compose.yml` nella root:

```bash
cd ../../
docker compose up --build
```

Oppure dalla root del progetto:

```bash
docker compose up --build
```

Il worker Docker esegue il sync automatico ogni giorno alle `01:30` con timezone `Europe/Rome`.
La dashboard espone anche un pannello di sync manuale. Nel Compose root e raggiungibile dal gateway su `/redash-ingestor`.

## Endpoint utili

```txt
GET  /redash-ingestor/api/health
GET  /redash-ingestor/api/sources
POST /redash-ingestor/api/redash/sync
GET  /redash-ingestor/api/redash/latest?source=master_campaigns
GET  /redash-ingestor/api/redash/preview?source=master_campaigns&limit=50
GET  /redash-ingestor/api/redash/db-table-preview?source=master_campaigns&limit=25
GET  /redash-ingestor/api/redash/runs
```

Direct local app development can leave `NEXT_PUBLIC_REDASH_INGESTOR_BASE_PATH` empty and use the unprefixed `/api/...` routes on the ingestor dev port. Root Docker Compose sets the non-secret gateway base path from `REDASH_INGESTOR_BASE_PATH`, default `/redash-ingestor`.

## Access Layer preparation

Redash Ingestor is prepared as a separate Access Layer tool from Petyr. It remains the technical service that calls Redash and writes PostgreSQL snapshots/materialized tables; Petyr continues to read PostgreSQL-backed data and must not call Redash or Redash Ingestor for product data.

Local development stays open by default:

```env
NODE_ENV=development
REDASH_INGESTOR_AUTH_MODE=disabled
```

In this mode Redash Ingestor uses a deterministic local operator identity, `dev.redash-ingestor@local`, with read, sync, source-write and admin permissions.

Production must fail closed through Access Layer:

```env
REDASH_INGESTOR_AUTH_MODE=access-layer
ACCESS_LAYER_PUBLIC_BASE_URL=https://access-layer.draftapps.it
ACCESS_LAYER_INTERNAL_BASE_URL=https://access-layer.draftapps.it
ACCESS_LAYER_CALLBACK_URL=https://petyr.draftapps.it/redash-ingestor/auth/callback
ACCESS_LAYER_TOOL_SLUG=redash-ingestor
ACCESS_LAYER_CLIENT_ID=replace_with_redash_ingestor_tool_client_id
ACCESS_LAYER_CLIENT_SECRET=replace_with_redash_ingestor_tool_client_secret
REDASH_INGESTOR_SESSION_SECRET=replace_with_long_random_session_secret
```

The Access Layer `redash-ingestor` tool must register:

```txt
redash-ingestor:read
redash-ingestor:sync
redash-ingestor:sources:write
redash-ingestor:admin
```

`redash-ingestor:read` protects dashboard/status/preview APIs, `redash-ingestor:sync` protects manual sync, and `redash-ingestor:sources:write` protects source create/update in addition to the existing `x-app-secret`/`APP_INTERNAL_SECRET` check.

## Sorgenti MVP

Le sorgenti attive per il primo MVP sono:

- `master_campaigns` → Redash query `1465`
- `master_agreements` → Redash query `1572`

- `company_ownership` -> Redash query `1685`

Le vecchie sorgenti non necessarie vengono disabilitate dal seed.
