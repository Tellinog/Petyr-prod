# Testing

## Petyr Intelligence Test Strategy

The first implementation added focused tests under:

```bash
cd apps/forecasting-app
npm run test:intelligence
```

## Unit Tests

Cover:

- company selection respects active/inactive filters and max company limits;
- query builder creates aggregated company-level queries and does not produce company x Business Unit searches;
- budget guard rejects runs beyond daily request limits;
- worker setting read/write returns admin-visible enabled/disabled status;
- provider retry policy retries transient failures and avoids retrying non-retryable auth/client errors;
- deduplication handles same URL, canonicalized URL, content hash and event signature;
- Business Unit classification accepts only official Petyr Business Units;
- insight validator rejects unsupported numeric analysis claims and unsupported Business Units;
- feedback validation accepts only documented usefulness and accuracy values.

## Service Tests

Cover:

- Exa client handles timeout, retryable failure and hard failure without losing run state;
- OpenRouter client uses strict JSON response expectations and validates returned shape;
- raw results are saved before classification;
- partial failures keep persisted run and source diagnostics;
- no Forecasting tables are written by Intelligence services.

## API Tests

Cover:

- CSM insight list and detail endpoints;
- feedback submission;
- admin dry-run trigger;
- admin non-dry-run trigger secret requirements;
- admin calibration report read/generate endpoints;
- bounded pagination and filters.

## Integration Tests

Use mocked Exa and OpenRouter responses for repeatable CI. A manual provider smoke test can be documented separately for local/operator validation with low limits.

## Regression Boundary

Run the existing Forecasting build/tests after Intelligence schema/API implementation to verify Forecasting regressions were not introduced.

Current MVP validation:

- `npm run test:intelligence`
- `npm run db:generate`
- `npm run build`

The Intelligence focused suite now includes daily budget, retry policy and worker setting tests.
