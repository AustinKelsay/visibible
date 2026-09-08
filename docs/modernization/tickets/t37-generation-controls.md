# T37: Use one generation interface in reader gallery and header

<!-- visibible-modernization:T37 -->

## Parent

[S09: Consistent reader controls and preferences](https://github.com/AustinKelsay/visibible/issues/53)

## What to build

Guests can start and recover a generation from the available verse controls without requiring HeroImage to own the command.

## Acceptance criteria

- [ ] Move command/quote/status ownership out of the renderer into a verse generation interface.
- [ ] Connect reader, gallery and header controls to the same selected passage and operation.
- [ ] Keep visual image-selection/loading/fullscreen/gesture state local and separate from paid work.
- [ ] Remove manual history refresh tokens once subscriptions and direct selected-image lookup cover updates.
- [ ] Preserve auto-generation affordability and avoid duplicate effects when switching views.

## Verification

Reader -> gallery -> generate -> navigate away -> reopen result; mount/unmount renderer; passive image load versus paid progress; verify no extra provider request.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

No visual redesign; use existing controls and layout.

## Blocked by

- [T27: Resolve image cancellation against durable completion](https://github.com/AustinKelsay/visibible/issues/83)
- [T33: Browse paginated history without breaking image links](https://github.com/AustinKelsay/visibible/issues/89)

## Traceability

Original backlog items: 57, 58, 59. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
