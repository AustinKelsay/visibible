# visibible

Prototype. Vibe with the bible.

## Run

```bash
npm install
npm run dev
```

## Env

Copy `.env.example` to `.env.local`.

### Proxy Trust (Vercel)

For accurate client IPs (rate limiting), configure trusted proxies in production:

- `TRUST_PROXY_PLATFORM=vercel` (recommended on Vercel; only active when `VERCEL=1` is set)
- Or set `TRUSTED_PROXY_IPS` to a comma/space-separated list of IPs/CIDRs

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

## Credit System

Users purchase credits via Lightning payments to access AI features.

### Pricing

- **Chat**: Dynamic pricing based on model cost (~1-20 credits per message depending on model)
- **Image generation**: Dynamic pricing based on model cost (~10-50 credits per image)
- Credits are calculated with a 25% markup over OpenRouter's base pricing
- 1 credit = $0.01 USD

### Spending Limits

To prevent API cost abuse, each session has a **$5/day spending limit**:
- Resets daily at midnight UTC
- Admin users bypass this limit
- If exceeded, requests are rejected until the next day

### Model Validation

Only models with valid OpenRouter pricing can be used. This prevents:
- Arbitrary expensive model selection
- Cost attacks using unpriced models

## Admin Access

Admin login functionality requires:

- `ADMIN_PASSWORD`: The admin password (required for admin login to work)
- `ADMIN_PASSWORD_SECRET`: Secret key used for HMAC password verification (required - app will fail to start if not set)
