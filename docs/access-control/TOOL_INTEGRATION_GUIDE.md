# Access Control Platform — Tool integration guide

This is the practical guide for developers integrating a tool with the Access Control Platform.

## Current Petyr-side tool manifests

The platform currently carries non-secret Access Layer onboarding descriptors in:

```txt
petyr/access-layer-tools/petyr.tool.json
petyr/access-layer-tools/redash-ingestor.tool.json
```

Use these files to create the two external Access Layer tools. Do not store generated client secrets, OAuth secrets, Redash API keys, database passwords or production credentials in those JSON files.

`petyr` and `redash-ingestor` are separate tools. Redash Ingestor remains the technical/operator service that calls Redash and writes PostgreSQL; Petyr continues to read PostgreSQL-backed product data and must not call Redash or Redash Ingestor for product data.

Petyr's tool-side implementation uses an opaque `HttpOnly` local session cookie
and PostgreSQL table `petyr_auth_session`. The table contains encrypted Access
Layer tokens plus current identity, permissions and expiry state. Every Petyr
page/API permission guard resolves the row and performs a server-to-server
refresh only when the access token has at most 60 seconds remaining. A
PostgreSQL advisory transaction lock serializes refreshes for the same local
session. Successful refresh replaces the single-use token pair and all derived
auth state atomically; invalid, failed or malformed refresh deletes the local
session and restarts login for browser navigation. Petyr has no background
session-renewal timer. Petyr logout sends both the latest `session_id` and
`refresh_token` when available and always deletes local state.

Petyr permissions:

```txt
petyr:read
petyr:forecast:write
petyr:management:write
petyr:admin
```

`POST /api/petyr/data-refresh` is a constrained Petyr product action available
to any authenticated session with at least one Petyr permission. It does not grant access to the
Redash Ingestor dashboard or arbitrary sync endpoints. Petyr re-authorizes the
browser session server-side and uses `APP_INTERNAL_SECRET` only on the internal
service-to-service request.

Redash Ingestor permissions:

```txt
redash-ingestor:read
redash-ingestor:sync
redash-ingestor:sources:write
redash-ingestor:admin
```

`redash-ingestor:admin` is an operator/admin superset. Source create/update routes still require the existing `APP_INTERNAL_SECRET`/`x-app-secret` recovery control in addition to Access Layer permission.

## Rule

Every protected tool must:

1. be behind OAuth2 Proxy or equivalent;
2. read the authenticated user from a trusted header;
3. call Auth API for permissions;
4. enforce permissions server-side;
5. emit audit events for relevant actions.

## Required environment variables

Each tool should define:

```env
TOOL_KEY=petyr_forecasting
AUTH_API_URL=http://auth-api:4000
AUTH_API_SECRET=replace-with-server-secret
TRUSTED_AUTH_EMAIL_HEADER=x-auth-request-email
```

## Required headers from proxy

Minimum required header:

```http
X-Auth-Request-Email: user@unguess.io
```

Optional headers:

```http
X-Auth-Request-User: user
X-Auth-Request-Preferred-Username: user@unguess.io
```

## Backend behaviour

### Missing header

Return:

```http
401 Unauthorized
```

Body:

```json
{
  "error": "missing_authenticated_user",
  "message": "Authenticated user header is missing."
}
```

### Auth API denies access

Return:

```http
403 Forbidden
```

Body:

```json
{
  "error": "forbidden",
  "message": "User is not authorized for this tool."
}
```

### Auth API unavailable

Return:

```http
503 Service Unavailable
```

Body:

```json
{
  "error": "auth_service_unavailable",
  "message": "Unable to verify user authorization."
}
```

## Node / Express middleware example

```js
const AUTH_API_URL = process.env.AUTH_API_URL;
const AUTH_API_SECRET = process.env.AUTH_API_SECRET;
const TOOL_KEY = process.env.TOOL_KEY;
const EMAIL_HEADER = process.env.TRUSTED_AUTH_EMAIL_HEADER || "x-auth-request-email";

function requirePermission(requiredPermission) {
  return async function (req, res, next) {
    try {
      const userEmail = req.headers[EMAIL_HEADER];

      if (!userEmail || Array.isArray(userEmail)) {
        return res.status(401).json({
          error: "missing_authenticated_user",
          message: "Authenticated user header is missing."
        });
      }

      const response = await fetch(`${AUTH_API_URL}/v1/authorize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${AUTH_API_SECRET}`
        },
        body: JSON.stringify({
          tool_key: TOOL_KEY,
          user_email: userEmail,
          required_permission: requiredPermission,
          request_id: req.id
        })
      });

      if (!response.ok) {
        return res.status(503).json({
          error: "auth_service_unavailable",
          message: "Unable to verify user authorization."
        });
      }

      const auth = await response.json();

      if (!auth.allowed) {
        return res.status(403).json({
          error: "forbidden",
          message: "User is not authorized for this tool."
        });
      }

      req.auth = {
        user: auth.user,
        role: auth.role,
        permissions: auth.permissions
      };

      return next();
    } catch (error) {
      return res.status(503).json({
        error: "authorization_check_failed",
        message: "Authorization check failed."
      });
    }
  };
}

module.exports = { requirePermission };
```

## Next.js API route pattern

For Next.js route handlers, wrap the handler with a shared function from `packages/auth-client` once implemented.

Pseudo-pattern:

```ts
export const GET = withPermission("forecast:read", async (request, auth) => {
  return Response.json({ user: auth.user.email, data: [] });
});
```

Do not duplicate raw Auth API calls in every route if `packages/auth-client` exists.

## FastAPI dependency example

```py
import os
import httpx
from fastapi import Depends, Header, HTTPException, Request

AUTH_API_URL = os.environ["AUTH_API_URL"]
AUTH_API_SECRET = os.environ["AUTH_API_SECRET"]
TOOL_KEY = os.environ["TOOL_KEY"]

async def require_permission(permission: str, request: Request, x_auth_request_email: str | None = Header(default=None)):
    if not x_auth_request_email:
        raise HTTPException(status_code=401, detail="missing_authenticated_user")

    async with httpx.AsyncClient(timeout=5) as client:
        response = await client.post(
            f"{AUTH_API_URL}/v1/authorize",
            headers={"Authorization": f"Bearer {AUTH_API_SECRET}"},
            json={
                "tool_key": TOOL_KEY,
                "user_email": x_auth_request_email,
                "required_permission": permission,
                "request_id": request.headers.get("x-request-id")
            },
        )

    if response.status_code >= 500:
        raise HTTPException(status_code=503, detail="auth_service_unavailable")

    data = response.json()
    if not data.get("allowed"):
        raise HTTPException(status_code=403, detail="forbidden")

    return data
```

## Route permission declaration

Every protected endpoint must declare a permission.

Example for Petyr:

```txt
GET  /api/forecast                 forecast:read
POST /api/forecast                 forecast:write
POST /api/forecast/approve         forecast:approve
GET  /api/admin/users              admin:users
GET  /api/audit                    logs:read
```

## Forbidden patterns

Do not use:

```js
if (user.email === "lorenzo@unguess.io") { ... }
```

Do not store role in frontend state as the source of truth.

Do not let the frontend call Auth API with `AUTH_API_SECRET`.

Do not accept `X-Auth-Request-Email` from public traffic.
