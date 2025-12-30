# Credits UI Implementation Guide

This document describes how the free/paid session state is surfaced in the UI and how users purchase credits.

---

## Entry Points

- `src/context/session-context.tsx` - session state and helpers.
- `src/components/credits-badge.tsx` - header badge.
- `src/components/onboarding-modal.tsx` - first-time prompt.
- `src/components/buy-credits-modal.tsx` - Lightning invoice flow.
- `src/components/hero-image.tsx` - credit gating for generation.
- `src/app/layout.tsx` - providers + modals mounted globally.

---

## Session Provider

**File:** `src/context/session-context.tsx`

- On mount, calls `GET /api/session`.
- If no session, creates one via `POST /api/session`.
- Tracks onboarding state in `localStorage` (`visibible_onboarding_seen`).
- Auto-opens onboarding for new users with `tier === "free"` and `credits === 0`.

### `useSession()` Hook Interface

| Property | Type | Description |
|----------|------|-------------|
| `sid` | `string \| null` | Session ID |
| `tier` | `"free" \| "paid" \| "admin"` | User tier |
| `credits` | `number` | Current credit balance |
| `isLoading` | `boolean` | Session fetch in progress |
| `error` | `string \| null` | Error message if any |
| `refetch` | `() => Promise<void>` | Re-fetch session state |
| `updateCredits` | `(n: number) => void` | Update local credits |
| `buyCredits` | `() => void` | Open buy modal |
| `isBuyModalOpen` | `boolean` | Buy modal state |
| `closeBuyModal` | `() => void` | Close buy modal |
| `isOnboardingOpen` | `boolean` | Onboarding modal state |
| `openOnboarding` | `() => void` | Open onboarding modal |
| `closeOnboarding` | `() => void` | Close onboarding modal |

### `useCanGenerate()` Hook

```ts
function useCanGenerate(creditsCost: number | null): boolean
```

Returns `true` if generation is allowed:
- `tier === "admin"` → always allowed
- `creditsCost === null` (unpriced model) → returns `credits >= 20`
- Otherwise → returns `credits >= creditsCost` (no tier check)

Note: The null case doesn't explicitly check tier, but free users have 0 credits by default, so they're effectively blocked.

**Important:** `HeroImage` does not use this hook directly. Instead, it implements its own inline logic that also checks `useConvexEnabled()`:

```ts
const canGenerate = !isConvexEnabled || isAdmin || (tier === "paid" && credits >= effectiveCost);
```

This inline logic always requires `tier === "paid"` for non-admins when Convex is enabled, whereas `useCanGenerate` allows any tier with sufficient credits for unpriced models.

---

## Credits Badge

**File:** `src/components/credits-badge.tsx`

- `admin` tier → shows admin badge.
- `free` tier or `credits === 0` → shows “Get Credits” button (opens onboarding).
- `paid` tier → shows credit balance (opens buy modal).

---

## Onboarding Modal

**File:** `src/components/onboarding-modal.tsx`

- Shows the first time a user is free and has zero credits.
- Fetches `/api/image-models` to show credit cost range.
- Primary action: buy credits → opens the buy modal.
- Secondary action: browse for free.
- Includes alpha notice (Lightning-only, no refunds, no fiat/on-chain, no accounts).
- Includes optional admin login flow (`/api/admin-login`).

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

---

## Layout Wiring

**File:** `src/app/layout.tsx`

- `SessionProvider` wraps the app.
- `BuyCreditsModal` and `OnboardingModal` are mounted globally.
