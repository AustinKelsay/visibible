# T12: Recover interrupted invoice creation

<!-- visibible-modernization:T12 -->

## Parent

[S03: Lightning purchases that settle without an open tab](https://github.com/AustinKelsay/visibible/issues/47)

## What to build

Retrying a purchase after a connection failure returns the known invoice or an explicit unresolved attempt.

## Acceptance criteria

- [ ] Persist owner, bundle, sats quote and stable creation intent before LND I/O.
- [ ] Verify whether deployed LND supports a stable lookup identity for safe creation recovery and implement that path when supported.
- [ ] Record results before returning BOLT11; repeated matching intents resolve to the same payable invoice.
- [ ] If provider creation is ambiguous and cannot be reconciled, return unresolved status and operator instructions rather than blindly creating another invoice.
- [ ] Validate hash/amount identity and keep sensitive provider fields out of client metadata/logs.

## Verification

Interrupt before provider call, after LND creation and after database save; test repeated and conflicting purchase intents with a fake LND adapter.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

The capability check must end in working recovery or explicit safe unresolved behavior, not an investigation-only note.

## Blocked by

- [T11: Credit settled invoices first observed after expiry](https://github.com/AustinKelsay/visibible/issues/67)

## Traceability

Original backlog items: 23. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
