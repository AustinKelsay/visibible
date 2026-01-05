# Sessions & Credits Context

High-level view of the session and credit system for AI features (chat and image generation). This is user-facing behavior and product intent, not implementation detail.

## Summary

- Sessions are anonymous and tracked via a signed cookie.
- All users start as "paid" tier (no free tier) but with 0 credits.
- Users buy credits via Lightning to unlock AI features (chat and image generation).
- Admin sessions bypass all credit and spending checks.
- Payments use Lightning invoices, payable via Lightning wallets or CashApp (fixed $3 bundle = 300 credits).

## User Tiers

- Paid: browse content, use AI features while credits >= model cost. Default tier.
- Admin: unlimited access (no credit or spending checks), but all usage is logged for audit.
- Admin tier is sticky and is never downgraded by credit balance changes.

## Spending Limits

To prevent API cost abuse, multiple layers of cost protection are enforced:

### Daily Spending Limit
- **$5/day per session** (resets at UTC midnight)
- Admin users bypass this limit
- Returns clear error with remaining budget when exceeded

### Per-Request Cost Cap
- **Maximum 100 credits ($1.00) per single request**
- Prevents expensive models from draining daily budget in one request
- Returns 400 error if model cost exceeds cap

### Input Validation Limits
- **Messages:** Maximum 50 per chat request
- **Context string:** Maximum 2000 characters
- **Request body:** Maximum 100KB (enforced via streaming reader, handles chunked transfer encoding)

These limits prevent token inflation attacks where attackers send huge payloads to maximize API costs.

## Alpha Constraints

The current payment flow is intentionally streamlined:

- Lightning invoices only (CashApp users can pay via Lightning using USD or BTC).
- No refunds.
- No direct fiat or on-chain payments (though CashApp bridges both to Lightning).
- No full accounts yet.

These limitations are explicitly shown in the buy-credits modal (which includes integrated onboarding).

## Charging Behavior

- Credits are reserved atomically before generation (prevents race conditions).
- Credits are converted to a charge after successful generation.
- If generation fails, reserved credits are released back to the user.
- Models without valid pricing are rejected (cannot use unpriced models).

### Chat Credits
- Dynamic pricing based on model's per-token cost
- Estimated ~2000 tokens reserved upfront
- Actual usage logged for monitoring

### Image Credits
- Dynamic pricing based on model's per-image cost
- Charged after successful image generation

## Admin Audit Logging

Admin users bypass credit checks, but **all admin API usage is logged** for security monitoring:

- Every chat and image generation request is logged with:
  - Session ID
  - Endpoint (chat or generate-image)
  - Model used
  - Estimated credits and USD cost
  - Timestamp
- `getAdminDailySpend` query returns total admin usage for the current day (server secret required)
- Enables detection of admin credential compromise
- Provides forensic data for investigation

This ensures unlimited admin access doesn't mean unmonitored access.

## Transparency Data

Each generated image stores a prompt and structured metadata (reference, verse text, theme, cost, duration, etc.) to support auditing and future features.

## Feature Gating

The credit system depends on Convex and session secrets. If Convex is not configured, the UI falls back to free browsing with no persistence or billing.

Client IP hashing uses trusted proxy headers only when configured; otherwise it may be `unknown` in dev.

## Entry Points

### API Routes
- `src/app/api/session/route.ts` - Session creation and state
- `src/app/api/invoice/route.ts` - Invoice creation
- `src/app/api/invoice/[id]/route.ts` - Invoice status and confirmation
- `src/app/api/admin-login/route.ts` - Admin authentication

### Client
- `src/context/session-context.tsx` - SessionProvider and useSession hook
- `src/components/credits-badge.tsx` - Credit balance display
- `src/components/buy-credits-modal.tsx` - Lightning payment flow + integrated onboarding

### Utilities
- `src/lib/session.ts` - JWT signing/verification helpers
- `src/lib/convex-client.ts` - Server-side Convex client
- `src/lib/btc-price.ts` - BTC/USD price fetching with cache
- `src/lib/lnd.ts` - Lightning invoice creation and lookup
- `src/lib/request-body.ts` - Secure body reading with size limits

### Convex Functions
- `convex/sessions.ts` - Session and credit ledger mutations
- `convex/invoices.ts` - Invoice mutations and queries
- `convex/modelStats.ts` - Generation timing statistics
