# Visibible

Read and visualize the Bible verse by verse, browse shared images, and discuss Scripture with AI chat. Browsing is free; AI requests use credits associated with an anonymous browser session.

## Local setup

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local` before starting. Session validation requires `SESSION_SECRET` and `IP_HASH_SECRET` (at least 32 characters each). For sessions, credits, AI requests, and the shared image library, configure a development Convex deployment using [Convex setup](convex/README.md).

AI requests also require `OPENROUTER_API_KEY`. Image generation is disabled in the template; set `ENABLE_IMAGE_GENERATION=true` to enable it. Credit purchases require LND configuration; optional admin access provides a way to exercise AI features without purchasing credits. See [payments](llm/context/PAYMENTS.md) for configuration boundaries.

```bash
npm run dev
# In another terminal, with Convex configured:
npm run convex:dev
```

`.env.example` lists runtime settings. Hosted environment templates are `.env.vercel.preview.example` and `.env.vercel.prod.example`. Template domains are examples; use the URLs of your configured deployments.

## Verification

```bash
npm run lint
npm run typecheck
npm test -- --run
```

`npm test` without `--run` can enter watch mode. Commands are defined in `package.json`.

## Documentation

- [Documentation index](llm/README.md): feature behavior and source entry points.
- [Vercel deployment](llm/workflow/VERCEL_WORKFLOWS.md): environment mapping and release commands.
- Public read-only image API: `/api/public/images`; the app serves its API reference at `/api-docs`.
