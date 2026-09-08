# T44: Exercise private and financial Convex handlers directly

<!-- visibible-modernization:T44 -->

## Parent

[S12: Verified migration and retirement of old implementations](https://github.com/AustinKelsay/visibible/issues/56)

## What to build

The core ownership and financial tests use real handlers instead of a second handwritten billing implementation.

## Acceptance criteria

- [ ] Cover session ownership, invoice confirmation, quote reservation, settlement receipt and outbox invariants using actual handlers.
- [ ] Replace business-rule duplication in route mocks with thin adapter fakes or shared handler harnesses.
- [ ] Exercise concurrent confirmation/reservation/release and rollback-on-error semantics with a suitable Convex test environment.
- [ ] Keep fast pure arithmetic tests and clearly separate fake-runtime checks from deployment-level concurrency guarantees.

## Verification

Introduce intentional ownership/double-charge regression to confirm tests fail; run relevant API/session suites and documented runtime checks.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

Image and bulk handler tests live with their implementation tickets; do not postpone those tests until this integration ticket.

## Blocked by

- [T08: Enforce ownership on private records and job controls](https://github.com/AustinKelsay/visibible/issues/64)
- [T11: Credit settled invoices first observed after expiry](https://github.com/AustinKelsay/visibible/issues/67)
- [T06: Finalize credits and durable cost reporting together](https://github.com/AustinKelsay/visibible/issues/62)

## Traceability

Original backlog items: 24, 69, 70. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
