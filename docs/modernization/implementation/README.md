# Implementation progress

Branch: `codex/modernization`. Baseline: `6ae456839208ab6c97d630f80f8719becda9c050`.

Read each ticket's current GitHub brief and parent policy before implementation. The planning and triage artifacts remain the backlog of record. A change listed here is not a closed ticket until all its acceptance criteria and relevant verification are satisfied.

## First implementation checkpoint

| Ticket | Implementation | Evidence | Remaining |
| --- | --- | --- | --- |
| T02 | Shared exact decimal per-token pricing for chat/planner estimates and actual costs, with one total rounding step | Pricing fixtures, invalid-input cases, catalog/outage parity and actual chat admission regression | Reviewed checkpoint; not merged |
| T09 | Retain funded or financially linked expired sessions; cursor cleanup; truthful access notice | Actual Convex tests for retention, empty deletion, dry run, cursor progress; dev push and empty dry run; purchase notice browser check | Reviewed checkpoint; not merged |
| T14 | Settle from successful model outcome instead of stream closure; report actual billing status | Installed AI SDK with fake provider: embedded error, error finish, empty, stop, length; financial regression tests | Reviewed checkpoint; not merged |
| T15 | Propagate request/response abort; prevent cancellation reversing completed charge | SDK cancellation and single-settlement tests | Known provider-spend persistence, failed-release recovery, before-token/race coverage |
| T11 | Verify settlement before local expiry; validate payment hash and amount; atomic invoice/wallet/ledger update; duplicate-payment guard | Actual Next handlers and Convex mutations with fake LND, late pending/expired, unpaid, outage, invalid evidence, duplicate confirmation and rollback | Reviewed checkpoint; not merged; live LND pending |

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

## Canonical generation checkpoint (T18)

The shared resolver requires a reference, resolves aliases, validates static location and selected chapter identity, and obtains current/neighboring text from Scripture. Compatibility text/context/theme cannot reach shared prompts. Missing current passages and upstream failures stop before paid work. Genesis 1 retains its server-owned theme. A new prompt-policy version and planner-model gate exclude legacy plans that could contain client-authored content; complete cache fingerprints remain T19.

Request tests inspect actual provider prompts, saved image provenance, and real Convex cache handlers with forged current text, neighbors, theme and an old cached plan. They verify replacement with canonical inputs and no reservation/provider call for absent passages. Existing cross-book/chapter continuity and payment regressions still pass. Latest checks: 482 tests across 50 files, lint and type checking. No live paid generation was used.

## Compatible scene plans checkpoint (T19)

Extracted prompt construction, normalization and canonical scene fingerprinting into `src/lib/image-prompts.ts`. The existing image prompt snapshot is unchanged. Fingerprints include complete canonical current/neighbor text, theme/style inputs and the rendered planner prompt; query/hit handlers additionally require matching translation, prompt version and planner model. Legacy rows miss; delayed hits cannot increment replacement records. Variation/output dimensions stay outside the planner identity because they do not change its canonical scene input.

Local tests cover every identity field, old entries, read-only hits, delayed hit writes, normalization and limits. A temporary internal check passed matching/mismatched identity and replacement-hit behavior on Convex dev. Its synthetic row was deleted in `finally`, and the module was removed after execution.

CodeRabbit's T18 finding about upstream error propagation was partly already covered by chapter/timeout handling. The remaining reference-endpoint 401/403 path is fixed; regressions preserve 401/403/429/500/503 status evidence and prove no paid request or reservation starts.

## Current checkpoint status

The implementation branch contains T02, T09, T11, T14, T16, T17, T18, T19, T22 and T23 work. T15 remains partial; the broader program is not complete and no ticket is closed solely because it appears here. Final local verification passes 512 tests in 52 files, lint and type checking. The Scripture and scene-plan reviews completed with no outstanding findings after the reference-error correction. A final retry regression additionally proved and fixed success being announced before the image-save attempt finished: retries now remain in progress during that attempt.

Convex development deployment `coordinated-shepherd-515` contains the backend changes; all temporary internal verification modules and synthetic records have been removed. Production was not deployed. Live LND remains unavailable. Model evaluations, durable background generation, verified Convex browser identity and the rest of the backlog remain separate implementation work.

Final browser check used the normal server at `http://localhost:3100` with no fixture preload: a complete 31-verse Genesis chapter rendered, `/` navigated to the reader, and no console error or framework overlay appeared. The browser session was closed afterward. Coverage thresholds pass (69.36% lines under the existing include/exclude configuration); central modules excluded by that configuration remain a known T44/T01 reporting limitation, so this percentage is not full-system coverage.

## Verified guest identity bridge (T07 / #63)

Added the RS256 token broker, public-key Convex configuration, memory-only client refresh hook and authenticated session lookup. Existing SIDs and balances are preserved; current tier and revocation are read from the database. Issuance uses the real HttpOnly cookie verifier, origin, CSRF and persisted rate checks. Background token renewal does not extend cookie expiry.

Local tests cover token claims/signatures, cookie deadlines, rotation overlap/removal, HTTP admission/rate limits, revoked/deleted sessions, stale admin claims, concurrent browser requests and subject changes. Live development checks rejected invalid signatures/issuer/audience/expiry, returned the synthetic existing balance and denied the same token after revocation. Fixtures and temporary modules were removed. The browser issued a token and read its own Convex record with no persisted bearer and no initial console errors.

Configuration and rotation: [guest auth](../../agents/guest-auth.md). Private-call migration and reactive balance conversion remain T08/T10. Hosted preview and production signing environments are not configured by this checkpoint.

T07 checkpoint: 529 tests in 56 files pass, with lint and TypeScript checks passing. Invalid-cookie browser verification retained Scripture and returned 401 for token issuance. The JWT includes a unique ID so same-second refreshes remain distinct for the installed Convex SDK.

## Private Convex callers (T08 / #64)

Migrated session/balance/history, invoice, bulk job and image-request status reads to verified ownership. Bulk creation and every legacy control/write now verify the authenticated SID and current session before accepting compatibility SID arguments. Unauthorized queries return no private records; controls throw. Browser subscriptions wait for Convex authentication.

Next.js uses explicit server credentials for private reads. Invoice HTTP reads additionally supply the cookie-derived owner and deny revoked owners. Rate-limit and admin lockout detail queries are server-only. The [complete function inventory](../../agents/convex-access.md) classifies all 90 registered handlers. Public library and API projections remain unchanged. Bulk counters remain writable by the verified owning browser until server execution replaces the legacy worker under S06.

The first CodeRabbit review examined eight tracked files and raised one minor expiry-alignment issue. The broker intentionally does not renew its session cookie. Renamed the returned field to `cookieExpiresAt` and added a real-cookie regression proving that an almost-expired cookie cannot acquire an extended bearer lifetime. A broader review follows to include the new files omitted by that initial uncommitted review.

T08 live dev verification passed for owner reads/control, known-ID isolation from a second valid guest and anonymous callers, and public library access. Synthetic sessions, invoices, jobs and verse records were deleted, and the temporary internal test module was removed and undeployed. Initial browser verification after the access migration rendered the full reader without console errors.

Final T07/T08 local checks: **539 tests across 57 files**, lint and type checking pass. Reconnect/focus behavior and almost-expired-cookie issuance have explicit regressions. The first uncommitted CodeRabbit review omitted new files; the follow-up is scoped from `5584b98` to include the complete auth/access changes.

The broader CodeRabbit review covered 36 files and raised three issues. The cookie-expiry route references and environment documentation were already correct in the current tree. Moved the hook's subject-ref update to a committed layout effect and added a suspended-render regression for the remaining issue. A real browser stayed open beyond five minutes: token requests increased from two initial handshakes to three without a page reload, confirming scheduled refresh; no console errors were reported.

## Reactive wallet checkpoint (T10 / #66)

One authenticated Convex query supplies available credits, pending holds and tier. Cookie bootstrap now lives outside the authenticated provider; monetary state lives inside it. Removed local subtraction and periodic/event-driven balance refreshes from single-image, bulk and purchase flows. Unavailable access shows reconnect controls, separately from loading and a verified zero balance.

An indexed reservation marker is maintained transactionally with reserve, charge, release and stale reconciliation. The explicit dev backfill classified 26 existing rows in one page, with zero unlinked reservations and no changes to balances or ledger amounts. [Rollout notes](../../agents/guest-auth.md#reactive-wallet-rollout) describe ordering and rollback constraints.

Two live browser tabs using the same guest followed actual Convex ledger mutations without reloading: 100 available → 50 available / 50 held → 150 / 50 → 170 / 20 → 190 / 0. The scenario used a synthetic credit addition, not LND. Both tabs then observed zero after fixture cleanup. Temporary verification functions and synthetic ledger entries were removed. [Pending-hold screenshot](screenshots/wallet-pending-holds.png).

Local regressions exercise actual Convex settlement handlers, overlapping reservations, repeated refund/charge, all charge outcomes, stale recovery, and paginated legacy backfill with settlement between pages. Rendered UI tests verify reactive results, cached-identity isolation, loading, reconnect and zero-balance states.

The live unavailable-identity browser check rendered Genesis 1:1 and reconnect controls at the same URL. [Unavailable-access screenshot](screenshots/wallet-unavailable.png). The authenticated two-tab session reported no browser console errors. Final local checks pass **549 tests across 60 files**, lint and type checking.

CodeRabbit reviewed all 19 wallet code files and raised one issue: focus renewal reset the shared loading state. Background identity renewal now preserves established authentication/loading state; a rendered provider regression checks initial loading, silent renewal and invalid-access clearing.

## Verified image catalog checkpoint (T03 / #59)

Image quotes now use explicit output-token pricing and documented model/resolution quantities, with provenance. A shared exact decimal calculation includes text allowances and rounds once; discovery and admission exercise that same calculation. Removed input-image-as-output pricing, unsupported resolution multipliers, synthetic live defaults, and model-list-triggered historical backfill. The existing generation API, default model and response parsing remain unchanged.

Unversioned cost samples cannot override this baseline. T05 remains responsible for fresh, settings/version-aware learned estimates. Legacy hold policy remains until T04 introduces visible accepted maxima; this checkpoint does not claim bounded provider exposure or a guaranteed maximum charge.

Real provider catalog fixtures cover missing input-image pricing, malformed output rates, zero cost, unknown billing/capabilities, resolution token counts, vanished defaults, stale snapshots and expiry. Route tests now use the production adapter instead of copied pricing functions. They compare discovery/admission at all three resolutions and reject invalid settings before paid work. Rendered selector/preference tests cover disabled models, stale labels, unavailable saved preferences and resolution normalization.

The local app uses Convex dev for identity, wallet and ETA data. Its live catalog displays verified choices and disabled unverified choices; supported resolution quotes differ as expected. No new Convex function/schema deployment is needed for this Next.js/catalog slice, and no paid generation or LND call was used for verification.

The saved-preference browser scenario kept the reader visible, disabled generation for a removed model, normalized its unsupported 4K preference to 1K, and recovered after explicitly selecting the default. No browser console errors were reported. Screenshots: [verified catalog](screenshots/image-catalog-verified.png), [unavailable saved model](screenshots/image-model-unavailable.png).

CodeRabbit reviewed 21 code/fixture files and raised two minor issues: premature/duplicate availability messages and enabling resolutions without a quote. Both are corrected. Rendered tests cover warning timing, one error message, and desktop/mobile controls for a partially quoted model.

Final T03 checks: **567 tests across 62 files**, lint and type checking pass. The 390-pixel browser view fits without horizontal overflow and retains Scripture without a framework overlay. No production deployment or live paid verification occurred.
