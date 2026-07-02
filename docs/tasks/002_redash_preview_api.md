# Task 002 - Redash preview API

## Objective

Add a lightweight API to inspect ingested Redash rows without opening raw JSON manually.

## Endpoint

```txt
GET /api/redash/preview?source=master_campaigns&limit=50
```

## Response

```json
{
  "source": {
    "key": "master_campaigns",
    "name": "Master Campaigns"
  },
  "fetchedAt": "...",
  "rowsCount": 123,
  "columns": [],
  "rows": []
}
```

## Requirements

- Read from PostgreSQL only.
- Do not call Redash.
- Do not change Prisma schema.
- Handle errors:
  - missing source query param -> 400;
  - unknown source -> 404;
  - no snapshot -> empty rows/columns.

## Acceptance criteria

- Build passes.
- Endpoint works for `master_campaigns`.
- Endpoint works for `master_agreements`.
