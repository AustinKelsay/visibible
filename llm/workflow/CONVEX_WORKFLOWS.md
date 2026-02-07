# Convex Workflows (Dev/Prod Split)

This project now uses separate Convex deployments for development and production.

## Deployment Model

- Dev deployment: used by local app development and Vercel Preview
- Prod deployment: used by Vercel Production

Never use the production Convex deployment for day-to-day local coding.

## Files and Scripts Added

Deployment target files:

- `.env.convex.dev` (local, ignored)
- `.env.convex.prod` (local, ignored)
- `.env.convex.dev.example` (committed template)
- `.env.convex.prod.example` (committed template)

NPM scripts:

- `npm run convex:dev`
- `npm run convex:dev:setup`
- `npm run convex:deploy:prod:dry-run`
- `npm run convex:deploy:prod`
- `npm run convex:env:list:dev`
- `npm run convex:env:list:prod`

## Initial Setup

1. Copy templates:

```bash
cp .env.convex.dev.example .env.convex.dev
cp .env.convex.prod.example .env.convex.prod
```

2. Set `CONVEX_DEPLOYMENT` values:

- `.env.convex.dev` -> `dev:...`
- `.env.convex.prod` -> `prod:...`

3. Keep `.env.local` pointed at Convex dev:

- `CONVEX_DEPLOYMENT=dev:...` (CLI convenience)
- `NEXT_PUBLIC_CONVEX_URL=https://api.dev.visibible.com`
- `CONVEX_SERVER_SECRET=<dev secret>`
- `NEXT_PUBLIC_APP_URL=https://dev.visibible.com`
- `OPENROUTER_REFERRER=https://dev.visibible.com`

Custom domain convention:

- Dev API: `api.dev.visibible.com`
- Dev HTTP Actions: `actions.dev.visibible.com`
- Prod API: `api.visibible.com`
- Prod HTTP Actions: `actions.visibible.com`

## Daily Development Workflow

1. Start Next.js:

```bash
npm run dev
```

2. In another terminal, run Convex watcher:

```bash
npm run convex:dev
```

## Production Deploy Workflow

1. Review backend deploy changes:

```bash
npm run convex:deploy:prod:dry-run
```

2. Deploy Convex backend:

```bash
npm run convex:deploy:prod
```

## Convex Environment Variables

Set deployment-specific values in Convex (not `.env.local`):

- `CONVEX_SERVER_SECRET`
- `ADMIN_PASSWORD_SECRET`
- `NOSTR_PRIVATE_KEY` (optional)

Examples:

```bash
npx convex env list --env-file .env.convex.dev
npx convex env list --env-file .env.convex.prod
```

## Common Failure Modes

- Unauthorized Convex actions:
  - `CONVEX_SERVER_SECRET` mismatch between Next.js runtime and target Convex deployment.
- Updates not appearing:
  - `npm run convex:dev` is not running, or points to wrong deployment file.
- Wrong data in app:
  - `NEXT_PUBLIC_CONVEX_URL` in `.env.local` points to prod instead of dev.

## Related Docs

- `convex/README.md`
- `llm/workflow/VERCEL_WORKFLOWS.md`
- `llm/workflow/PROXY_CONFIGURATION.md`
