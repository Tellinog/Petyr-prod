# API

## Petyr source-data refresh

### POST /api/petyr/data-refresh

Purpose: let a CSM forecast writer or Petyr admin request fresh Redash-derived
Petyr data without access to the technical Redash Ingestor surface.

Permissions: `petyr:forecast:write` or `petyr:admin`.

Body: empty JSON object. Source/query selection is not accepted.

The request is synchronous and normally takes 2-5 minutes. Petyr sends a
server-to-server request to the internal Ingestor endpoint and returns a
sanitized summary. `409` means the global Redash sync lock is already held.

### POST /redash-ingestor/api/redash/petyr-refresh

Purpose: internal fixed-source command used only by Petyr. Requires the shared
`x-app-secret: APP_INTERNAL_SECRET`; it does not accept browser Access Layer
sessions or arbitrary source selection. It forces fresh executions of
`master_campaigns`, `master_agreements` and `company_ownership`, then stores raw
snapshots and materializes their PostgreSQL latest tables.

## Admin Petyr Intelligence Endpoints

These endpoints are implemented in the first MVP.

### GET /api/petyr/intelligence/insights

Purpose: list Intelligence insights for admin review.

Suggested query parameters:

- `csmName`
- `companyName`
- `businessUnit`
- `insightType`
- `urgency`
- `limit`

Permissions: `petyr:admin`.

### GET /api/petyr/intelligence/insights/[insightId]

Purpose: return one insight with sources, rationale, suggested action and feedback summary.

Permissions: `petyr:admin`.

### POST /api/petyr/intelligence/feedback

Purpose: submit usefulness and accuracy feedback.

Suggested body:

```json
{
  "insightId": "insight_id",
  "ratingUsefulness": "useful",
  "ratingAccuracy": "accurate",
  "feedbackText": "Optional note"
}
```

Permissions: `petyr:admin`.

## Admin Endpoints

### GET /api/petyr/admin/intelligence/runs

Purpose: list scan runs, statuses, provider usage and errors.

Permissions: `petyr:admin`.

### POST /api/petyr/admin/intelligence/runs

Purpose: trigger a controlled dry-run or real scan.

Suggested body:

```json
{
  "dryRun": true,
  "companyName": "Optional Company",
  "maxCompanies": 10,
  "maxResultsPerCompany": 5
}
```

Rules:

- default `dryRun=true`;
- reject all-company unbounded execution;
- require `x-app-secret: APP_INTERNAL_SECRET` for non-dry-run admin triggers;
- enforce per-run caps before provider calls.
- non-dry-run manual scans use the same advisory-lock path as the worker;
- daily aggregate provider budget is checked before every Exa/OpenRouter attempt.
- unexpected execution failures return JSON with `error`, `phase`, sanitized `details` and a troubleshooting `hint` so the admin UI can show why a dry-run failed without exposing provider keys, app secrets or database credentials.

### GET /api/petyr/admin/intelligence/calibration

Purpose: return feedback aggregates and latest calibration reports.

Permissions: `petyr:admin`.

### GET /api/petyr/admin/intelligence/budget

Purpose: return sanitized provider key/config presence and configured MVP limits.

Permissions: `petyr:admin`.

### GET /api/petyr/admin/intelligence/worker

Purpose: return scheduled worker enablement, schedule, provider readiness and current daily budget status.

Permissions: `petyr:admin`.

### PUT /api/petyr/admin/intelligence/worker

Purpose: enable or disable the scheduled `intelligence-scan` worker.

Suggested body:

```json
{
  "enabled": true
}
```

Permissions: `petyr:admin` plus `x-app-secret: APP_INTERNAL_SECRET`.

## Provider Boundary

Browser code must never call Exa or OpenRouter directly and must never receive provider API keys. Provider calls happen only in server services or workers.
