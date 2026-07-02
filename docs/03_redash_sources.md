# Redash sources

## Required sources for MVP

| Key | Redash Query ID | Purpose |
|---|---:|---|
| `master_campaigns` | `1465` | Campaign-level source for revenue, status, end dates, business units and customer information |
| `master_agreements` | `1572` | Agreement-level source for agreement value, residuals, expiry and customer relationship |
| `company_ownership` | `1685` | Canonical company owner and branch source for Petyr company, CSM and branch attribution |

## Not required for first MVP

| Key | Redash Query ID | Notes |
|---|---:|---|
| `hubspot_deals` | `1586` | Do not use unless explicitly requested |
| `agreements_campaigns_join` | `1574` | Do not use unless explicitly requested |
| `agreements_warnings` | `1593` | Do not use unless explicitly requested |

## Rule

The ingestion service may contain configuration for several sources, but forecasting MVP should rely only on:
- `master_campaigns`;
- `master_agreements`;
- `company_ownership`.

`company_ownership` is the canonical source for:
- company display name: `company_name`;
- current CSM owner: `csm_name`;
- company branch: `company_branch`.

## First cleanup task

Disable unused sources instead of deleting them.

Suggested SQL:

```sql
UPDATE "RedashSource"
SET "enabled" = false
WHERE "key" NOT IN ('master_campaigns', 'master_agreements', 'company_ownership');
```

## Required preview endpoint

The ingestor should expose:

```txt
GET /api/redash/preview?source=master_campaigns&limit=50
```

Response should include:
- source key;
- source name;
- fetchedAt;
- rowsCount;
- columns;
- limited rows.

No Redash call should happen inside preview endpoint.
