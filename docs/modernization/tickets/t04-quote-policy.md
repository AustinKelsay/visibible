# T04: Show and enforce a maximum charge for paid work

<!-- visibible-modernization:T04 -->

## Parent

[S01: Accurate quotes and auditable credit charges](https://github.com/AustinKelsay/visibible/issues/45)

## What to build

A guest accepts a versioned estimate and maximum charge, then sees a reservation that matches that authorization.

## Acceptance criteria

- [ ] Persist quote fingerprint/version and five-minute expiry; reject stale or mismatched acceptance before provider work.
- [ ] Show estimate and maximum in single-generation controls and chat admission; reserve the accepted maximum once.
- [ ] Use capped actual-usage settlement for new-policy operations; missing usage uses the accepted estimate and remains labeled estimated.
- [ ] Preserve positive-balance five-credit explicit-image grace with hold/max capped to balance; automatic generation requires full estimated affordability.
- [ ] Enforce actual input/output bounds and separate provider exposure from customer billing, including concurrent requests and daily reset.

## Verification

Quote -> accept -> reserve -> finish/release tests through existing entry points; test expiry, tampering, grace, changed catalog, cap breach and midnight release.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

Keep existing operation policy version for in-flight work; no automatic top-up debit or historical repricing.

## Blocked by

- [T02: Correct chat and planner price units](https://github.com/AustinKelsay/visibible/issues/58)
- [T03: Quote supported image settings from verified billing units](https://github.com/AustinKelsay/visibible/issues/59)

## Traceability

Original backlog items: 4, 6, 8, 10, 11. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
