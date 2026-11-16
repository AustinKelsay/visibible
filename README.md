# Visibible

Read the Bible like a picture book: each verse is a spread, its painting filling the window with the verse on a glass page beside it. Turn the page with the dock, the arrow keys or a swipe; open the chapter as a wall of pictures from the passage name, choose how the book looks with Aa, and ask about the verse at the foot of its page. Reading is free; painting, videos and questions use credits associated with an anonymous browser session. The [reader guide](llm/context/NAVIGATION.md) describes every part of the spread.

## Local setup

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local` before starting. Session validation requires `SESSION_SECRET` and `IP_HASH_SECRET` (at least 32 characters each). For sessions, credits, AI requests, and the shared image library, configure a development Convex deployment using [Convex setup](convex/README.md).

AI requests also require `OPENROUTER_API_KEY`. Image generation is disabled in the template; set `ENABLE_IMAGE_GENERATION=true` to enable it. Credit purchases require `LNURL_PAY_URL`; optional admin access provides a way to exercise AI features without purchasing credits. See [payments](llm/context/PAYMENTS.md) for configuration boundaries.

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
npm run works:import   # writes works/*/work.json, which several tests read
npm test -- --run
```

`npm test` without `--run` can enter watch mode. Commands are defined in `package.json`.

## Documentation

- [Reader screenshots](llm/workflow/READER_CAPTURE.md): `npm run capture:reader` captures every state of the reader at desktop and phone size, in both appearances, from a local app.
- [Documentation index](llm/README.md): feature behavior and source entry points.
- [Vercel deployment](llm/workflow/VERCEL_WORKFLOWS.md): environment mapping and release commands.
- Public read-only image API: `/api/public/images`; the app serves its API reference at `/api-docs`.

## Video

Choose **Make a video** in a picture's menu to generate a short scene with Hailuo 3 Max. Jobs continue on the server, use existing credits, and save completed videos to public verse history; a verse with a video shows a play mark on its picture and its Contents tile. See [Video generation](llm/context/VIDEO-GENERATION.md) for configuration, verification, and rollout.
