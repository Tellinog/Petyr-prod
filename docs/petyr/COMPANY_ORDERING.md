# Petyr company ordering

This document explains how Petyr orders companies today and which ordering rules
are still TODO.

## Source of truth

Company ordering is a product rule, not a visual-only detail.

Primary documented factors:

- active/inactive status;
- agreement residual;
- agreement expiry;
- risk score;
- missing or not-updated forecast;
- deterministic fallback ordering.

## Where ordering is calculated today

### Dedicated Forecast Entry route

The dedicated Forecast Entry route receives company options from:

```txt
apps/forecasting-app/src/services/petyrDataService.ts
getForecastEntryCompanies()
```

Current implemented priority score:

```txt
active/inactive score
+ data-quality readiness score
+ missing forecast score
+ residual agreement value
```

Current behavior:

- inactive companies are lowered but remain visible;
- companies with no previous-month and no ongoing forecast get higher priority;
- residual agreement value increases priority;
- ties fall back to company name ascending.

Implemented:

- active/inactive influence;
- agreement residual influence;
- forecast missing influence;
- deterministic company-name fallback.

TODO:

- add agreement expiry / near-expiration to the dedicated Forecast Entry service score;
- define a real risk score instead of using data-quality readiness as a partial proxy;
- decide whether Business Unit below history and AI-vs-CSM gaps should affect the route ordering;
- centralize the scoring weights in a named shared ordering helper.

### Approved `/forecasting` Forecast Entry preview

The approved rendering contains a preview navigator in:

```txt
apps/forecasting-app/src/components/petyr/PetyrMVPRendering.tsx
```

Current preview score:

```txt
active/inactive score
+ agreement residual
+ near-expiration score
```

This is part of the approved rendering preview, not the canonical dedicated
Forecast Entry service.

Implemented:

- active/inactive influence;
- residual influence;
- near-expiration influence.

TODO:

- align preview scoring with the dedicated route once the canonical ordering
  helper exists.

### Company Detail

The dedicated Company Detail route is an analytical read-only page, but it now
uses the Forecast Entry company catalog for CSM filter, company selection,
previous/next navigation and year reload. This resolves the previous TODO: the
dedicated route uses Forecast Entry priority ordering, not residual-only ordering,
so users can move continuously between Company Detail and Forecast Entry with the
same company sequence.

Within the page:

- company navigation uses Forecast Entry priority score and company-name tie-breaker;
- campaign rows sort by End Date descending, with missing End Date rows last, then campaign name;
- agreement rows sort by active nearest expiry first, then residual, total value and agreement name;
- monthly forecast rows sort by year, month, Business Unit and forecast type;
- annual forecast rows sort by year, then Business Unit.

Implemented:

- Forecast Entry priority ordering in the dedicated Company Detail navigator;
- deterministic table ordering inside the dedicated Company Detail route.

### CSM Overview

CSM Overview is read-only.

Current service/read-model behavior:

- company overview lists are primarily residual-oriented;
- forecast-not-updated action rows prioritize missing forecast updates, then residual;
- expiring agreement action rows prioritize nearest expiry, then residual;
- expired agreement residual action rows prioritize residual amount, then expiry date;
- high residual action rows keep existing residual eligibility but prioritize the nearest active residual agreement expiry;
- CSM aggregate rows sort by residual value, then CSM name.

Implemented:

- residual-based prioritization;
- missing forecast prioritization inside the forecast-not-updated action;
- expiry-date prioritization inside expiring agreement actions;
- nearest active residual agreement evidence inside high residual actions;
- separate `Expired agreement with residual` action category, without mixing it
  into expiring-soon ordering;
- deterministic name fallback where used.

TODO:

- document whether the visible company list in CSM Overview should be ordered by
  the same canonical score as Forecast Entry or stay residual/action driven;

## Factor status

### Active/inactive

Implemented in Forecast Entry ordering.

Inactive companies are lowered in priority and remain visible. They must not be
filtered out.

### Agreement residual

Implemented broadly.

Residual value is used in Forecast Entry, CSM Overview action ordering and the
Company Detail preview.

### Agreement expiry

Partially implemented.

The approved Forecast Entry preview includes near-expiration scoring. CSM
Overview expiring-agreement actions and high-residual agreement evidence sort by
nearest active expiry. Company Detail agreement rows use the same active
nearest-expiry priority. The dedicated Forecast Entry route still needs expiry
added to the canonical service score.

### Risk score

Not fully implemented as a business risk score.

Today Petyr exposes data-quality status and uses readiness as a partial ordering
input in the dedicated Forecast Entry service. That must not be treated as the
final commercial/forecast risk score.

### Forecast missing / not updated

Implemented.

Forecast Entry raises priority when both previous-month and ongoing forecast are
missing. CSM Overview forecast-not-updated actions prioritize missing updates.

### Fallbacks

Fallbacks must be deterministic.

Current examples:

- company name ascending for equal Forecast Entry priority;
- CSM name ascending for equal CSM aggregate residual;
- derived agreement deal links sort linked campaign candidates by campaign end
  date, start date, campaign name, campaign link and materialized `row_index`;
- stable table sort keys inside Company Detail.

If source data is missing, Petyr must show diagnostics or empty states instead
of silently switching to illustrative data.

## Open TODOs

- Define final canonical score weights for Forecast Entry.
- Add agreement expiry to the dedicated Forecast Entry service score.
- Define the real risk score inputs and severity scale.
- Decide whether Business Unit below history affects company ordering or only alerts.
- Decide whether AI-vs-CSM forecast gaps affect company ordering or only alerts.
- Align approved preview ordering with the canonical helper after the helper exists.
