# T29: Create and schedule whole-book queues within limits

<!-- visibible-modernization:T29 -->

## Parent

[S06: Bulk generation managed by the server](https://github.com/AustinKelsay/visibible/issues/50)

## What to build

A whole-book bulk job is created and scheduled without oversized transactions or excessive provider concurrency.

## Acceptance criteria

- [ ] Build queue in bounded separate transactions with resumable checkpoints; execution waits for complete queue assembly.
- [ ] Enforce one canonical book maximum, one active/paused job per guest and documented global/per-guest concurrency.
- [ ] Validate input size/count server-side and keep quotas/admin rate rules in force.
- [ ] Recover interrupted queue construction without duplicate/missing items or incorrect initial counts.

## Verification

Create largest book with fake provider; inspect transaction sizes, restart mid-build, repeat creation and run multiple guests under configured capacity.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

No new bulk scope or per-guest parallelism beyond the initial one-active-item rule.

## Blocked by

- [T28: Run a small bulk job entirely on the server](https://github.com/AustinKelsay/visibible/issues/84)

## Traceability

Original backlog items: 43, 44. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
