# Modernization triage

Reviewed 2026-09-07 at baseline `6ae456839208ab6c97d630f80f8719becda9c050`. This is a verified snapshot; use GitHub for later status and discussion.

**67 issues triaged:** 17 bugs and 50 enhancements. There are 54 agent-ready implementation tickets, one human-owned implementation ticket, and 12 planning parents. Fifteen implementation tickets have no open blockers at this snapshot.

Every issue has exactly one category and one state label, plus its program/type labels. Each has a disclosed AI triage brief. No issue was closed, no scope was rejected and no unanswered reporter question requires action.

## Startable work

Recommended first attention: pricing and customer-credit defects, guest access, request identity and remote image fetch boundaries. These are recommendations, not new dependency constraints.

| Ticket | Category |
| --- | --- |
| [T01: Capture existing behavior and expose coverage gaps](https://github.com/AustinKelsay/visibible/issues/57) | enhancement |
| [T02: Correct chat and planner price units](https://github.com/AustinKelsay/visibible/issues/58) | bug |
| [T03: Quote supported image settings from verified billing units](https://github.com/AustinKelsay/visibible/issues/59) | bug |
| [T07: Authenticate anonymous Convex access from valid sessions](https://github.com/AustinKelsay/visibible/issues/63) | enhancement |
| [T09: Preserve funded records when guest access expires](https://github.com/AustinKelsay/visibible/issues/65) | bug |
| [T11: Credit settled invoices first observed after expiry](https://github.com/AustinKelsay/visibible/issues/67) | bug |
| [T14: Release credits for embedded chat stream errors](https://github.com/AustinKelsay/visibible/issues/70) | bug |
| [T16: Resolve canonical passages and preserve unavailable locations](https://github.com/AustinKelsay/visibible/issues/72) | bug |
| [T22: Deduplicate image requests and guard terminal states](https://github.com/AustinKelsay/visibible/issues/78) | bug |
| [T23: Save each generation once and retain its image identity](https://github.com/AustinKelsay/visibible/issues/79) | bug |
| [T24: Constrain remote image storage fetches](https://github.com/AustinKelsay/visibible/issues/80) | bug |
| [T36: Keep Nostr publication identity stable through failures](https://github.com/AustinKelsay/visibible/issues/92) | bug |
| [T41: Create repeatable Scripture chat evaluations](https://github.com/AustinKelsay/visibible/issues/97) | enhancement |
| [T42: Evaluate image quality and planner value](https://github.com/AustinKelsay/visibible/issues/98) | enhancement |
| [T46: Distinguish readiness from observed dependency health](https://github.com/AustinKelsay/visibible/issues/102) | enhancement |

## Human execution boundary

[T43: Select model defaults from measured comparisons](https://github.com/AustinKelsay/visibible/issues/99) is `ready-for-human`, still blocked by the evaluation and catalog tickets. Its accepted policy requires human quality review, budget authority for live comparisons and a named model-release owner. Agents can build the evaluation tooling and prepare evidence. There is no immediate approval request.

## Dependency corrections

- T09 no longer waits for T07: preserve funded records using existing session and cookie rules.
- T14 no longer waits for T02: fix embedded stream error settlement independently of pricing.
- T22 no longer waits for T04: deduplicate current HTTP requests under the legacy policy/executor version.

The graph now has **80 native blocking links** and **55 parent links**, has no cycles, and still connects every ticket transitively to the final audit. All 86 original items remain mapped.

## Evidence and limits

[Evidence report](evidence.md) records the nine isolated runtime characterizations, source checks and existing behavior that must be preserved. Full browser, provider and production concurrency claims were not tested during triage. The briefs distinguish runtime reproduction from source-established failure paths.

## All triage outcomes

| Issue | Category | State | Blocking tickets | Brief |
| --- | --- | --- | --- | --- |
| [S01: Accurate quotes and auditable credit charges](https://github.com/AustinKelsay/visibible/issues/45) | enhancement | ready-for-agent | Planning parent | [Execution brief](https://github.com/AustinKelsay/visibible/issues/45#issuecomment-5577214702) |
| [S02: Verified guest access and protected credit ownership](https://github.com/AustinKelsay/visibible/issues/46) | enhancement | ready-for-agent | Planning parent | [Execution brief](https://github.com/AustinKelsay/visibible/issues/46#issuecomment-5577215247) |
| [S03: Lightning purchases that settle without an open tab](https://github.com/AustinKelsay/visibible/issues/47) | enhancement | ready-for-agent | Planning parent | [Execution brief](https://github.com/AustinKelsay/visibible/issues/47#issuecomment-5577215905) |
| [S04: Reliable Scripture chat with correct stream settlement](https://github.com/AustinKelsay/visibible/issues/48) | enhancement | ready-for-agent | Planning parent | [Execution brief](https://github.com/AustinKelsay/visibible/issues/48#issuecomment-5577216369) |
| [S05: Durable single-verse image generation](https://github.com/AustinKelsay/visibible/issues/49) | enhancement | ready-for-agent | Planning parent | [Execution brief](https://github.com/AustinKelsay/visibible/issues/49#issuecomment-5577217091) |
| [S06: Bulk generation managed by the server](https://github.com/AustinKelsay/visibible/issues/50) | enhancement | ready-for-agent | Planning parent | [Execution brief](https://github.com/AustinKelsay/visibible/issues/50#issuecomment-5577217506) |
| [S07: Canonical Scripture and versioned scene plans](https://github.com/AustinKelsay/visibible/issues/51) | enhancement | ready-for-agent | Planning parent | [Execution brief](https://github.com/AustinKelsay/visibible/issues/51#issuecomment-5577218081) |
| [S08: Reliable shared image storage and bounded library reads](https://github.com/AustinKelsay/visibible/issues/52) | enhancement | ready-for-agent | Planning parent | [Execution brief](https://github.com/AustinKelsay/visibible/issues/52#issuecomment-5577218724) |
| [S09: Consistent reader controls and preferences](https://github.com/AustinKelsay/visibible/issues/53) | enhancement | ready-for-agent | Planning parent | [Execution brief](https://github.com/AustinKelsay/visibible/issues/53#issuecomment-5577219141) |
| [S10: Evidence-based model and prompt releases](https://github.com/AustinKelsay/visibible/issues/54) | enhancement | ready-for-agent | Planning parent | [Execution brief](https://github.com/AustinKelsay/visibible/issues/54#issuecomment-5577219856) |
| [S11: Trustworthy publication, operations and retention](https://github.com/AustinKelsay/visibible/issues/55) | enhancement | ready-for-agent | Planning parent | [Execution brief](https://github.com/AustinKelsay/visibible/issues/55#issuecomment-5577220336) |
| [S12: Verified migration and retirement of old implementations](https://github.com/AustinKelsay/visibible/issues/56) | enhancement | ready-for-agent | Planning parent | [Execution brief](https://github.com/AustinKelsay/visibible/issues/56#issuecomment-5577220967) |
| [T01: Capture existing behavior and expose coverage gaps](https://github.com/AustinKelsay/visibible/issues/57) | enhancement | ready-for-agent | None | [Execution brief](https://github.com/AustinKelsay/visibible/issues/57#issuecomment-5577221700) |
| [T02: Correct chat and planner price units](https://github.com/AustinKelsay/visibible/issues/58) | bug | ready-for-agent | None | [Execution brief](https://github.com/AustinKelsay/visibible/issues/58#issuecomment-5577222130) |
| [T03: Quote supported image settings from verified billing units](https://github.com/AustinKelsay/visibible/issues/59) | bug | ready-for-agent | None | [Execution brief](https://github.com/AustinKelsay/visibible/issues/59#issuecomment-5577222880) |
| [T04: Show and enforce a maximum charge for paid work](https://github.com/AustinKelsay/visibible/issues/60) | enhancement | ready-for-agent | T02, T03 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/60#issuecomment-5577223354) |
| [T05: Use fresh cost samples and explicit estimate backfill](https://github.com/AustinKelsay/visibible/issues/61) | enhancement | ready-for-agent | T03 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/61#issuecomment-5577223885) |
| [T06: Finalize credits and durable cost reporting together](https://github.com/AustinKelsay/visibible/issues/62) | enhancement | ready-for-agent | T04 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/62#issuecomment-5577224634) |
| [T07: Authenticate anonymous Convex access from valid sessions](https://github.com/AustinKelsay/visibible/issues/63) | enhancement | ready-for-agent | None | [Execution brief](https://github.com/AustinKelsay/visibible/issues/63#issuecomment-5577225088) |
| [T08: Enforce ownership on private records and job controls](https://github.com/AustinKelsay/visibible/issues/64) | bug | ready-for-agent | T07 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/64#issuecomment-5577225511) |
| [T09: Preserve funded records when guest access expires](https://github.com/AustinKelsay/visibible/issues/65) | bug | ready-for-agent | None | [Execution brief](https://github.com/AustinKelsay/visibible/issues/65#issuecomment-5577226138) |
| [T10: Keep credit balances consistent across tabs](https://github.com/AustinKelsay/visibible/issues/66) | enhancement | ready-for-agent | T08 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/66#issuecomment-5577226633) |
| [T11: Credit settled invoices first observed after expiry](https://github.com/AustinKelsay/visibible/issues/67) | bug | ready-for-agent | None | [Execution brief](https://github.com/AustinKelsay/visibible/issues/67#issuecomment-5577227401) |
| [T12: Recover interrupted invoice creation](https://github.com/AustinKelsay/visibible/issues/68) | enhancement | ready-for-agent | T11 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/68#issuecomment-5577227821) |
| [T13: Reconcile Lightning invoices without browser polling](https://github.com/AustinKelsay/visibible/issues/69) | enhancement | ready-for-agent | T12 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/69#issuecomment-5577228379) |
| [T14: Release credits for embedded chat stream errors](https://github.com/AustinKelsay/visibible/issues/70) | bug | ready-for-agent | None | [Execution brief](https://github.com/AustinKelsay/visibible/issues/70#issuecomment-5577229198) |
| [T15: Cancel chat safely through the provider and wallet](https://github.com/AustinKelsay/visibible/issues/71) | bug | ready-for-agent | T14 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/71#issuecomment-5577229598) |
| [T16: Resolve canonical passages and preserve unavailable locations](https://github.com/AustinKelsay/visibible/issues/72) | bug | ready-for-agent | None | [Execution brief](https://github.com/AustinKelsay/visibible/issues/72#issuecomment-5577230204) |
| [T17: Bound chapter caching and concurrent lookup work](https://github.com/AustinKelsay/visibible/issues/73) | enhancement | ready-for-agent | T16 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/73#issuecomment-5577230810) |
| [T18: Build shared images from verified Scripture text](https://github.com/AustinKelsay/visibible/issues/74) | bug | ready-for-agent | T16 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/74#issuecomment-5577231313) |
| [T19: Reuse only compatible scene plans](https://github.com/AustinKelsay/visibible/issues/75) | bug | ready-for-agent | T18 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/75#issuecomment-5577232117) |
| [T20: Bound chat input and keep system instructions server-owned](https://github.com/AustinKelsay/visibible/issues/76) | bug | ready-for-agent | T16, T15 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/76#issuecomment-5577232702) |
| [T21: Attach durable quotes and receipts to chat turns](https://github.com/AustinKelsay/visibible/issues/77) | enhancement | ready-for-agent | T20, T06 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/77#issuecomment-5577233184) |
| [T22: Deduplicate image requests and guard terminal states](https://github.com/AustinKelsay/visibible/issues/78) | bug | ready-for-agent | None | [Execution brief](https://github.com/AustinKelsay/visibible/issues/78#issuecomment-5577234189) |
| [T23: Save each generation once and retain its image identity](https://github.com/AustinKelsay/visibible/issues/79) | bug | ready-for-agent | None | [Execution brief](https://github.com/AustinKelsay/visibible/issues/79#issuecomment-5577234690) |
| [T24: Constrain remote image storage fetches](https://github.com/AustinKelsay/visibible/issues/80) | bug | ready-for-agent | None | [Execution brief](https://github.com/AustinKelsay/visibible/issues/80#issuecomment-5577235259) |
| [T25: Complete one image through a durable Convex workflow](https://github.com/AustinKelsay/visibible/issues/81) | enhancement | ready-for-agent | T07, T22, T23, T24, T19, T06 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/81#issuecomment-5577235962) |
| [T26: Recover provider ambiguity and image storage failures](https://github.com/AustinKelsay/visibible/issues/82) | enhancement | ready-for-agent | T25 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/82#issuecomment-5577236425) |
| [T27: Resolve image cancellation against durable completion](https://github.com/AustinKelsay/visibible/issues/83) | enhancement | ready-for-agent | T26 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/83#issuecomment-5577237016) |
| [T28: Run a small bulk job entirely on the server](https://github.com/AustinKelsay/visibible/issues/84) | enhancement | ready-for-agent | T27, T08 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/84#issuecomment-5577237718) |
| [T29: Create and schedule whole-book queues within limits](https://github.com/AustinKelsay/visibible/issues/85) | enhancement | ready-for-agent | T28 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/85#issuecomment-5577238209) |
| [T30: Recover interrupted bulk items from generation truth](https://github.com/AustinKelsay/visibible/issues/86) | bug | ready-for-agent | T28 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/86#issuecomment-5577238931) |
| [T31: Make bulk pause resume and cancel authoritative](https://github.com/AustinKelsay/visibible/issues/87) | enhancement | ready-for-agent | T30, T29 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/87#issuecomment-5577239482) |
| [T32: Remove browser bulk leases and local counters](https://github.com/AustinKelsay/visibible/issues/88) | enhancement | ready-for-agent | T31, T10 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/88#issuecomment-5577240003) |
| [T33: Browse paginated history without breaking image links](https://github.com/AustinKelsay/visibible/issues/89) | enhancement | ready-for-agent | T23 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/89#issuecomment-5577240651) |
| [T34: Serve image counts and availability from bounded summaries](https://github.com/AustinKelsay/visibible/issues/90) | enhancement | ready-for-agent | T23 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/90#issuecomment-5577241088) |
| [T35: Bound publication impressions and measure reactive fan-out](https://github.com/AustinKelsay/visibible/issues/91) | enhancement | ready-for-agent | T07, T33 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/91#issuecomment-5577241845) |
| [T36: Keep Nostr publication identity stable through failures](https://github.com/AustinKelsay/visibible/issues/92) | bug | ready-for-agent | None | [Execution brief](https://github.com/AustinKelsay/visibible/issues/92#issuecomment-5577242333) |
| [T37: Use one generation interface in reader gallery and header](https://github.com/AustinKelsay/visibible/issues/93) | bug | ready-for-agent | T27, T33 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/93#issuecomment-5577242923) |
| [T38: Make preference hydration and persistence consistent](https://github.com/AustinKelsay/visibible/issues/94) | enhancement | ready-for-agent | T03 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/94#issuecomment-5577243508) |
| [T39: Separate welcome purchase and admin states](https://github.com/AustinKelsay/visibible/issues/95) | enhancement | ready-for-agent | T13, T10 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/95#issuecomment-5577243965) |
| [T40: Protect reader interaction through behavior tests](https://github.com/AustinKelsay/visibible/issues/96) | enhancement | ready-for-agent | T37, T38 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/96#issuecomment-5577244769) |
| [T41: Create repeatable Scripture chat evaluations](https://github.com/AustinKelsay/visibible/issues/97) | enhancement | ready-for-agent | None | [Execution brief](https://github.com/AustinKelsay/visibible/issues/97#issuecomment-5577245344) |
| [T42: Evaluate image quality and planner value](https://github.com/AustinKelsay/visibible/issues/98) | enhancement | ready-for-agent | None | [Execution brief](https://github.com/AustinKelsay/visibible/issues/98#issuecomment-5577245747) |
| [T43: Select model defaults from measured comparisons](https://github.com/AustinKelsay/visibible/issues/99) | enhancement | ready-for-human | T41, T42, T03 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/99#issuecomment-5577246228) |
| [T44: Exercise private and financial Convex handlers directly](https://github.com/AustinKelsay/visibible/issues/100) | enhancement | ready-for-agent | T08, T11, T06 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/100#issuecomment-5577246736) |
| [T45: Inspect durable unresolved work and financial outcomes](https://github.com/AustinKelsay/visibible/issues/101) | enhancement | ready-for-agent | T13, T26 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/101#issuecomment-5577247286) |
| [T46: Distinguish readiness from observed dependency health](https://github.com/AustinKelsay/visibible/issues/102) | enhancement | ready-for-agent | None | [Execution brief](https://github.com/AustinKelsay/visibible/issues/102#issuecomment-5577247753) |
| [T47: Apply bounded retention without losing financial evidence](https://github.com/AustinKelsay/visibible/issues/103) | enhancement | ready-for-agent | T09, T06 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/103#issuecomment-5577248596) |
| [T48: Align privacy credits and storage copy with behavior](https://github.com/AustinKelsay/visibible/issues/104) | enhancement | ready-for-agent | T39, T47 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/104#issuecomment-5577248980) |
| [T49: Prove data export restore and reconciliation](https://github.com/AustinKelsay/visibible/issues/105) | enhancement | ready-for-agent | T01 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/105#issuecomment-5577249640) |
| [T50: Switch new admissions without duplicating paid work](https://github.com/AustinKelsay/visibible/issues/106) | enhancement | ready-for-agent | T49, T25 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/106#issuecomment-5577250566) |
| [T51: Rehearse rollback with active jobs and payments](https://github.com/AustinKelsay/visibible/issues/107) | enhancement | ready-for-agent | T50, T31, T13, T44 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/107#issuecomment-5577251163) |
| [T52: Retire replaced image executors after old work drains](https://github.com/AustinKelsay/visibible/issues/108) | enhancement | ready-for-agent | T51, T32 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/108#issuecomment-5577251601) |
| [T53: Retire duplicated pricing and chat settlement paths](https://github.com/AustinKelsay/visibible/issues/109) | enhancement | ready-for-agent | T51, T21, T05 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/109#issuecomment-5577252377) |
| [T54: Retire replaced reader state and library queries](https://github.com/AustinKelsay/visibible/issues/110) | enhancement | ready-for-agent | T51, T40, T34 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/110#issuecomment-5577252828) |
| [T55: Close the modernization traceability and documentation audit](https://github.com/AustinKelsay/visibible/issues/111) | enhancement | ready-for-agent | T52, T53, T54, T45, T46, T36, T35, T48, T17, T43 | [Execution brief](https://github.com/AustinKelsay/visibible/issues/111#issuecomment-5577253512) |

## Verification

Read back all issue states, labels, brief bodies, native parents and native blockers from GitHub. Verified exactly one category and one state per issue, all issues still open, 67 matching briefs and complete source-item coverage. [Manifest](manifest.json) stores the remote comment identities and body hashes.

Application implementation is future work. Local planning and evidence files are uncommitted snapshots.
