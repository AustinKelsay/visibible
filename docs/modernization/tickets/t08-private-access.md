# T08: Enforce ownership on private records and job controls

<!-- visibible-modernization:T08 -->

## Parent

[S02: Verified guest access and protected credit ownership](https://github.com/AustinKelsay/visibible/issues/46)

## What to build

Guests can access their own credit, invoice and bulk records while foreign identifiers grant no access.

## Acceptance criteria

- [ ] Inventory every exported Convex function and classify it public, guest-owned or internal/server-only.
- [ ] Migrate private reads and controls to server-derived subject ownership; reject caller SID as proof.
- [ ] Preserve server-side payment/generation callers through scoped authenticated interfaces.
- [ ] Keep public image API projections unchanged; exclude private session and invoice data.
- [ ] Check job mutation ownership and expiry through the same identity rule.

## Verification

Two guests plus unauthenticated client call actual handlers with known foreign IDs; verify denial for balance, history, invoice and bulk controls, and continued public browsing.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

Bulk outcome/counter writes become worker-only in the bulk-execution ticket; this slice closes identity gaps first.

## Blocked by

- [T07: Authenticate anonymous Convex access from valid sessions](https://github.com/AustinKelsay/visibible/issues/63)

## Traceability

Original backlog items: 26, 27. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
