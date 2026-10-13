# T03: Quote supported image settings from verified billing units

<!-- visibible-modernization:T03 -->

## Parent

[S01: Accurate quotes and auditable credit charges](https://github.com/AustinKelsay/visibible/issues/45)

## What to build

A guest sees only supported image settings with prices derived from the correct output billing basis.

## Acceptance criteria

- [ ] Introduce a catalog/provider adapter that records explicit input/output units and capability provenance.
- [ ] Remove use of input-image price as a flat output price; verify output token/per-image/resolution fields for each enabled model.
- [ ] Apply the same normalized quote to selector and request validation; mark unavailable or unpriceable choices and explain fallback state.
- [ ] Retain supported current default behavior; adopting another image API is conditional on fixture/capability parity.
- [ ] Validate saved preferences and never inject a missing default as live-available solely because it is configured.

## Verification

Catalog fixtures with absent input-image price, explicit output units, unsupported resolution, stale catalog, default disappearance and malformed rates; assert UI quote equals server quote for same inputs.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

No default-model quality change. Versioned quote acceptance and reservation policy are a separate slice.

## Blocked by

None (can start immediately).

## Traceability

Original backlog items: 3, 7, 48, 49, 67. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
