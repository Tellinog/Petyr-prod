# Access Control Platform — API contract

This document defines the first internal API contract for `services/auth-api`.

Contracts must not be changed without updating this document and `DECISIONS.md` if the change is architectural.

## Authentication between tools and Auth API

Tools call Auth API server-to-server.

Required header:

```http
Authorization: Bearer <AUTH_API_SECRET>
Content-Type: application/json
```

The secret is configured per environment and must never be exposed to the browser.

## POST /v1/authorize

Checks whether a user is allowed to perform a permission on a tool.

### Request

```json
{
  "tool_key": "petyr_forecasting",
  "user_email": "lorenzo@unguess.io",
  "required_permission": "forecast:read",
  "request_id": "req_abc123"
}
```

### Success response — allowed

```json
{
  "allowed": true,
  "user": {
    "id": "usr_123",
    "email": "lorenzo@unguess.io",
    "name": "Lorenzo Prandi"
  },
  "tool": {
    "key": "petyr_forecasting"
  },
  "role": "admin",
  "permissions": [
    "forecast:read",
    "forecast:write",
    "warnings:read",
    "logs:read"
  ]
}
```

### Success response — denied

```json
{
  "allowed": false,
  "reason": "user_not_authorized_for_tool"
}
```

### Expected error responses

```json
{
  "error": "missing_tool_key",
  "message": "tool_key is required."
}
```

```json
{
  "error": "invalid_required_permission",
  "message": "required_permission is not valid for this tool."
}
```

## POST /v1/audit/events

Records a centralized audit event.

### Request

```json
{
  "tool_key": "petyr_forecasting",
  "actor_email": "lorenzo@unguess.io",
  "action": "forecast.updated",
  "resource_type": "company_forecast",
  "resource_id": "company_123_2026_05",
  "outcome": "success",
  "request_id": "req_abc123",
  "metadata": {
    "company_name": "ACME Spa",
    "month": "2026-05",
    "field": "forecast_ongoing",
    "old_value": 12000,
    "new_value": 14500
  }
}
```

### Response

```json
{
  "ok": true,
  "event_id": "aud_123"
}
```

## GET /v1/me

Optional endpoint for tools or admin UI to resolve the current authenticated user when a session/header is available.

This endpoint is optional for MVP if each tool reads the proxy header directly and calls `/v1/authorize`.

## Admin endpoints

Admin endpoints are deferred until implementation is planned.

Likely future endpoints:

```http
GET    /v1/admin/users
GET    /v1/admin/tools
POST   /v1/admin/tools
POST   /v1/admin/tools/:toolKey/memberships
PATCH  /v1/admin/tools/:toolKey/memberships/:membershipId
DELETE /v1/admin/tools/:toolKey/memberships/:membershipId
GET    /v1/admin/audit/events
```

Do not implement these by assumption. Add a task and update this API contract first.
