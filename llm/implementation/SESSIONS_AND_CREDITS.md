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
│   │  /api/session   │    │  /api/invoice   │    │/api/invoice/:id │    │/api/generate-   │ │
│   │                 │    │                 │    │                 │    │    image        │ │
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

1. **Session creation**: `/api/session` issues an anonymous JWT cookie.
2. **Free tier**: browse and view images; no generation when credits are zero.
3. **Credit purchase**: `/api/invoice` creates a Lightning invoice (300 credits for $3).
4. **Payment confirmation**: `/api/invoice/:id` checks LND and grants credits when settled.
5. **Generation**: `/api/generate-image` pre-checks credits, generates, then charges on success.

---

## Feature Gates & Configuration

- `NEXT_PUBLIC_CONVEX_URL`: required to enable sessions/credits/persistence.
- `SESSION_SECRET`: required for JWT signing and IP hashing.
- `ENABLE_IMAGE_GENERATION`: must be `true` to allow generation.
- `OPENROUTER_API_KEY`: required for all image generation.
- `LND_HOST`, `LND_INVOICE_MACAROON`: required for Lightning invoices and settlement checks.
- `ADMIN_PASSWORD`, `ADMIN_PASSWORD_SECRET`: required for admin login.

If Convex is not configured, session and payment routes return free defaults or 503s, and generation runs without credit enforcement.

---

## Convex Data Model

### `sessions`
- `sid`, `tier`, `credits`, `createdAt`, `lastSeenAt`, `lastIpHash`, `flags`.
- `flags` is reserved for future use (e.g., feature flags, beta access).
- Index: `by_sid`.

### `invoices`
- `invoiceId`, `sid`, `amountUsd`, `amountSats`, `bolt11`, `status`, `createdAt`, `paidAt`, `expiresAt`, `paymentHash`.
- Indexes: `by_sid`, `by_invoiceId`, `by_paymentHash`.

### `creditLedger`
- `sid`, `delta`, `reason`, `modelId`, `costUsd`, `generationId`, `createdAt`.
- Indexes: `by_sid` (sid + createdAt), `by_generationId` (generationId + sid).
- Reasons: `purchase`, `generation`, `refund`, `reservation`. Reservations are created when credits are pre-reserved before generation; refunds restore credits if generation fails or convert reservations to final charges.
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
| `createSession` | Mutation | `sid, ipHash?` | `{ sid, tier: "free", credits: 0 }` |
| `updateLastSeen` | Mutation | `sid` | `void` |
| `addCredits` | Mutation | `sid, amount, reason, invoiceId?` | `{ newBalance }` |
| `reserveCredits` | Mutation | `sid, amount, modelId, generationId, costUsd?` | `{ success, newBalance, alreadyReserved? }` or `{ success: false, error, required, available }` |
| `releaseReservation` | Mutation | `sid, generationId` | `{ success, newBalance, alreadyReleased? }` |
| `deductCredits` | Mutation | `sid, amount, modelId, generationId, costUsd?` | `{ success, newBalance, converted?, alreadyCharged? }` or `{ success: false, error, required, available }` |
| `getCreditHistory` | Query | `sid, limit?` | `Array<{ delta, reason, modelId, generationId, createdAt }>` |
| `upgradeToAdmin` | Mutation | `sid` | `{ success: true }` |

**Note:** `addCredits` accepts `invoiceId` but it is not currently stored in the ledger (reserved for future use).

### Reservation System

The credit system uses a two-stage reservation pattern to prevent race conditions:

1. **`reserveCredits`**: Atomically reserves credits BEFORE image generation. Deducts from balance and creates a `reservation` ledger entry. If credits already reserved/charged for the `generationId`, returns `{ alreadyReserved: true }`.

2. **`releaseReservation`**: Restores credits if generation fails. Creates a `refund` entry to cancel the reservation. Called when OpenRouter returns an error.

3. **`deductCredits`**: Converts a reservation to a final charge. Uses double-entry bookkeeping:
   - If reservation exists but no generation entry: creates `generation` entry + compensating `refund` entry (net effect: reservation → generation)
   - If no reservation: performs direct debit (backward compatibility)
   - Returns `{ converted: true }` when converting from reservation

**Idempotency:** All three mutations use net-delta checking:
1. Query ALL ledger entries for `generationId` + `sid`
2. Calculate `netDelta` summing `generation`, `refund`, AND `reservation` entries
3. If `netDelta < 0` (already reserved/charged), return success without duplicate action

This prevents double-charging from retries and allows atomic credit reservation.

**Tier Transitions:** `resolveTier()` centralizes tier updates for all credit mutations. `admin` is sticky and never downgraded; non-admins are `paid` when credits > 0, otherwise `free`.

### `convex/invoices.ts`

| Function | Type | Arguments | Returns |
|----------|------|-----------|---------|
| `createInvoice` | Mutation | `sid, amountSats, bolt11, paymentHash` | `{ invoiceId, bolt11, amountUsd, amountSats, expiresAt, credits }` |
| `getInvoice` | Query | `invoiceId` | Invoice details (includes `sid`) or `null` |
| `getSessionInvoices` | Query | `sid` | `Array<{ invoiceId, status, amountUsd, createdAt, paidAt? }>` |
| `confirmPayment` | Mutation | `invoiceId, paymentHash?` | `{ success, alreadyPaid?, newBalance, creditsAdded }` (preserves `admin` tier; `paymentHash` only updated if provided) |
| `expireInvoice` | Mutation | `invoiceId` | `{ success: true }` |

### `convex/modelStats.ts`

| Function | Type | Arguments | Returns |
|----------|------|-----------|---------|
| `getModelStats` | Query | `modelId` | `{ modelId, count, avgMs, etaSeconds }` |
| `getAllModelStats` | Query | none | `Array<{ modelId, count, avgMs, etaSeconds }>` |
| `recordGeneration` | Mutation | `modelId, durationMs` | `{ modelId, count, avgMs, etaSeconds }` |

---

## API Routes

### `GET /api/session`
Returns session state; if no cookie or Convex disabled, returns free tier with `sid: null`.

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

### `GET /api/generate-image`
Credit flow (reservation pattern):
1. Verify session cookie via `getSessionFromCookies()`.
2. Resolve model pricing and compute `creditsCost` (default 20 if unpriced).
3. **Reserve credits atomically** via `reserveCredits()` - deducts from balance immediately.
4. If reservation fails (insufficient credits), return 402.
5. Generate image via OpenRouter.
6. **Convert reservation to charge** via `deductCredits()` - uses double-entry bookkeeping.
7. If generation fails, **release reservation** via `releaseReservation()` to restore credits.
8. If post-charge fails, return 402 and discard the generated image.

On success, the response includes:
- `imageUrl`, `model`, `provider`, `providerRequestId`
- `generationId`, `prompt`, `promptVersion`, `promptInputs`
- `reference`, `verseText`, `chapterTheme`, `generationNumber`
- `creditsCost`, `costUsd`, `durationMs`, `aspectRatio`
- `credits` (optional, updated balance after charge)

### `GET /api/image-models`
Returns OpenRouter image models with `creditsCost` and `etaSeconds`, plus a `creditRange` for UI.

---

## Credit Pricing

```ts
const CREDIT_USD = 0.01; // 1 credit = $0.01
const PREMIUM_MULTIPLIER = 1.25; // 25% markup
```

```ts
function computeCreditsCost(pricingImage?: string): number | null {
  if (!pricingImage) return null;
  const baseUsd = parseFloat(pricingImage);
  if (isNaN(baseUsd) || baseUsd <= 0) return null;
  return Math.max(1, Math.ceil((baseUsd * PREMIUM_MULTIPLIER) / CREDIT_USD));
}
```

Unpriced models default to 20 credits (~$0.20).

---

## Client Integration

- `SessionProvider` (`src/context/session-context.tsx`): boots the session, exposes `buyCredits`, `openOnboarding`, and updates credits.
- `CreditsBadge`: shows Get Credits / credit balance / Admin.
- `OnboardingModal`: shows alpha notice, buy option, and admin login.
- `BuyCreditsModal`: creates invoice, displays QR + BOLT11, polls status until paid or expired.
- `HeroImage`: gates generation based on credits, sends generation requests, and saves metadata to Convex via `saveImage` action.

---

## Environment Variables

```env
# Sessions (32 bytes → 44 base64 characters)
SESSION_SECRET=your-session-secret-here

# Admin
ADMIN_PASSWORD=your-secret-admin-password
ADMIN_PASSWORD_SECRET=your-hmac-secret

# Convex
CONVEX_DEPLOYMENT=prod:your-deployment
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud

# Image generation
ENABLE_IMAGE_GENERATION=true
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_REFERRER=http://localhost:3000
OPENROUTER_TITLE=visibible

# Lightning
LND_HOST=your-node.m.voltageapp.io
LND_INVOICE_MACAROON=your-invoice-macaroon-hex
```

Generate secrets:

```bash
openssl rand -base64 32
# Optional: use a separate random value or a hash of the admin password as the HMAC secret.
node -e "console.log(require('crypto').createHash('sha256').update('your-secret-admin-password').digest('hex'))"
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
