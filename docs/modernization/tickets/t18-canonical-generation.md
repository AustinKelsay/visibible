# T18: Build shared images from verified Scripture text

<!-- visibible-modernization:T18 -->

## Parent

[S07: Canonical Scripture and versioned scene plans](https://github.com/AustinKelsay/visibible/issues/51)

## What to build

An image request always uses the verse and translation it declares, even if an older client sends conflicting text.

## Acceptance criteria

- [ ] Resolve current and adjacent text server-side from canonical reference/translation.
- [ ] Treat client-supplied text as nonauthoritative compatibility input and prevent it from entering a shared scene cache.
- [ ] Reject invalid or unavailable paid passages before reservation/provider work.
- [ ] Return canonical provenance with successful generation metadata.

## Verification

Request-path tests for valid reference with altered text, wrong adjacent context, missing translation and lookup outage; inspect provider prompt and cache inputs.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

No custom text generation mode or intentional prompt redesign.

## Blocked by

- [T16: Resolve canonical passages and preserve unavailable locations](https://github.com/AustinKelsay/visibible/issues/72)

## Traceability

Original backlog items: 45. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
