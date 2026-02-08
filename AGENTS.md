# Repository Guidelines

## Project Structure & Module Organization
- `src/app` holds Next.js App Router pages, layouts, and API routes (notably `src/app/api/chat/route.ts`).
- `src/components` contains reusable React UI components (for example, `src/components/chat.tsx`).
- `src/app/globals.css` defines global styles and the Tailwind v4 entry point.
- `public` stores static assets served at `/` (SVGs, icons, etc.).
- Top-level configs live in `next.config.ts`, `tsconfig.json`, and `eslint.config.mjs`.

## Build, Test, and Development Commands
- `npm run dev` starts the local dev server at `http://localhost:3000`.
- `npm run build` generates a production build.
- `npm start` serves the production build locally.
- `npm run lint` runs ESLint with Next.js and TypeScript rules.
- `npm run typecheck` runs TypeScript type checking without emitting files.
- `npm test` runs Vitest tests.

**Note:** When verifying your work, run `npm run lint`, `npm run typecheck`, and `npm test` instead of building. This is faster and catches issues without generating a full production build.

## Coding Style & Naming Conventions
- TypeScript + React with `strict` mode enabled in `tsconfig.json`.
- Match existing formatting: 2-space indentation and double quotes.
- Follow App Router naming (`page.tsx`, `layout.tsx`, `route.ts`).
- Components are `PascalCase`; hooks are `useX`.
- Prefer the `@/*` path alias for imports from `src` (e.g., `@/components/chat`).

## Testing Guidelines
- Tests are run with Vitest (`npm test`).
- Test files use the `*.test.ts` or `*.test.tsx` naming convention and live alongside the code they test or in `__tests__` directories.
- When verifying changes, run `npm run lint`, `npm run typecheck`, and `npm test` to ensure code quality.

## Commit & Pull Request Guidelines
- The Git history currently only includes `Initial commit`, so there is no established commit format.
- Use short, imperative commit messages (e.g., `Add streaming chat UI`) and keep unrelated changes separate.
- PRs should include a concise summary, testing notes (`npm run lint`, `npm run typecheck`, `npm test` or manual steps), and screenshots/GIFs for UI changes.

## Configuration & Secrets
- Copy `.env.example` to `.env.local` and set `OPENROUTER_API_KEY` for chat and image generation.
- Never commit real API keys.
