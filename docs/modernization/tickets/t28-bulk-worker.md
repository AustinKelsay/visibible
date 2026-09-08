# T28: Run a small bulk job entirely on the server

<!-- visibible-modernization:T28 -->

## Parent

[S06: Bulk generation managed by the server](https://github.com/AustinKelsay/visibible/issues/50)

## What to build

A guest starts a short next-verses job and it finishes while all browser tabs are closed.

## Acceptance criteria

- [ ] Generate every item through the single-generation interface with deterministic job/item intent IDs.
- [ ] Allow only authenticated job commands from clients; worker outcomes update item and parent counters atomically.
- [ ] Begin with one active item per guest and bounded global worker concurrency.
- [ ] Persist accepted per-item max charge and aggregate spending authorization without upfront bulk debit; pause for renewed authorization if a later quote exceeds either limit.
- [ ] Show accurate reactive progress and result links.

## Verification

Start three verses, close tab, run fake worker effects and reopen; assert item/parent totals, one generation per item and no client-owned result writes.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

Preserve existing scope semantics; large queue creation and robust controls have separate tickets.

## Blocked by

- [T27: Resolve image cancellation against durable completion](https://github.com/AustinKelsay/visibible/issues/83)
- [T08: Enforce ownership on private records and job controls](https://github.com/AustinKelsay/visibible/issues/64)

## Traceability

Original backlog items: 27, 39. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
