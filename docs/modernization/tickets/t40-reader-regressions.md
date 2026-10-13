# T40: Protect reader interaction through behavior tests

<!-- visibible-modernization:T40 -->

## Parent

[S09: Consistent reader controls and preferences](https://github.com/AustinKelsay/visibible/issues/53)

## What to build

A maintainer can refactor reader internals while tests protect the interactions readers actually use.

## Acceptance criteria

- [ ] Cover keyboard/touch navigation, Escape order, focus restoration and fullscreen across reader/gallery.
- [ ] Protect deep links, image selection and passive loading/error behavior on narrow/wide layouts.
- [ ] Replace corresponding source-text assertions only after behavior coverage exists.
- [ ] Record visual checks and fix regressions introduced by replacement, keeping established design.

## Verification

Browser acceptance suite with deterministic Scripture/image fixtures and no paid provider calls; demonstrate failures for broken interaction contracts.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

Test slice limited to reader interactions, not broad snapshot coverage of every component.

## Blocked by

- [T37: Use one generation interface in reader gallery and header](https://github.com/AustinKelsay/visibible/issues/93)
- [T38: Make preference hydration and persistence consistent](https://github.com/AustinKelsay/visibible/issues/94)

## Traceability

Original backlog items: 71, 81. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
