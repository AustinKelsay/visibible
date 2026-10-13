# T34: Serve image counts and availability from bounded summaries

<!-- visibible-modernization:T34 -->

## Parent

[S08: Reliable shared image storage and bounded library reads](https://github.com/AustinKelsay/visibible/issues/52)

## What to build

Book menus and verse strips show accurate image counts without reading all image history.

## Acceptance criteria

- [ ] Maintain latest-image and count summaries during image insert/delete using the same transaction where feasible.
- [ ] Backfill in bounded repeatable batches while preserving stable IDs.
- [ ] Compare summary output against reference queries before switching book/chapter/verse consumers.
- [ ] Measure representative query reads and return sizes for large histories.

## Verification

Insert/delete/retry/backfill scenarios and reconciliation against source rows, plus menu/verse-strip behavior tests.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

No aggregation component required unless measurements justify it.

## Blocked by

- [T23: Save each generation once and retain its image identity](https://github.com/AustinKelsay/visibible/issues/79)

## Traceability

Original backlog items: 51. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
