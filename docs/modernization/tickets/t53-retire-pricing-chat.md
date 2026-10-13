# T53: Retire duplicated pricing and chat settlement paths

<!-- visibible-modernization:T53 -->

## Parent

[S12: Verified migration and retirement of old implementations](https://github.com/AustinKelsay/visibible/issues/56)

## What to build

Chat and image charges use the same supported price and settlement policy without orphaning old financial records.

## Acceptance criteria

- [ ] Inventory remaining quote and settlement callers; migrate any old-policy read adapter before removing duplicate logic.
- [ ] Delete replaced price conversions, ad hoc cost reporting and obsolete chat settlement branches only after all new callers use shared policy.
- [ ] Retain historical policy interpretation and reconciliation of unresolved legacy holds; prove no active operation needs removed execution code.
- [ ] Verify chat success/error/cancel, image rounding and duplicate settlement with one authoritative wallet.

## Verification

Financial fixture regression and caller inventory; compare recorded charges and provider spend before and after retirement.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

Only pricing and chat contract cleanup; no historical repricing, financial record deletion or image-executor rewrite.

## Blocked by

- [T51: Rehearse rollback with active jobs and payments](https://github.com/AustinKelsay/visibible/issues/107)
- [T21: Attach durable quotes and receipts to chat turns](https://github.com/AustinKelsay/visibible/issues/77)
- [T05: Use fresh cost samples and explicit estimate backfill](https://github.com/AustinKelsay/visibible/issues/61)

## Traceability

Original backlog items: 85. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
