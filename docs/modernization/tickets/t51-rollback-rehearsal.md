# T51: Rehearse rollback with active jobs and payments

<!-- visibible-modernization:T51 -->

## Parent

[S12: Verified migration and retirement of old implementations](https://github.com/AustinKelsay/visibible/issues/56)

## What to build

Operators can stop or roll back the replacement without losing new records or replaying completed work.

## Acceptance criteria

- [ ] Seed mixed executors, active jobs/holds, pending invoices, saved images and unresolved attempts.
- [ ] Rehearse stop admissions, drain/reconcile, switch reader/executor compatibility and restore operation visibility.
- [ ] Verify balances/receipts, image IDs/public contracts and publication records survive rollback.
- [ ] Record exact rollback conditions, steps, data compatibility limits and recovery outcomes.

## Verification

Executed synthetic/preview failure drill with reconciliation report and browser revisit; no completed provider call is repeated.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

Rollback cannot delete new ledger entries or pretend uncertain attempts never existed.

## Blocked by

- [T50: Switch new admissions without duplicating paid work](https://github.com/AustinKelsay/visibible/issues/106)
- [T31: Make bulk pause resume and cancel authoritative](https://github.com/AustinKelsay/visibible/issues/87)
- [T13: Reconcile Lightning invoices without browser polling](https://github.com/AustinKelsay/visibible/issues/69)
- [T44: Exercise private and financial Convex handlers directly](https://github.com/AustinKelsay/visibible/issues/100)

## Traceability

Original backlog items: 70, 84. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
