# Triage evidence

Baseline: `6ae456839208ab6c97d630f80f8719becda9c050`. Reviewed 2026-09-07. All 67 live issue bodies matched the published scope when triage began; none had comments or conflicting state roles. No prior rejection entries were present in `.out-of-scope`, and no matching ADR rejection was found.

## Isolated runtime characterizations

Nine checks exercised real pricing helpers, registered Convex handlers or the installed AI SDK with synthetic state and provider effects. All nine demonstrated the expected **current defects**. They are not fix regressions, transaction-contention tests or evidence that a deployed customer experienced the failure.

| Tickets | Observed result |
| --- | --- |
| T02 | 1,000 input and 1,000 output tokens at USD 0.00001/token yielded USD 0.00000002 and one credit. The correct provider-basis amount is USD 0.02. |
| T03, T04 | USD 0.001 became a one-credit image estimate and a 35-credit hold. Known zero actual usage fell back to estimated credits and was marked non-actual. |
| T08 | The real private session query returned a known foreign SID's balance without consulting an unauthenticated identity. Paid HTTP-route theft was not tested or established. |
| T09 | The cleanup handler passed an expired session with 100 credits to deletion. No live record was accessed or deleted. |
| T11 | The real payment confirmation handler rejected a pending invoice after local expiry. The fake database does not model rollback; no persisted expired-state claim follows from its patch spy. |
| T19 | The cache handler returned old prompt/planner metadata without a compatible-version lookup requirement. |
| T22 | The lifecycle handler accepted a transition from succeeded back to generating. Concurrent paid HTTP calls were not run. |
| T23 | The final insertion handler accepted two inserts using the same generation identity. The earlier action-level lookup does not provide atomic insertion uniqueness. |
| T14 | The real AI SDK emitted embedded error data and closed normally, invoking a transform's flush. Source review connects the application's equivalent flush to credit deduction. |

The retained [characterization source](characterizations.ts.txt) is a text artifact so it will not enter the application test suite. It originally ran as `src/lib/__tests__/triage-20260907.test.ts` with `npm test -- --run src/lib/__tests__/triage-20260907.test.ts`; its relative imports use that location. To reproduce at this baseline, copy it to an unused test filename at that location, run the targeted command, and remove the temporary test afterward. Do not overwrite existing work. For a fix, write desired-behavior regressions rather than preserving these defect expectations.

[Captured test output](characterizations.log): one file, nine passing characterizations. No provider generation, Lightning payment, relay publication or production database access was performed.

## Redundancy and source checks

The earlier [repository investigation](../../../llm/research/2026-09-07-rebuild-assessment.md) supplies the wider feature inventory. Triage rechecked the following domain concepts at the unchanged baseline. Existing partial implementations are reasons to reuse code, not reasons to close an unfinished contract.

| Domain | Existing interfaces inspected | Remaining gap |
| --- | --- | --- |
| Pricing and cost records | Chat/image model helpers; learned model stats; wallet; cost event/outbox handlers | Correct units, quote authorization policy and atomic settlement/reporting intent |
| Guest identity and retention | Convex client provider; session/history queries; bulk owner checks; cleanup | Verified private identity and funded-record preservation |
| Lightning | LND adapter; invoice routes; confirmation handler; cron configuration | Late settlement, creation recovery and autonomous reconciliation |
| Chat | Request schema; model-message conversion; streamText configuration; settlement transform | Trusted roles/context, bounded input/output, explicit success and cancellation |
| Image execution | Canonical lookup; request creation/update; provider orchestration; save ordering | Stable intent identity, durable output and recoverable execution |
| Bulk | Job/item mutations; browser leases, heartbeats and queue restoration | Server-owned execution and outcome reconciliation |
| Scripture and scene plans | Verse/chapter adapters; reader fallback branches; scene cache keys | Preserved locations, bounded caching and compatible canonical plans |
| Image library | Final storage insertion; remote fetch; private gallery/history; public pagination | Atomic uniqueness, complete fetch constraints, bounded UI reads and summaries |
| Reader state | GenerationContext registration; gallery renderer lifecycle; preference storage; existing interaction tests | Commands independent of renderer and consistent preference authority |
| Evaluations | Configured defaults; committed test inventory; chat release rubric | Reproducible quality/cost case sets, runner and human model-release decision |
| Operations and Nostr | Publication checks/window claims; publish/save order; impressions; health/metrics; cleanup | Stable external event identity, durable operational truth and explicit retention |
| Migration | Current single executor; coverage configuration; behavior tests; modernization documents | Executed additive migration, restore/rollback evidence and safe retirement |

Additional bug claims in T15, T16, T18, T20, T24, T30, T36 and T37 are supported by source paths and described reproduction cases. Their full browser, external-system or concurrency reproductions remain required implementation verification. Their briefs explicitly distinguish that evidence from the runtime checks above.

## Dependency decisions

- T09 no longer waits for T07: funded-record retention works on existing session records and cookie expiry rules; a JWT broker is not required.
- T14 no longer waits for T02: stream success/error settlement can be repaired independently of price-unit conversion.
- T22 no longer waits for T04: current HTTP requests can share a stable operation/billing identity while retaining the legacy policy version.

T43 moves to `ready-for-human` because its accepted release contract requires human review of model quality and a named release owner. The evaluation-tooling tickets remain agent-ready. This is a future execution boundary, not a request for approval during triage.
