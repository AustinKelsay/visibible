# Visibible modernization specs and tickets

Planning baseline: `6ae456839208ab6c97d630f80f8719becda9c050`. Authored 2026-09-07. **12 specs, 55 implementation tickets, all 86 original items mapped.**

The chosen approach is staged replacement of the unreliable execution and accounting core while preserving the reader, saved work, URLs and product intent. Convex owns durable jobs, reactive shared state, atomic financial settlement and recoverable background work. Next.js keeps the reader and streaming chat.

GitHub is authoritative for status, scope changes and discussion after publication. These files are publication snapshots, not a live status dashboard; the status columns and the section below were last reconciled on 13 November 2026. Specs are planning parents; tickets are the units of implementation. A `ready-for-agent` label does not override open blockers.

**Start here:** [complete source-item mapping](coverage.md), [domain vocabulary](../../CONTEXT.md), [original investigation](../../llm/research/2026-09-07-rebuild-assessment.md), [tracker conventions](../agents/issue-tracker.md).

## Decisions carried through the program

- Preserve one authoritative wallet and stable image/public URL identities. No historical repricing or dual paid execution.
- Show versioned estimates and maximum customer charges; track provider spend separately and release unused holds exactly once.
- Verify anonymous identity before private Convex access. Preserve funded records independently of credential expiry; recovery remains a separate feature.
- Reconcile payments and run image/bulk work on the server so closing a browser does not stop progress.
- Keep model changes behind repeatable quality/cost evaluations. The newest model is not automatically the selected model.
- Migrate additively, rehearse restore and rollback, then retire obsolete code in bounded tickets.

## Specs

| Spec | Tickets | Status |
| --- | --- | --- |
| [S01: Accurate quotes and auditable credit charges](https://github.com/AustinKelsay/visibible/issues/45) | T02, T03, T04, T05, T06 | Parked |
| [S02: Verified guest access and protected credit ownership](https://github.com/AustinKelsay/visibible/issues/46) | T07, T08, T09, T10 | Done |
| [S03: Lightning purchases that settle without an open tab](https://github.com/AustinKelsay/visibible/issues/47) | T11, T12, T13 | Done |
| [S04: Reliable Scripture chat with correct stream settlement](https://github.com/AustinKelsay/visibible/issues/48) | T14, T15, T20, T21 | Parked |
| [S05: Durable single-verse image generation](https://github.com/AustinKelsay/visibible/issues/49) | T22, T25, T26, T27 | Parked |
| [S06: Bulk generation managed by the server](https://github.com/AustinKelsay/visibible/issues/50) | T28, T29, T30, T31, T32 | Parked |
| [S07: Canonical Scripture and versioned scene plans](https://github.com/AustinKelsay/visibible/issues/51) | T16, T17, T18, T19 | Done |
| [S08: Reliable shared image storage and bounded library reads](https://github.com/AustinKelsay/visibible/issues/52) | T23, T24, T33, T34 | Parked |
| [S09: Consistent reader controls and preferences](https://github.com/AustinKelsay/visibible/issues/53) | T37, T38, T39, T40, T48 | Parked |
| [S10: Evidence-based model and prompt releases](https://github.com/AustinKelsay/visibible/issues/54) | T41, T42, T43 | Done |
| [S11: Trustworthy publication, operations and retention](https://github.com/AustinKelsay/visibible/issues/55) | T35, T36, T45, T46, T47 | Parked |
| [S12: Verified migration and retirement of old implementations](https://github.com/AustinKelsay/visibible/issues/56) | T01, T44, T49, T50, T51, T52, T53, T54, T55 | Parked |

## Status on 13 November 2026

The plan was written before the generic engine replaced the legacy image pipeline (#165, October 2026) and before the lean engine cut image generation to one call from the text ([ADR 0012](../adr/0012-one-image-call-from-the-text.md), 9 November 2026). A triage on 10 November checked every open issue against `main`, and each closed issue carries a note with its evidence.

On 13 November the owner chose to stop working the backlog as a program: finish the three tickets that protect a paying stranger, and park the rest until real use asks for them. Of the 55 tickets, **25 are done, 6 are not planned and 24 are parked. None is open.**

- **Done on 13 November:** T04, a shown and enforced maximum charge ([#423](https://github.com/AustinKelsay/visibible/pull/423)); T12, a retried purchase returns its saved invoice ([#420](https://github.com/AustinKelsay/visibible/pull/420)); T13, a payment is credited with every tab closed ([#421](https://github.com/AustinKelsay/visibible/pull/421)). S03 is complete. All three were released on 13 November at 23:32 UTC ([record](../../llm/releases/2026-11-13-max-charge-and-invoices/deployment.json)); production is deployed by hand ([Vercel deployment](../../llm/workflow/VERCEL_WORKFLOWS.md)).
- **Done on 14 November, from the parked list:** T48, the About page's credits and privacy copy matches what the app charges and stores ([#426](https://github.com/AustinKelsay/visibible/pull/426)).
- **Superseded by the engine migrations:** T50 and T51 (the admission switch and rollback rehearsal ran for the engine cutover in #182 and #183), T52 (the legacy executor was retired in #184), T19 and T05 (no scene plans or learned estimates remain), and T54 (its remaining reads are T33 and T34).
- **Not planned on cost:** T27, image cancellation, since an image now takes about ten seconds.

### Parked tickets and what reopens them

A parked ticket is closed as not planned with its labels kept, and its last comment states the trigger below. Reopen the issue when the trigger happens; read its latest triage comment before starting, since several name code that has changed.

| Ticket | Issue | Reopen when |
| --- | --- | --- |
| T01 | #57 | A remaining browser-run area (bulk generation, the reader's image stage) is about to be rewritten. |
| T06, T21 | #62, #77 | A paying reader disputes a charge, or `costEventOutbox` shows cost events that failed to persist. T04 already stores the accepted estimate and maximum with each operation. |
| T25, T26 | #81, #82 | A reader pays for an image that never appears, a request is found stuck in `generating`, or the stale-reservation job starts releasing holds regularly. |
| T28–T32 | #84–#88 | Bulk generation is offered to readers as a paid feature, or an owner run is lost by closing the tab. T30 sooner if an owner run pauses `in_flight` and cannot be resumed. |
| T33, T34 | #89, #90 | One book holds about 1,000 saved images. Recheck after the most-read passages are seeded. |
| T35 | #91 | Nostr publishing is back on and readers are producing impressions. |
| T36 | #92 | Before Nostr publishing is turned back on: this is a precondition for it. |
| T37 | #93 | A reader reports the gallery or header generating differently from the reader page, or the image stage is next reworked. |
| T38 | #94 | A reader reports a translation or model choice that does not stick, or preferences are next changed. |
| T39 | #95 | The purchase dialog is next reworked, or a reader gets stuck between the welcome and purchase steps. |
| T40 | #96 | A refactor of the reader page is planned; these tests are its precondition. |
| T44, T53 | #100, #109 | A settlement bug gets past the route tests, two of the duplicated rounding paths disagree, or chat or video pricing next changes. |
| T45 | #101 | There are paying readers to support and an unresolved request or charge has to be found by hand. T12 and T13 added operator views for invoices. |
| T46 | #102 | An outage of OpenRouter, Convex or the pay server is discovered late because readiness looked healthy. |
| T47 | #103 | A table's size becomes a cost, or the privacy copy promises a retention period. |
| T49 | #105 | Before the first migration that rewrites financial rows, or when readers other than the owner hold balances. |

## Full ticket table

| Ticket | Spec | Blocked by | Original items | Status |
| --- | --- | --- | --- | --- |
| [T01: Capture existing behavior and expose coverage gaps](https://github.com/AustinKelsay/visibible/issues/57) | S12 | None | 71, 72, 81 | Parked |
| [T02: Correct chat and planner price units](https://github.com/AustinKelsay/visibible/issues/58) | S01 | None | 1, 2, 4, 5, 14, 67 | Done |
| [T03: Quote supported image settings from verified billing units](https://github.com/AustinKelsay/visibible/issues/59) | S01 | None | 3, 7, 48, 49, 67 | Done |
| [T04: Show and enforce a maximum charge for paid work](https://github.com/AustinKelsay/visibible/issues/60) | S01 | T02, T03 | 4, 6, 8, 10, 11 | Done |
| [T05: Use fresh cost samples and explicit estimate backfill](https://github.com/AustinKelsay/visibible/issues/61) | S01 | T03 | 12, 13 | Not planned |
| [T06: Finalize credits and durable cost reporting together](https://github.com/AustinKelsay/visibible/issues/62) | S01 | T04 | 8, 9, 15, 16 | Parked |
| [T07: Authenticate anonymous Convex access from valid sessions](https://github.com/AustinKelsay/visibible/issues/63) | S02 | None | 25 | Done |
| [T08: Enforce ownership on private records and job controls](https://github.com/AustinKelsay/visibible/issues/64) | S02 | T07 | 26, 27 | Done |
| [T09: Preserve funded records when guest access expires](https://github.com/AustinKelsay/visibible/issues/65) | S02 | None | 28, 29 | Done |
| [T10: Keep credit balances consistent across tabs](https://github.com/AustinKelsay/visibible/issues/66) | S02 | T08 | 30 | Done |
| [T11: Credit settled invoices first observed after expiry](https://github.com/AustinKelsay/visibible/issues/67) | S03 | None | 21, 24 | Done |
| [T12: Recover interrupted invoice creation](https://github.com/AustinKelsay/visibible/issues/68) | S03 | T11 | 23 | Done |
| [T13: Reconcile Lightning invoices without browser polling](https://github.com/AustinKelsay/visibible/issues/69) | S03 | T12 | 22 | Done |
| [T14: Release credits for embedded chat stream errors](https://github.com/AustinKelsay/visibible/issues/70) | S04 | None | 17, 68 | Done |
| [T15: Cancel chat safely through the provider and wallet](https://github.com/AustinKelsay/visibible/issues/71) | S04 | T14 | 18 | Done |
| [T16: Resolve canonical passages and preserve unavailable locations](https://github.com/AustinKelsay/visibible/issues/72) | S07 | None | 62, 64, 65 | Done |
| [T17: Bound chapter caching and concurrent lookup work](https://github.com/AustinKelsay/visibible/issues/73) | S07 | T16 | 63 | Done |
| [T18: Build shared images from verified Scripture text](https://github.com/AustinKelsay/visibible/issues/74) | S07 | T16 | 45 | Done |
| [T19: Reuse only compatible scene plans](https://github.com/AustinKelsay/visibible/issues/75) | S07 | T18 | 46, 47 | Not planned |
| [T20: Bound chat input and keep system instructions server-owned](https://github.com/AustinKelsay/visibible/issues/76) | S04 | T16, T15 | 19, 20, 11 | Done |
| [T21: Attach durable quotes and receipts to chat turns](https://github.com/AustinKelsay/visibible/issues/77) | S04 | T20, T06 | 8, 10, 20 | Parked |
| [T22: Deduplicate image requests and guard terminal states](https://github.com/AustinKelsay/visibible/issues/78) | S05 | None | 31, 32, 33 | Done |
| [T23: Save each generation once and retain its image identity](https://github.com/AustinKelsay/visibible/issues/79) | S08 | None | 37, 52 | Done |
| [T24: Constrain remote image storage fetches](https://github.com/AustinKelsay/visibible/issues/80) | S08 | None | 53 | Done |
| [T25: Complete one image through a durable Convex workflow](https://github.com/AustinKelsay/visibible/issues/81) | S05 | T07, T22, T23, T24, T19, T06 | 34, 36 | Parked |
| [T26: Recover provider ambiguity and image storage failures](https://github.com/AustinKelsay/visibible/issues/82) | S05 | T25 | 35, 38, 70 | Parked |
| [T27: Resolve image cancellation against durable completion](https://github.com/AustinKelsay/visibible/issues/83) | S05 | T26 | 33, 36 | Not planned |
| [T28: Run a small bulk job entirely on the server](https://github.com/AustinKelsay/visibible/issues/84) | S06 | T27, T08 | 27, 39 | Parked |
| [T29: Create and schedule whole-book queues within limits](https://github.com/AustinKelsay/visibible/issues/85) | S06 | T28 | 43, 44 | Parked |
| [T30: Recover interrupted bulk items from generation truth](https://github.com/AustinKelsay/visibible/issues/86) | S06 | T28 | 41, 70 | Parked |
| [T31: Make bulk pause resume and cancel authoritative](https://github.com/AustinKelsay/visibible/issues/87) | S06 | T30, T29 | 42 | Parked |
| [T32: Remove browser bulk leases and local counters](https://github.com/AustinKelsay/visibible/issues/88) | S06 | T31, T10 | 40 | Parked |
| [T33: Browse paginated history without breaking image links](https://github.com/AustinKelsay/visibible/issues/89) | S08 | T23 | 50, 52, 66 | Parked |
| [T34: Serve image counts and availability from bounded summaries](https://github.com/AustinKelsay/visibible/issues/90) | S08 | T23 | 51 | Parked |
| [T35: Bound publication impressions and measure reactive fan-out](https://github.com/AustinKelsay/visibible/issues/91) | S11 | T07, T33 | 54, 55 | Parked |
| [T36: Keep Nostr publication identity stable through failures](https://github.com/AustinKelsay/visibible/issues/92) | S11 | None | 56 | Parked |
| [T37: Use one generation interface in reader gallery and header](https://github.com/AustinKelsay/visibible/issues/93) | S09 | T27, T33 | 57, 58, 59 | Parked |
| [T38: Make preference hydration and persistence consistent](https://github.com/AustinKelsay/visibible/issues/94) | S09 | T03 | 60 | Parked |
| [T39: Separate welcome purchase and admin states](https://github.com/AustinKelsay/visibible/issues/95) | S09 | T13, T10 | 61 | Parked |
| [T40: Protect reader interaction through behavior tests](https://github.com/AustinKelsay/visibible/issues/96) | S09 | T37, T38 | 71, 81 | Parked |
| [T41: Create repeatable Scripture chat evaluations](https://github.com/AustinKelsay/visibible/issues/97) | S10 | None | 73 | Done |
| [T42: Evaluate image quality and planner value](https://github.com/AustinKelsay/visibible/issues/98) | S10 | None | 74 | Done |
| [T43: Select model defaults from measured comparisons](https://github.com/AustinKelsay/visibible/issues/99) | S10 | T41, T42, T03 | 75 | Done |
| [T44: Exercise private and financial Convex handlers directly](https://github.com/AustinKelsay/visibible/issues/100) | S12 | T08, T11, T06 | 24, 69, 70 | Parked |
| [T45: Inspect durable unresolved work and financial outcomes](https://github.com/AustinKelsay/visibible/issues/101) | S11 | T13, T26 | 76, 77 | Parked |
| [T46: Distinguish readiness from observed dependency health](https://github.com/AustinKelsay/visibible/issues/102) | S11 | None | 78 | Parked |
| [T47: Apply bounded retention without losing financial evidence](https://github.com/AustinKelsay/visibible/issues/103) | S11 | T09, T06 | 80 | Parked |
| [T48: Align privacy credits and storage copy with behavior](https://github.com/AustinKelsay/visibible/issues/104) | S09 | T39, T47 | 79 | Done |
| [T49: Prove data export restore and reconciliation](https://github.com/AustinKelsay/visibible/issues/105) | S12 | T01 | 82 | Parked |
| [T50: Switch new admissions without duplicating paid work](https://github.com/AustinKelsay/visibible/issues/106) | S12 | T49, T25 | 83 | Not planned |
| [T51: Rehearse rollback with active jobs and payments](https://github.com/AustinKelsay/visibible/issues/107) | S12 | T50, T31, T13, T44 | 70, 84 | Not planned |
| [T52: Retire replaced image executors after old work drains](https://github.com/AustinKelsay/visibible/issues/108) | S12 | T51, T32 | 85 | Done |
| [T53: Retire duplicated pricing and chat settlement paths](https://github.com/AustinKelsay/visibible/issues/109) | S12 | T51, T21, T05 | 85 | Parked |
| [T54: Retire replaced reader state and library queries](https://github.com/AustinKelsay/visibible/issues/110) | S12 | T51, T40, T34 | 85 | Not planned |
| [T55: Close the modernization traceability and documentation audit](https://github.com/AustinKelsay/visibible/issues/111) | S12 | T52, T53, T54, T45, T46, T36, T35, T48, T17, T43 | 86 | Done |

## Verification and publication

The plan contains 80 explicit blocking edges. The graph is acyclic, every blocker precedes its dependent, all 86 source items are covered, and the final audit depends transitively on every other ticket.

Each spec states user stories, policy, implementation boundaries and test decisions. Every ticket states acceptance criteria, verification, scope and blockers. Application implementation, production migration and paid evaluation are future ticket work.

The structured scope lives in [plan.json](plan.json). Publication IDs and relationship verification live in [github.json](github.json). Refresh these snapshots from GitHub before using them after issue discussion changes scope.

## Triage

The 7 September [triage outcomes and execution briefs](triage/README.md) classify all 67 issues, identify the 15 tickets startable then and record the three removed blockers; the 10 and 13 November reconciliations are in the status section above and in each issue's latest triage comment. Model selection T43 closed on 11 November 2026 with the owner's choice of Mistral Small 4 and guarded chat rules, measured by T41's `npm run evals:chat`. Two release items are still open: a human review of the failed and edge cases, which only model scorers have read, and the first-24-hour watch, owned by the repository owner. Both are listed in the [comparison record](../../llm/releases/2026-11-11-chat-model-comparison/README.md#decision-and-change). Read the latest GitHub brief before implementation.
