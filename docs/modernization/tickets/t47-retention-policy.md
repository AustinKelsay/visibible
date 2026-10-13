# T47: Apply bounded retention without losing financial evidence

<!-- visibible-modernization:T47 -->

## Parent

[S11: Trustworthy publication, operations and retention](https://github.com/AustinKelsay/visibible/issues/55)

## What to build

Operators can dry-run cleanup and see exactly what can expire without removing balances or unresolved work.

## Acceptance criteria

- [ ] Implement S11 retention classes with compact financial receipts and operation dedupe identities retained.
- [ ] Use bounded resumable cleanup for eligible diagnostics, processed outbox payloads, stale plans and minimized feedback context.
- [ ] Check linked state and blob references before deletion; unresolved/financial records are never swept by age alone.
- [ ] Provide dry-run counts, sampled identifiers and reconciliation totals with sensitive data redacted.
- [ ] New retention rules apply through a reviewed staged rollout; no destructive production cleanup is part of the implementation test.

## Verification

Synthetic linked data at expiry boundaries, interrupted cleanup and repeat run; verify retained balances, pending invoices, dedupe behavior and saved-image provenance.

Run repository-required lint, type checks and relevant tests. For visible changes, verify the complete affected browser flow and attach screenshots. Update current behavior documentation with the implementation. No live paid evaluation or production migration is authorized by ticket publication; follow the applicable release procedure when implementing.

## Scope boundaries

No legal-compliance claim and no indefinite retention of avoidable raw diagnostic payloads.

## Blocked by

- [T09: Preserve funded records when guest access expires](https://github.com/AustinKelsay/visibible/issues/65)
- [T06: Finalize credits and durable cost reporting together](https://github.com/AustinKelsay/visibible/issues/62)

## Traceability

Original backlog items: 80. Baseline: `6ae456839208`. Read the parent spec for shared policy and domain decisions. `ready-for-agent` means specified; start only after blockers are complete.
