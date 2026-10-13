# T15: Cancel chat safely through the provider and wallet

<!-- visibible-modernization:T15 -->

## Parent

[S04: Reliable Scripture chat with correct stream settlement](https://github.com/AustinKelsay/visibible/issues/48)

## What to build

Cancelling chat stops processing and settles the reservation once.

## Acceptance criteria

- [ ] Connect request cancellation to provider abort and the active stream reader.
- [ ] Resolve cancellation racing success according to the first recorded terminal outcome.
- [ ] Release holds for cancelled/error streams and retain known provider spend.
- [ ] Make disconnect/abort cleanup safe to repeat without hiding a failed release.

## Verification

Real SDK fake provider with cancellation before tokens, midstream and after success; assert cancellation signal and single final wallet effect.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

Provider-side cancellation is best-effort; do not claim it erases already incurred spend.

## Blocked by

- [T14: Release credits for embedded chat stream errors](https://github.com/AustinKelsay/visibible/issues/70)

## Traceability

Original backlog items: 18. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
