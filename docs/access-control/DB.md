# Access Control Platform — Database model

This document defines the logical data model. Physical schema may be implemented with Prisma after the stack decision is confirmed.

## users

Represents users known to the Auth API.

Fields:

```txt
id
google_sub nullable initially if only proxy email is available
email unique
name nullable
picture_url nullable
hosted_domain nullable
is_active boolean
first_seen_at
last_seen_at
created_at
updated_at
```

Invariant:

- `email` is unique.
- disabled users must not be authorized.

## tools

Represents protected tools.

Fields:

```txt
id
tool_key unique
name
description nullable
base_url nullable
is_active boolean
created_at
updated_at
```

Invariant:

- `tool_key` is stable and must not be casually renamed.
- inactive tools deny authorization.

## roles

For MVP roles can be enum-based:

```txt
owner
admin
editor
viewer
```

If a table is needed later:

```txt
id
role_key unique
description
created_at
updated_at
```

## tool_memberships

Connects users to tools.

Fields:

```txt
id
user_id
tool_id
role
status active|disabled|expired
granted_by_user_id nullable
granted_at
expires_at nullable
created_at
updated_at
```

Invariant:

- A user can have at most one active membership per tool.
- Expired or disabled memberships deny access.

## tool_permissions

For MVP this may live in config/code, but it must be documented.

Logical shape:

```txt
tool_key
role
permission
```

Example:

```json
{
  "petyr_forecasting": {
    "viewer": ["forecast:read", "company:read", "warnings:read"],
    "editor": ["forecast:read", "forecast:write", "company:read", "warnings:read"],
    "admin": ["forecast:read", "forecast:write", "admin:users", "logs:read"],
    "owner": ["*"]
  }
}
```

## audit_events

Stores centralized audit logs.

Fields:

```txt
id
tool_id nullable
tool_key
actor_user_id nullable
actor_email
action
resource_type nullable
resource_id nullable
outcome success|denied|failed
request_id nullable
ip_address nullable
user_agent nullable
metadata_json nullable
created_at
```

Invariant:

- Audit events are append-only.
- Standard users cannot modify audit records.
- Metadata must not contain secrets.

## future optional tables

- `api_clients` for server-to-server credentials.
- `sessions` if the Auth API manages app sessions directly.
- `permission_catalog` if permissions move from config to DB.
- `admin_actions` if admin auditing needs a dedicated normalized table.
