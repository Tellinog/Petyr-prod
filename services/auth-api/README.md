# Auth API

Placeholder for the future Access Control Auth API.

Do not implement code here before reading:

- `docs/access-control/SOURCE_OF_TRUTH.md`
- `docs/access-control/ARCHITECTURE.md`
- `docs/access-control/API.md`
- `docs/access-control/DB.md`
- `docs/access-control/SECURITY.md`

## Planned responsibilities

- manage users;
- manage tools;
- manage memberships;
- resolve roles and permissions;
- expose `/v1/authorize`;
- expose `/v1/audit/events`;
- support admin APIs when approved.

## MVP endpoints

```http
POST /v1/authorize
POST /v1/audit/events
GET  /health
```

## Non-goals

- no password login;
- no Google Groups sync in MVP;
- no public signup;
- no frontend secrets.
