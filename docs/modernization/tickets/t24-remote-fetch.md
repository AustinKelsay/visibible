# T24: Constrain remote image storage fetches

<!-- visibible-modernization:T24 -->

## Parent

[S08: Reliable shared image storage and bounded library reads](https://github.com/AustinKelsay/visibible/issues/52)

## What to build

Valid provider image output can be stored while forbidden destinations and malformed payloads are rejected.

## Acceptance criteria

- [ ] Prefer returned image bytes and preserve MIME, size and timeout enforcement through full body read.
- [ ] Reject redirects by default; any supported redirect revalidates the destination before fetching.
- [ ] Validate a runtime-compatible protection against private/DNS-rebound targets, or reject remote URL mode when that protection cannot be established.
- [ ] Return an explicit persistence error rather than creating a durable-success claim for rejected output.

## Verification

Fake network responses for redirect chains, private hosts, DNS changes where testable, oversize/chunked bodies, invalid MIME and delayed body completion.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

Do not expand allowlists or claim DNS protection based solely on string hostname checks.

## Blocked by

None (can start immediately).

## Traceability

Original backlog items: 53. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
