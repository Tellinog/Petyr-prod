# Task 005 - Forecasting company preview

## Objective

Create first company-level preview for the forecasting app.

## Endpoint

```txt
GET /api/forecasting/companies-preview
```

## Data source

PostgreSQL only.

Use latest snapshots for:
- `master_campaigns`;
- `master_agreements`.

## Output

For each company:
- companyName;
- campaignsCount;
- agreementsCount;
- sampleCampaignRows;
- sampleAgreementRows.

## Requirements

- Do not call Redash.
- Do not create normalized tables yet.
- Handle missing snapshots gracefully.

## Acceptance criteria

- Endpoint returns useful company-level array.
- Build passes.
