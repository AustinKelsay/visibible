# T25: Complete one image through a durable Convex workflow

<!-- visibible-modernization:T25 -->

## Parent

[S05: Durable single-verse image generation](https://github.com/AustinKelsay/visibible/issues/49)

## What to build

A guest starts one default-model generation and can reopen its saved result and settled receipt after disconnection.

## Acceptance criteria

- [ ] Atomically accept operation/quote/reservation and schedule one workflow using stable operation identity.
- [ ] Pass IDs rather than image bytes through the workflow journal; run external effects only in steps.
- [ ] Persist output before terminal success; finalize saved image link and charge once.
- [ ] Expose reactive accepted/planning/generating/saving/success/failure state and addressable result.
- [ ] Use current default provider transport first and disable automatic retry of ambiguous paid actions.

## Verification

One-verse preview demo plus real handler tests with fake effects; disconnect after acceptance and verify saved image/receipt without another HTTP generation request.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

Keep the slice to one configured model and happy path plus safe terminal failure; broad recovery/cancellation follow in explicit dependent tickets.

## Blocked by

- [T07: Authenticate anonymous Convex access from valid sessions](https://github.com/AustinKelsay/visibible/issues/63)
- [T22: Deduplicate image requests and guard terminal states](https://github.com/AustinKelsay/visibible/issues/78)
- [T23: Save each generation once and retain its image identity](https://github.com/AustinKelsay/visibible/issues/79)
- [T24: Constrain remote image storage fetches](https://github.com/AustinKelsay/visibible/issues/80)
- [T19: Reuse only compatible scene plans](https://github.com/AustinKelsay/visibible/issues/75)
- [T06: Finalize credits and durable cost reporting together](https://github.com/AustinKelsay/visibible/issues/62)

## Traceability

Original backlog items: 34, 36. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
