# Access Control Platform — Testing

## Smoke tests

### Authentication gate

```txt
[ ] Anonymous user is redirected to Google login.
[ ] User with non-company Google account is rejected.
[ ] User with company Google account reaches the protected tool.
```

### Authorization

```txt
[ ] Authorized user with `viewer` can access read-only endpoints.
[ ] `viewer` cannot access write endpoints.
[ ] User without membership receives 403.
[ ] Disabled user receives 403.
[ ] Unknown tool_key receives tool_not_found or denied response.
```

### Audit

```txt
[ ] Successful tool access creates audit event.
[ ] Access denied creates audit event.
[ ] Data export creates audit event.
[ ] Admin membership change creates audit event.
[ ] Agent run creates started/completed or started/failed events.
```

### Network trust

```txt
[ ] Backend cannot be reached directly from public internet.
[ ] Direct request without trusted auth header returns 401.
[ ] Proxy strips client-supplied X-Auth-Request-Email before setting its own.
```

## Tool integration checklist

```txt
[ ] TOOL_KEY configured.
[ ] AUTH_API_URL configured.
[ ] AUTH_API_SECRET configured server-side only.
[ ] Trusted email header read server-side.
[ ] Every protected endpoint declares required permission.
[ ] Frontend does not enforce security alone.
[ ] Audit events are emitted for relevant actions.
[ ] 401/403/503 messages match ERROR_CODES.md.
```

## Manual test script for a protected tool

1. Open the tool in an anonymous browser.
2. Verify redirect to Google login.
3. Login with authorized company account.
4. Verify tool loads.
5. Login with company account without membership.
6. Verify 403 access denied.
7. Try direct backend URL without proxy.
8. Verify 401 or unreachable.
9. Perform a read action.
10. Verify audit log.
11. Perform a write action.
12. Verify permission and audit log.
