# T31: Make bulk pause resume and cancel authoritative

<!-- visibible-modernization:T31 -->

## Parent

[S06: Bulk generation managed by the server](https://github.com/AustinKelsay/visibible/issues/50)

## What to build

A guest controls future bulk work reliably across refresh and multiple tabs.

## Acceptance criteria

- [ ] Pause prevents new claims while showing the in-flight item until completion.
- [ ] Cancel prevents future work and clearly reports any current item outcome under the generation contract.
- [ ] Insufficient credits pauses for explicit resume; throttling records retry-after and prevents early restart.
- [ ] Resuming reuses pending items and accepted authorization, refreshing it when required.
- [ ] Counters and total charge always derive from item receipts, never client supplied totals.

## Verification

Two-tab controls, pause/cancel racing claim, low-credit purchase/resume, retry-after and repeated commands against actual job handlers.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

No automatic spending increase on resume.

## Blocked by

- [T30: Recover interrupted bulk items from generation truth](https://github.com/AustinKelsay/visibible/issues/86)
- [T29: Create and schedule whole-book queues within limits](https://github.com/AustinKelsay/visibible/issues/85)

## Traceability

Original backlog items: 42. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
