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

## Image intent checkpoint (T22)

Authenticated retry lookup runs before external Scripture/catalog reads. A canonical request fingerprint binds request ID to owner and inputs; admission atomically claims one billing ID and pins `next-image-v1` / `legacy-image-v1`. Duplicate POSTs return progress or the saved result. Admission failures start no paid work. Terminal lifecycle rows and billing identity are immutable, and backwards progress is rejected. The hero follows HTTP 202 via its existing Convex subscription.

Evidence: actual HTTP handlers plus Convex intent mutations cover concurrent POSTs, saved-result replay despite catalog outage, changed inputs and failed admission; mutation tests cover owner isolation and terminal/reordered updates; a rendered React test covers 202 through terminal failure. A temporary internal dev check passed five concurrent claims, stable billing ID, owner isolation and terminal guard; its fixture and module were removed. No provider call or public image was created by this dev check.

## Scripture availability checkpoint (T16)

Invalid references return not-found; missing translation text and upstream failures retain the requested URL with retry and translation controls. Chapter payload validation follows the provider's actual nested translation metadata (the reference endpoint has a different shape). Canonical structure validates integer chapter/verse bounds and owns adjacent navigation. Prompt context no longer loads unrelated chapters.

The all-translation evidence snapshot records book listings plus two representative chapter endpoints; limitations are documented in `llm/context/BIBLE-API.md`. It is not a whole-corpus coverage claim. Local adapter and server-rendered page tests cover the real response shape, malformed/mismatched payloads, missing text, timeouts, invalid references and every book boundary.

Browser verification on port 3100 passed missing-text → retry → select WEB → reader recovery at the same URL with no browser errors. Screenshots: [missing translation](screenshots/scripture-unavailable.png), [recovered reader](screenshots/scripture-recovered.png). The live provider returned access errors during this run, verifying the real outage screen. Successful recovery used a temporary Node-process-only Scripture fixture, which was removed along with its Next fetch cache after verification. This did not verify current live provider availability. The original port 3000 had an additional OrbStack listener and a stale dev server; it was not used as final evidence.

## Chapter lookup checkpoint (T17)

Removed the unbounded completed-chapter map. Next.js owns response caching; a 256-entry maximum active-request table coalesces chapter and verse calls, retains translation identity, and releases entries on success or failure. The 10-second upstream signal bounds waits. No additional completed-entry TTL or eviction policy is needed because that process cache was removed.

Seven new adapter tests cover concurrent chapter/verse callers, platform-cache delegation, translation isolation, shared missing/malformed/error responses followed by recovery, fake-clock timeout, and capacity recovery after 256 concurrent distinct lookups. Full checkpoint verification: 477 tests across 50 files, type checking and lint.
