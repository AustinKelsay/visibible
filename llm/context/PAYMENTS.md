# Lightning credit purchases

[BuyCreditsModal](../../src/components/buy-credits-modal.tsx) offers $1/100-credit and $3/300-credit bundles and renders an invoice QR code/BOLT11 string. The app integrates Lightning invoices through LND; it has no direct fiat or on-chain checkout. Wallet compatibility depends on the wallet. Welcome behavior is in [Onboarding](ONBOARDING.md).

1. [POST /api/invoice](../../src/app/api/invoice/route.ts) validates origin, signed session with current-IP tracking and an IP-scoped rate limit, then creates an LND invoice and a Convex invoice record.
2. The client polls [GET /api/invoice/[id]](../../src/app/api/invoice/[id]/route.ts) every three seconds; the route also exposes an explicit POST confirmation handler. Both validate origin, signed session and an IP/session-scoped rate limit, then read the invoice with the cookie's SID as owner, so another or revoked session cannot read it. For any unpaid invoice, they query LND before considering local expiry.
3. Settlement requires a settled LND invoice whose payment hash matches the record and whose paid sats cover the invoice amount ([lnd.ts](../../src/lib/lnd.ts) and [convex/invoices.ts](../../convex/invoices.ts) both check). A payment observed after local expiry still credits. Marking the invoice paid, adding wallet credits and an invoice-keyed purchase ledger entry commit in one mutation. Repeated confirmation reports `alreadyPaid` without another credit, and a payment hash already credited through another invoice record is rejected. LND-canceled or locally expired unpaid invoices are marked expired. LND lookup failures return an error without changing unpaid state. Live LND verification of this path remains pending while the node is offline.

The purchase UI communicates session-only access and no refunds during alpha. Losing the session cookie loses access to its balance; [Sessions and credits](SESSIONS_AND_CREDITS.md) documents expiry as well.

## Configuration

Next.js needs `LND_HOST` and `LND_INVOICE_MACAROON`. Use an invoice-only macaroon limited to invoice creation/lookup; [lnd.ts](../../src/lib/lnd.ts) defines the actual requests and timeout behavior. [btc-price.ts](../../src/lib/btc-price.ts) provides the cached USD/BTC conversion.

For optional admin login, set `ADMIN_PASSWORD` and `ADMIN_PASSWORD_SECRET` in Next.js and the same `ADMIN_PASSWORD_SECRET` in Convex. The modal exposes an Admin Access section. [The login route](../../src/app/api/admin-login/route.ts) validates origin, CSRF, session validation/IP tracking and brute-force protection before upgrading the session. It does not fund an ordinary paid session.

The Next.js and Convex `CONVEX_SERVER_SECRET` values must also match. See [Convex setup](../../convex/README.md).
