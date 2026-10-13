# T23: Save each generation once and retain its image identity

<!-- visibible-modernization:T23 -->

## Parent

[S08: Reliable shared image storage and bounded library reads](https://github.com/AustinKelsay/visibible/issues/52)

## What to build

Repeated image-save processing produces one durable image row and a stable lookup result.

## Acceptance criteria

- [ ] Move generation uniqueness check into the insertion mutation.
- [ ] Keep saved-image identity and provenance stable across retried actions.
- [ ] Separate storage persistence from unrelated library-query logic only as needed for a clear save/read interface.
- [ ] Detect orphaned blobs safely; any cleanup is bounded and verifies absence of references.

## Verification

Concurrent saves with same generation ID against actual insertion handlers; duplicate/retry returns same image, different generations remain distinct.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

No library pagination or deletion of legacy images.

## Blocked by

None (can start immediately).

## Traceability

Original backlog items: 37, 52. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
