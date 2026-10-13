# T05: Use fresh cost samples and explicit estimate backfill

<!-- visibible-modernization:T05 -->

## Parent

[S01: Accurate quotes and auditable credit charges](https://github.com/AustinKelsay/visibible/issues/45)

## What to build

Guests receive estimates with defensible sample provenance; operators backfill estimates explicitly.

## Acceptance criteria

- [ ] Use at most 30 recent actual samples, a five-sample minimum and a 30-day freshness limit with model/settings normalization.
- [ ] Return source, sample count, age and confidence with learned estimates; fallback estimates never imply a guaranteed provider maximum.
- [ ] Remove backfill writes from model-choice GET handling.
- [ ] Provide a bounded resumable backfill with dry run, deterministic ordering and repeat-safe sample identity.

## Verification

Test aged samples, sparse model/provider/global buckets, changed resolution support, duplicated history and repeated backfill; model browsing must perform no backfill mutation.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

No new statistical model beyond the specified recent percentile approach.

## Blocked by

- [T03: Quote supported image settings from verified billing units](https://github.com/AustinKelsay/visibible/issues/59)

## Traceability

Original backlog items: 12, 13. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
