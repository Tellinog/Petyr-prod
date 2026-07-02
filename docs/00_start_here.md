# Start here

This documentation defines the target direction for the UNGUESS Redash + Forecasting platform.

## Current state

There is a working Dockerized app that:
- calls Redash;
- saves JSON payloads into PostgreSQL;
- displays source status and sync metadata in localhost;
- currently syncs more sources than needed.

The useful Redash sources for the first forecasting MVP are:
- `master_campaigns` -> Redash query `1465`;
- `master_agreements` -> Redash query `1572`;
- `company_ownership` -> Redash query `1685`.

## Target direction

Move from a single app to a small data platform:

```txt
unguess-data-platform/
├─ docker-compose.yml
├─ apps/
│  ├─ redash-ingestor/
│  └─ forecasting-app/
├─ packages/
│  └─ shared/
├─ docs/
└─ AGENTS.md
```

## Why this direction

This is more future-proof because other future services can consume the same Redash-derived data without coupling themselves to Redash.

Future consumers may include:
- forecasting UI;
- AI forecasting agent;
- alerting service;
- finance dashboards;
- Slack agent;
- data quality monitor.

## Golden rule

Only `redash-ingestor` talks to Redash.

Every other service reads from PostgreSQL or stable internal APIs.
