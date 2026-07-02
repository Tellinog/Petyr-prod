# Auth Client

Shared client/middleware package for integrating tools with the Access Control Platform.

The goal is to avoid duplicated and inconsistent access-control logic across apps.

## Planned exports

```ts
requirePermission(permission: string)
auditEvent(event: AuditEvent)
getAuthenticatedEmail(request)
assertAuthenticated(request)
```

## Expected users

- `apps/forecasting-app`
- future internal web apps
- internal agents with web/API surfaces

## Required reading

- `docs/access-control/TOOL_INTEGRATION_GUIDE.md`
- `docs/access-control/API.md`
- `docs/access-control/ERROR_CODES.md`

## Rules

- Never expose `AUTH_API_SECRET` to browser code.
- Never enforce permissions only in frontend.
- Always fail closed when Auth API cannot verify access.
