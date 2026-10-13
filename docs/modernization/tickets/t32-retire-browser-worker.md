# T32: Remove browser bulk leases and local counters

<!-- visibible-modernization:T32 -->

## Parent

[S06: Bulk generation managed by the server](https://github.com/AustinKelsay/visibible/issues/50)

## What to build

The bulk UI observes server jobs without managing work locks or subtracting credits.

## Acceptance criteria

- [ ] Remove browser runner, localStorage lease, BroadcastChannel takeover and heartbeat code once caller inventory confirms server execution.
- [ ] Use authorized reactive job/item/balance queries and small command handlers.
- [ ] Preserve bulk scope panel and current progress/error affordances.
- [ ] Migrate/reconcile legacy active jobs before deleting the old runner; do not start both executors.

## Verification

Browser closes/reopens across jobs; two tabs observe identical state; existing panel scope tests and server recovery tests remain green.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

Contract step: blocked until the replacement controls and authoritative balance are working.

## Blocked by

- [T31: Make bulk pause resume and cancel authoritative](https://github.com/AustinKelsay/visibible/issues/87)
- [T10: Keep credit balances consistent across tabs](https://github.com/AustinKelsay/visibible/issues/66)

## Traceability

Original backlog items: 40. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
