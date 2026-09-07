# Repository Guidelines

## Structure
- `src/app` contains App Router pages, layouts, and API routes.
- `src/components` holds reusable UI, `public` holds static assets, and root config lives in `next.config.ts`, `tsconfig.json`, and `eslint.config.mjs`.
- `src/app/globals.css` is the global Tailwind entry.

## Commands
- `npm run dev`
- `npm run convex:dev`
- `npm run build`
- `npm run lint`
- `npm run typecheck`
- `npm test`

Prefer `npm run lint`, `npm run typecheck`, and `npm test` for routine verification instead of a full build.

## Conventions
- TypeScript + React in strict mode.
- Keep existing 2-space indentation and double quotes.
- Follow App Router naming (`page.tsx`, `layout.tsx`, `route.ts`) and use the `@/*` alias for local imports.

## PR Rules
- Keep commits short and imperative.
- Unless instructed otherwise, attempt to run the CodeRabbit CLI on unstaged changes before committing and pushing.
- PRs should include test notes and screenshots or GIFs for visible UI changes.

## Secrets
- Copy `.env.example` to `.env.local` and set `OPENROUTER_API_KEY`.
- Never commit real API keys.

## Engineering Principles
**1. Think Before Coding**: State assumptions, surface uncertainty, and present tradeoffs.
**2. Simplicity First**: Minimum code required. No speculative features or unnecessary abstractions.
**3. Surgical Changes**: Touch only what is necessary. Match existing style.
**4. Goal-Driven Execution**: Define success via verifiable tests/checks.
