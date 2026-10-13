# T26: Recover provider ambiguity and image storage failures

<!-- visibible-modernization:T26 -->

## Parent

[S05: Durable single-verse image generation](https://github.com/AustinKelsay/visibible/issues/49)

## What to build

An interrupted generation is reconciled from its recorded attempt rather than silently generating another paid image.

## Acceptance criteria

- [ ] Record attempt identity before provider call and persist response ID/usage/output as soon as possible.
- [ ] Reconcile known provider outcomes using verified capabilities; unresolved attempts enter uncertain without automatic paid retry.
- [ ] Retry saving existing output without regeneration; expose actionable persistence/uncertain status.
- [ ] After the 30-minute unresolved customer hold limit, release once and retain reconciliation evidence; late cost discovery cannot reopen the guest debit.
- [ ] Retain dedupe identity after diagnostic data is archived.

## Verification

Failure injection after provider success before local acknowledgement, after output save before finalization, lost storage response and delayed provider lookup.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

No exactly-once claim for external providers that lack verifiable idempotency.

## Blocked by

- [T25: Complete one image through a durable Convex workflow](https://github.com/AustinKelsay/visibible/issues/81)

## Traceability

Original backlog items: 35, 38, 70. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
