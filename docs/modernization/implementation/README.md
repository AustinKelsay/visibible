# Implementation progress

Branch: `codex/modernization`. Baseline: `6ae456839208ab6c97d630f80f8719becda9c050`.

Read each ticket's current GitHub brief and parent policy before implementation. The planning and triage artifacts remain the backlog of record. A change listed here is not a closed ticket until all its acceptance criteria and relevant verification are satisfied.

## First implementation checkpoint

| Ticket | Implementation | Evidence | Remaining |
| --- | --- | --- | --- |
| T02 | Shared exact decimal per-token pricing for chat/planner estimates and actual costs, with one total rounding step | Pricing fixtures, invalid-input cases, catalog/outage parity and actual chat admission regression | Final review |
| T09 | Retain funded or financially linked expired sessions; cursor cleanup; truthful access notice | Actual Convex tests for retention, empty deletion, dry run, cursor progress; dev push and empty dry run; purchase notice browser check | Final review |
| T14 | Settle from successful model outcome instead of stream closure; report actual billing status | Installed AI SDK with fake provider: embedded error, error finish, empty, stop, length; financial regression tests | Final review |
| T15 | Propagate request/response abort; prevent cancellation reversing completed charge | SDK cancellation and single-settlement tests | Known provider-spend persistence, failed-release recovery, before-token/race coverage |
| T11 | Verify settlement before local expiry; validate payment hash and amount; atomic invoice/wallet/ledger update; duplicate-payment guard | Actual Next handlers and Convex mutations with fake LND, late pending/expired, unpaid, outage, invalid evidence, duplicate confirmation and rollback | Final review; live LND pending |

Local verification at this checkpoint: 437 tests in 46 files passed; lint and TypeScript checks passed. The test harness uses `convex-test@0.0.41`, compatible with the installed Convex SDK. Harness modules live outside `convex/` so test-only `import.meta.glob` is never deployed.

Development target: `coordinated-shepherd-515`. Database export taken before the first push, stored privately outside the repository; storage blobs were not exported. First retention push succeeded; its dry run scanned zero expired rows. No production deployment or live payment was performed.

Browser verification: local reader loads existing Convex images and Scripture; no reported browser errors; purchase notice explicitly separates server-held balance from browser session access. Screenshot captured outside the repository at `/tmp/visibible-retention-notice.png`.

Continue through the remaining tickets in dependency order. LND being offline limits live-payment evidence; it does not block controlled payment implementation. T43 retains the specified human release review. Do not report the full backlog as implemented based on this checkpoint.

Deployed synthetic contract verification passed for funded-session retention, empty-session deletion, late settlement and five concurrent confirmations resulting in exactly one purchase. Fixtures were removed in a `finally` block; the temporary internal dev-only test module was removed after execution. This verifies real Convex transaction behavior, not live LND connectivity.

T23 implementation adds atomic generation lookup to both final image insertion mutations. Storage saves verify the blob exists. Losing uploads are removed only after an indexed check proves no image references that blob. Local Convex tests cover concurrent URL/storage saves, original provenance, distinct generation identity and a blob shared by another image. Existing legacy image rows are not deleted or rewritten.

CodeRabbit reviewed the first diff and raised five issues. Fixed the two invoice response details. Cleanup now persists a cursor, caps each run at 20 pages and resumes on the next cron; epoch checks ignore delayed work superseded by a newer run. A regression with 1,001 retained rows proves later empty sessions are not starved. The four allegedly missing agent docs already exist locally as planning artifacts. Edge-runtime isolation remains part of T44; these mixed Next/Convex tests run in Node, with actual Convex deployment checks covering the deployed runtime boundary.
