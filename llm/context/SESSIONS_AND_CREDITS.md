# Sessions & Credits Context

High-level view of the paid/free sessions system for image generation. This is user-facing behavior and product intent, not implementation detail.

## Summary

- Sessions are anonymous and tracked via a signed cookie.
- Free users can browse verses and view existing images.
- Paid users buy credits and can generate images until credits run out.
- Admin sessions bypass credits entirely.
- Payments use Lightning invoices, payable via Lightning wallets or CashApp (fixed $3 bundle = 300 credits).

## User Tiers

- Free: browse content, view saved images, cannot generate.
- Paid: can generate while credits >= model cost.
- Admin: unlimited generation (no credit checks).
- Admin tier is sticky and is never downgraded by credit balance changes.

## Alpha Constraints

The current payment flow is intentionally streamlined:

- Lightning invoices only (CashApp users can pay via Lightning using USD or BTC).
- No refunds.
- No direct fiat or on-chain payments (though CashApp bridges both to Lightning).
- No full accounts yet.

These limitations are explicitly shown in the onboarding and buy-credits modals.

## Charging Behavior

- Credits are pre-checked before generation.
- Credits are charged only after a successful generation.
- If the post-charge fails (race/insufficient credits), the image is discarded and an error is returned.

## Transparency Data

Each generated image stores a prompt and structured metadata (reference, verse text, theme, cost, duration, etc.) to support auditing and future features.

## Feature Gating

The credit system depends on Convex and session secrets. If Convex is not configured, the UI falls back to free browsing with no persistence or billing.

## Entry Points

### API Routes
- `src/app/api/session/route.ts` - Session creation and state
- `src/app/api/invoice/route.ts` - Invoice creation
- `src/app/api/invoice/[id]/route.ts` - Invoice status and confirmation
- `src/app/api/admin-login/route.ts` - Admin authentication

### Client
- `src/context/session-context.tsx` - SessionProvider and useSession hook
- `src/components/credits-badge.tsx` - Credit balance display
- `src/components/buy-credits-modal.tsx` - Lightning payment flow
- `src/components/onboarding-modal.tsx` - First-time user modal

### Utilities
- `src/lib/session.ts` - JWT signing/verification helpers
- `src/lib/convex-client.ts` - Server-side Convex client
- `src/lib/btc-price.ts` - BTC/USD price fetching with cache
- `src/lib/lnd.ts` - Lightning invoice creation and lookup

### Convex Functions
- `convex/sessions.ts` - Session and credit ledger mutations
- `convex/invoices.ts` - Invoice mutations and queries
- `convex/modelStats.ts` - Generation timing statistics
