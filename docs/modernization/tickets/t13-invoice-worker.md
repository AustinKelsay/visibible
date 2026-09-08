# T13: Reconcile Lightning invoices without browser polling

<!-- visibible-modernization:T13 -->

## Parent

[S03: Lightning purchases that settle without an open tab](https://github.com/AustinKelsay/visibible/issues/47)

## What to build

A completed payment updates the guest balance even while every browser tab is closed.

## Acceptance criteria

- [ ] Schedule bounded server reconciliation from recorded invoice intents; validate execution-environment LND reachability.
- [ ] Use direct server adapter or a narrowly authenticated bridge if required; no browser-driven settlement dependency.
- [ ] Apply pending polling/backoff and historical locally-expired sweep from S03; expose unresolved age and retry status.
- [ ] Reuse atomic confirmation and never issue a second purchase credit.
- [ ] Keep invoice expiry display separate from verified settled truth.

## Verification

Close browser, settle fake LND invoice, advance scheduler, reopen; test outages, restart, backoff and late historical settlement.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

No broader LND privileges, real-money test requirement or public payment callback without authentication.

## Blocked by

- [T12: Recover interrupted invoice creation](https://github.com/AustinKelsay/visibible/issues/68)

## Traceability

Original backlog items: 22. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
