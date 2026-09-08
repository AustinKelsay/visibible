# T33: Browse paginated history without breaking image links

<!-- visibible-modernization:T33 -->

## Parent

[S08: Reliable shared image storage and bounded library reads](https://github.com/AustinKelsay/visibible/issues/52)

## What to build

Readers and API consumers can browse large image histories while opening a specific historical image directly.

## Acceptance criteria

- [ ] Provide stable cursor pagination with default 30 and maximum 100 results through the library interface.
- [ ] Keep selected-image lookup addressable independently of the current page.
- [ ] Migrate reader history and chapter gallery consumers without losing newest-first/verse grouping semantics.
- [ ] Keep existing public routes and projected fields compatible; test insertion between page reads.
- [ ] Keep history grouped by verse across translations and display each image translation/provenance in details; generation remains tied to the selected translation.

## Verification

Large synthetic histories, equal timestamps, newly inserted images, missing/deleted selected ID and public API contract fixtures; verify reader/gallery navigation.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

No new public metadata fields or private collections.

## Blocked by

- [T23: Save each generation once and retain its image identity](https://github.com/AustinKelsay/visibible/issues/79)

## Traceability

Original backlog items: 50, 52, 66. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
