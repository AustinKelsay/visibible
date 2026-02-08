# visibible

Explore Scripture with AI-powered insights and imagery

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

Set up two Convex deployments before release:

1. A **dev deployment** for local development and testing
2. A **prod deployment** for Vercel production

Use separate local files to target deployments from the Convex CLI:

```bash
cp .env.convex.dev.example .env.convex.dev
cp .env.convex.prod.example .env.convex.prod
```

Then fill in `CONVEX_DEPLOYMENT` in each file:

- `.env.convex.dev` -> `dev:...`
- `.env.convex.prod` -> `prod:...`

For local app development, set `.env.local` to the **dev** deployment values:

- `CONVEX_DEPLOYMENT=dev:...`
- `NEXT_PUBLIC_CONVEX_URL=https://api.dev.visibible.com`
- `CONVEX_SERVER_SECRET=<dev secret>`
- `NEXT_PUBLIC_APP_URL=https://dev.visibible.com`
- `OPENROUTER_REFERRER=https://dev.visibible.com`

Use these commands:

```bash
# One-time Convex project/dev setup
npm run convex:dev:setup

# Daily Convex development watcher (functions + schema sync)
npm run convex:dev

# Deploy Convex backend to production
npm run convex:deploy:prod
```

For more details on Convex functions and CLI commands, see [`convex/README.md`](convex/README.md).

### Vercel Setup

Use Vercel environments with this mapping:

- `Development` -> local workflow, Convex dev
- `Preview` -> PR/branch deployments, Convex dev
- `Production` -> live deployment, Convex prod

Use these templates when creating Vercel env vars:

- `.env.vercel.preview.example`
- `.env.vercel.prod.example`

Domain mapping:

- Preview frontend: `dev.visibible.com`
- Preview Convex API: `api.dev.visibible.com`
- Preview Convex HTTP Actions (optional): `actions.dev.visibible.com`
- Production frontend: `visibible.com`
- Production Convex API: `api.visibible.com`
- Production Convex HTTP Actions (optional): `actions.visibible.com`

Helpful commands:

```bash
# Link this repo to a Vercel project
npm run vercel:link

# Pull current Vercel env vars by environment
npm run vercel:env:pull:preview
npm run vercel:env:pull:production
```

Full runbook: [`llm/workflow/VERCEL_WORKFLOWS.md`](llm/workflow/VERCEL_WORKFLOWS.md)

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
