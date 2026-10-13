# T35: Bound publication impressions and measure reactive fan-out

<!-- visibible-modernization:T35 -->

## Parent

[S11: Trustworthy publication, operations and retention](https://github.com/AustinKelsay/visibible/issues/55)

## What to build

Publication ranking counts repeat views under an explicit rule without avoidable gallery recomputation.

## Acceptance criteria

- [ ] Count at most one eligible impression per authenticated guest/image/four-hour window and enforce a bounded write rate.
- [ ] Preserve public image browsing; unauthenticated views need not count toward ranking.
- [ ] Measure history/gallery invalidations at representative loads and move counters away from image records if needed.
- [ ] Document that guest uniqueness is an abuse control, not unique-human proof; keep ranking output inspectable.

## Verification

Repeated/simultaneous impressions, multiple images/windows, foreign IDs and load comparison before/after; attach measurements even if no counter move is warranted.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

No social voting or tracking of extra identifying data solely for perfect uniqueness.

## Blocked by

- [T07: Authenticate anonymous Convex access from valid sessions](https://github.com/AustinKelsay/visibible/issues/63)
- [T33: Browse paginated history without breaking image links](https://github.com/AustinKelsay/visibible/issues/89)

## Traceability

Original backlog items: 54, 55. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
