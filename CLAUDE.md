# Repository guidance

Follow [AGENTS.md](AGENTS.md) for repository conventions and verification.
Read [README.md](README.md) for local setup, and use the [documentation index](llm/README.md) to find the guide for the feature you are changing.

Next.js handles pages and API requests; Convex stores shared application state. AI calls go through OpenRouter. Defaults, schemas, and scripts live in source: consult the linked implementation rather than duplicating them in this file.

## Agent skills

- When publishing or implementing specs and tickets, use [GitHub tracker conventions](docs/agents/issue-tracker.md) and [triage labels](docs/agents/triage-labels.md).
- When naming domain concepts or interpreting target versus current behavior, use [domain documentation](docs/agents/domain.md).

- For Convex and Nostr operational tooling, use [CLI access notes](docs/agents/cli-access.md).
