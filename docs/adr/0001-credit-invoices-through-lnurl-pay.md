---
status: accepted
date: 2026-10-14
---

# Credit invoices come from the LNURL-pay server, not the LND node

The Voltage LND REST endpoint that created **invoices** went away (every path returned 404), so buying credits failed. We now create and check invoices through the LNURL-pay server on tower that serves `pay@visibible.com`. The app holds no node credentials: the callback `LNURL_PAY_URL?amount=<msat>&comment=…` creates the invoice, and the public `LNURL_PAY_URL/check?id=<payment hash>` reports `OPEN`, `SETTLED`, `CANCELED` or `ACCEPTED` ([lightning.ts](../../src/lib/lightning.ts)).

## Consequences

- **Payment evidence is trusted, not authenticated.** `/check` takes no credentials, so a `SETTLED` answer is trusted because it comes over HTTPS from our own server. This is the same trust the app gave the LND REST endpoint.
- **The record's amount is the paid amount.** `/check` reports only a state, not an amount paid. The app rejects any invoice whose bolt11 amount differs from the credit bundle, and LND never settles a fixed-amount invoice for less. So a `SETTLED` invoice credits the record's `amountSats` ([invoice status route](../../src/app/api/invoice/[id]/route.ts)). An invoice server that allows underpayment would break this.
- **Invoice expiry comes from the bolt11.** Convex stores the invoice's own expiry (60 minutes on tower), not a fixed app window, so the purchase UI never hides an invoice that a wallet can still pay ([convex/invoices.ts](../../convex/invoices.ts)).
- **Every environment uses one node.** Local, preview and production all create real invoices on tower. Leave test invoices unpaid unless a real purchase is intended.
- **Tower's invoices have no `description_hash`.** LUD-06 expects one. Credit purchases don't depend on it, but strict wallets may refuse to pay `pay@visibible.com` directly. That is the tower operator's concern, not the app's.

Verified on 2026-10-14: a real $1 production credit purchase added 100 credits through one purchase ledger entry. Shipped in #115 and #117.
