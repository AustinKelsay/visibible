# T10: Keep credit balances consistent across tabs

<!-- visibible-modernization:T10 -->

## Parent

[S02: Verified guest access and protected credit ownership](https://github.com/AustinKelsay/visibible/issues/46)

## What to build

Two open views immediately show the authoritative balance after a purchase, reservation, charge or refund.

## Acceptance criteria

- [ ] Use one authenticated Convex balance query as the UI authority.
- [ ] Remove local balance subtraction and periodic balance refetch from single/bulk/chat/purchase callers as they use this interface.
- [ ] Represent loading, expired access and pending holds distinctly.
- [ ] Preserve free-browse behavior when private identity is unavailable.

## Verification

Two-tab browser scenario plus actual ledger mutations; compare displayed balances after overlapping purchase and generation events.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

No visual redesign or new payment behavior.

## Blocked by

- [T08: Enforce ownership on private records and job controls](https://github.com/AustinKelsay/visibible/issues/64)

## Traceability

Original backlog items: 30. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
