# Actual production requests — 22 October 2026

**Measured latency and accounting targets met in a small sample; visual release held.** [#183](https://github.com/AustinKelsay/visibible/issues/183) remains open. This independent owner check follows the [failed Daniel selected-cast text check](../2026-10-22-moment-cast-evaluation/README.md), retained in merged [PR #251](https://github.com/AustinKelsay/visibible/pull/251). It does not continue that stopped operation or accept its plan.

## Actual app, controlled session

The [plan](plan.json) pins reviewed application commit `ecd58e06537e2a09b97260fee7612c35f0feb879`, production Convex `unique-impala-244`, generation 1, one existing non-admin paid-tier session with **90 credits**, and separate hard allowances. No additional credit grant or account purchase occurred. The session SID/cookie and credentials are not retained. [Source hashes](application-sources.json) identify the application and checked import inputs; the work/brief versions match the ready analysis.

[Deployment record](deployment.json) identifies the staged production builds, promotion sequence and rollback. The same reviewed source was exported with `git archive` to a private directory. Both staged builds reported READY and their unauthenticated catalogs kept public Watercolor/Icon unavailable. The owner build added admission for only the controlled session; it kept ordinary guest quotes, reservations and settlement. The production environment's persistent setting stayed disabled; owner flags were per-deployment overrides. Vercel MCP required reauthentication, so the authenticated CLI performed these authorized operations. No backend deployment was needed.

An important execution deviation is retained: navigating the reader to empty Exodus 16:15 **automatically generated one image before the recorder was installed**. The operation stopped and restored disabled admission. [Audit](unexpected-navigation.json) and [redacted runtime events](unexpected-runtime.ndjson) identify its saved WEB image, five-credit debit, $0.034319 image usage and two preparation calls costing $0.00089220. No client full-request timing was captured, and the reader requested WEB. It is excluded from timing and KJV-request evidence. No replacement cold sample was invented.

The [continuation plan](continuation-plan.json) retains that image inside the same 18-request/$0.90 operation cap, leaving 17 guarded requests and 85 credits. The first guard tool invocation rejected trailing whitespace; owner admission reopened before corrected installation. The page remained on About with no additional image request. [Execution notes](execution-notes.json) disclose this ordering deviation; the [guard read-back](guard-before-batch.json) precedes every measured request. A [fresh read-only audit](continuation-preflight.json) confirmed the remaining eight inputs were untouched. The [historical browser harness](browser-harness-used.txt) records each request/reply, spaces starts, checks $0.05 of headroom before each new attempt, counts the earlier automatic usage, and stops on errors, missing usage or unexpected settlement. CodeRabbit subsequently identified a concurrency defect: limit checks occur before serialized starts and do not reserve pending capacity. This is archived as exact historical text, not a reusable guard. The actual batch awaited each response; retained timestamps prove no measured requests overlapped, and final totals stayed inside both caps. Any future harness must serialize admission and reserve pending count/budget before network calls. It made explicit HTTP requests from About rather than navigating the reader again.

## Measured requests and saved records

All **18 new images** succeeded: six per style, including the untimed automatic Classical image. All settled at five credits. The measured cohort is **eight cold + nine prepared requests**, not completion of the historical ten-plus-ten design. Old timings from earlier prompt versions are not pooled. Each style has three prepared samples; cold has two Classical, three Watercolor and three Icon samples.

| Full HTTP request, fetch through parsed response | n | Mean | Nearest-rank p90 | Target |
| --- | ---: | ---: | ---: | ---: |
| Both look and plan absent | 8 | 14.85 s | **17.75 s** | ≤20 s |
| Both current and reused | 9 | 5.92 s | **7.22 s** | ≤10 s |

The [measurement file](measurements.json), [cold browser prefix](browser-cold.json) and [complete measured replies](browser-prepared.json) retain exact per-style timings, request IDs and usage. These are small descriptive cohorts, not statistical repeatability or human latency acceptance. Before the prepared phase, [read-back](after-cold.json) showed all nine moments reusable with **zero model calls**. The later [saved-image collection](after-cold-saved.json) overlapped the start of prepared requests, so its intermediate credit/history reads are not used as the phase boundary. The settled [after-prepared snapshot](after-prepared.json) is the final accounting boundary. All nine cache inputs and resulting look/plan versions stayed identical across prepared requests.

For all **17 explicitly recorded KJV requests**, independently fetched saved records contain exact imported WEB text, `translationId: "web"`, `requestTranslationId: "kjv"`, generic engine, the chosen style, generation 1 and canon/look/plan/reference provenance. The automatic image requested WEB and is disclosed separately. The ordinary credit ledger gained **54 entries**: 18 reservations, 18 refunds converting the reservation, and 18 single five-credit generation debits, totalling 90 credits. Seventeen reservations were ten credits; the last used the remaining five-credit balance under the existing explicit-request spend-down behavior. The session ended at zero credits without admin billing.

After rollback, [completed replay](replay-disabled.json) returned HTTP 200, the same image and `reused: true` in 476.7 ms at that zero balance. [After-replay](after-replay.json) has the same 65 ledger entries, zero credits and unchanged preparation spend. Replay usage was not counted again. [Public read-only checks](public-saved-after-rollback.json) still returned saved images in all three styles. The public API exposes style/translation, not the internal engine field; Convex provides the independent engine provenance.

The actual reader kept its verse URL and changed its passage to KJV through the translation control: [DOM capture](reader-kjv.json), [screenshot](reader-kjv.png). Saved records remained WEB. The rollback [style menu](reader-disabled-styles.json) and [screenshot](reader-unavailable-styles.png) label Watercolor/Icon temporarily unavailable **for generation**, while keeping selection available for browsing saved images. Screenshot automation initially timed out twice; selecting this thread through the native UI made the embedded browser capturable. The screenshots provide context; the DOM capture is the exact text evidence. Test translation preferences were restored and the controlled browser returned to About. This does not certify every feedback/bulk UI state; the [146-test compatibility rehearsal](../2026-10-22-moment-cast-evaluation/rehearsal-summary.json) supplies separate controlled-provider coverage.

## Visual failures remain release blockers

All 18 outputs were inspected in the [Classical](contact-classical.jpg), [Watercolor](contact-watercolor.jpg) and [Icon](contact-icon.jpg) contact sheets. The [visual review](visual-review.json) records:

- **Exodus 16:15, both images:** a robed human-shaped being appears in the luminous cloud despite God's no-form canon and no selected formed sky figure. The prepared output was also viewed at native resolution.
- **Luke 10:33, both images:** Jesus and the lawyer appear inside the Good Samaritan story. The actual plan selects only those two while describing unselected Samaritan/wounded subjects. The section puts `the_samaritan` in `mentionedOnly` and lacks the parable participants in its scene cast. This exposes an embedded-story source/cast gap in addition to Daniel's presence failure. The selected-roster instructions do not make this plan correct.
- **Watercolor, all six images:** white paper or unpainted margins remain at the image edges.

No smoke image fills a fixed evaluation slot or receives a whole-release pass. Six Icon outputs show gold backgrounds and broad single scenes, but that limited observation is not source/era/likeness certification. These quality failures do not invalidate the measured latency and accounting; they prevent public visual acceptance.

[Image hashes](image-hashes.json) identify all full-resolution outputs under the owner's ignored `evals/images/runs/release-2026-10-22-owner-smoke/outputs/`. Contact sheets are committed; the native files are not. The verifier checks native hashes when those local files are present and reports how many it checked. [Contact-sheet script](contact.mts) only downloads saved images and composes evidence; it makes no generation call.

## Separate spending and final state

| Bucket | Authorized | Measured cumulative | Retained uncertainty | Remaining after uncertainty |
| --- | ---: | ---: | ---: | ---: |
| Preparation | $43 | $3.64575760 | $0.03 | $39.32424240 |
| Evaluation | $16.50 | $16.29800690 | $0.045 | $0.15699310 |
| Owner production smoke | $1 | $0.68579500 | $0 | $0.31420500 |

This operation used **$0.61727350 for images** and **$0.00491710 for 18 preparation calls**. Prepared requests added zero preparation calls. [The settled balance](balance-final.json) decreased by exactly the combined $0.62219060. No spend moves between buckets. The session's credits are exhausted even though the smoke-dollar allowance has headroom.

The [fresh dry manifest](current-matrix-dry-run.json) contains **324 planned current-prompt samples**, zero executed: 36 cases × three styles × three repeats. At the explicitly assumed $0.036/image plus conservative preparation, it estimates **$11.988**, far above $0.15699310 remaining evaluation headroom. This is an estimate, not a quote or authorization. Historical v2 completion remains 236/324 with 88 missing; current v4 smoke outputs cannot complete those slots.

The final [configuration proof](disabled-final.json) records production `visibible.com` on READY disabled deployment `dpl_4FE7JeXKq853nCxsrN2NYZYFdYjj`, persistent `GENERIC_ENGINE_MODE=disabled`, no configured production owner-session digest, and a public catalog with only Classical available. No public activation, human visual/likeness/accounting/latency acceptance or post-activation follow-up is recorded.

Run `npm run works:import`, then `npx tsx llm/releases/2026-10-22-owner-request-check/verify.mts`. The offline verifier checks hashes, source commit, nine zero-call cache replays, exact saved text/provenance, 54 new ledger entries, one debit per image, no-charge replay, timing math, all separate caps, balance reconciliation, public saved-image records and disabled state. It forbids network/model calls and live writes. `audit.mts` documents the read-only production collection; its already-retained phases refuse overwrite and require private env/session paths. Neither script authorizes a new paid operation.

CodeRabbit reviewed 37 text files and excluded five binary images. It raised one valid historical harness concurrency issue and one missing-binary false alarm. [Review and disposition](review-disposition.json) retain both; the historical source is archived unchanged as `.txt`, and the verifier proves the actual requests were sequential. The committed archive is checked for all five images. Repository lint, typecheck and the offline verifier pass.
