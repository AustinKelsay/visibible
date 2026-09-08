# T43: Select model defaults from measured comparisons

<!-- visibible-modernization:T43 -->

## Parent

[S10: Evidence-based model and prompt releases](https://github.com/AustinKelsay/visibible/issues/54)

## What to build

A default-model decision is backed by comparable evidence and a working rollback configuration.

## Acceptance criteria

- [ ] Compare current defaults and eligible candidates using committed cases and identical settings.
- [ ] Record quality, latency, actual cost, failure rate and estimate variance; retain baseline if evidence does not justify change.
- [ ] Verify provider/API capability compatibility before switching transport or models.
- [ ] For any release attach required failed-case review, risks, exact rollback and first-24-hour owner; an evidence-backed no-change result is a valid completed outcome.

## Verification

Dry-run config selection/rollback; baseline/candidate live reports only after budget/credentials are established. Do not close with fabricated or unexecuted evidence.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

No blanket latest-model upgrade or self-approved theological evaluation.

## Blocked by

- [T41: Create repeatable Scripture chat evaluations](https://github.com/AustinKelsay/visibible/issues/97)
- [T42: Evaluate image quality and planner value](https://github.com/AustinKelsay/visibible/issues/98)
- [T03: Quote supported image settings from verified billing units](https://github.com/AustinKelsay/visibible/issues/59)

## Traceability

Original backlog items: 75. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
