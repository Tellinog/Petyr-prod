# Petyr context

Petyr replaces the manual Excel-based forecasting currently managed by CSMs.

Petyr must make forecasting:
- centralized;
- updated in specific moments of the month;
- readable by management, CSMs and company views;
- comparable with closed revenue from Redash;
- enriched by AI forecast and operational alerts;
- traceable through save sessions and change logs.

Core principle:

```txt
The CSM remains owner of the forecast, but Petyr helps compile, compare, correct and justify forecast changes.
```

## Data sources

### Redash / closed revenue data

Redash remains the source for:
- closed campaign revenue;
- planned, confirmed and completed campaigns;
- campaign value, costs and GM%;
- Business Unit;
- company;
- CSM;
- active agreements;
- total agreement value;
- agreement residual;
- agreement expiry date;
- current company CSM owner;
- company branch;
- campaign link;
- agreement/deal link derived from linked campaign deal link when available.

### Petyr data

Petyr owns:
- monthly CSM forecast;
- ongoing CSM forecast;
- annual CSM forecast;
- save notes;
- active/inactive company status;
- forecast change logs;
- draft/consolidated states.

### AI data

First AI Forecasting MVP can generate:
- manually triggered monthly AI forecast by company + Business Unit + future month + year;
- operational AI notes;
- alerts about agreements, residuals, trends, anomalies and BU under history.

The MVP is company-by-company and must not process all companies together or run
a global automatic batch. AI Forecasting must use deterministic baseline +
business signals + LLM reasoning, and write only to `ai_forecast_cache`.

Complete anonymization through a dedicated tool/API is deferred for the first
manual test. When that tool/API exists, LLM/OpenRouter payloads must not send
company, CSM, campaign or agreement names, links or other identifying text. Use
temporary server-side pseudonyms and map AI output back internally.
