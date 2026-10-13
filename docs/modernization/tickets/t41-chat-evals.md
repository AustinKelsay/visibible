# T41: Create repeatable Scripture chat evaluations

<!-- visibible-modernization:T41 -->

## Parent

[S10: Evidence-based model and prompt releases](https://github.com/AustinKelsay/visibible/issues/54)

## What to build

Reviewers can compare chat baselines and candidates with the committed release rubric.

## Acceptance criteria

- [ ] Commit at least 30 cases covering the categories and exact context/expected behavior required by the release guide.
- [ ] Implement a repeatable runner with fake-provider dry run, versioned inputs/judges, cost budget and machine-readable report.
- [ ] Score grounding, interpretation, tone and uncertainty; surface critical/minor failures and human review cases.
- [ ] Attach baseline/candidate procedure, quality thresholds and 24-hour monitoring/rollback fields without claiming unrun scores.

## Verification

Deterministic fake-provider pass/fail/timeout/budget tests and report-schema validation; live runs only with available authority and budget.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

No default change or paid evaluation run implied by this ticket.

## Blocked by

None (can start immediately).

## Traceability

Original backlog items: 73. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
