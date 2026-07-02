# Access Control Platform — Source of Truth

This document is the source of truth for the UNGUESS Access Control Platform.

Any implementation under:

- `services/auth-api/`
- `apps/access-control-admin/`
- `packages/auth-client/`
- reverse proxy / OAuth2 Proxy configuration
- tool-level access-control integration

must comply with this document.

## Mission

Create a common authentication, authorization and audit layer for internal UNGUESS tools and agents.

The system must support:

- Google Workspace login;
- domain-level access gate;
- tool-level authorization;
- role and permission management;
- centralized audit logging;
- repeatable integration for every web app, agent and internal service.

## Architecture summary

```txt
User
  ↓
Reverse proxy / OAuth2 Proxy
  ↓
Protected tool UI/API
  ↓
Auth API
  ↓
Access-control database
```

## Core decisions

1. Use Google Workspace identity through OAuth/OIDC.
2. Use OAuth2 Proxy or equivalent as the first authentication gate.
3. Do not use Google IAP as the primary solution because the platform is not hosted on Google Cloud.
4. Do not use Google Groups in the first version.
5. Authorization is internal and based on tools, roles and permissions.
6. Every protected tool must integrate with Auth API or the shared auth client.
7. Every relevant action must produce an audit log event.
8. Frontend UX can hide actions, but backend authorization is mandatory.
9. No tool must implement custom username/password login.
10. No tool must hardcode authorized emails.

## In scope for MVP

- OAuth2 Proxy in front of protected web apps.
- Company-domain Google login.
- Auth API with users, tools, memberships, roles, permissions.
- `/v1/authorize` endpoint.
- `/v1/audit/events` endpoint.
- Shared integration guidance for tools.
- Audit logs for login/access/action events.
- Manual management of users and memberships through seed/admin API or minimal admin panel.

## Out of scope for MVP

- Google Groups sync.
- Google IAP.
- SCIM provisioning.
- Fine-grained Google Workspace admin automation.
- Full SIEM integration.
- Advanced risk scoring.
- Password-based login.
- Public self-registration.

## Non-negotiables

- Deny by default.
- Server-side authorization only.
- Backend must not trust client-supplied auth headers unless traffic is guaranteed to come from the trusted proxy.
- Auth headers must be stripped and recreated by the proxy.
- Secrets must never be committed.
- Audit logs must not store unnecessary sensitive data.
- If behaviour is ambiguous, update `docs/access-control/BACKLOG.md` instead of inventing.
