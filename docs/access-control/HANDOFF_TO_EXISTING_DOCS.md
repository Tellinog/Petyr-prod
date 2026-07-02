# Suggested future edits to existing docs

This overlay does not modify existing files. If later you explicitly allow updating existing root docs, add the following cross-links.

## Suggested addition to root README.md

```md
## Access Control Platform

This repository also contains documentation and placeholders for a shared access-control layer for internal UNGUESS tools.

Start from:

- `docs/access-control/SOURCE_OF_TRUTH.md`
- `docs/access-control/ARCHITECTURE.md`
- `docs/access-control/TOOL_INTEGRATION_GUIDE.md`

The current decision is OAuth2 Proxy + internal Auth API + centralized audit logs. Google Groups and Google IAP are out of scope for the MVP.
```

## Suggested addition to root AGENTS.md

```md
## Access Control Platform rules

Before changing authentication, authorization, protected routes, tool access, roles, permissions, audit logging or proxy configuration, read:

- `docs/access-control/SOURCE_OF_TRUTH.md`
- `docs/access-control/SECURITY.md`
- `docs/access-control/API.md`
- `docs/access-control/TOOL_INTEGRATION_GUIDE.md`

Do not hardcode authorized emails inside tools.
Do not implement custom password login.
Do not rely on frontend-only authorization.
Do not use Google Groups or Google IAP unless a new decision is recorded in `DECISIONS.md`.
```

## Suggested addition to root `.env.example`

Use `examples/env.access-control.example` as the source and copy only after the first Auth API/proxy implementation task is approved.
