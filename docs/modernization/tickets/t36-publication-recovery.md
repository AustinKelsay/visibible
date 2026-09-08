# T36: Keep Nostr publication identity stable through failures

<!-- visibible-modernization:T36 -->

## Parent

[S11: Trustworthy publication, operations and retention](https://github.com/AustinKelsay/visibible/issues/55)

## What to build

A scheduled image is shared without generating duplicate events when recording or relay acknowledgement fails.

## Acceptance criteria

- [ ] Persist the signed event identity before external publication and retry only that same event when safe.
- [ ] Record relay outcomes and preserve historical publication IDs and conservative ambiguous-window handling.
- [ ] Keep latest completed four-hour selection and skip missed windows rather than automatically flooding a backlog.
- [ ] Provide operator-visible unresolved status with safe reconciliation steps.

## Verification

Fake relays: success then local failure, partial acknowledgements, timeout, restart and scheduler downtime; assert at most one signed event identity per selected publication.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

No new relay platform or live publication during tests.

## Blocked by

None (can start immediately).

## Traceability

Original backlog items: 56. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
