# Repository guidance

Follow [AGENTS.md](AGENTS.md) for repository conventions and verification.
Read [README.md](README.md) for local setup, and use the [documentation index](llm/README.md) to find the guide for the feature you are changing.

Next.js handles pages and API requests; Convex stores shared application state. AI calls go through OpenRouter. Defaults, schemas, and scripts live in source: consult the linked implementation rather than duplicating them in this file.
