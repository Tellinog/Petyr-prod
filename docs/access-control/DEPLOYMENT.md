# Access Control Platform — Deployment

## Deployment components

Future deployment should include:

```txt
oauth2-proxy
auth-api
access-control-admin optional
protected tools
postgres access-control schema or shared DB
```

## Environment variables

See:

```txt
examples/env.access-control.example
```

## OAuth2 Proxy configuration direction

Indicative variables:

```env
OAUTH2_PROXY_PROVIDER=google
OAUTH2_PROXY_CLIENT_ID=replace-me
OAUTH2_PROXY_CLIENT_SECRET=replace-me
OAUTH2_PROXY_COOKIE_SECRET=replace-me
OAUTH2_PROXY_EMAIL_DOMAINS=unguess.io
OAUTH2_PROXY_SET_XAUTHREQUEST=true
OAUTH2_PROXY_PASS_USER_HEADERS=true
OAUTH2_PROXY_COOKIE_SECURE=true
OAUTH2_PROXY_COOKIE_HTTPONLY=true
OAUTH2_PROXY_COOKIE_SAMESITE=lax
```

## Protected app configuration direction

```env
TOOL_KEY=petyr_forecasting
AUTH_API_URL=http://auth-api:4000
AUTH_API_SECRET=replace-me
TRUSTED_AUTH_EMAIL_HEADER=x-auth-request-email
```

## Deployment sequencing

1. Deploy Auth API internally.
2. Seed/register initial tool records.
3. Seed/register initial platform owner.
4. Deploy OAuth2 Proxy in front of one pilot tool.
5. Integrate pilot tool middleware.
6. Validate smoke tests.
7. Add audit log views/export.
8. Extend to other tools.

## Do not

- Do not expose Auth API admin endpoints publicly.
- Do not expose protected app backend directly.
- Do not commit secrets.
- Do not weaken authorization to fix routing problems.
