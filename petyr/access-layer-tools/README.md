# Access Layer tool configs

Non-secret onboarding descriptors for tools that must be registered in the external Access Layer.

These files are operational handoff/config references only. Do not add generated client secrets, OAuth secrets, Redash API keys, database passwords or production credentials here.

## Tools

- `petyr.tool.json`: product-facing Petyr Forecasting workspace.
- `redash-ingestor.tool.json`: technical/operator Redash ingestion dashboard and APIs.

## Production URLs

```txt
Access Layer:    https://access-layer.draftapps.it
Petyr:           https://petyr.draftapps.it
Redash Ingestor: https://petyr.draftapps.it/redash-ingestor
```

After creating each tool in Access Layer, copy the generated client ID and one-time client secret into the target service environment variables in Coolify only.
