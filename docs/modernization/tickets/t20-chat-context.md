# T20: Bound chat input and keep system instructions server-owned

<!-- visibible-modernization:T20 -->

## Parent

[S04: Reliable Scripture chat with correct stream settlement](https://github.com/AustinKelsay/visibible/issues/48)

## What to build

A guest can ask about the canonical passage with bounded history and cannot submit privileged system instructions.

## Acceptance criteria

- [ ] Accept explicit user/assistant history and supported parts; reject client system roles.
- [ ] Resolve passage context on the server and bound serialized history against model capacity.
- [ ] Enforce model-compatible output token limit with default maximum 2048; show rejection or length status clearly.
- [ ] Keep request admission, context assembly and stream outcome behind the chat interface while preserving output intent.
- [ ] Complete required baseline/candidate chat evaluation for context or provider behavior changes before release.

## Verification

Actual chat interface tests for role injection, altered passage context, overlong history, unsupported parts and context-window edge; real SDK fakes for bounded output.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

No persistent conversations or new persona. Live evaluation is subject to the existing release gate.

## Blocked by

- [T16: Resolve canonical passages and preserve unavailable locations](https://github.com/AustinKelsay/visibible/issues/72)
- [T15: Cancel chat safely through the provider and wallet](https://github.com/AustinKelsay/visibible/issues/71)

## Traceability

Original backlog items: 19, 20, 11. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
