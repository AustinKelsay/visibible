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
- `creditsCost === null` (unpriced model) → returns `credits >= 20`
- Otherwise → returns `credits >= creditsCost` (no tier check)

Note: The null case uses `DEFAULT_CREDITS_COST` (20) as the threshold for unpriced models.

**Important:** `HeroImage` does not use this hook directly. Instead, it implements its own inline logic that also checks `useConvexEnabled()`:

```ts
const canGenerate = !isConvexEnabled || isAdmin || (tier === "paid" && credits >= effectiveCost);
```

This inline logic always requires `tier === "paid"` for non-admins when Convex is enabled, whereas `useCanGenerate` allows any tier with sufficient credits for unpriced models.

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
- Defaults to 20 credits and ~12s ETA for unpriced models.
- `canGenerate` uses **inline logic** (not the `useCanGenerate` hook):
  ```ts
  const canGenerate = !isConvexEnabled || isAdmin || (tier === "paid" && credits >= effectiveCost);
  ```
  - If Convex is disabled, generation is allowed (no credit gating)
  - Admin tier always allowed
  - Paid tier with sufficient credits allowed
- Auto-generation only runs when `canGenerate` is true and the session has loaded.
- On generation success, the server returns `credits` and the UI updates local state.

### Estimate vs Actual Cost Display

The UI shows a **conservative estimate** ("Up to X credits") before generation because:

1. **OpenRouter API pricing is inaccurate** - The models API `pricing.image` field often underreports actual costs by ~31x for multimodal models.
2. **Reservation system** - Credits are reserved using a 35x multiplier to ensure sufficient funds.
3. **Automatic refund** - After generation, the actual cost (from OpenRouter's `usage` response) is charged, and excess reserved credits are refunded.

**UI copy pattern:**
- Model selector: `~12s · Up to {credits} credits`
- Resolution selector: `Up to {cost} credits`
- Generate button area: Shows cost with "unused refunded" note

This prevents confusing "insufficient credits" errors when users have enough for the actual charge but not the reservation buffer.

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
