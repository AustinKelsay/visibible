# Convex Setup and Environments

This project uses Convex for sessions, credits, invoices, image storage, and scheduled cleanup jobs.

## Environment Model

Use two Convex deployments:

- `dev` deployment: local development and testing
- `prod` deployment: live production traffic

Do not use your production Convex deployment for day-to-day local development.

## 1) Create Deployment Target Files

```bash
cp .env.convex.dev.example .env.convex.dev
cp .env.convex.prod.example .env.convex.prod
```

Set deployment names from the Convex dashboard:

- `.env.convex.dev`: `CONVEX_DEPLOYMENT=dev:your-project`
- `.env.convex.prod`: `CONVEX_DEPLOYMENT=prod:your-project`

## 2) Configure Local Next.js To Use Dev

In `.env.local`, keep Convex values pointed at your dev deployment:

- `CONVEX_DEPLOYMENT=dev:...`
- `NEXT_PUBLIC_CONVEX_URL=https://api.dev.visibible.com` (dev API URL)
- `CONVEX_SERVER_SECRET=<dev secret>`

Custom domain pattern in this project:

- Dev Convex API: `api.dev.visibible.com`
- Dev Convex HTTP Actions: `actions.dev.visibible.com`
- Prod Convex API: `api.visibible.com`
- Prod Convex HTTP Actions: `actions.visibible.com`

## 3) Initialize or Reconfigure Dev Deployment

Run once if needed:

```bash
npm run convex:dev:setup
```

This runs:

```bash
convex dev --configure existing --once --env-file .env.convex.dev
```

## 4) Daily Development

Run in a dedicated terminal while editing `convex/*.ts`:

```bash
npm run convex:dev
```

This watches files, codegens types, and syncs schema/functions to the dev deployment.

## 5) Production Deploy

Before release (or backend updates):

```bash
npm run convex:deploy:prod:dry-run
npm run convex:deploy:prod
```

## 6) Convex Environment Variables (Per Deployment)

Convex env vars are stored in Convex, not in `.env.local`.
Set them for both dev and prod deployments (with environment-specific values):

```bash
convex env set CONVEX_SERVER_SECRET "..."
convex env set ADMIN_PASSWORD_SECRET "..."
convex env set NOSTR_PRIVATE_KEY "..." # optional
convex env set NOSTR_RELAYS "wss://relay.nostr.band,wss://nos.lol,wss://relay.damus.io,wss://relay.primal.net" # optional
```

Use the deployment target files to select where values are set:

```bash
convex env list --env-file .env.convex.dev
convex env list --env-file .env.convex.prod
```

## 7) Core Commands

From repository root:

- `npm run convex:dev`
- `npm run convex:dev:setup`
- `npm run convex:deploy:prod`
- `npm run convex:deploy:prod:dry-run`
- `npm run convex:env:list:dev`
- `npm run convex:env:list:prod`

## 8) After Convex Setup: Vercel

Configure Vercel Preview and Production environment variables to match this Convex split.
Runbook: `llm/workflow/VERCEL_WORKFLOWS.md`

## Troubleshooting

- Unauthorized action calls:
  - Ensure `CONVEX_SERVER_SECRET` matches between Next.js env and the active Convex deployment.
- Wrong data environment:
  - Check `NEXT_PUBLIC_CONVEX_URL` in `.env.local`.
  - Check which env file (`.env.convex.dev` vs `.env.convex.prod`) is used by your CLI command.
- Functions not updating:
  - Keep `npm run convex:dev` running and verify no typecheck/codegen errors.
