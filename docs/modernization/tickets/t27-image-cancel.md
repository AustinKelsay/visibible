# T27: Resolve image cancellation against durable completion

<!-- visibible-modernization:T27 -->

## Parent

[S05: Durable single-verse image generation](https://github.com/AustinKelsay/visibible/issues/49)

## What to build

A guest can cancel unfinished generation and receives an unambiguous saved/charged or cancelled/released result.

## Acceptance criteria

- [ ] Cancel pending steps and propagate supported provider cancellation.
- [ ] Use a transactional terminal decision for cancel racing saved success.
- [ ] If success committed first, return saved image and existing charge; otherwise release per policy and retain provider spend.
- [ ] Pending/uncertain cancellation is visible in controls and survives refresh.

## Verification

Cancel before provider, during generation, during storage and after terminal success; replay cancel and completion concurrently against real handlers.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

Cancellation cannot promise reversal of upstream provider charges.

## Blocked by

- [T26: Recover provider ambiguity and image storage failures](https://github.com/AustinKelsay/visibible/issues/82)

## Traceability

Original backlog items: 33, 36. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
