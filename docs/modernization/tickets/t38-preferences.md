# T38: Make preference hydration and persistence consistent

<!-- visibible-modernization:T38 -->

## Parent

[S09: Consistent reader controls and preferences](https://github.com/AustinKelsay/visibible/issues/53)

## What to build

A reader keeps valid translation/model/settings choices across refresh without conflicting storage copies.

## Acceptance criteria

- [ ] Use cookies as authority for server-visible translation/model preferences and versioned localStorage for client-only settings/boot hints.
- [ ] Migrate existing values and handle unavailable models/settings explicitly.
- [ ] Prevent hydration effects from reverting a user choice or triggering paid work.
- [ ] Preserve route refresh semantics only where server-visible content actually changes.

## Verification

Stale cookie/localStorage combinations, fresh browser, unavailable model, translation switch and rapid selection during hydration; verify rendered choices and next request settings.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

No cross-device preference sync.

## Blocked by

- [T03: Quote supported image settings from verified billing units](https://github.com/AustinKelsay/visibible/issues/59)

## Traceability

Original backlog items: 60. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
