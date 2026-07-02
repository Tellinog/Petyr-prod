# Petyr / UNGUESS Data Platform — Documentazione, Handoff e Source of Truth

Questo documento definisce le regole operative che Codex deve seguire quando lavora nel repository `unguess-data-platform`.

È adattato allo stato reale del progetto: il repository non è un singolo progetto software isolato, ma una root multi-progetto con più applicazioni e documentazione già presente.

Struttura rilevante attuale:

```txt
project-root/
  README.md
  AGENTS.md
  .env.example
  docker-compose.yml
  PETYR_PRODUCT_AND_DATA_LOGIC.md

  apps/
    redash-ingestor/
      README.md
      AGENTS.md
    forecasting-app/
      README.md
      AGENTS.md

  docs/
    00_start_here.md
    01_architecture.md
    02_migration_plan.md
    03_redash_sources.md
    04_data_model.md
    05_forecasting_product_spec.md
    06_codex_workflow.md
    07_codex_prompts.md
    08_operational_commands.md
    petyr/
      00_petyr_context.md
      01_petyr_architecture.md
      02_petyr_data_model_target.md
      03_petyr_business_rules.md
      04_codex_prompts_petyr.md
      05_docker_petyr.md
      COMPANY_ORDERING.md
    tasks/
      ...

  platform-home/
```

---

## 1. Principio generale: documentation-driven development

Ogni sviluppo deve partire dalla source of truth presente nel repository, non da deduzioni del dev/LLM.

Codex deve sempre:

1. leggere le istruzioni e i documenti rilevanti prima di modificare codice;
2. identificare il progetto interessato dentro la root;
3. rispettare la source of truth del progetto;
4. aggiornare la documentazione quando una modifica cambia comportamento, logica prodotto, dati, flusso o responsabilità;
5. non inventare logiche mancanti.

Per Petyr, la source of truth principale è:

```txt
./PETYR_PRODUCT_AND_DATA_LOGIC.md
```

Documenti secondari Petyr:

```txt
./docs/petyr/00_petyr_context.md
./docs/petyr/01_petyr_architecture.md
./docs/petyr/02_petyr_data_model_target.md
./docs/petyr/03_petyr_business_rules.md
./docs/petyr/COMPANY_ORDERING.md
./docs/petyr/05_docker_petyr.md
```

Documenti platform-level:

```txt
./AGENTS.md
./README.md
./docs/00_start_here.md
./docs/01_architecture.md
./docs/03_redash_sources.md
./docs/04_data_model.md
./docs/06_codex_workflow.md
./docs/08_operational_commands.md
```

---

## 2. Regola anti-deriva

Se Codex trova un punto ambiguo, non specificato o in conflitto:

- non deve inventare;
- non deve risolvere con una scelta implicita non documentata;
- deve creare o aggiornare una voce in `BACKLOG.md`;
- deve fermarsi su quella parte;
- può continuare solo sulle parti già definite e non ambigue.

Formato minimo voce `BACKLOG.md`:

```md
## YYYY-MM-DD — [Project] Titolo breve

- Status: Open
- Area: Petyr / Redash Ingestor / Platform / Docs / UI / Data / Admin
- Context: cosa stavo implementando
- Ambiguity: cosa non è specificato o è in conflitto
- Why it blocks: perché non posso procedere senza decisione
- Proposed options:
  - A) ...
  - B) ...
- Files affected: ...
```

Se l’ambiguità non blocca tutto il task, Codex deve completare la parte sicura e lasciare in backlog solo la parte bloccata.

---

## 3. Hygiene minima del repository

La root deve avere sempre questi file. Se mancano, Codex deve crearli o proporne la creazione come primo task di documentazione, senza cambiare codice prodotto.

```txt
README.md
AGENTS.md
DEVLOG.md
BACKLOG.md
DEPLOY.md
DECISIONS.md
.env.example
.gitignore
```

Nota: nel repository attuale esistono già `README_INSTALL_DOCKER.md` e `README_PETYR_INSTALL.md`. `DEPLOY.md` non deve duplicare tutto: può essere un indice/runbook operativo che rimanda ai file esistenti e indica quale usare per platform, Petyr e Redash Ingestor.

---

## 4. Documentazione root vs documentazione dei singoli progetti

Poiché la root contiene più progetti, non bisogna applicare una struttura standard monolitica a tutto il repository.

Usare questa logica:

### Root / platform-level

Documenta ciò che riguarda:

- struttura complessiva del repository;
- responsabilità dei servizi;
- flussi tra servizi;
- Redash → PostgreSQL → Petyr;
- comandi operativi comuni;
- deploy complessivo;
- decisioni trasversali;
- backlog trasversale.

File principali:

```txt
README.md
AGENTS.md
DEVLOG.md
BACKLOG.md
DEPLOY.md
DECISIONS.md
docs/00_start_here.md
docs/01_architecture.md
docs/03_redash_sources.md
docs/04_data_model.md
docs/06_codex_workflow.md
docs/08_operational_commands.md
```

### Petyr / forecasting-app

Documenta ciò che riguarda:

- logiche prodotto Petyr;
- golden master UI;
- forecast;
- closed revenue;
- branch/CSM ownership;
- import/export;
- admin temporaneo;
- OpenRouter model settings;
- data health;
- Forecast Entry;
- Company Detail.

File principali:

```txt
PETYR_PRODUCT_AND_DATA_LOGIC.md
docs/petyr/*.md
apps/forecasting-app/AGENTS.md
apps/forecasting-app/README.md
```

### Redash Ingestor

Documenta ciò che riguarda:

- sync Redash;
- snapshot;
- materialized tables;
- preview APIs;
- mapping source;
- job di ingestion.

File principali:

```txt
docs/03_redash_sources.md
apps/redash-ingestor/AGENTS.md
apps/redash-ingestor/README.md
```

---

## 5. Non creare struttura tecnica generica non richiesta

Le istruzioni generali su cartelle come `specs/`, `schemas/`, `seeds/`, `examples/`, `assets/`, `scripts/` sono una guida di metodo, non un obbligo da applicare meccanicamente a questo repository.

Nel repository attuale Codex deve:

- non rinominare la documentazione esistente;
- non spostare file solo per aderire a un template;
- non imporre un nuovo stack;
- non introdurre cartelle tecniche non necessarie al task;
- usare i documenti già presenti come base;
- creare solo i file hygiene mancanti in root;
- aggiungere documenti specifici solo se servono davvero a ridurre ambiguità.

---

## 6. Quando aggiornare DEVLOG, DECISIONS e BACKLOG

### Aggiornare `DEVLOG.md` quando

Una modifica cambia:

- comportamento utente;
- logica dati;
- calcolo KPI;
- API/endpoint;
- flusso operativo;
- regole di import/export;
- admin;
- integrazione OpenRouter;
- routing;
- deploy/runbook;
- regole di documentazione.

Formato minimo:

```md
## YYYY-MM-DD — [Project] Titolo modifica

- Changed: cosa è cambiato
- Why: motivo
- Impact: impatto su UI / dati / API / operatività
- Source of truth updated: file aggiornati
- Validation: build/test/comandi eseguiti o non eseguiti
```

### Aggiornare `DECISIONS.md` quando

Si prende una decisione architetturale o di prodotto non ovvia.

Formato ADR-lite:

```md
## YYYY-MM-DD — Decisione breve

- Status: Accepted / Proposed / Superseded
- Context: problema
- Decision: scelta fatta
- Alternatives considered: alternative valutate
- Consequences: effetti positivi/negativi
- Related docs: link/file
```

### Aggiornare `BACKLOG.md` quando

- manca una specifica;
- c’è un conflitto fra documenti;
- una parte del task va rimandata;
- manca una decisione business;
- manca un mapping dati;
- manca una definizione di KPI;
- un valore resta hardcoded temporaneamente;
- un fallback è accettato ma da rivedere.

---

## 7. Handoff obbligatorio a fine task

Alla fine di ogni task Codex deve restituire un handoff con questa struttura:

```md
## Handoff

### Summary
- ...

### Files changed
- `path/file`: cosa è cambiato

### Docs updated
- `DEVLOG.md`: voce aggiunta / non necessaria perché ...
- `BACKLOG.md`: voce aggiunta / non necessaria perché ...
- `DECISIONS.md`: voce aggiunta / non necessaria perché ...
- altri docs aggiornati

### Validation
- comando eseguito: esito
- comando non eseguito: motivo

### Open questions / blocked items
- ...

### Suggested next task
- ...
```

Non basta dire “fatto”: deve essere chiaro cosa è cambiato, quali documenti sono stati aggiornati e cosa resta aperto.

---

## 8. Regola specifica Petyr: UI golden master

Per Petyr, `PetyrMVPRendering.tsx` è golden master grafico approvato dal management.

Codex non deve:

- ridisegnare la dashboard;
- cambiare layout;
- cambiare classi Tailwind;
- cambiare colori;
- cambiare ordine sezioni;
- sostituire componenti UI;
- introdurre nuove card se non richiesto.

Codex può:

- collegare dati reali;
- sostituire mock con props/adapters;
- correggere copy richiesto;
- aggiungere diagnostica solo dove non altera il layout approvato oppure in admin.

---

## 9. Regola specifica Petyr: source of truth dati

Petyr deve leggere dati reali da PostgreSQL/Redash materializzato, non da mock statici.

Però, se un dato manca:

- non usare fallback mock silenzioso;
- mostra o registra diagnostica;
- aggiungi voce in `BACKLOG.md` se serve una decisione.

Regole chiave già definite:

- branch dinamiche da `company_ownership.company_branch`;
- CSM ownership primaria da company ownership;
- yearly objective Branch e Business Unit inseriti dal management, annuali, auditabili e separati dal forecast annuale;
- Branch list dinamica da company ownership, mentre la lista Business Unit resta ufficiale e chiusa;
- accesso manager-only alla gestione objective da implementare più avanti tramite RBAC;
- il solo blocco temporaneo documentato per Management Objectives è la password hardcoded `Pippo`, che non è sicurezza reale, non è un secret sensibile e non deve essere riusata per altri scopi;
- planned through year end da campagne future Redash, non forecast CSM futuro;
- nessun target CSM inventato;
- Closed revenue YTD da revenue campagne da inizio anno a oggi.

---

## 10. Prompt header obbligatorio per Codex

Ogni prompt operativo dovrebbe iniziare con:

```text
Prima di modificare codice, leggi:

./AGENTS.md
./PETYR_PRODUCT_AND_DATA_LOGIC.md
./PETYR_DOCUMENTATION_AND_HANDOFF_RULES.md

Poi identifica quale progetto stai modificando:
- root/platform;
- apps/redash-ingestor;
- apps/forecasting-app / Petyr;
- platform-home;
- docs only.

Non inventare logiche mancanti.
Se trovi ambiguità, aggiorna BACKLOG.md e fermati su quella parte.
Se cambi comportamento, aggiorna DEVLOG.md.
Se prendi una decisione non ovvia, aggiorna DECISIONS.md.
Alla fine produci un handoff con file cambiati, docs aggiornati, validazione e questioni aperte.
```
