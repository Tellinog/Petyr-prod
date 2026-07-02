# Access Control Admin

Placeholder for the future admin panel used to manage access-control data.

Do not implement before the Auth API MVP is working.

## Planned capabilities

- list users;
- list tools;
- assign user to tool;
- change role;
- revoke access;
- inspect audit logs;
- export logs.

## Required reading

- `docs/access-control/SOURCE_OF_TRUTH.md`
- `docs/access-control/COPY_UX.md`
- `docs/access-control/ERROR_CODES.md`
- `docs/access-control/AUDIT_LOGGING.md`

## MVP note

The first implementation can use seeds or API calls before this panel exists. Do not block the core authorization flow on admin UI complexity.
