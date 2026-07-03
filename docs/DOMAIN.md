# Domain Model

## Petyr Intelligence Domain

Module name: `intelligence`

UI name: `Petyr Intelligence`

Job name: `intelligence-scan`

Core domain objects:

- `CompanyIntelligenceRun`: one scan execution for one company or a controlled batch of companies.
- `CompanySignalItem`: one deduplicated external source/result/event candidate for a company.
- `CompanyIntelligenceInsight`: one generated actionable insight for a company, optionally mapped to one or more official Business Units.
- `CompanyInsightFeedback`: one CSM rating/comment on an insight.
- `IntelligenceCalibrationReport`: admin-facing recommendations generated from feedback and scan quality metrics.

## Inputs

Petyr Intelligence may use:

- company names and active/inactive status from Petyr/PostgreSQL;
- CSM ownership and Branch from `company_ownership`;
- official Petyr Business Units;
- company-level context needed to search and classify external signals.

Petyr Intelligence must not ask OpenRouter to analyze deterministic numeric data such as revenue, margin, forecasts, campaign counts or mathematical trends. Those stay owned by deterministic Forecasting services.

## Signal Categories

Initial signal categories may include:

- company funding, growth, downsizing or restructuring;
- product launches or market expansion;
- compliance, security, accessibility or quality-related events;
- hiring or leadership changes;
- partnerships, acquisitions or public customer experience signals.

These categories are not Business Units. Business Unit relevance is classified after retrieval against the official Petyr Business Unit list:

- AI
- Accessibility
- Community
- Experience
- Express
- FTE
- Other
- QA
- Security
- TA

## Insight Contract

Each persisted insight should keep:

- company;
- CSM context;
- mapped Business Unit relevance;
- short insight text;
- rationale;
- suggested action;
- confidence or relevance score;
- linked source ids;
- provider/model metadata;
- generation timestamp;
- feedback aggregate state.

