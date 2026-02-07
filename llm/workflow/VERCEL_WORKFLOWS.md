# Vercel Workflows (Aligned with Convex Split)

This runbook covers the Vercel side of the current deployment setup.

## Environment Mapping

Use Vercel environments with this mapping:

| Vercel | Convex target |
| --- | --- |
| Development | Convex dev |
| Preview | Convex dev |
| Production | Convex prod |

Domain convention:

- Preview frontend: `dev.visibible.com`
- Preview Convex API: `api.dev.visibible.com`
- Preview Convex HTTP Actions: `actions.dev.visibible.com`
- Production frontend: `visibible.com`
- Production Convex API: `api.visibible.com`
- Production Convex HTTP Actions: `actions.visibible.com`

## Files and Scripts Added

Vercel templates:

- `.env.vercel.preview.example`
- `.env.vercel.prod.example`

NPM scripts:

- `npm run vercel:link`
- `npm run vercel:env:pull:development`
- `npm run vercel:env:pull:preview`
- `npm run vercel:env:pull:production`
- `npm run vercel:deploy:preview`
- `npm run vercel:deploy:production`

## One-Time Project Setup

1. Link this repo to a Vercel project:

```bash
npm run vercel:link
```

2. In Vercel dashboard, set environment variables for Preview and Production using the template files above.

## Required Variables Per Vercel Environment

Minimum required values:

- `OPENROUTER_API_KEY`
- `SESSION_SECRET`
- `IP_HASH_SECRET`
- `NEXT_PUBLIC_CONVEX_URL`
- `CONVEX_SERVER_SECRET`
- `TRUST_PROXY_PLATFORM=vercel`
- `NEXT_PUBLIC_APP_URL`

Important notes:

- `CONVEX_DEPLOYMENT` is not required by Next.js runtime on Vercel.
- `CONVEX_SERVER_SECRET` must match the secret in the target Convex deployment.
- `NEXT_PUBLIC_*` variables are public and must not contain secrets.
- `NEXT_PUBLIC_CONVEX_URL` should be `https://api.dev.visibible.com` for Preview and `https://api.visibible.com` for Production.

## Pulling Vercel Env Locally

Use these commands to inspect current values:

```bash
npm run vercel:env:pull:development
npm run vercel:env:pull:preview
npm run vercel:env:pull:production
```

Generated files:

- `.env.vercel.development.local`
- `.env.vercel.preview.local`
- `.env.vercel.prod.local`

## Deploy Flow

Preview deploy:

```bash
npm run convex:dev
npm run vercel:deploy:preview
```

Production deploy:

```bash
npm run convex:deploy:prod:dry-run
npm run convex:deploy:prod
npm run vercel:deploy:production
```

Deploy Convex production before Vercel production when backend schema/functions changed.

## Pre-Release Checklist

- Vercel Production `NEXT_PUBLIC_CONVEX_URL` points to Convex prod.
- Vercel Production `CONVEX_SERVER_SECRET` matches Convex prod value.
- `TRUST_PROXY_PLATFORM=vercel` is set.
- `NEXT_PUBLIC_APP_URL` matches the canonical production domain.
- Convex custom domains are configured for both API and HTTP Actions.

## Related Docs

- `llm/workflow/CONVEX_WORKFLOWS.md`
- `llm/workflow/PROXY_CONFIGURATION.md`
