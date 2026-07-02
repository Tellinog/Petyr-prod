# Petyr status attuale - UI alignment e AI Forecast

Data: 2026-06-05

Questo documento fotografa lo stato corrente dopo l allineamento della navigazione Petyr tra Management View, CSM Overview, Company Detail e Forecast Entry.

## Aggiornamento 2026-06-24 - Forecast Entry batch normale e legacy admin

La normale `/forecasting/entry` non espone piu la vecchia esperienza completa
single-company. Ora e una Monthly Forecast batch-entry per il mese/anno corrente
server, filtrata solo per CSM, con tabella company x Business Unit ufficiali
Petyr e save batch. Annual Forecast, Forecast Intelligence, selezione company,
toggle active/inactive, deterministic preview, apply AI forecast, change history
e tool admin restano preservati nella legacy admin-only:

```txt
/forecasting/entry/old
```

La route legacy richiede `petyr:admin`. La route normale richiede
`petyr:forecast:write` e usa:

```txt
GET /api/petyr/forecast-entry/batch
POST /api/petyr/forecast-entry/batch/save
```

## Sintesi

Company Detail e Forecast Entry usano ora una soluzione visuale continuativa:

- shell Petyr condivisa con card/header descrittiva;
- navigazione sezioni Management, CSM Overview, Company Detail e Forecast Entry;
- link route-aware verso Company Detail e Forecast Entry quando company, CSM, anno e mese sono disponibili;
- Data diagnostics disponibili dal pulsante flottante bottom-right, non come card nel corpo pagina.

Company Detail resta analitica e read-only per forecast data edits, ma non e piu bloccata sul contesto iniziale: espone filtro CSM, selezione company, previous/next e anno caricabile, usando il catalogo e l ordinamento Forecast Entry.

Forecast Entry resta l unico punto UI in cui generare/applicare AI Forecast e l unico punto per l editing mensile CSM.

## Gerarchia Forecast Entry finale

1. Shell Petyr condivisa con header/card descrittiva e navigazione sezioni.
2. `PetyrSectionTitle` con titolo `Forecast Entry` e badge stato entry mode.
3. Navigator CSM/company basato su `PetyrForecastNavigatorShell`, con filtro CSM, selezione company, previous/next e helper ordering.
4. Notice di salvataggio/caricamento subito dopo il navigator.
5. Tab `Monthly forecast` / `Annual forecast`.
6. Editor mensile: anno/mese dentro l editor, stato editabilita, righe Business Unit, nota, toggle active/inactive, save action e recent change history.
7. Editor annuale: anno/status, righe Business Unit annuali, nota, save draft e consolidate.
8. Management Objectives come supporto nell area annuale.
9. AI Forecast action come support tool secondario.
10. Floating `Data diagnostics` menu.

## Gerarchia Company Detail finale

1. Shell Petyr condivisa con header/card descrittiva e navigazione sezioni.
2. `PetyrSectionTitle` con titolo `Company Detail`, badge esplicito `Forecast status` e link `Edit forecast` verso Forecast Entry.
3. Forecast Entry-style navigator con filtro CSM, selezione company, anno/load a sinistra del previous/next e senza helper CSM nel previous/next.
4. Quattro KPI primari: Total agreement, Closed revenue YTD, Agreement residual, Initial Forecast.
5. Due grafici affiancati: trend mensile e Revenue per Business Unit con closed revenue arancione, Initial Forecast grigio e marker previous-month verde/giallo rispetto all Initial Forecast.
6. Vista espandibile `Business Unit month-by-month view`: 12 mesi per BU con closed revenue, previous-month forecast, ongoing forecast e AI Forecast.
7. Relevant company insights, solo categorie attive.
8. Tabelle reali campagne e accordi/residual evidence.
9. Change history subito sotto accordi/residual evidence, con ultime due sessioni e storico espandibile.
10. Support details read-only: contesto/metriche extra, dettaglio BU, `Monthly forecast rows`, `Annual forecast rows`, `AI forecast cache`.
11. Floating `Data diagnostics` menu.

Company Detail non espone piu `Generate AI forecast`; mostra solo la cache AI read-only come evidenza.

## AI Forecast - flusso corrente

AI Forecast MVP e manuale, company-by-company.

Entry point principali:

- UI operativo: `PetyrAiForecastCompanyAction` solo in Forecast Entry;
- evidenza read-only: `ai_forecast_cache` in Company Detail e Forecast Entry;
- server action: `apps/forecasting-app/src/app/forecasting/aiForecastActions.ts`;
- servizio: `generatePetyrAiForecastCompanyPreview(...)`;
- endpoint protetto alternativo: `POST /api/petyr/ai-forecast/company`.

Il batch globale e disabilitato:

- `POST /api/petyr/admin/ai-forecast-batch` risponde `410`;
- il post-sync Redash Ingestor ritorna `skipped`;
- MVP non processa tutte le aziende insieme.

## AI Forecast - regole operative

- Il primo click UI esegue dry-run e non scrive database.
- `Apply AI forecast` richiede conferma esplicita.
- La persistenza scrive solo in `ai_forecast_cache`.
- Non scrive `forecast_monthly`, `forecast_annual`, `forecast_annual_snapshot`, closed revenue, management objectives, Forecast Entry change log o dati Redash/materialized source.
- AI Forecast puo generare o aggiornare solo mesi futuri dell anno selezionato.
- Mesi passati e mese corrente sono sempre esclusi.
- CSM-entered monthly e annual forecast sono dati di confronto UI, non input OpenRouter e non anchor per `aiForecastValue`.

## Primitive condivise usate

- `apps/forecasting-app/src/components/petyr/PetyrLayoutPrimitives.tsx`
- `apps/forecasting-app/src/components/petyr/PetyrForecastNavigation.tsx`
- `apps/forecasting-app/src/components/petyr/PetyrFloatingDiagnosticsMenu.tsx`
- `apps/forecasting-app/src/components/petyr/CompanyDetailNavigator.tsx`
- `apps/forecasting-app/src/components/petyr/CompanyBusinessUnitMonthlyView.tsx`

## Limiti e rischi residui

- Il confronto Revenue per Business Unit in Company Detail resta selected-year: il payload corrente non espone ancora un confronto storico multi-year per BU.
- La formula AI baseline e esplicabile ma non ancora calibrata da Management/Finance.
- Il residual agreement e company-level, non attribuito a una BU canonica.
- `ai_forecast_cache` non conserva in modo strutturato baseline, planned value, residual signal, advice e drivers.
- Anonymization completa e ancora rinviata: il payload usa pseudonimi temporanei, ma manca il servizio definitivo di pseudonimizzazione/minimizzazione.
