# Payments Context

High-level view of payments and credit purchases. This describes product intent and user-facing behavior, not internal implementation.

## Summary

- Payments use Lightning invoices, payable via any Lightning wallet or CashApp.
- Fixed bundle: $3 for 300 credits.
- Credits unlock both **image generation** and **AI chat** (cost varies by model).
- Invoices are tied to the current anonymous session.

**CashApp Support:** CashApp users can scan the Lightning QR code to pay using their CashApp balance (USD or BTC). This allows anyone to pay even if they don't have a dedicated Lightning wallet.

## Credit Usage

Credits are consumed by AI features:

| Feature | Cost | Notes |
|---------|------|-------|
| Image generation | ~5-50 credits | Varies by model (shown before generating) |
| AI chat | ~1-10 credits | Varies by model, estimated at ~2000 tokens/message |

Admin users have unlimited access without credit deductions.

## Daily Spending Limit

Sessions have a **$5/day spending limit** to prevent runaway costs:
- Resets at UTC midnight
- Admin users are exempt
- Returns error with remaining budget when exceeded

## Flow

1. User clicks "Get Credits" (credit badge in header) or is prompted when out of credits.
2. **First-time users** see a welcome modal explaining Visibible before the purchase screen.
3. The app creates a Lightning invoice and shows a QR code + BOLT11 string.
4. The invoice expires after **15 minutes** if unpaid.
5. The app polls for settlement every **3 seconds** and credits the session when paid.

## Modal States

The buy credits modal has several states:

1. **Welcome** (first-time) — Introduction to Visibible with "Buy Credits" or "Browse for Free" options
2. **Selection** — Package info ($3 = 300 credits), payment methods, admin login option
3. **Loading** — Creating the Lightning invoice
4. **Invoice** — QR code, BOLT11, countdown timer, "Waiting for payment..."
5. **Success** — "Payment Received!" confirmation
6. **Error** — Retry option for failed/expired invoices

## Alpha Constraints

- No refunds.
- No direct fiat or on-chain payments (though CashApp bridges both to Lightning).
- No full accounts yet — credits are **session-only**.
- This is called out explicitly in onboarding and buy-credits UI.

## Session-Only Warning

The UI prominently warns users:
> "You have no account. Credits are stored in this browser session only. Clearing your cache or using a different browser will result in lost credits."

## Admin Access

The buy credits modal includes a hidden "Admin Access" section:
- Reveals a password input when clicked
- Successful admin login upgrades the session tier to "admin"
- Admin users bypass all credit checks and daily limits

## Transparency & Security

- Invoice status can only be accessed by the session that created it.
- Credits are granted only after the Lightning invoice is **settled** (confirmed by LND).
- Origin validation prevents CSRF attacks on invoice creation.
- Invoice creation is **rate limited** (10 requests per minute per IP). Uses IP-only to prevent multi-session bypass.

## Entry Points

- Credits badge: `src/components/credits-badge.tsx`
- Buy modal: `src/components/buy-credits-modal.tsx`
- Invoice creation: `src/app/api/invoice/route.ts`
- Invoice status: `src/app/api/invoice/[id]/route.ts`
- LND client: `src/lib/lnd.ts`
- Convex invoices: `convex/invoices.ts`
