# Access Control Platform — Security

## Authentication

Authentication is delegated to Google Workspace through OAuth/OIDC, mediated by OAuth2 Proxy or equivalent.

The platform must not implement username/password login.

## Domain restriction

Only company-domain Google accounts should pass the proxy.

This is the first gate. It is not enough for tool-level access.

## Authorization

Authorization is handled by Auth API.

Every protected action must resolve:

```txt
user + tool + required_permission → allowed / denied
```

## Session handling

OAuth2 Proxy manages authentication cookies.

Required cookie settings for production:

- secure cookies;
- HTTP-only cookies;
- SameSite Lax or Strict depending on routing;
- strong cookie secret;
- explicit cookie domain if tools share a parent domain.

## Header trust model

Trusted headers may include:

```txt
X-Auth-Request-Email
X-Auth-Request-User
X-Auth-Request-Preferred-Username
```

These headers are trusted only if:

1. the backend is reachable only through the trusted proxy;
2. the proxy strips any incoming headers with the same names;
3. the proxy recreates headers after successful login.

If these conditions are not guaranteed, the tool must not trust the headers and must use a signed internal token instead.

## Secrets

Never commit:

- Google OAuth client secret;
- OAuth2 Proxy cookie secret;
- Auth API server-to-server token;
- database password;
- production URLs containing credentials;
- real Redash API keys.

Use `.env` locally and `.env.example` / `examples/*.example` for placeholders.

## Sensitive data in audit logs

Audit logs should contain metadata needed for traceability, not full sensitive payloads.

Avoid storing:

- full prompts unless required for a documented debug/audit reason;
- personal data not needed for audit;
- full customer datasets;
- secrets;
- access tokens;
- raw files.

Prefer:

- IDs;
- resource type;
- action;
- outcome;
- actor email;
- timestamps;
- model name;
- token count;
- execution duration;
- query ID or hash;
- compact metadata.

## Deny by default

If Auth API cannot verify access, protected tools must deny access or fail closed.

Recommended behaviour:

- missing auth header → `401`;
- valid identity but no membership → `403`;
- Auth API unavailable → `503`, not silent allow.

## Admin actions

Admin actions must be audited.

Minimum admin audit actions:

- `admin.user_granted`
- `admin.user_revoked`
- `admin.role_changed`
- `admin.tool_created`
- `admin.tool_disabled`
- `admin.permission_changed`

## AI agent actions

AI agent actions must be audited separately from normal UI actions.

Minimum AI audit actions:

- `agent.run.started`
- `agent.run.completed`
- `agent.run.failed`
- `agent.model.selected`
- `agent.query.generated`
- `agent.query.executed`
- `agent.file.read`
- `agent.external_api.called`
