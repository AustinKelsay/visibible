# T46: Distinguish readiness from observed dependency health

<!-- visibible-modernization:T46 -->

## Parent

[S11: Trustworthy publication, operations and retention](https://github.com/AustinKelsay/visibible/issues/55)

## What to build

Operators know whether the app is configured and whether dependencies were actually observed working.

## Acceptance criteria

- [ ] Keep public liveness/readiness output minimal and detailed diagnostics authenticated.
- [ ] Separate configuration checks from last-success dependency observations, with timestamp and stale status.
- [ ] Use bounded background non-billable checks where useful; no paid generation from health endpoints.
- [ ] Return useful outage/unknown states without disclosing credentials or private deployment internals.

## Verification

Unauthorized detail access, missing configuration, provider/LND outage, stale observation and process restart using fake probes.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

No promise that a configuration-only check verifies provider availability.

## Blocked by

None (can start immediately).

## Traceability

Original backlog items: 78. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
