# Credits UI Implementation Guide

This document describes how session state and credits are surfaced in the UI and how users purchase credits.

---

## Entry Points

- `src/context/session-context.tsx` - session state and helpers.
- `src/components/credits-badge.tsx` - header badge.
- `src/components/buy-credits-modal.tsx` - Lightning invoice flow + integrated onboarding.
- `src/components/hero-image.tsx` - credit gating for generation.
- `src/app/layout.tsx` - providers + modals mounted globally.

---

## Session Provider

**File:** `src/context/session-context.tsx`

- On mount, calls `GET /api/session`.
- If no session, creates one via `POST /api/session`.
- Tracks onboarding state in `localStorage` (`visibible_onboarding_seen`).
- Auto-opens `BuyCreditsModal` (with welcome flow) for new non-admin users who haven't seen onboarding.

### `useSession()` Hook Interface

| Property | Type | Description |
|----------|------|-------------|
| `sid` | `string \| null` | Session ID |
| `tier` | `"paid" \| "admin"` | User tier |
| `credits` | `number` | Current credit balance |
| `isLoading` | `boolean` | Session fetch in progress |
| `error` | `string \| null` | Error message if any |
| `refetch` | `() => Promise<void>` | Re-fetch session state |
| `updateCredits` | `(n: number) => void` | Update local credits |
| `buyCredits` | `() => void` | Open buy modal |
| `isBuyModalOpen` | `boolean` | Buy modal state |
| `closeBuyModal` | `() => void` | Close buy modal |

### `useCanGenerate()` Hook

```ts
function useCanGenerate(creditsCost: number | null): boolean
```

Returns `true` if generation is allowed:
- `tier === "admin"` → always allowed
- `creditsCost === null` (unpriced model) → uses `DEFAULT_IMAGE_ESTIMATED_CREDITS_COST` with the 5-credit image spend-down grace window
- Otherwise → allows the estimated image cost with the same 5-credit image spend-down grace window

Formula used by the helper:
- Allow generation when `credits >= estimatedCost`
- Also allow generation when `credits > 0` and `credits + 5 >= estimatedCost`
- Do not allow generation when `credits <= 0`

Note: The null case uses `DEFAULT_IMAGE_ESTIMATED_CREDITS_COST` as the shared base estimate for unpriced models.

### `canAffordImageGeneration()` Helper

`canAffordImageGeneration(credits, effectiveCost)` lives in `src/lib/image-models.ts` and powers both `useCanGenerate()` and manual image generation actions.

- `credits`: the current session credit balance
- `effectiveCost`: the estimated image charge after model and resolution adjustments
- Returns: `true` when generation should be allowed, otherwise `false`

Behavior:
- If `credits >= effectiveCost`, return `true`
- If `credits > 0` and `credits + 5 >= effectiveCost`, return `true`
- If `credits <= 0`, return `false`

Examples:
- `credits=7`, `effectiveCost=5` → allowed
- `credits=2`, `effectiveCost=6` → allowed by the 5-credit image spend-down grace window
- `credits=0`, `effectiveCost=5` → blocked
- The helper is credit-only; `HeroImage` still layers on `tier === "paid"` when Convex-backed billing is enabled
- `HeroImage` uses a stricter `credits >= effectiveCost` check for auto-generation on first visit, so the grace window only applies to explicit generate actions

**Important:** `HeroImage` does not use this hook directly. Instead, it implements its own inline logic that also checks `useConvexEnabled()`:

```ts
const canGenerate =
  !isConvexEnabled ||
  isAdmin ||
  (tier === "paid" && canAffordImageGeneration(credits, effectiveCost));

const canAutoGenerate =
  !isConvexEnabled ||
  isAdmin ||
  (tier === "paid" && credits >= effectiveCost);
```

This inline logic always requires `tier === "paid"` for non-admins when Convex is enabled. `useCanGenerate` is only a credit-threshold helper; it does not enforce the paid-tier requirement by itself.

---

## Credits Badge

**File:** `src/components/credits-badge.tsx`

- `admin` tier → shows admin badge (Shield icon + "Admin" text).
- Otherwise → shows credit balance with Zap icon (clickable, opens buy modal).

---

## Onboarding (Integrated in BuyCreditsModal)

Onboarding is integrated into `BuyCreditsModal` as a "welcome" state, not a separate component.

- Auto-opens for new non-admin users (via `SessionProvider`).
- Welcome page shows app description and alpha notice.
- Includes `MiniVerseStrip` component demonstrating verse navigation with image indicator dots:
  - Shows 5 sample verses (36x36px boxes) with varying dot counts (0-3 dots)
  - Dots use same styling as main UI: `w-2 h-2` (8px) with `border-[var(--background)]/30` outline
  - Auto-cycles selection every 2.5 seconds with 500ms fade transitions
  - Selected verse: accent background, scale-110, shadow glow, pulsing dots
  - Uses `animate-dot-pulse` CSS animation (defined in globals.css)
  - Respects `prefers-reduced-motion` for accessibility
- Primary action: "Buy Credits to Generate" → transitions to credit selection.
- Secondary action: "Browse for Free" → closes modal.
- Alpha notice includes: Lightning-only payments, no refunds, credits are session-only.
- Includes optional admin login flow (`/api/admin-login`) in a collapsible section.

---

## Buy Credits Modal

**File:** `src/components/buy-credits-modal.tsx`

- On open, calls `POST /api/invoice` to create a Lightning invoice.
- Displays sats price, credits, QR code, and BOLT11 string.
- Polls `GET /api/invoice/:id` every 3 seconds for settlement.
- Shows a countdown based on `expiresAt`.
- On settlement, calls `refetch()` to update credits and shows a success state.
- On expiry or failure, shows an error and allows retry.

---

## Generation Gating

**File:** `src/components/hero-image.tsx`

- Fetches model pricing via `/api/image-models` to calculate credit cost and ETA.
- Defaults to `DEFAULT_IMAGE_ESTIMATED_CREDITS_COST` and ~12s ETA for unpriced models.
- `canGenerate` uses **inline logic** (not the `useCanGenerate` hook):
  ```ts
  const canGenerate =
    !isConvexEnabled ||
    isAdmin ||
    (tier === "paid" && canAffordImageGeneration(credits, effectiveCost));

  const canAutoGenerate =
    !isConvexEnabled ||
    isAdmin ||
    (tier === "paid" && credits >= effectiveCost);
  ```
  - If Convex is disabled, generation is allowed (no credit gating)
  - Admin tier always allowed
  - Paid tier with sufficient credits, or within the 5-credit grace window, allowed
- Auto-generation only runs when `canGenerate` is true and the session has loaded.
- On generation success, the server returns `credits` and the UI updates local state.

### Estimate vs Actual Cost Display

The UI shows the **normal estimated charge** ("About X credits") before generation while keeping the conservative hold internal because:

1. **OpenRouter API pricing is inaccurate** - The models API `pricing.image` field often underreports actual costs by ~31x for multimodal models.
2. **Reservation system** - Credits are still reserved conservatively in the backend to protect against underreported provider costs.
3. **Spend-down UX** - Low-balance users can continue generating down to zero without needing enough credits to cover the full conservative hold.
4. **Automatic refund** - After generation, the actual cost (from OpenRouter's `usage` response) is charged, and excess reserved credits are refunded.

**UI copy pattern:**
- Model selector: `~12s · About {credits} credits`
- Resolution selector / generate CTA: shows the estimated charge with an "unused refunded" note
- Generate button area: Shows cost with "unused refunded" note

This prevents confusing "insufficient credits" errors when users have enough for the expected charge but not the hidden reservation buffer.

### Fallback Behavior

If OpenRouter doesn't return usage data in its response (monitored via `usedFallbackEstimate: true`):
- The **API-based estimate** (`imageCreditsCost`) is charged, not the conservative 35x reservation
- This ensures users aren't overcharged when usage extraction fails
- Server logs warn: `[Image API] Using fallback estimate for model=X, gen=Y...`
- The response includes `usedFallbackEstimate: true` for monitoring and retroactive analysis

---

## Layout Wiring

**File:** `src/app/layout.tsx`

- `SessionProvider` wraps the app.
- `BuyCreditsModal` is mounted globally (includes integrated onboarding flow).
