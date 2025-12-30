# visibible

Prototype. Vibe with the bible.

## Run

```bash
npm install
npm run dev
```

## Env

Copy `.env.example` to `.env.local`.

### Convex Setup

To enable Convex features (image storage), create a deployment in the [Convex Dashboard](https://dashboard.convex.dev/):

1. Create a new deployment or use an existing one
2. Copy the **deployment name** (format: `prod:your-deployment-name`) to `CONVEX_DEPLOYMENT`
3. Copy the **public URL** (format: `https://your-deployment-name.convex.cloud`) to `NEXT_PUBLIC_CONVEX_URL`

Both values are available in your Convex dashboard under Deployment Settings.

4. **Sync schema and functions**: During local development, run `npx convex dev` to sync your schema and functions to the deployment. This watches for changes and automatically pushes updates.
5. **Deploy to production**: When ready for production, run `npx convex deploy` to push your schema and functions to the deployment.

For more details on Convex functions and CLI commands, see [`convex/README.md`](convex/README.md).

## Vercel AI SDK

Chat API lives in `src/app/api/chat/route.ts`.

- OpenAI: set `OPENAI_API_KEY`
- Anthropic: set `ANTHROPIC_API_KEY` and switch to `anthropic(...)`
- OpenRouter: set `OPENROUTER_API_KEY` to switch automatically (optional `OPENROUTER_REFERRER`, `OPENROUTER_TITLE`)

## Admin Access

Admin login functionality requires:

- `ADMIN_PASSWORD`: The admin password (required for admin login to work)
- `ADMIN_PASSWORD_SECRET`: Secret key used for HMAC password verification (required - app will fail to start if not set)
