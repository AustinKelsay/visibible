# T30: Recover interrupted bulk items from generation truth

<!-- visibible-modernization:T30 -->

## Parent

[S06: Bulk generation managed by the server](https://github.com/AustinKelsay/visibible/issues/50)

## What to build

A restarted job resolves abandoned generating items and continues without repeating completed work.

## Acceptance criteria

- [ ] Reconcile each abandoned claim against linked generation state/result.
- [ ] Finalize counters once for completed/failed items and preserve uncertain attempts for safe resolution.
- [ ] Prevent a stale worker from overwriting a newer or terminal item outcome.
- [ ] Expose recovery status instead of leaving a permanent generating spinner.

## Verification

Crash before generation, after saved image, after settlement and before parent counter update; restart and verify exact totals and no additional provider call.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

No blind requeue of uncertain paid attempts.

## Blocked by

- [T28: Run a small bulk job entirely on the server](https://github.com/AustinKelsay/visibible/issues/84)

## Traceability

Original backlog items: 41, 70. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
