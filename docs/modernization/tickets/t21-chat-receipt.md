# T21: Attach durable quotes and receipts to chat turns

<!-- visibible-modernization:T21 -->

## Parent

[S04: Reliable Scripture chat with correct stream settlement](https://github.com/AustinKelsay/visibible/issues/48)

## What to build

A completed or failed chat turn has one durable receipt matching its displayed charge.

## Acceptance criteria

- [ ] Accept the versioned chat quote before provider work and carry stable operation identity through streaming.
- [ ] Finalize actual-usage capped charge or release through the shared wallet/receipt interface.
- [ ] Record provider costs for failures and label estimated cost when usage is absent.
- [ ] Return receipt identity and final charge in metadata; no duplicate billing on terminal callbacks.

## Verification

Stream success/error/cancel with changing catalog, missing usage, projection failure and duplicate callbacks; compare UI metadata with immutable receipt.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

No persisted message content required; retain only the usage and outcome metadata needed for this contract.

## Blocked by

- [T20: Bound chat input and keep system instructions server-owned](https://github.com/AustinKelsay/visibible/issues/76)
- [T06: Finalize credits and durable cost reporting together](https://github.com/AustinKelsay/visibible/issues/62)

## Traceability

Original backlog items: 8, 10, 20. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
