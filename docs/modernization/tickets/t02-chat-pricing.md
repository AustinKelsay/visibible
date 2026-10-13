# T02: Correct chat and planner price units

<!-- visibible-modernization:T02 -->

## Parent

[S01: Accurate quotes and auditable credit charges](https://github.com/AustinKelsay/visibible/issues/45)

## What to build

A chat or planner quote uses correct provider units in normal and catalog-outage conditions.

## Acceptance criteria

- [ ] Normalize live and emergency prices to one explicit per-token representation and remove duplicate per-million conversion.
- [ ] Use a shared validated monetary calculation for chat/planner quotes and metadata; keep one-credit minimum and 25% markup.
- [ ] Reject negative/nonfinite/malformed rates; distinguish known free usage from missing information.
- [ ] A fixture with USD 0.00001 per token and 1000 input plus 1000 output produces USD 0.02 and three credits; fallback mode uses the same units.
- [ ] Do not reprice historical charges or alter the default chat model.

## Verification

Realistic catalog fixtures through quote and chat request paths, including free/missing prices, very small costs, outage fallback and overflow cases.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

Immediate correctness repair on current execution; durable receipts and new chat max-charge UI follow separately.

## Blocked by

None (can start immediately).

## Traceability

Original backlog items: 1, 2, 4, 5, 14, 67. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
