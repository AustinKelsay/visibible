# T19: Reuse only compatible scene plans

<!-- visibible-modernization:T19 -->

## Parent

[S07: Canonical Scripture and versioned scene plans](https://github.com/AustinKelsay/visibible/issues/51)

## What to build

A guest gets a cached plan only when canonical inputs and prompt/model/style versions match.

## Acceptance criteria

- [ ] Extract bounded prompt construction and plan normalization behind the generation module.
- [ ] Key cache by passage fingerprint, translation and relevant planner/prompt/style/theme/continuity versions.
- [ ] Separate cache query from optional hit accounting; old incompatible entries miss safely.
- [ ] Keep classical style, existing prompt limits and variation intent as the evaluation baseline.

## Verification

Cache hit/miss behavior for each version/input change, malformed planner output and empty/oversized fields; compare bounded prompt output on existing fixtures.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

Any changed artistic output must also satisfy the model-quality release spec.

## Blocked by

- [T18: Build shared images from verified Scripture text](https://github.com/AustinKelsay/visibible/issues/74)

## Traceability

Original backlog items: 46, 47. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
