# Lightning credit purchases

[BuyCreditsModal](../../src/components/buy-credits-modal.tsx) offers $1/100-credit and $3/300-credit bundles and renders an invoice QR code/BOLT11 string. The app integrates Lightning invoices through LND; it has no direct fiat or on-chain checkout. Wallet compatibility depends on the wallet. Welcome behavior is in [Onboarding](ONBOARDING.md).

1. [POST /api/invoice](../../src/app/api/invoice/route.ts) validates origin, signed session with current-IP tracking and an IP-scoped rate limit, then creates an LND invoice and a Convex invoice record.
2. The client polls [GET /api/invoice/[id]](../../src/app/api/invoice/[id]/route.ts) every three seconds. The GET handler looks up pending invoices and confirms settled payments; the route also exposes an explicit POST confirmation handler.
3. [convex/invoices.ts](../../convex/invoices.ts) credits the owning session after settlement verification, with duplicate confirmation protection. Only the originating session can access the invoice through the Next.js route.

The purchase UI communicates session-only access and no refunds during alpha. Losing the session cookie loses access to its balance; [Sessions and credits](SESSIONS_AND_CREDITS.md) documents expiry as well.

## Configuration

Next.js needs `LND_HOST` and `LND_INVOICE_MACAROON`. Use an invoice-only macaroon limited to invoice creation/lookup; [lnd.ts](../../src/lib/lnd.ts) defines the actual requests and timeout behavior. [btc-price.ts](../../src/lib/btc-price.ts) provides the cached USD/BTC conversion.

For optional admin login, set `ADMIN_PASSWORD` and `ADMIN_PASSWORD_SECRET` in Next.js and the same `ADMIN_PASSWORD_SECRET` in Convex. The modal exposes an Admin Access section. [The login route](../../src/app/api/admin-login/route.ts) validates origin, CSRF, session validation/IP tracking and brute-force protection before upgrading the session. It does not fund an ordinary paid session.

The Next.js and Convex `CONVEX_SERVER_SECRET` values must also match. See [Convex setup](../../convex/README.md).
