# Lightning credit purchases

[BuyCreditsModal](../../src/components/buy-credits-modal.tsx) offers $1/100-credit and $3/300-credit bundles and renders an invoice QR code/BOLT11 string. The app creates Lightning invoices through the LNURL-pay server behind `pay@visibible.com`, which fronts the receiving LND node; it has no direct fiat or on-chain checkout. Wallet compatibility depends on the wallet. Welcome behavior is in [Onboarding](ONBOARDING.md).

1. [POST /api/invoice](../../src/app/api/invoice/route.ts) validates origin, signed session with current-IP tracking and an IP-scoped rate limit. It then saves a purchase intent (owner, bundle, sats quote and the browser's intent id) before it asks the LNURL-pay callback for an invoice, checks that the invoice requests exactly the quoted sats, and stores a Convex invoice record whose expiry is the invoice's own. See [Purchase intents](#purchase-intents).
2. While the purchase dialog is open, the client polls [GET /api/invoice/[id]](../../src/app/api/invoice/[id]/route.ts) every three seconds, and the server also looks on its own ([Settlement without a browser](#settlement-without-a-browser)); the route also exposes an explicit POST confirmation handler. Both validate origin, signed session and an IP/session-scoped rate limit, then read the invoice with the cookie's SID as owner, so another or revoked session cannot read it. For any unpaid invoice, they ask the LNURL-pay server's `/check` endpoint for the invoice state before considering local expiry.
3. A credit purchase requires the LNURL-pay server's `/check` to report `SETTLED` for the record's payment hash. `/check` reports no amount received. The invoice requests exactly the bundle's sats and LND never settles a fixed-amount invoice for less, so the record's requested amount is passed as the amount paid, and the credits come from the bundle; an overpayment is neither measured nor credited ([lightning.ts](../../src/lib/lightning.ts) and [convex/invoices.ts](../../convex/invoices.ts)). A payment observed after local expiry still credits. Marking the invoice paid, adding wallet credits and an invoice-keyed purchase ledger entry commit in one mutation. Repeated confirmation reports `alreadyPaid` without another credit, and a payment hash already credited through another invoice record is rejected. Node-canceled or locally expired unpaid invoices are marked expired. Lookup failures return an error without changing unpaid state. A real $1 production credit purchase on 2026-10-14 added 100 credits through one purchase ledger entry.

The purchase UI communicates session-only access and no refunds during alpha. Losing the session cookie loses access to its balance; [Sessions and credits](SESSIONS_AND_CREDITS.md) documents expiry as well.

## Settlement without a browser

A payment credits the wallet even when every tab is closed. When an invoice is saved, [invoiceReconciliation.ts](../../convex/invoiceReconciliation.ts) schedules a chain of looks at the same `/check` endpoint from Convex:

- The first look is 30 seconds after the invoice is saved. Each later one doubles the invoice's age, to at most 15 minutes apart, with one more look two minutes after the invoice's own expiry.
- `SETTLED` credits through the same `confirmPaymentInternal` the browser path uses, so the two can never credit one invoice twice. `CANCELED`, or `OPEN` after expiry, marks the invoice expired. Either answer ends the chain.
- `ACCEPTED` means the node is holding a payment, which can still settle after expiry, so the server keeps looking.
- A look the node does not answer changes nothing except the recorded error. After expiry the server looks every 15 minutes and stops after eight looks (about two hours) that brought neither a settlement nor an expiry; the invoice then keeps its status and its last error. A settlement reported after that is still credited.
- Each look plans the next one before it asks the node, so a look that never reports back cannot stop the chain.

An hourly job schedules unpaid invoices that were never scheduled, 25 per status per run: invoices saved before this existed, including ones already marked expired, and any saved while Convex had no `LNURL_PAY_URL`. A historical invoice the node reports settled is credited once; one it cannot look up is left as it is after eight tries.

Convex needs its own `LNURL_PAY_URL` (the same value as Next.js). Without it nothing is scheduled and the browser path is the only one, as before; the hourly job catches up once it is set. To see what the server is still watching or gave up on, with age, next look and last error, run `npx convex run invoiceReconciliation:status` against the deployment. The displayed countdown in the purchase dialog is the invoice's own expiry and never decides settlement: only the node's answer does.

## Purchase intents

The browser sends one intent id per purchase and reuses it until the server settles that intent's outcome with an invoice, `invoice_unresolved` or `invoice_intent_conflict`. A lost connection, a rate limit, a server error or the answer that the invoice is still being created all leave it in use. A repeated intent is answered from what was saved, before any price lookup. [beginInvoice](../../convex/invoices.ts) decides what a request with that id gets:

| Saved intent | Answer |
| --- | --- |
| None | The intent is saved as `creating` and the callback is asked for an invoice. |
| `created` | The saved invoice, unchanged. The callback is not asked again. |
| `failed` (the pay server itself refused with `{"status":"ERROR"}`, so it made no invoice) | The callback is asked again with the same sats quote. |
| `creating` for under 30 seconds | 409 `invoice_in_progress`. |
| `creating` for longer, or `unresolved` | 409 `invoice_unresolved` with the intent id as `reference`. The callback is never asked again for this intent. |
| Same id, different bundle | 409 `invoice_intent_conflict`. |

An intent becomes `unresolved` after any other failure of the invoice request (no connection, a timeout, a gateway's error page, a success without a usable invoice, an invoice for the wrong amount) or when the request stopped before its outcome was recorded. In each case an invoice may exist on the node. The callback's only lookup is `/check` by payment hash, so an invoice whose hash was never saved cannot be found again, and a second request could leave two invoices for one purchase. The buyer is told that nothing was charged and starts a new purchase, which is a new intent.

An unresolved intent cannot have been paid through the app: the buyer receives a BOLT11 string only after its invoice record is saved. To inspect them, run `npx convex run invoices:listOpenInvoiceIntents` against the deployment. Each row gives the intent id the buyer saw as a reference, the invoice id sent to the callback in the comment `credits <invoiceId>`, the session and the sats quote. If a buyer reports paying anyway, find that comment on the LNURL-pay server; no credit is granted automatically.

A request without an intent id is treated as a new purchase each time. A saved invoice must match its intent's invoice id, bundle and sats quote, and a payment hash that already belongs to an invoice record is refused.

## Configuration

Next.js needs `LNURL_PAY_URL`, the LNURL-pay callback (production: `https://tower.taila60b27.ts.net:10000/lnurlp/pay`). It needs no node credentials: the callback creates invoices and `<LNURL_PAY_URL>/check?id=<payment hash>` reports their state. [lightning.ts](../../src/lib/lightning.ts) defines the actual requests and timeout behavior. [btc-price.ts](../../src/lib/btc-price.ts) provides the cached USD/BTC conversion.

For optional admin login, set `ADMIN_PASSWORD` and `ADMIN_PASSWORD_SECRET` in Next.js and the same `ADMIN_PASSWORD_SECRET` in Convex. The modal shows its Admin Access section only when the page URL includes `?admin` (for example `/genesis/1/1?admin`), so buyers do not see it. [The login route](../../src/app/api/admin-login/route.ts) validates origin, CSRF, session validation/IP tracking and brute-force protection before upgrading the session. It does not fund an ordinary paid session.

The Next.js and Convex `CONVEX_SERVER_SECRET` values must also match. See [Convex setup](../../convex/README.md).
