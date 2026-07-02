# Access Control Platform — Backlog

## Confirm implementation stack for Auth API

- **Area:** Auth API
- **Problem/question:** The implementation stack is not formally chosen. Existing platform direction prefers TypeScript, Next.js, Prisma, PostgreSQL and Docker.
- **Impact:** Cannot create actual code or schema migrations without risking drift.
- **Status:** Open.
- **Proposal / next action:** Use TypeScript + Fastify or Next.js route handlers + Prisma + PostgreSQL. Record final choice in root `DECISIONS.md`.

## Confirm whether Auth API uses shared PostgreSQL or separate DB/schema

- **Area:** Database / Deployment
- **Problem/question:** The current platform uses shared PostgreSQL. It is unclear whether access-control tables should live in the same DB or a separate schema/database.
- **Impact:** Affects Prisma schemas, backups, security boundaries and migrations.
- **Status:** Open.
- **Proposal / next action:** For MVP, use same PostgreSQL instance but separate table namespace or schema. Confirm before implementation.

## Define first pilot tool permissions

- **Area:** Tool integration / Petyr
- **Problem/question:** Petyr permissions are proposed but not finalized.
- **Impact:** Middleware cannot be fully validated against real endpoints.
- **Status:** Open.
- **Proposal / next action:** Start with `forecast:read`, `forecast:write`, `warnings:read`, `model:select`, `admin:users`, `logs:read` and refine with the Petyr owner.

## Define admin panel MVP

- **Area:** Admin UI
- **Problem/question:** It is unclear whether the first version should include an admin UI or only seed/API-based management.
- **Impact:** Affects implementation scope.
- **Status:** Deferred.
- **Proposal / next action:** Implement API and seed first; create admin panel only after the first protected tool works.

## Define audit retention policy

- **Area:** Security / Compliance
- **Problem/question:** Audit log retention period is not defined.
- **Impact:** Affects storage, privacy and export.
- **Status:** Open.
- **Proposal / next action:** Define a default retention period and document it before production rollout.

## Define Petyr unified host temporary protection before public server exposure

- **Area:** Access Control / Petyr unified deployment
- **Problem/question:** The unified Petyr gateway currently exposes `/forecasting`, `/petyr-admin`, `/api/petyr/*`, `/redash-ingestor` and `/redash-ingestor/api/*` without OAuth2 Proxy/Auth API enforcement. Access Control is not implemented yet, so it is unclear which temporary server-level protection is required before colleagues can use an online host.
- **Impact:** Publishing the current gateway publicly would expose forecasting data, Petyr Admin workflows, Redash Ingestor diagnostics and Redash sync APIs to unauthenticated traffic.
- **Status:** Blocking before public/colleague server exposure.
- **Proposal / next action:** Until OAuth2 Proxy + Auth API are integrated, protect the entire host with temporary server-level controls such as VPN, IP allowlist, basic auth or another approved company-only gate. Record the chosen temporary control in deployment docs before opening the host.

## Define Petyr route permission matrix for access-control integration

- **Area:** Access Control / Petyr route permissions
- **Problem/question:** Petyr route-level permissions needed an MVP matrix before tool-side Access Layer integration.
- **Impact:** Resolved for Petyr-owned routes. Petyr now uses `petyr:read`, `petyr:forecast:write`, `petyr:management:write`, `petyr:admin` and reserves `petyr:redash:operator` for the Redash Ingestor operator surface.
- **Status:** Resolved for Petyr-owned routes on 2026-06-19. Redash Ingestor gateway enforcement remains tracked separately below because `/redash-ingestor` bypasses Petyr.
- **Proposal / next action:** Register the same permission keys on the external Access Layer `petyr` tool. Implement gateway or Redash Ingestor protection for `/redash-ingestor` before exposing that operator surface publicly.

## Protect Redash Ingestor operator and sync routes before public exposure

- **Area:** Access Control / Redash Ingestor
- **Problem/question:** The Redash Ingestor dashboard and `POST /redash-ingestor/api/redash/sync` are reachable through the unified gateway. Manual sync currently does not require `APP_INTERNAL_SECRET`; only source configuration writes use `x-app-secret`.
- **Impact:** Resolved at app level by preparing Redash Ingestor as a separate Access Layer tool with read, sync, source-write and admin permissions. Direct backend port exposure would still bypass the intended gateway/proxy path.
- **Status:** App-level implementation completed on 2026-06-19. Server network exposure remains blocking and is tracked by the direct backend ports item below.
- **Proposal / next action:** Register `redash-ingestor` in the external Access Layer using `petyr/access-layer-tools/redash-ingestor.tool.json`, configure Coolify secrets and verify direct backend ports are not publicly reachable.

## Remove direct public access to backend debug ports in server deployment

- **Area:** Deployment / Network exposure
- **Problem/question:** Local Compose publishes PostgreSQL `5432`, Redash Ingestor `3000`, Forecasting `3001` and gateway `8090` for local debugging. It is not documented which ports should be bound privately or firewalled on an online server.
- **Impact:** If the local Compose port model is copied to a public server, unauthenticated traffic could bypass the intended gateway and reach backend services directly.
- **Status:** Blocking before public/colleague server exposure.
- **Proposal / next action:** Document a server deployment profile where only the chosen public reverse proxy port is internet-facing. Bind backend app/database ports to internal Docker networks or localhost only, and verify direct backend URLs are unreachable externally.
