# Sessions & Credits Implementation Guide

This document describes the anonymous session, credit ledger, and Lightning payment flows that gate image generation.

---

## Architecture Overview

```
                                    ┌─────────────────────┐
                                    │   Browser Cookie    │
                                    │  (visibible_session) │
                                    │    JWT with sid     │
                                    └──────────┬──────────┘
                                               │
┌──────────────────────────────────────────────┼──────────────────────────────────────────────┐
│                                   Next.js API Routes                                        │
│                                              │                                              │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│   │  /api/session   │    │  /api/invoice   │    │/api/invoice/:id │    │/api/generate-image│ │
│   │                 │    │                 │    │                 │    │                  │ │
│   │ GET: get state  │    │ POST: create    │    │ GET: status     │    │ pre-check       │ │
│   │ POST: create    │    │      invoice    │    │ POST: confirm   │    │ post-charge     │ │
│   └────────┬────────┘    └────────┬────────┘    └────────┬────────┘    └────────┬────────┘ │
│            │                      │                      │                      │          │
└────────────┼──────────────────────┼──────────────────────┼──────────────────────┼──────────┘
             │                      │                      │                      │
             └──────────────────────┴──────────────────────┴──────────────────────┘
                                               │
                                    ┌──────────┴──────────┐
                                    │       Convex        │
                                    │                     │
                                    │  sessions           │
                                    │  invoices           │
                                    │  creditLedger       │
                                    │  modelStats         │
                                    └─────────────────────┘
```

### Flow Summary

1. **Session creation**: `/api/session` issues an anonymous JWT cookie with "paid" tier and 0 credits.
2. **Browse without credits**: Users can view content but cannot generate images when credits are zero.
3. **Credit purchase**: `/api/invoice` creates a Lightning invoice for a supported bundle (`$1 = 100 credits`, `$3 = 300 credits`).
4. **Payment confirmation**: `/api/invoice/:id` checks LND and grants credits when settled.
5. **Generation**: `/api/generate-image` pre-checks credits, generates, then charges on success.

---

## Feature Gates & Configuration

- `NEXT_PUBLIC_CONVEX_URL`: required to enable sessions/credits/persistence.
- `SESSION_SECRET`: required for JWT signing and IP hashing.
- `TRUST_PROXY_PLATFORM=vercel` or `TRUSTED_PROXY_IPS`: required to trust proxy headers for client IPs (rate limiting) in production. See `llm/workflow/PROXY_CONFIGURATION.md`.
- `ENABLE_IMAGE_GENERATION`: must be `true` to allow generation.
- `OPENROUTER_API_KEY`: required for all image generation.
- `LND_HOST`, `LND_INVOICE_MACAROON`: required for Lightning invoices and settlement checks.
- `ADMIN_PASSWORD`, `ADMIN_PASSWORD_SECRET`: required for admin login.

If Convex is not configured, session and payment routes return free defaults or 503s, and generation runs without credit enforcement.

**Convex Configuration Validation:** Both `NEXT_PUBLIC_CONVEX_URL` and `CONVEX_SERVER_SECRET` must be set together. API routes validate both early in the request:
- `getConvexClient()` returns `null` if URL missing → 503 response
- `getConvexServerSecret()` throws if secret missing → caught and returns 503 response
- This ensures consistent 503 behavior for any Convex misconfiguration rather than cryptic 500 errors.

---

## Convex Data Model

### `sessions`
- `sid`, `tier`, `credits`, `createdAt`, `lastSeenAt`, `lastIpHash`, `flags`.
- `dailySpendUsd`, `dailySpendLimitUsd`, `lastDayReset` (daily spending cap tracking).
- `flags` is reserved for future use (e.g., feature flags, beta access).
- Index: `by_sid`.

### `invoices`
- `invoiceId`, `sid`, `amountUsd`, `amountSats`, `bolt11`, `status`, `createdAt`, `paidAt`, `expiresAt`, `paymentHash`.
- Indexes: `by_sid`, `by_invoiceId`, `by_paymentHash`.

### `creditLedger`
- `sid`, `delta`, `reason`, `modelId`, `costUsd`, `generationId`, `createdAt`.
- Indexes: `by_sid` (sid + createdAt), `by_generationId` (generationId + sid).
- Reasons:
  - `purchase` - Credits added via Lightning payment
  - `generation` - Credits charged for successful generation
  - `refund` - Credits restored (failed generation or reservation conversion)
  - `reservation` - Credits pre-reserved before generation
  - `scene_planner_refund` - Partial refund when scene planner fails but image generation succeeds
- Note: `costUsd` is stored in the database but **not returned** by `getCreditHistory` for privacy/simplicity.

### `modelStats`
- `modelId`, `count`, `avgMs`, `p50Ms`, `updatedAt`.
- Note: `p50Ms` is in the schema but not currently populated; only `avgMs` (EMA) is used.

### `verseImages` (generation transparency)
- Stores `prompt`, `reference`, `verseText`, `chapterTheme`, `generationNumber`, `creditsCost`, `costUsd`, `durationMs`, `aspectRatio`, plus model and storage details.

---

## Convex Functions

### `convex/sessions.ts`

| Function | Type | Arguments | Returns |
|----------|------|-----------|---------|
| `getSession` | Query | `sid` | `{ sid, tier, credits, createdAt, lastSeenAt }` or `null` |
| `createSession` | Mutation | `sid, ipHash?, serverSecret` | `{ sid, tier: "paid", credits: 0 }` |
| `updateLastSeen` | Mutation | `sid, serverSecret` | `void` |
| `addCredits` | Action | `sid, amount, reason, invoiceId?, serverSecret` | `{ newBalance }` |
| `reserveCredits` | Action | `sid, amount, modelId, generationId, costUsd?, serverSecret` | `{ success, newBalance, alreadyReserved? }` or `{ success: false, error, required?, available? }` |
| `releaseReservation` | Action | `sid, generationId, serverSecret` | `{ success, newBalance, alreadyReleased? }` |
| `deductCredits` | Action | `sid, amount, modelId, generationId, costUsd?, actualAmount?, actualCostUsd?, serverSecret` | `{ success, newBalance, converted?, alreadyCharged?, refunded?, additionalCharged?, shortfall? }` or `{ success: false, error, required?, available? }` |
| `getCreditHistory` | Query | `sid, limit?` | `Array<{ delta, reason, modelId, generationId, createdAt }>` |
| `upgradeToAdmin` | Action | `sid, serverSecret` | `{ success: true }` |

**Note:** `addCredits` accepts `invoiceId` but it is not currently stored in the ledger (reserved for future use).

### Reservation System

The credit system uses a reservation settlement state machine per `generationId` to prevent race conditions and replay abuse:

1. **`reserveCredits`**: Atomically reserves credits BEFORE image generation. Deducts from balance and creates a `reservation` ledger entry.
   - If state is `reserved`, returns `{ alreadyReserved: true }`.
   - If state is `released` or `charged`, returns `{ success: false, error: "Generation already settled" }`.

2. **`releaseReservation`**: Restores credits if generation fails.
   - Only refunds from state `reserved`.
   - For `none`, `released`, or `charged`, returns `{ alreadyReleased: true }` with no balance change.

3. **`deductCredits`**: Converts a reservation to a final charge. Uses double-entry bookkeeping:
   - If state is `reserved`: creates `generation` entry + compensating `refund` entry (net effect: reservation → generation)
   - If state is `charged`: idempotent no-op (`alreadyCharged: true`)
   - If state is `released`: no-op (`alreadyCharged: true`) so released generations cannot be re-charged
   - If no reservation: performs direct debit (backward compatibility)
   - Returns `{ converted: true }` when converting from reservation
   - **Actual-usage charging**: Accepts optional `actualAmount` and `actualCostUsd` params to charge the real cost (from OpenRouter `usage` response) instead of the reserved amount:
     - If `actualAmount < reserved`: refunds the excess, returns `{ refunded: N }`
     - If `actualAmount > reserved`: charges additional, returns `{ additionalCharged: N }`
     - This enables the "reserve conservatively → charge actual → refund excess" pattern
   - **Daily spend adjustment**: When actual cost differs from reserved cost, `dailySpendUsd` is adjusted accordingly:
     - If `actualCostUsd < reservationCostUsd`: reduces `dailySpendUsd` by the difference
     - If `actualCostUsd > reservationCostUsd`: increases `dailySpendUsd` by the difference
     - This prevents the inflated 35x reservation estimate from prematurely blocking users at the daily spend limit

**Idempotency and one-way settlement:** All three actions summarize ledger state for `generationId` + `sid`:
1. Query all ledger entries for that key.
2. Classify state as:
   - `none`: no reservation/generation/refund
   - `reserved`: reservation exists, no generation
   - `released`: refund exists, no generation
   - `charged`: generation exists (refund may also exist as conversion entry)
3. Gate reserve/release/deduct behavior based on state to prevent duplicate refunds and post-release charging.

This prevents credit inflation from duplicate release calls and prevents replay charging after a released generation.

### Stale Reservation Reconciliation (PR-4)

To handle crashed/aborted requests that never settle:

- `internal.sessions.reconcileStaleReservations` scans stale `reservation` entries using `creditLedger.by_reason_createdAt`.
- Cron runs every 5 minutes via `convex/crons.ts`.
- Default reconciliation target is reservations older than 30 minutes (`maxAgeMs`), up to 50 candidates per run (`limit`).
- Only generations currently in settlement state `reserved` are released; already `released`/`charged` generations are skipped.
- This makes reruns safe and idempotent while preventing stranded reserved credits.

**Tier Transitions:** `resolveTier()` centralizes tier updates for all credit mutations. `admin` is sticky and never downgraded; non-admins are always `paid` tier.

**Daily Spending Limit:** `reserveCreditsInternal` checks `checkDailySpendLimit()` before allowing credit reservation. The default limit is defined by the constant `DEFAULT_DAILY_SPEND_LIMIT_USD = 5.0` in `convex/sessions.ts` (line 7). This can be overridden per-session via the `dailySpendLimitUsd` field in the sessions table. The limit is checked at line 72 of `checkDailySpendLimit()` using `session.dailySpendLimitUsd ?? DEFAULT_DAILY_SPEND_LIMIT_USD`. To change the default limit, modify the `DEFAULT_DAILY_SPEND_LIMIT_USD` constant in `convex/sessions.ts`. To override for a specific session, update the session's `dailySpendLimitUsd` field in the Convex database. If daily spend exceeds the limit, the request is rejected with `"Daily spending limit exceeded"`. The limit resets at UTC midnight. Admin sessions bypass the daily spending limit entirely.

### Partial Refunds with Retry

For image generation with scene planner, credits are reserved for both the image model and scene planner upfront. If the scene planner fails but image generation succeeds, a partial refund is issued for the scene planner portion.

**Retry logic** (implemented in `/api/generate-image`):
```typescript
// serverSecret is validated early in request handler
const maxRetries = 3;
let refundSuccess = false;
for (let attempt = 1; attempt <= maxRetries && !refundSuccess; attempt++) {
  try {
    await convex.action(api.sessions.addCredits, {
      sid,
      amount: scenePlannerCreditsCost,
      reason: "scene_planner_refund",
      serverSecret,
    });
    refundSuccess = true;
  } catch (refundError) {
    if (attempt < maxRetries) {
      // Exponential backoff: 100ms, 200ms, 400ms
      await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt - 1)));
    } else {
      console.error(`Failed to refund after ${maxRetries} attempts:`, refundError);
      // Continue with request - user over-charged but generation proceeds
    }
  }
}
```

**Design rationale:**
- Transient Convex/network issues are handled automatically
- Max added latency: ~700ms (only if all retries fail)
- Graceful degradation: request succeeds even if refund fails
- Ledger entry with reason `"scene_planner_refund"` for audit trail

### `convex/invoices.ts`

| Function | Type | Arguments | Returns |
|----------|------|-----------|---------|
| `createInvoice` | Mutation | `sid, amountSats, bolt11, paymentHash, serverSecret` | `{ invoiceId, bolt11, amountUsd, amountSats, expiresAt, credits }` |
| `getInvoice` | Query | `invoiceId` | Invoice details (includes `sid`) or `null` |
| `getSessionInvoices` | Query | `sid` | `Array<{ invoiceId, status, amountUsd, createdAt, paidAt? }>` |
| `confirmPayment` | Action | `invoiceId, paymentHash?, serverSecret` | `{ success, alreadyPaid?, newBalance, creditsAdded }` (preserves `admin` tier; `paymentHash` only updated if provided) |
| `expireInvoice` | Mutation | `invoiceId, serverSecret` | `{ success: true }` |

### `convex/modelStats.ts`

| Function | Type | Arguments | Returns |
|----------|------|-----------|---------|
| `getModelStats` | Query | `modelId` | `{ modelId, count, avgMs, etaSeconds }` |
| `getAllModelStats` | Query | none | `Array<{ modelId, count, avgMs, etaSeconds }>` |
| `recordGeneration` | Mutation | `modelId, durationMs, serverSecret` | `{ modelId, count, avgMs, etaSeconds }` |

---

## Rate Limiting

All protected API routes implement rate limiting to prevent abuse:

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/chat` | 20 requests | 1 minute |
| `/api/generate-image` | 5 requests | 1 minute |
| `/api/invoice` | 10 requests | 1 minute |
| `/api/invoice/:id` (GET/POST) | 30 requests | 1 minute |
| `/api/session` | 10 requests | 1 minute |
| `/api/admin-login` | 5 attempts | 15 minutes + 1 hour lockout |

### Rate Limit Identifier

Endpoints use one of two identifier strategies:

**IP+Session (for session-bound expensive/sensitive flows):**
```typescript
const rateLimitIdentifier = `${ipHash}:${sid}`;
```
Used by: `/api/chat`, `/api/generate-image`, `/api/invoice/:id` (status/confirm polling)

**IP-Only (for infrastructure):**
```typescript
const rateLimitIdentifier = await hashIp(clientIp);
```
Used by: `/api/session`, `/api/invoice`

**Why the difference?**
- **Session-bound expensive/sensitive endpoints** use IP+session to allow fair per-session usage while preventing abuse
- **Invoice creation** uses IP-only to prevent multi-session bypass (attacker creating many sessions to flood LND with invoices)
- **Session endpoint** uses IP-only to prevent session creation spam
- **Privacy**: IP addresses are hashed with SESSION_SECRET before storage

### Implementation

Rate limiting is handled by `convex/rateLimit.ts`:
- Sliding window algorithm
- Admin login includes additional brute-force protection with IP-based lockout
- Returns `Retry-After` header for 429 responses
- Sensitive rate-limit mutations are server-authenticated (`serverSecret` required):
  - `checkRateLimit`
  - `recordFailedAdminLogin`
  - `clearAdminLoginAttempts`

### Rate Limit Status API

**Route:** `GET /api/rate-limit-status`

Clients can check rate limit status before making expensive requests to avoid wasted API calls.

**Note:** Only cost-incurring endpoints (`chat`, `generate-image`) are exposed. Other rate-limited endpoints (`session`, `invoice`, `admin-login`, `feedback`) are intentionally excluded for security/simplicity.

**Response:**
```typescript
interface RateLimitStatusResponse {
  endpoints: {
    chat: {
      remaining: number;    // Requests remaining in window
      limit: number;        // Max requests per window
      resetAt: number;      // Unix timestamp when window resets
      windowMs: number;     // Window duration in ms
    };
    "generate-image": {
      remaining: number;
      limit: number;
      resetAt: number;
      windowMs: number;
    };
  };
  dailySpend: {
    spent: number;          // USD spent today
    limit: number;          // Daily limit (default $5)
    remaining: number;      // Budget remaining
    resetsAt: number;       // UTC midnight timestamp
  } | null;                 // null for admins
}
```

**Usage:** Clients can proactively check limits and show warnings or disable buttons when limits are approaching.

---

## API Routes

### `GET /api/session`
Returns session state; if no cookie or Convex disabled, returns `{ sid: null, tier: "paid", credits: 0 }`.

### `POST /api/session`
Creates a new anonymous session (Convex required) and sets the JWT cookie.

### `POST /api/admin-login`
Validates `ADMIN_PASSWORD` using HMAC with `ADMIN_PASSWORD_SECRET` and upgrades the session to `admin`.

**Security:** Uses `crypto.timingSafeEqual()` to compare password digests, preventing timing attacks.

### `POST /api/invoice`
Creates a Lightning invoice and stores it in Convex. Requires a valid session and LND configuration.

### `GET /api/invoice/:id`
Requires session ownership. If pending, checks LND settlement and may confirm/expire the invoice. Returns invoice status and BOLT11 string.

### `POST /api/invoice/:id`
Requires session ownership. Verifies LND settlement before confirming payment and granting credits. Returns 402 if not settled.

### `POST /api/generate-image`
Credit flow (reservation pattern):
1. Enforce strict origin + CSRF validation for this state-changing route.
2. Verify session and IP binding via `validateSessionWithIp()`.
3. Parse JSON request body (model/context/options).
4. `GET /api/generate-image` returns `405 Method Not Allowed` with `Allow: POST`.
5. Fetch model from `fetchImageModels()` and compute `creditsCost` via `computeCreditsCost()`.
6. **Reject unpriced models** - if `creditsCost` is null, return 400 "Model pricing unavailable".
7. **Reserve credits atomically** via `reserveCredits()` - deducts from balance immediately.
8. If reservation fails (insufficient credits or daily limit exceeded), return 402.
9. Generate image via OpenRouter.
10. **Convert reservation to charge** via `deductCredits()` - uses double-entry bookkeeping.
11. If generation fails, **release reservation** via `releaseReservation()` to restore credits.
12. If post-charge fails, return 402 and discard the generated image.
13. Persist generated image server-side via `api.verseImages.saveImage` using `CONVEX_SERVER_SECRET`; response includes `savedImageId` when persistence succeeds.

On success, the response includes:
- `imageUrl`, `model`, `provider`, `providerRequestId`
- `generationId`, `prompt`, `promptVersion`, `promptInputs`
- `reference`, `verseText`, `chapterTheme`, `generationNumber`
- `creditsCost`, `costUsd`, `durationMs`, `aspectRatio`
- `credits` (optional, updated balance after charge)
- Cost tracking fields:
  - `estimatedCreditsCost` - Pre-generation estimate (API pricing)
  - `usedActualCost` - Boolean: OpenRouter returned valid usage data
  - `usedFallbackEstimate` - Boolean: Fallback to API estimate was used
  - `openRouterUsageUsd` - Raw USD cost from OpenRouter (null if unavailable)

### `GET /api/image-models`
Returns OpenRouter image models with `creditsCost` and `etaSeconds`, plus a `creditRange` for UI.

---

## Credit Pricing

```ts
const CREDIT_USD = 0.01; // 1 credit = $0.01
const PREMIUM_MULTIPLIER = 1.25; // 25% markup
const CONSERVATIVE_ESTIMATE_MULTIPLIER = 35; // Accounts for API pricing discrepancy
```

### Image Generation

OpenRouter's models API `pricing.image` field is often inaccurate for multimodal models (e.g., Gemini). Actual billing is based on image completion tokens at a much higher rate than listed.

**Base cost calculation (for reference only):**
```ts
function computeCreditsCost(pricingImage?: string): number | null {
  if (!pricingImage) return null;
  const baseUsd = parseFloat(pricingImage);
  if (isNaN(baseUsd) || baseUsd <= 0) return null;
  return Math.max(1, Math.ceil((baseUsd * PREMIUM_MULTIPLIER) / CREDIT_USD));
}
```

**Conservative estimate (for reservations):**
```ts
function computeConservativeEstimate(pricingImage?: string): number | null {
  const baseCost = computeCreditsCost(pricingImage);
  if (baseCost === null) return null; // Unpriced models rejected
  return Math.ceil(baseCost * CONSERVATIVE_ESTIMATE_MULTIPLIER);
}
```

**Actual usage calculation (post-generation):**
```ts
function computeCreditsFromActualUsage(
  actualUsageUsd: number | null,
  fallbackCredits: number
): { credits: number; usedActual: boolean } {
  if (actualUsageUsd !== null && actualUsageUsd > 0) {
    const withPremium = actualUsageUsd * PREMIUM_MULTIPLIER;
    return { credits: Math.max(1, Math.ceil(withPremium / CREDIT_USD)), usedActual: true };
  }
  return { credits: fallbackCredits, usedActual: false };
}
```

**Flow:**
1. Reserve using `computeConservativeEstimate()` (~35x API price) — adds inflated `costUsd` to `dailySpendUsd`
2. Generate image
3. Extract actual cost from OpenRouter response (checks `usage.cost`, `usage.total_cost`, `data.cost`, `data.total_cost`)
4. Charge actual via `deductCredits(actualAmount=..., actualCostUsd=...)`
5. Excess credits refunded + `dailySpendUsd` adjusted to reflect actual cost (not inflated estimate)

**Fallback behavior:** If OpenRouter doesn't return cost in any known location:
- The **API-based estimate** (`imageCreditsCost`) is used, NOT the conservative 35x reservation
- This ensures users aren't overcharged when usage extraction fails
- Server logs: `[Image API] Using fallback estimate for model=X, gen=Y, fallbackCredits=Z, reservationCredits=W`
- Response includes `usedFallbackEstimate: true` for monitoring

**Response tracking fields:**
| Field | Type | Description |
|-------|------|-------------|
| `usedActualCost` | boolean | `true` if OpenRouter returned valid usage data |
| `usedFallbackEstimate` | boolean | `true` if fallback to API estimate was used |
| `openRouterUsageUsd` | number \| null | Raw USD cost from OpenRouter (null if not available) |
| `chargeShortfall` | object \| undefined | Present if actual exceeded reservation and user couldn't cover overage |

**Shortfall handling:** In the rare case where actual OpenRouter cost exceeds the 35x conservative estimate AND the user lacks credits to cover the overage:
- Only the reserved amount is charged (not the full actual)
- Ledger records `costUsd: reservationCostUsd` (matching the credits charged, not the higher actual cost)
- Response includes `chargeShortfall: { wantedCredits, chargedCredits, shortfall }`
- `creditsCost` and `costUsd` reflect what was actually charged (not what was wanted)
- Server logs: `[Image API] Shortfall: wanted=X credits, charged=Y credits, shortfall=Z`

**Models without pricing are rejected** - no fallback to default cost.

### Chat

Chat credits are calculated dynamically based on model's per-token pricing:

```ts
function computeChatCreditsCost(
  pricing: { prompt?: string; completion?: string },
  estimatedTokens: number = 2000  // 1000 prompt + 1000 completion
): number | null {
  // ... validates pricing exists
  // ... calculates: (tokens × price × PREMIUM_MULTIPLIER) / CREDIT_USD
  return Math.max(MIN_CHAT_CREDITS, Math.ceil(effectiveUsd / CREDIT_USD));
}
```

- Estimates ~2000 tokens per message
- Free models (`:free` suffix or $0 pricing) cost minimum 1 credit
- Actual token usage is logged for monitoring after stream completes
- **Models without pricing are rejected** with 400 error

---

## Client Integration

- `SessionProvider` (`src/context/session-context.tsx`): boots the session, exposes `buyCredits`, and updates credits.
- `CreditsBadge`: shows credit balance (clickable to buy) or Admin badge.
- `BuyCreditsModal`: includes integrated onboarding (welcome flow), creates invoice, displays QR + BOLT11, polls status until paid or expired. Also includes admin login option.
- `HeroImage`: gates generation based on credits and sends generation requests. Image persistence is handled server-side in `/api/generate-image`.

---

## Environment Variables

```env
# Sessions (32 bytes → 44 base64 characters)
SESSION_SECRET=your-session-secret-here

# Admin
ADMIN_PASSWORD=your-secret-admin-password
ADMIN_PASSWORD_SECRET=your-hmac-secret

# Convex runtime target (Next.js environment)
# Use dev URL in local/preview, prod URL in production
# Replace placeholder with your actual deployment URL or custom domain
# (e.g., https://api.dev.visibible.com for preview/dev, https://api.visibible.com for production)
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
CONVEX_SERVER_SECRET=your-convex-server-secret

# Image generation
ENABLE_IMAGE_GENERATION=true
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_REFERRER=http://localhost:3000
OPENROUTER_TITLE=visibible
# Optional strict host allowlist for server-side image fetch persistence
# IMAGE_FETCH_ALLOWLIST=openrouter.ai,*.openrouter.ai

# Lightning
LND_HOST=your-node.m.voltageapp.io
LND_INVOICE_MACAROON=your-invoice-macaroon-hex
```

Convex CLI deployment targeting (`CONVEX_DEPLOYMENT`) is managed with:

- `.env.convex.dev` for dev commands
- `.env.convex.prod` for production deploy commands

For canonical project-specific URL/domain mapping and env templates, see `README.md`
(`Convex Setup` and `Vercel Setup` sections).

See `llm/workflow/CONVEX_WORKFLOWS.md` for the full workflow.

Generate secrets:

```bash
openssl rand -base64 32
# Optional: use a separate random value or a hash of the admin password as the HMAC secret.
node -e "console.log(require('crypto').createHash('sha256').update('your-secret-admin-password').digest('hex'))"
```

### Dual-Environment Configuration

Some environment variables must be set in **both** Next.js (`.env.local`) and Convex:

| Variable | Next.js | Convex | Notes |
|----------|---------|--------|-------|
| `CONVEX_SERVER_SECRET` | ✅ | ✅ | Must match exactly for authenticated server actions |
| `ADMIN_PASSWORD_SECRET` | ✅ | ✅ | Must match exactly in both environments |

**Why?** The admin login flow works in two stages:
1. Next.js API route validates the password using HMAC with `ADMIN_PASSWORD_SECRET`
2. Convex action re-validates the secret server-side before upgrading the session

If the Convex environment doesn't have the secret, the action throws "Unauthorized".

**Set Convex env vars:**
```bash
npx convex env set ADMIN_PASSWORD_SECRET "your-value-here"
npx convex env list  # verify
```

---

## Known Limitations

- Refunds are not implemented.
- Lightning-only payments (no fiat or on-chain).
- No full account system yet.
- Admin access requires shared secret credentials.

---

## Testing Notes

- Invoice confirmation requires LND settlement. Without a real payment, invoices remain `pending`.
- The credit system is active only when Convex is configured.
- Use `/api/session` and `/api/invoice` to validate the flow end-to-end.
