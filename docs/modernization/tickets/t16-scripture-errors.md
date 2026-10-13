# T16: Resolve canonical passages and preserve unavailable locations

<!-- visibible-modernization:T16 -->

## Parent

[S07: Canonical Scripture and versioned scene plans](https://github.com/AustinKelsay/visibible/issues/51)

## What to build

A reader stays at the intended passage when text is unavailable and gets correct adjacent navigation.

## Acceptance criteria

- [ ] Consolidate book identity and reference/adjacency rules behind the existing Scripture interface.
- [ ] Distinguish invalid location, missing translation coverage and retryable upstream failure.
- [ ] Render retry/translation alternatives at the requested URL instead of redirecting failures to Genesis.
- [ ] Verify all selectable translations against representative missing-coverage and book-edge fixtures; document limitations.
- [ ] Preserve existing canonical URLs, scope semantics and first/last verse behavior.

## Verification

Scripture resolve/navigation tests and rendered error states for upstream timeout, missing translation, invalid reference and cross-book edges.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

No new corpus or translation. Replace duplicate metadata only where needed to keep one reference authority.

## Blocked by

None (can start immediately).

## Traceability

Original backlog items: 62, 64, 65. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
