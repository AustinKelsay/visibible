# T42: Evaluate image quality and planner value

<!-- visibible-modernization:T42 -->

## Parent

[S10: Evidence-based model and prompt releases](https://github.com/AustinKelsay/visibible/issues/54)

## What to build

Reviewers can compare direct and planner-assisted images across Scripture genres.

## Acceptance criteria

- [ ] Commit at least 24 representative image cases with reference, translation, settings and expected visual behavior.
- [ ] Produce reports for relevance, clarity, artifacts/style, latency, provider/planner spend and failure rate.
- [ ] Support repeated samples, fixed inputs and budget enforcement; label undersampled comparison inconclusive.
- [ ] Provide human side-by-side review using stable output references rather than selecting only successful examples.

## Verification

Fake image/provider fixtures exercise reports, missing usage, planner failure, partial results and exhausted budget.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

No automatic removal of the planner or new style engine.

## Blocked by

None (can start immediately).

## Traceability

Original backlog items: 74. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
