# Exact look citations: offline candidate

The [funded comparison](../2026-10-24-rendering-review-check/RESULTS.md) stopped after 3/92 operations because both time-control replies copied JSON property syntax from the actual request. The semantic reasons identify the isolated night-versus-midday conflict, but value-only citation matching marks both reviews unavailable. Four calls cost $0.00148710. The attempt remains incomplete and cannot restart; no cold pipeline or clean control ran.

Review version `2026-10-25-rendering-review-v7` fixes that input/validation mismatch. Plain phrases within one look value remain valid. The matcher also accepts the exact complete JSON string for a nonempty value, the exact compact key/string member shown in the request, or that complete member without its first/last quotation marks, as in the second retained reply. The actual key and full value must match. Wrong keys, different values, key-only citations, truncated properties, empty values, enclosing objects/arrays and cross-field concatenation remain invalid. Existing whitespace/case normalization stays in force.

No arbitrary dequoting, fuzzy repair or parsing of character names is added. Accepted reports retain their original `planQuote`. Non-look citations keep their prior rules, and cast IDs, no-form IDs and selected-canon checks still apply. No problem kinds, schemas, prompts, model settings or retry limits change. The exact system/user request bytes are asserted equal to the captured requests. This repairs citation handling; it does not improve or validate semantic judgment.

The version marker refreshes old v6 plan approvals lazily while reusing a current look. A recognized look conflict still stops at the look stage without re-planning or storing a plan. Original look, canon and source prose remain intact. No application/backend deployment or activation is included.

## Verification

`npm test -- --run src/lib/__tests__/review-look-citations.test.ts` first failed both exact-reply regressions against unchanged v6. Both pass after the fix, each using one review attempt with its spend recorded. The expanded 14 tests cover the two recorded replies, plain/JSON-string citations, malformed and cross-field boundaries, escaped content, unchanged cast/non-look checks and a complete preparation probe. That probe makes three accounted calls, retains the original bad look, stops before storing a plan and makes no re-plan. The existing 17 rendering-contract tests also pass, including v6 cache refresh with an unchanged look. Full verification passes **1,019 tests with one existing skip**, plus lint and type checks.

Scripted replay tests do not make new provider requests, count as paid semantic scores or turn the original unavailable review into a pass. The original one-shot markers and every paid response/usage record stay unchanged.

## Immutable historical replay

The stopped attempt was replayed successfully in a disposable local clone at evidence commit **`5baafe6`**, before this source change. [Replay metadata](historical-replay.json) records dry-run verification and exact scored replay of all four charged replies and three results, with zero new calls/writes. All 30 cold pairs remain incomplete. Planned-denominator intervals in the frozen tally are not empirical acceptance rates for an unexecuted cohort.

To reproduce, retain/fetch the evidence branch and use a separate checkout at that commit with the locked dependencies and generated work bytes, then run the old `dry-run.mts verify` and `audit.mts finalize`. A squash merge alone does not make intermediate funding/score/evidence commits ancestors of `dev`. The frozen historical scripts intentionally reject this new v7 source; their hashes must not be updated to fit it.

## Subsequent validation and next boundary

The owner separately authorized the [frozen v6/v7 comparison](../2026-10-25-citation-validation/README.md), capped at $0.30 within the existing $17.50 evaluation allowance with no increase. It completed **92/92 operations / 233 calls / $0.14488520**, with no new uncertainty, images or production queries/writes. Exact citation handling worked on the actual time-control reply; strict controls were 14/16 candidate versus 12/16 baseline, with no false alarms on seven clean controls in either arm.

The full-packet gate still fails: **3/30 acceptable candidate versus 4/30 baseline**, both **0/7 retained**. Candidate stores two flawed and one uncertain packet. Both arms refuse 17 cases for reported shared-look conflicts, including questionable semantic judgments. First masked scores and alternatives remain immutable; even accepting every store cannot pass availability. [Complete results and offline reproduction](../2026-10-25-citation-validation/RESULTS.md).

Current measured evaluation total is **$17.20161110**, retained uncertainty **$0.045** and remaining **$0.25338890**. The grant ended with that one attempt and authorizes no further paid execution. The [next proposal](../2026-10-25-citation-validation/NEXT.md) asks the owner to choose between per-moment resolved situational conditions and the existing literal shared-look correction policy before implementation. Semantic source/canon accuracy, current full-request latency, visual quality, human acceptance and public activation remain outstanding.
