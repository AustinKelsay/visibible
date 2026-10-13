# T52: Retire replaced image executors after old work drains

<!-- visibible-modernization:T52 -->

## Parent

[S12: Verified migration and retirement of old implementations](https://github.com/AustinKelsay/visibible/issues/56)

## What to build

Maintainers have one supported image executor and retain safe lookup of historical and unresolved operations.

## Acceptance criteria

- [ ] Inventory legacy image route callers, active operations and replay needs; record zero remaining execution dependencies before deletion.
- [ ] Remove superseded image orchestration and browser worker adapters while keeping public admission and historical lookup contracts.
- [ ] Remove only mocks and helpers exclusive to that executor; preserve uncertainty records, receipts and stable image identifiers.
- [ ] Run single-image and bulk recovery cases against the retained executor, including revisits to old image URLs.

## Verification

Caller inventory plus image and bulk acceptance/recovery tests; lint and type checks remain green.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

Only image execution retirement. Do not remove wallet, library, preferences or historical record compatibility.

## Blocked by

- [T51: Rehearse rollback with active jobs and payments](https://github.com/AustinKelsay/visibible/issues/107)
- [T32: Remove browser bulk leases and local counters](https://github.com/AustinKelsay/visibible/issues/88)

## Traceability

Original backlog items: 85. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
