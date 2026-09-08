# T11: Credit settled invoices first observed after expiry

<!-- visibible-modernization:T11 -->

## Parent

[S03: Lightning purchases that settle without an open tab](https://github.com/AustinKelsay/visibible/issues/47)

## What to build

A guest who paid on time receives credits even when the first successful status check is late.

## Acceptance criteria

- [ ] Read and validate LND settlement before using local expiry to reject credit confirmation.
- [ ] Apply the rule consistently to status GET, explicit confirmation and internal finalization.
- [ ] Make invoice-paid and purchase credit addition atomic and uniquely keyed.
- [ ] Distinguish provider outage from unpaid/expired state; never grant credits from an unverified client report.
- [ ] Keep existing bundles and paid/admin tier behavior.

## Verification

Actual invoice/credit handlers with fake LND: settled before deadline but observed late, unpaid expired, outage, insufficient paid amount and concurrent duplicate confirmation.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

Independent hotfix; do not wait for the background worker or auth migration.

## Blocked by

None (can start immediately).

## Traceability

Original backlog items: 21, 24. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
