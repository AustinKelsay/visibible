# T50: Switch new admissions without duplicating paid work

<!-- visibible-modernization:T50 -->

## Parent

[S12: Verified migration and retirement of old implementations](https://github.com/AustinKelsay/visibible/issues/56)

## What to build

Operators can send a bounded cohort of new image operations to the replacement while old work drains safely.

## Acceptance criteria

- [ ] Persist executor and policy version per operation and route retries to that same executor.
- [ ] Use one authoritative ledger and no dual execution or shadow paid calls.
- [ ] Provide a new-admission stop switch and a small session-cohort rollout control.
- [ ] Keep existing URLs/data readable across versions and expose old in-flight work until drained.

## Verification

Mixed old/new synthetic operations, switched routing during retry, stop/start admissions and existing balance checks.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

Deployment preparation only until preview/release gates pass; never backfill work by replaying provider calls.

## Blocked by

- [T49: Prove data export restore and reconciliation](https://github.com/AustinKelsay/visibible/issues/105)
- [T25: Complete one image through a durable Convex workflow](https://github.com/AustinKelsay/visibible/issues/81)

## Traceability

Original backlog items: 83. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
