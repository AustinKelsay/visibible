# Lightning Payments Implementation Guide

This document describes how Lightning invoices are created, tracked, and confirmed for credit purchases.

---

## Entry Points

- `src/app/api/invoice/route.ts` - create invoices.
- `src/app/api/invoice/[id]/route.ts` - status + confirmation.
- `src/lib/lnd.ts` - LND REST client (create + lookup).
- `src/lib/btc-price.ts` - BTC/USD price caching.
- `convex/invoices.ts` - persistence + credit grant.

---

## Environment Variables

```env
# Lightning
LND_HOST=your-node.m.voltageapp.io
LND_INVOICE_MACAROON=your-invoice-macaroon-hex

# Convex
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
```

If LND is not configured, invoice routes return 503. If Convex is not configured, invoice routes return 503 with "Payment system not available."

---

## Invoice Creation

**Route:** `POST /api/invoice`

1. Requires a valid session cookie (`/api/session`).
2. Fetches BTC price via `getBtcPrice()` (Coinbase; 5 min cache).
3. Converts `$3` bundle price to sats via `usdToSats()`.
4. Calls `createLndInvoice(amountSats, memo)` with 15-minute expiry.
5. Converts the LND `r_hash` from base64 → hex (`base64ToHex`).
6. Stores the invoice in Convex via `api.invoices.createInvoice`.
7. Returns `invoiceId`, `bolt11`, `amounts`, `expiresAt`, and `credits` (300).

**Stored fields:** `invoiceId`, `sid`, `amountUsd`, `amountSats`, `bolt11`, `paymentHash`, `status`, `createdAt`, `expiresAt`, `paidAt`.

---

## Invoice Status (Polling + Auto-Confirm)

**Route:** `GET /api/invoice/:id`

- Requires a valid session cookie.
- Verifies the invoice belongs to the current session (`invoice.sid`).
- If pending and not expired, checks LND settlement by `paymentHash`:
  - `SETTLED` → **automatically confirms payment** via `confirmPayment` mutation and credits the session.
  - `CANCELED` → expires the invoice.
  - `OPEN`/`ACCEPTED` → remains pending.

Returns invoice details (`status`, `bolt11`, `amounts`, `expiresAt`, `paidAt`).

**Note:** The GET route performs automatic confirmation when LND reports settlement. This allows the polling mechanism to complete the payment flow without requiring a separate POST confirmation call.

---

## Invoice Confirmation

**Route:** `POST /api/invoice/:id`

- Requires session cookie and ownership check.
- Requires `paymentHash` on the invoice and LND configuration.
- Looks up the invoice via LND; only confirms if `SETTLED`.

**Error Codes:**
- `401`: Missing or invalid session
- `403`: Invoice not owned by session
- `404`: Invoice not found
- `402`: Not settled (payment still pending)
- `410`: Invoice canceled or expired
- `503`: LND not configured

On success, returns `{ success, alreadyPaid?, newBalance?, creditsAdded? }`.

**Note:** This endpoint does not accept arbitrary confirmation; it only succeeds when LND reports settlement.

---

## Convex Mutations

**`confirmPayment`** (`convex/invoices.ts`)

- Validates invoice exists and is not expired.
- Sets status to `paid`, `paidAt` timestamp.
- Updates `paymentHash` only if provided (preserves existing value if omitted).
- Adds 300 credits to the session.
- Inserts a `creditLedger` entry with reason `purchase`.

---

## LND Client

**File:** `src/lib/lnd.ts`

- `createLndInvoice(amountSats, memo)` uses the invoice macaroon.
- `lookupLndInvoice(paymentHash)` checks settlement state.
- Uses 10-second timeouts for LND requests to avoid blocking.

---

## BTC Price Cache

**File:** `src/lib/btc-price.ts`

- Fetches BTC/USD from Coinbase with a 5-second timeout.
- Caches for 5 minutes.
- Falls back to stale cache if the live fetch fails.

---

## Security Notes

- Invoice status/confirmation is session-scoped.
- Credits are granted only after LND settlement.
- No refund path is implemented in the current flow.
