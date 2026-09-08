# T49: Prove data export restore and reconciliation

<!-- visibible-modernization:T49 -->

## Parent

[S12: Verified migration and retirement of old implementations](https://github.com/AustinKelsay/visibible/issues/56)

## What to build

An operator can restore a representative pre-migration dataset and verify its balances and public identities.

## Acceptance criteria

- [ ] Create a documented protected export/restore procedure that identifies the intended environment.
- [ ] Use synthetic sessions, ledger, images, active reservations, pending invoices and Nostr records for a repeatable rehearsal.
- [ ] Compare balance totals, invoice identity, image URLs/IDs and publication IDs before/after.
- [ ] Keep export artifacts containing real private data outside tracked planning files; any live access needs established environment authority.

## Verification

Execute synthetic restore and reconciliation; inject an omitted record and verify the report fails.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

No production export, destructive restore or real secret values in this planning program.

## Blocked by

- [T01: Capture existing behavior and expose coverage gaps](https://github.com/AustinKelsay/visibible/issues/57)

## Traceability

Original backlog items: 82. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
