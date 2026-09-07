# Vercel deployment

Use development Convex for Vercel Development/Preview and production Convex for Vercel Production. The committed templates describe intended settings, not proof of live domain or environment configuration.

## Setup

1. Run `npm run vercel:link` from the repository root to select the project.
2. Configure each Vercel environment using [.env.vercel.preview.example](../../.env.vercel.preview.example) or [.env.vercel.prod.example](../../.env.vercel.prod.example).
3. Match `NEXT_PUBLIC_CONVEX_URL` and `CONVEX_SERVER_SECRET` to that environment's Convex deployment. Set session/IP secrets, the OpenRouter key, app URL, feature flags, and optional payment/admin settings as described in [.env.example](../../.env.example).
4. Set `TRUST_PROXY_PLATFORM=vercel` for Vercel runtimes; see [Proxy trust](PROXY_CONFIGURATION.md). `NEXT_PUBLIC_*` values are public and must contain no secrets.

`CONVEX_DEPLOYMENT` selects backend CLI commands and is not required by the Next.js runtime. Use the actual configured app/API/HTTP Actions URLs; custom domains shown in templates are examples, not prerequisites.

The `vercel:env:pull:development`, `vercel:env:pull:preview`, and `vercel:env:pull:production` scripts write environment snapshots to ignored `.env.vercel.*.local` files. They do not automatically configure `.env.local`; do not use production credentials for daily development.

## Release

Run the repository lint, typecheck and non-watch tests before release. For prompt/model/context changes, also satisfy [Chat eval and release](CHAT_EVAL_AND_RELEASE.md).

Preview:

```bash
# Sync backend dev changes in a separate terminal:
npm run convex:dev
# Deploy frontend preview:
npm run vercel:deploy:preview
```

Production, when backend changes are included:

```bash
npm run convex:deploy:prod:dry-run
npm run convex:deploy:prod
npm run vercel:deploy:production
```

Deploy compatible backend changes before the frontend that depends on them. Verify target URLs/secrets before deploying and exercise the affected feature in preview. Readiness confirms only its documented checks, not end-to-end provider/payment health; see [Observability](../context/OBSERVABILITY.md).

Backend initialization and environment commands: [Convex setup](../../convex/README.md). Exact script definitions: [package.json](../../package.json).
