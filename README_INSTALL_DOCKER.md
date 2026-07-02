# UNGUESS Data Platform - installazione Docker locale

Questa repository è pensata come **data platform locale Dockerizzata**.

Per ora contiene:

- `postgres`: database PostgreSQL condiviso;
- `redash-ingestor`: web app tecnica per sync, stato e preview dati Redash;
- `redash-worker`: worker schedulato che richiama Redash e salva snapshot nel DB;
- `forecasting-app`: workspace Petyr per forecasting;
- `platform-home`: gateway/reverse proxy locale che espone Petyr e Redash Ingestor sotto un solo host.

La `forecasting-app` legge gli stessi dati da PostgreSQL e non chiama Redash direttamente.

---

## 1. Struttura attesa

```txt
unguess-data-platform/
├─ docker-compose.yml
├─ .env.example
├─ README_INSTALL_DOCKER.md
├─ platform-home/
│  ├─ Dockerfile
│  ├─ index.html
│  ├─ nginx.conf
│  └─ styles.css
├─ AGENTS.md
├─ docs/
└─ apps/
   ├─ redash-ingestor/
   │  ├─ Dockerfile
   │  ├─ package.json
   │  ├─ prisma/
   │  └─ src/
   └─ forecasting-app/
      └─ AGENTS.md
```

Il comando Docker va lanciato dalla **root** `unguess-data-platform`, non da `apps/redash-ingestor`.

---

## 2. Creare `.env`

Dalla root:

```bash
cp .env.example .env
```

Su Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Poi modifica `.env` inserendo almeno `REDASH_API_KEY`, `APP_INTERNAL_SECRET` e credenziali PostgreSQL coerenti tra `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` e `DATABASE_URL`.

Per sviluppo locale senza Access Layer, imposta anche:

```env
NODE_ENV=development
PETYR_AUTH_MODE=disabled
REDASH_INGESTOR_AUTH_MODE=disabled
```

In Coolify/produzione questi valori devono restare `NODE_ENV=production`, `PETYR_AUTH_MODE=access-layer` e `REDASH_INGESTOR_AUTH_MODE=access-layer`.

`APP_INTERNAL_SECRET` e' opzionale per l'ingestor: non serve per il sync manuale Redash.
Impostalo solo se vuoi permettere al worker di chiamare i batch AI interni di Petyr dopo un sync completo.

Lo scheduler del worker usa questi default:

```env
REDASH_INITIAL_SYNC_ON_BOOTSTRAP=false
TZ=Europe/Rome
SYNC_DAILY_TIME=01:30
SYNC_LOCK_TTL_SECONDS=3600
REDASH_INGESTOR_BASE_PATH=/redash-ingestor
```

All'avvio del compose root, `forecasting-db-sync` prepara per primo lo schema
PostgreSQL condiviso usando lo schema Prisma superset di Petyr. Solo dopo,
`redash-bootstrap` esegue il seed idempotente delle sorgenti Redash. Non usare
`prisma db push --accept-data-loss` e non lanciare lo schema Prisma parziale del
Redash Ingestor contro il database condiviso.

`DATABASE_URL` deve usare il servizio interno `postgres` come host e deve combaciare con `POSTGRES_DB`, `POSTGRES_USER` e `POSTGRES_PASSWORD`. Se cambi password dopo che il volume PostgreSQL e gia stato inizializzato, ricrea la risorsa/volume oppure mantieni le vecchie credenziali reali del volume.

---

## 3. Avviare tutto

Dalla root:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

Apri:

```txt
http://localhost:8080
```

Accesso unificato locale:

```txt
http://localhost:8080/forecasting       -> Petyr Forecasting
http://localhost:8080/petyr-admin       -> Petyr Admin
http://localhost:8080/redash-ingestor   -> Redash Ingestor dashboard tecnico
```

La root `http://localhost:8080` reindirizza a `/forecasting` quando includi `docker-compose.local.yml`. Il compose root di produzione non binda porte host: espone `platform-home:8080` alla rete Docker per Coolify. Il percorso utente e operativo deve passare dal gateway; per debug diretto delle app usa sviluppo app diretto o un override locale esplicito. Quando il Redash Ingestor e costruito da Compose, anche la porta diretta `3000` usa il prefisso `/redash-ingestor`; in sviluppo app diretto, lascia `NEXT_PUBLIC_REDASH_INGESTOR_BASE_PATH` vuoto per usare le route non prefissate.

---

## 4. Servizi Docker attivi

| Servizio | Container | Porta locale | Scopo |
|---|---|---:|---|
| `postgres` | Compose-managed | non pubblicata | Database condiviso |
| `redash-ingestor` | Compose-managed | gateway `/redash-ingestor` | UI/API tecnica |
| `redash-worker` | Compose-managed | nessuna | Sync giornaliero Redash |
| `forecasting-app` | Compose-managed | gateway `/forecasting` e `/petyr-admin` | Workspace Petyr Forecasting |
| `platform-home` | Compose-managed | `8080` con `docker-compose.local.yml`; container port `8080` su Coolify | Gateway/reverse proxy locale/produzione |

---

## 5. Controllare lo stato

Health check:

```txt
http://localhost:8080/redash-ingestor/api/health
```

Sorgenti configurate:

```txt
http://localhost:8080/redash-ingestor/api/sources
```

Preview dati salvati da PostgreSQL:

```txt
http://localhost:8080/redash-ingestor/api/redash/preview?source=master_campaigns&limit=10
http://localhost:8080/redash-ingestor/api/redash/preview?source=master_agreements&limit=10
```

Ultimo snapshot grezzo:

```txt
http://localhost:8080/redash-ingestor/api/redash/latest?source=master_campaigns
```

---

## 6. Lanciare un sync manuale

Dal browser puoi usare il pannello **Sync manuale** nella dashboard tecnica:

```txt
http://localhost:8080/redash-ingestor
```

Scegli `Sync all` oppure una singola sorgente. Se una run e gia in corso, la richiesta manuale viene bloccata con errore `409`.

Sync all:

```bash
curl -X POST http://localhost:8080/redash-ingestor/api/redash/sync \
  -H "Content-Type: application/json" \
  -d '{}'
```

Per master campaigns:

```bash
curl -X POST http://localhost:8080/redash-ingestor/api/redash/sync \
  -H "Content-Type: application/json" \
  -d '{"sourceKey":"master_campaigns"}'
```

Per master agreements:

```bash
curl -X POST http://localhost:8080/redash-ingestor/api/redash/sync \
  -H "Content-Type: application/json" \
  -d '{"sourceKey":"master_agreements"}'
```

---

## 7. Log utili

Tutti i log:

```bash
docker compose logs -f
```

Solo ingestor:

```bash
docker compose logs -f redash-ingestor
```

Solo worker:

```bash
docker compose logs -f redash-worker
```

Solo Petyr:

```bash
docker compose logs -f forecasting-app
```

Solo launcher:

```bash
docker compose logs -f platform-home
```

Solo database:

```bash
docker compose logs -f postgres
```

---

## 8. Entrare in PostgreSQL

```bash
docker compose exec postgres psql -U unguess -d unguess_redash
```

Verificare sorgenti:

```sql
SELECT "key", "name", "redashQueryId", "enabled"
FROM "RedashSource"
ORDER BY "key";
```

Verificare ultimi snapshot:

```sql
SELECT 
  s."key",
  sn."fetchedAt",
  sn."rowsCount",
  sn."queryResultId"
FROM "RedashSnapshot" sn
JOIN "RedashSource" s ON s."id" = sn."sourceId"
ORDER BY sn."fetchedAt" DESC
LIMIT 20;
```

Uscire:

```sql
\q
```

---

## 9. Fermare tutto

```bash
docker compose down
```

Fermare e cancellare anche il volume DB locale:

```bash
docker compose down -v
```

Attenzione: `-v` cancella gli snapshot salvati localmente.

---

## 10. Gateway e app Petyr

La `forecasting-app` e il gateway `platform-home` sono container separati orchestrati dallo stesso `docker-compose.yml` root.

Non serve un secondo sistema Docker separato.

Architettura Compose locale:

```txt
root docker-compose.yml
├─ postgres
├─ redash-ingestor
├─ redash-worker
├─ forecasting-app
└─ platform-home
```

Il forecasting non chiamerà Redash direttamente. Leggerà da PostgreSQL oppure da API interne stabili.

Flusso corretto:

```txt
Redash → redash-ingestor / worker → PostgreSQL → forecasting-app
```
