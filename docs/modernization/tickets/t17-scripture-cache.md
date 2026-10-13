# T17: Bound chapter caching and concurrent lookup work

<!-- visibible-modernization:T17 -->

## Parent

[S07: Canonical Scripture and versioned scene plans](https://github.com/AustinKelsay/visibible/issues/51)

## What to build

Repeated reading uses a predictable chapter cache without unlimited process growth or duplicate in-flight fetches.

## Acceptance criteria

- [ ] Prefer the existing platform cache; retain a process layer only with demonstrated need.
- [ ] If retained, enforce 256-entry maximum and 24-hour TTL, with in-flight request deduplication.
- [ ] Bound external waits and represent retryable failures without caching them as valid empty chapters.
- [ ] Keep translation in cache identity and preserve existing successful passage output.

## Verification

Fake clock/provider tests for eviction, expiry, concurrent same-chapter calls, translation isolation and recovery after failure.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

No framework upgrade or new storage system required.

## Blocked by

- [T16: Resolve canonical passages and preserve unavailable locations](https://github.com/AustinKelsay/visibible/issues/72)

## Traceability

Original backlog items: 63. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
