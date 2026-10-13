# T39: Separate welcome purchase and admin states

<!-- visibible-modernization:T39 -->

## Parent

[S09: Consistent reader controls and preferences](https://github.com/AustinKelsay/visibible/issues/53)

## What to build

A guest completes welcome or a Lightning purchase without unrelated modal state interfering.

## Acceptance criteria

- [ ] Separate welcome, bundle choice, invoice status and admin access behind small UI interfaces.
- [ ] Migrate both old welcome flags to one completed state without re-showing onboarding to existing readers.
- [ ] Use authorized reactive invoice/balance state with clear late-check/unavailable/paid states.
- [ ] Preserve Browse for Free, existing bundles and current visual layout.

## Verification

New/existing guest welcome, free-browse exit, create/pay/close/reopen invoice, expired access and admin flow; screenshots at mobile/desktop sizes.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

No change to when welcome appears and no new sales funnel.

## Blocked by

- [T13: Reconcile Lightning invoices without browser polling](https://github.com/AustinKelsay/visibible/issues/69)
- [T10: Keep credit balances consistent across tabs](https://github.com/AustinKelsay/visibible/issues/66)

## Traceability

Original backlog items: 61. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
