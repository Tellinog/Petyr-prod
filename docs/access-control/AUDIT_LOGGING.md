# Access Control Platform — Audit logging

## Purpose

Audit logs answer:

```txt
Who did what, where, when, with which result?
```

## Required event fields

```txt
tool_key
actor_email
action
outcome
created_at
```

Recommended fields:

```txt
resource_type
resource_id
request_id
ip_address
user_agent
metadata_json
```

## Standard actions

### Tool access

```txt
tool.accessed
tool.access_denied
tool.logout
```

### Admin

```txt
admin.user_granted
admin.user_revoked
admin.role_changed
admin.tool_created
admin.tool_disabled
```

### Data actions

```txt
data.viewed
data.created
data.updated
data.deleted
data.exported
file.uploaded
file.downloaded
settings.updated
```

### AI agent actions

```txt
agent.run.started
agent.run.completed
agent.run.failed
agent.model.selected
agent.prompt.submitted
agent.query.generated
agent.query.executed
agent.file.read
agent.external_api.called
```

## Example event

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

## What not to log

Do not log:

- secrets;
- API keys;
- OAuth tokens;
- full raw customer datasets;
- unnecessary personal data;
- full uploaded files;
- full prompts unless explicitly required and documented.

## Agent-specific note

For AI agents, prefer storing:

- model;
- token count;
- duration;
- tool/action;
- resource IDs;
- generated SQL if relevant for audit;
- error details if failed.

If storing full prompts or outputs becomes necessary, document the reason and retention policy first.
