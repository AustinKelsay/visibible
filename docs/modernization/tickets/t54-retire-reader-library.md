# T54: Retire replaced reader state and library queries

<!-- visibible-modernization:T54 -->

## Parent

[S12: Verified migration and retirement of old implementations](https://github.com/AustinKelsay/visibible/issues/56)

## What to build

Reader controls and image history use the replacement state and bounded queries with existing URLs intact.

## Acceptance criteria

- [ ] Confirm all reader/gallery callers use the shared generation command and canonical preferences.
- [ ] Remove superseded local state/event plumbing, unbounded library queries and compatibility code with no remaining supported callers.
- [ ] Retain preference migration and old image deep-link resolution for existing readers; inventory required adapters explicitly.
- [ ] Verify navigation, gallery pages, preferences, responsive controls and live image arrival after removal.

## Verification

Browser acceptance scenarios plus stable public image responses and bounded query assertions; capture visible regression evidence.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

Only reader and library retirement; no changes to the supported public URL contract or removal of persisted images.

## Blocked by

- [T51: Rehearse rollback with active jobs and payments](https://github.com/AustinKelsay/visibible/issues/107)
- [T40: Protect reader interaction through behavior tests](https://github.com/AustinKelsay/visibible/issues/96)
- [T34: Serve image counts and availability from bounded summaries](https://github.com/AustinKelsay/visibible/issues/90)

## Traceability

Original backlog items: 85. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
