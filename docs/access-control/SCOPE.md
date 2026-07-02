# Access Control Platform — Scope

## Goal

Protect internal UNGUESS tools and agents with a shared access-control system.

The first goal is not to build a complex IAM product. The first goal is to create a simple, stable and repeatable access gate for company tools.

## MVP objectives

- Authenticate users through Google Workspace.
- Allow only company-domain accounts past the proxy.
- Authorize users per tool through internal memberships.
- Support standard roles: `owner`, `admin`, `editor`, `viewer`.
- Expose a canonical authorization endpoint.
- Expose a canonical audit endpoint.
- Provide reusable integration patterns for tools.

## Personas

### Platform owner

Owns access-control architecture, security rules, cross-tool consistency and rollout.

### Tool owner

Owns one specific tool, its allowed users, and its permission model.

### Tool user

Uses one or more internal tools after Google login.

### Auditor / Ops

Reads audit logs to understand who accessed what and what actions were performed.

### Developer / LLM agent

Implements or modifies tools following documentation-first rules.

## In scope

- Google login via OAuth2 Proxy.
- Internal authorization API.
- Tool membership records.
- Role/permission mapping.
- Audit events.
- Integration guide and shared package placeholder.
- Admin panel placeholder.

## Out of scope

- Google Groups in MVP.
- Google IAP in MVP.
- Password authentication.
- External customer access.
- Public signup.
- Complete enterprise IAM feature set.

## Success metrics

- A protected tool cannot be accessed anonymously.
- A valid Google user without tool membership receives a clear 403.
- A valid authorized user can access the tool.
- Every protected action has a permission check.
- Relevant actions are logged in a centralized audit table.
- A new tool can integrate using the documented middleware pattern without inventing custom auth logic.
