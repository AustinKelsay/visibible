# Lightning credit purchases

[BuyCreditsModal](../../src/components/buy-credits-modal.tsx) offers $1/100-credit and $3/300-credit bundles and renders an invoice QR code/BOLT11 string. The app creates Lightning invoices through the LNURL-pay server behind `pay@visibible.com`, which fronts the receiving LND node; it has no direct fiat or on-chain checkout. Wallet compatibility depends on the wallet. Welcome behavior is in [Onboarding](ONBOARDING.md).

1. [POST /api/invoice](../../src/app/api/invoice/route.ts) validates origin, signed session with current-IP tracking and an IP-scoped rate limit, then creates an invoice through the LNURL-pay callback, checks that it requests exactly the bundle's sats, and stores a Convex invoice record whose expiry is the invoice's own.
2. The client polls [GET /api/invoice/[id]](../../src/app/api/invoice/[id]/route.ts) every three seconds; the route also exposes an explicit POST confirmation handler. Both validate origin, signed session and an IP/session-scoped rate limit, then read the invoice with the cookie's SID as owner, so another or revoked session cannot read it. For any unpaid invoice, they query the node's invoice state before considering local expiry.
3. A credit purchase requires the node to report `SETTLED` for the record's payment hash. The invoice requests exactly the bundle's sats and LND never settles a fixed-amount invoice for less, so the record's amount is the paid amount ([lightning.ts](../../src/lib/lightning.ts) and [convex/invoices.ts](../../convex/invoices.ts)). A payment observed after local expiry still credits. Marking the invoice paid, adding wallet credits and an invoice-keyed purchase ledger entry commit in one mutation. Repeated confirmation reports `alreadyPaid` without another credit, and a payment hash already credited through another invoice record is rejected. Node-canceled or locally expired unpaid invoices are marked expired. Lookup failures return an error without changing unpaid state. A real $1 production purchase on 2026-10-14 settled and added 100 credits through one purchase ledger entry.

The purchase UI communicates session-only access and no refunds during alpha. Losing the session cookie loses access to its balance; [Sessions and credits](SESSIONS_AND_CREDITS.md) documents expiry as well.

## Configuration

Next.js needs `LNURL_PAY_URL`, the LNURL-pay callback (production: `https://tower.taila60b27.ts.net:10000/lnurlp/pay`). It needs no node credentials: the callback creates invoices and `<LNURL_PAY_URL>/check?id=<payment hash>` reports their state. [lightning.ts](../../src/lib/lightning.ts) defines the actual requests and timeout behavior. [btc-price.ts](../../src/lib/btc-price.ts) provides the cached USD/BTC conversion.

For optional admin login, set `ADMIN_PASSWORD` and `ADMIN_PASSWORD_SECRET` in Next.js and the same `ADMIN_PASSWORD_SECRET` in Convex. The modal exposes an Admin Access section. [The login route](../../src/app/api/admin-login/route.ts) validates origin, CSRF, session validation/IP tracking and brute-force protection before upgrading the session. It does not fund an ordinary paid session.

The Next.js and Convex `CONVEX_SERVER_SECRET` values must also match. See [Convex setup](../../convex/README.md).
