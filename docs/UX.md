# UX

## Petyr Intelligence UI

Petyr Intelligence should be a separate admin-only section, not a panel inside Forecasting Company Detail and not part of Forecast Entry.

Implemented routes:

```txt
/intelligence
/intelligence/company/[companyName]
/petyr-admin/intelligence
```

The platform gateway routes `/intelligence` to the Forecasting app container while the module remains separated from Forecasting business logic.

## Admin Experience

`/intelligence` should show an admin-only insight review workspace:

- company filter;
- Business Unit filter;
- active/inactive company filter;
- freshness/status filter;
- insight list with source count, Business Unit relevance and suggested action;
- source drawer or detail area with links and rationale;
- feedback controls for usefulness and accuracy.

The UI should avoid copy that implies OpenRouter calculated revenue, forecast, margin or numeric trends. Suggested actions should be consultative and source-backed.

## Company Intelligence Detail

`/intelligence/company/[companyName]` should require `petyr:admin` and show:

- latest insights for the company;
- sources grouped by deduplicated signal item;
- Business Unit relevance;
- run history and freshness;
- feedback already submitted by admins when available.

This page may link to Forecasting Company Detail for deterministic revenue/forecast context, but must not embed or alter Forecasting calculations.

## Admin Intelligence UX

`/petyr-admin/intelligence` should show:

- scan status and latest run history;
- budget usage and remaining daily request budget;
- failed/partial run diagnostics;
- provider availability;
- calibration report history;
- feedback aggregate summaries;
- manual dry-run and controlled run action with explicit limits.
- provider key/config presence without exposing key values.
- scheduled worker enabled/disabled status.
- protected enable/disable worker action.
- daily provider budget used/remaining.

The admin UI should show default MVP limits before a run:

- max companies per run: 10;
- max results per company: 5;
- search recency: 30 days;
- daily request budget: 100.

Admin can run one capped scan manually even when the scheduled worker is disabled. Real manual scans and worker toggle changes require the internal secret.
