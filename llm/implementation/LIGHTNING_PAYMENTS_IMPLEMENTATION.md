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
CONVEX_SERVER_SECRET=your-secure-random-secret
```

**Invoice-Only Macaroon:** The `LND_INVOICE_MACAROON` should be a restricted macaroon with only invoice create and lookup permissions. This limits the scope of LND access to the operations required by `src/lib/lnd.ts` (`createLndInvoice` and `lookupLndInvoice`). To generate such a macaroon, use the `lncli bakemacaroon` command:

```bash
lncli bakemacaroon invoices:read invoices:write
```

The command outputs a hex-encoded macaroon that can be set directly as `LND_INVOICE_MACAROON`. The `invoices:read` permission allows looking up invoice status, while `invoices:write` allows creating new invoices. LND enforces these permissions at the API level, ensuring the macaroon cannot be used for other operations like sending payments or accessing channel management endpoints.

For detailed information on macaroon permissions and additional options, see the [LND macaroon documentation](https://docs.lightning.engineering/lightning-network-tools/lnd/macaroons).

- If LND is not configured, invoice routes return 503.
- If Convex is not configured, invoice routes return 503 with "Payment system not available."
- `CONVEX_SERVER_SECRET` is required for payment confirmation (validates requests come from trusted backend).

---

## Invoice Creation

**Route:** `POST /api/invoice`

**Security checks (in order):**
1. Origin validation (returns 403 if invalid).
2. Convex client availability (returns 503 if unavailable).
3. LND configuration check (returns 503 if not configured).
4. Session cookie required (returns 401 if missing).
5. Rate limiting: 10 invoices per minute per IP (returns 429 with `Retry-After` header if exceeded). Uses IP-only (not session) to prevent multi-session bypass.

**Flow:**
1. Fetches BTC price via `getBtcPrice()` (Coinbase; 5 min cache).
2. Converts `$3` bundle price to sats via `usdToSats()`.
3. Generates `invoiceId` (UUID) before LND call.
4. Creates memo with format: `Visibible: {invoiceId}` (enables linking LND ↔ Convex).
5. Calls `createLndInvoice(amountSats, memo)` with 15-minute expiry.
6. Converts the LND `r_hash` from base64 → hex (`base64ToHex`).
7. Stores the invoice in Convex via `api.invoices.createInvoice` (passes pre-generated `invoiceId`).
8. Returns `invoiceId`, `bolt11`, `amounts`, `expiresAt`, and `credits` (300).

### Security Considerations: IP-Only Rate Limiting

**Design Decision:** Invoice creation uses **IP-only rate limiting** (`ipHash` identifier) instead of the IP+session pattern (`${ipHash}:${sid}`) used by other endpoints like chat and image generation.

**Rationale:** This is an **intentional design choice** that prioritizes network-level DDoS protection over per-session quotas. The invoice creation flow involves multiple external dependencies and resource-intensive operations that must be protected:

1. **`getBtcPrice()`** - External Coinbase API call with 5-second timeout
2. **`usdToSats()`** - Price conversion calculation
3. **`createLndInvoice()`** - External LND node API call (10-second timeout, creates persistent invoice)
4. **`base64ToHex()`** - Payment hash encoding
5. **`api.invoices.createInvoice()`** - Convex database write with session lookup

**Attack Surface:** Without IP-only limiting, an attacker could:
- Create multiple sessions from the same IP to bypass rate limits
- Flood the LND node with invoice creation requests (most expensive operation)
- Exhaust Coinbase API quota and trigger rate limiting on price fetches
- Fill the Convex `invoices` table with spam records
- Overwhelm LND's invoice database and memory

**Trade-offs:**

✅ **Benefits:**
- **Stronger DDoS defense**: Prevents invoice flooding attacks that could overwhelm the LND node
- **LND protection**: The 10 invoices/minute limit applies per IP regardless of session count
- **External API protection**: Prevents exhausting Coinbase API quota via multi-session bypass
- **Resource conservation**: Limits expensive external calls at the network level

⚠️ **Limitations:**
- **Shared quota for legitimate users**: All sessions behind the same IP share the 10/minute quota
- **Impact on corporate networks**: Users behind corporate NAT may hit limits more quickly
- **Public Wi-Fi limitations**: Multiple legitimate users on public Wi-Fi share the same quota
- **VPN/proxy users**: Users on shared VPN endpoints may experience reduced availability

**Justification:** The trade-off is acceptable because:
- Invoice creation is infrequent (typically 1-2 per session for credit purchases)
- 10 invoices/minute per IP is sufficient for legitimate usage patterns
- Protecting LND from flooding is critical (node availability affects all users)
- The 15-minute invoice expiry provides natural cleanup of unused invoices
- Payment confirmation still requires session ownership (`invoice.sid` check)

**Comparison with Other Endpoints:**
- `chat`: Uses `${ipHash}:${sid}` (per-session quota appropriate for frequent, low-cost operations)
- `generate-image`: Uses `${ipHash}:${sid}` (per-session quota for expensive AI operations)
- `invoice`: Uses `ipHash` only (network-level protection for external dependencies)
- `session`: Uses `ipHash` only (prevents session creation spam)

**Stored fields:** `invoiceId`, `sid`, `amountUsd`, `amountSats`, `bolt11`, `paymentHash`, `status`, `createdAt`, `expiresAt`, `paidAt`.

**LND ↔ Convex Linking:** The `invoiceId` in the LND memo allows looking up any invoice in Convex directly from the LND node interface. The `paymentHash` (hex-encoded `r_hash`) also links both systems but is less human-readable.

---

## Invoice Status (Polling + Auto-Confirm)

**Route:** `GET /api/invoice/:id`

- Origin validation required (returns 403 if invalid).
- Requires a valid session cookie (returns 401 if missing).
- Verifies the invoice belongs to the current session (`invoice.sid`, returns 403 if mismatch).
- If pending and not expired, checks LND settlement by `paymentHash`:
  - `SETTLED` → **automatically confirms payment** via `confirmPayment` mutation and credits the session.
  - `CANCELED` → expires the invoice.
  - `OPEN`/`ACCEPTED` → remains pending.

Returns invoice details (`status`, `bolt11`, `amounts`, `expiresAt`, `paidAt`).

**Note:** The GET route performs automatic confirmation when LND reports settlement. This allows the polling mechanism to complete the payment flow without requiring a separate POST confirmation call.

---

## Invoice Confirmation

**Route:** `POST /api/invoice/:id`

- Origin validation required.
- Requires session cookie and ownership check.
- Requires `paymentHash` on the invoice and LND configuration.
- Looks up the invoice via LND; only confirms if `SETTLED`.

**Error Codes:**
- `400`: Invoice missing payment hash
- `401`: Missing or invalid session
- `402`: Not settled (payment still pending)
- `403`: Invalid origin or invoice not owned by session
- `404`: Invoice not found
- `410`: Invoice canceled or expired
- `500`: Server error
- `503`: LND or Convex not configured

On success, returns `{ success, alreadyPaid?, newBalance?, creditsAdded? }`.

**Note:** This endpoint does not accept arbitrary confirmation; it only succeeds when LND reports settlement.

---

## Convex Mutations

**`confirmPayment`** (action in `convex/invoices.ts`)

- Validates `serverSecret` against `CONVEX_SERVER_SECRET` (throws "Unauthorized" if invalid).
- Calls internal mutation `confirmPaymentInternal` which:
  - Validates invoice exists and is not expired.
  - Returns early if already paid (idempotent—prevents double-crediting).
  - Sets status to `paid`, `paidAt` timestamp.
  - Updates `paymentHash` only if provided (preserves existing value if omitted).
  - Adds 300 credits to the session.
  - Upgrades session `tier` to `"paid"` (unless already `"admin"`).
  - Inserts a `creditLedger` entry with reason `purchase`.

**`expireInvoice`** (mutation in `convex/invoices.ts`)

- Marks an invoice as expired (called when LND reports `CANCELED` or local expiry exceeded).
- Only updates status if currently `"pending"` (idempotent).
- Sets `status` to `"expired"`.

---

## LND Client

**File:** `src/lib/lnd.ts`

- `createLndInvoice(amountSats, memo)` uses the invoice macaroon.
  - `memo` contains the Convex `invoiceId` for cross-system linking.
  - Returns `r_hash` in base64 encoding (LND's default response format).
- `lookupLndInvoice(paymentHash)` checks settlement state.
  - Expects `paymentHash` in **hex encoding** (as stored in Convex).
  - First tries hex directly in path `/v1/invoice/{hex}`, then falls back to base64 query param `/v1/invoice?r_hash={base64}`.
- Uses 10-second timeouts for LND requests to avoid blocking.

### Payment Hash Encoding

**Important:** LND uses different encodings in different contexts:

| Context | Encoding | Example |
|---------|----------|---------|
| LND REST response (`r_hash`) | Base64 | `Wm9vYmFy...` |
| Convex storage (`paymentHash`) | Hex | `5a6f6f626172...` |
| LND REST lookup (primary) | Hex | `/v1/invoice/5a6f6f626172...` |
| LND REST lookup (fallback) | Base64 | `/v1/invoice?r_hash=Wm9vYmFy...` |

The conversion happens at invoice creation time (`base64ToHex(lndInvoice.r_hash)`) and the hex format is used for storage. Lookups first try hex in the path, then fall back to base64 in a query param for compatibility with different LND gateway implementations.

---

## BTC Price Cache

**File:** `src/lib/btc-price.ts`

- Fetches BTC/USD from Coinbase with a 5-second timeout.
- Caches for 5 minutes.
- Falls back to stale cache if the live fetch fails.

---

## Security Notes

- **Origin validation**: All invoice routes validate the HTTP Origin header to prevent CSRF attacks.
- **Session scoping**: Invoice status/confirmation requires matching session ownership.
- **Rate limiting**: Invoice creation is rate-limited (10/min per IP) to prevent LND flooding. Uses IP-only identifier to prevent multi-session bypass attacks.
- **Server secret**: Payment confirmation requires `CONVEX_SERVER_SECRET` to validate trusted backend calls.
- **Idempotency**: `confirmPayment` safely handles duplicate calls (returns `alreadyPaid: true`).
- **LND verification**: Credits are granted only after LND reports `SETTLED` state.
- **Invoice-only macaroon**: LND authentication uses a restricted macaroon with create/lookup permissions only.
- No refund path is implemented in the current flow.
