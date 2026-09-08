# T45: Inspect durable unresolved work and financial outcomes

<!-- visibible-modernization:T45 -->

## Parent

[S11: Trustworthy publication, operations and retention](https://github.com/AustinKelsay/visibible/issues/55)

## What to build

An operator can see unresolved jobs/payments and spending totals after server restart.

## Acceptance criteria

- [ ] Provide authenticated bounded queries for unresolved generation attempts, payment checks and receipt delivery.
- [ ] Show provider spend, charges and shortfall totals with missing/estimated usage clearly separated.
- [ ] Supplement process counters with suitable aggregate metrics/log storage; label local diagnostics honestly.
- [ ] Add age/attempt thresholds that identify actionable failures without exposing guest secrets or raw keys.

## Verification

Restart process, inject failed delivery and payment/provider outage, and verify durable operator results; reject unauthorized access.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

A focused operational view/query is sufficient; no general analytics warehouse.

## Blocked by

- [T13: Reconcile Lightning invoices without browser polling](https://github.com/AustinKelsay/visibible/issues/69)
- [T26: Recover provider ambiguity and image storage failures](https://github.com/AustinKelsay/visibible/issues/82)

## Traceability

Original backlog items: 76, 77. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
