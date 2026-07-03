# Platform Scope

## Petyr Intelligence

Petyr Intelligence is a planned Petyr section/module for external company-signal discovery and admin-only insight review.

In scope:

- scan selected active and inactive Petyr companies for external web/news/company signals;
- build one or a small number of aggregated company-level Exa queries per company;
- call Exa with strict request, result, recency and daily budget limits;
- store raw Exa results locally for auditability;
- deduplicate by URL, content fingerprint and event signature;
- classify relevance to company and official Petyr Business Units internally;
- use OpenRouter for qualitative classification and actionable insight generation only;
- expose admin-only insights, sources, rationale and suggested actions;
- let admins rate usefulness and accuracy during MVP calibration;
- produce future admin calibration recommendations from feedback.

Out of scope for Petyr Intelligence:

- direct Redash access;
- LLM analysis of deterministic numeric data such as revenue, margin, forecast, campaign count or mathematical trend calculations;
- modifying Forecasting forecast tables, AI Forecast cache semantics or CSM forecast values;
- replacing existing Forecast Entry Intelligence;
- unbounded scans or provider runs without explicit daily budget enforcement.

The first MVP should validate quality, UX and worker behavior with admins before any future non-admin exposure.
