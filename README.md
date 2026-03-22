# visibible

Visualize the Bible, verse by verse.

No accounts, no subscriptions. Everything runs through an anonymous browser session.

[Live app](https://www.visibible.com) · [About](https://www.visibible.com/about) · [API docs](https://www.visibible.com/api-docs)

## Run Locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

For Convex (image persistence and the public library):

```bash
cp .env.convex.dev.example .env.convex.dev
npm run convex:dev:setup
npm run convex:dev
```

See `.env.example` for the full list of variables. Hosted environment templates live at `.env.vercel.preview.example` and `.env.vercel.prod.example`.

## Verify

```bash
npm run lint
npm run typecheck
npm test
```

## Public API

Saved verse images become part of a public read-only library. Browse and reuse what's already been generated.

Base path: `/api/public/images` · [Live docs](https://www.visibible.com/api-docs)

## Deployment

Runs on Vercel with Convex. Setup details in [convex/README.md](convex/README.md).
