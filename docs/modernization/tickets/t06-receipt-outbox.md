# T06: Finalize credits and durable cost reporting together

<!-- visibible-modernization:T06 -->

## Parent

[S01: Accurate quotes and auditable credit charges](https://github.com/AustinKelsay/visibible/issues/45)

## What to build

An operator can recover one complete settlement receipt and cost projection after a crash.

## Acceptance criteria

- [ ] Atomically persist wallet effect, immutable receipt and outbox intent keyed to the operation.
- [ ] Store provider spend, planner spend, estimate, hold, charged credits, released credits and absorbed shortfall separately with usage provenance.
- [ ] Project to Neutral Cost through atomic deduplication; replay and concurrent workers cannot create duplicate events.
- [ ] Expose pending/failed delivery with bounded retries; known zero is not missing usage.
- [ ] Record provider corrections separately without reopening settled guest charges.

## Verification

Crash after settlement before delivery, double processing, provider success with unusable plan, missing usage and projection outage against real settlement/delivery handlers.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

Neutral Cost remains a reporting projection. Do not create a second authoritative wallet.

## Blocked by

- [T04: Show and enforce a maximum charge for paid work](https://github.com/AustinKelsay/visibible/issues/60)

## Traceability

Original backlog items: 8, 9, 15, 16. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
