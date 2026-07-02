# Access Control Platform — Architecture

## Component map

```txt
Browser
  ↓
OAuth2 Proxy / reverse proxy
  ↓
apps/<protected-tool>
  ↓
packages/auth-client   ──▶ services/auth-api
                              ↓
                         PostgreSQL / access-control schema
```

## Responsibilities

### OAuth2 Proxy

Responsible for:

- redirecting anonymous users to Google login;
- accepting only Google-authenticated sessions;
- enforcing allowed company email domain;
- setting trusted auth headers for upstream apps;
- managing authentication cookies.

Not responsible for:

- deciding which tool the user can access;
- assigning roles;
- deciding app-level permissions;
- storing audit events.

### Auth API

Responsible for:

- upserting users from trusted proxy identity;
- managing tools;
- managing memberships;
- mapping roles to permissions;
- answering authorization requests;
- accepting audit events;
- exposing admin endpoints when implemented.

### Protected tool

Responsible for:

- reading trusted user identity from proxy headers;
- calling Auth API before protected actions;
- applying backend permission checks;
- sending audit events;
- showing clear access denied UI.

### Auth client package

Responsible for:

- avoiding duplicated integration logic;
- exposing middleware helpers;
- exposing audit helpers;
- standardizing error handling.

## Authentication flow

```txt
1. User opens protected tool.
2. Reverse proxy sends unauthenticated user to Google login.
3. User authenticates with Google Workspace account.
4. OAuth2 Proxy validates session and allowed email domain.
5. Proxy forwards request to tool with trusted auth headers.
6. Tool reads user email from `X-Auth-Request-Email`.
7. Tool calls Auth API `/v1/authorize` for required permission.
8. Auth API checks user, tool, membership, role and permission.
9. Tool allows or denies the request.
10. Tool emits an audit event.
```

## Authorization flow

```txt
Tool request
  ↓
read X-Auth-Request-Email
  ↓
POST /v1/authorize
  ↓
Auth API checks membership
  ↓
allowed=true/false
  ↓
tool continues or returns 403
```

## Network invariant

If tools trust `X-Auth-Request-Email`, the tool backend must not be directly reachable by users.

Required protections:

- app containers listen only on internal Docker/network interfaces where possible;
- public route goes through proxy;
- proxy strips incoming auth headers before setting trusted ones;
- direct requests without trusted header return 401;
- internal service-to-service calls use explicit server tokens, not spoofed user headers.

## Suggested future repo placement

```txt
services/auth-api/                 # Authorization and audit service
apps/access-control-admin/         # Admin UI for users, tools, roles, logs
packages/auth-client/              # Shared middleware/client helpers
docs/access-control/               # Source of truth and contracts
```

## Integration with existing platform

The existing platform already has:

- `apps/redash-ingestor`;
- `apps/forecasting-app`;
- `platform-home`;
- root Docker Compose.

Access Control must be added without changing existing business/data rules.

Petyr/Forecasting remains governed by:

- `PETYR_PRODUCT_AND_DATA_LOGIC.md`;
- `docs/petyr/*`;
- `apps/forecasting-app/AGENTS.md`.

Access Control only adds the access layer around tools.
