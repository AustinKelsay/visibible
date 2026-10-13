# T01: Capture existing behavior and expose coverage gaps

<!-- visibible-modernization:T01 -->

## Parent

[S12: Verified migration and retirement of old implementations](https://github.com/AustinKelsay/visibible/issues/56)

## What to build

A maintainer can run an acceptance inventory and see which production modules are covered before replacing behavior.

## Acceptance criteria

- [ ] Record current reader/gallery/deep-link, translation, free-browse, credit, payment, API and Nostr contracts; identify accepted defects separately from behavior to preserve.
- [ ] Include relevant production implementations in coverage; publish the newly visible baseline and preserve existing thresholds through explicit scoped ratchets rather than claiming the old percentage covers all files.
- [ ] Replace at least one high-value source-string assertion with an equivalent rendered behavior check to establish reusable prior art.
- [ ] Keep this slice limited to inventory, coverage configuration and the example behavior test; do not rewrite application flows.

## Verification

Run routine repo checks and prove an unimported central module appears in the coverage report. Demonstrate the example behavior regression fails when the behavior is intentionally broken.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

No blanket dependency on this ticket for urgent correctness fixes; later migration verification consumes its inventory.

## Blocked by

None (can start immediately).

## Traceability

Original backlog items: 71, 72, 81. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
