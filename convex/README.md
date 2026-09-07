# Convex setup

Convex stores sessions, credits, invoices, images, feedback, bulk progress and scheduled-job state. Use a development deployment for local work and Vercel Preview, and a separate production deployment for Vercel Production. This is the intended mapping; verify actual deployment settings before release.

## Development

From the repository root:

```bash
cp .env.convex.dev.example .env.convex.dev
```

Set its `CONVEX_DEPLOYMENT` to your `dev:...` target, then initialize the existing project:

```bash
npm run convex:dev:setup
```

Set `.env.local`'s `NEXT_PUBLIC_CONVEX_URL` to that deployment's API URL and `CONVEX_SERVER_SECRET` to a generated secret of at least 32 characters. Configure the same secret in the selected Convex deployment:

```bash
npx convex env set CONVEX_SERVER_SECRET '<dev-secret>' --env-file .env.convex.dev
```

Replace the placeholder locally. Keep secrets out of committed files. Run `npm run convex:dev` in a dedicated terminal to watch, generate types and sync backend changes; run `npm run dev` separately for Next.js.

## Environment boundaries

Convex actions cannot read Next.js `.env.local`. Configure these in the target Convex deployment as needed:

- `CONVEX_SERVER_SECRET`: matches the corresponding Next.js runtime.
- `ADMIN_PASSWORD_SECRET`: matches Next.js when admin login is enabled.
- `IMAGE_FETCH_ALLOWLIST`: optional additional remote-image hosts, read by the storage action.
- Nostr key, relays and image URL base: see [Nostr](../llm/context/NOSTR.md).

Pass `--env-file .env.convex.dev` or `--env-file .env.convex.prod` on environment commands. The project scripts `convex:env:list:dev` and `convex:env:list:prod` inspect the respective deployment's values; their output can contain secrets.

`CONVEX_DEPLOYMENT` selects the CLI target. `NEXT_PUBLIC_CONVEX_URL` selects the application's runtime API target. An HTTP Actions URL used for `/image/:storageId` is a separate setting; do not substitute it for the runtime API URL.

## Production

```bash
cp .env.convex.prod.example .env.convex.prod
```

Set the intended `prod:...` target and production Convex environment values. Review and deploy backend changes with:

```bash
npm run convex:deploy:prod:dry-run
npm run convex:deploy:prod
```

For the frontend release and matching runtime values, follow [Vercel deployment](../llm/workflow/VERCEL_WORKFLOWS.md).

## Maintenance and troubleshooting

[schema.ts](schema.ts) defines tables; [crons.ts](crons.ts) defines cleanup, stale reservation reconciliation, cost-event replay and Nostr scheduling. These jobs run in each deployment with that deployment's data/environment.

Unauthorized actions usually indicate mismatched server secrets. Wrong data usually indicates the wrong runtime URL or CLI target. Missing backend changes warrant checking the watcher and its typecheck/codegen output.
