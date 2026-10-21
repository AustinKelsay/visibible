# Daniel schema-guided planning pilot — 21 October 2026

**The v3 plan passed the pre-image text gate, but the three-image pilot did not pass the visual release gates. Keep public generic admission disabled and [#183](https://github.com/AustinKelsay/visibible/issues/183) open.** One plan call and three image calls cost **$0.10295855**, with no missing usage, retry, manual plan edit or discarded image.

This follows [planner response contract #232](https://github.com/AustinKelsay/visibible/pull/232), merged at `01fdbe3`, and the [v2 text-only pilot](../2026-10-21-daniel-canon-pilot/README.md). It runs local engine assembly against ready production Bible generation 1; it does not deploy application code or change the brief, models, styles, public routing or existing saved images.

## Scope and retained plan

The [plan](plan.json) reserves **$0.16** from the existing **$0.16937015** evaluation remainder, allowing at most two schema/error planning attempts and one original Daniel 7:9 image in each of Classical, Watercolor and Icon. The [dry-run manifest](manifest.json) estimates about $0.11. The [two-stage wrapper](run.mts) permits preparation first and requires an agent review bound to the exact plan before enabling image calls. Missing usage blocks further calls; per-call reserves are admission guards, not billing guarantees. These retained execution scripts are not authorization to replay the run.

The [before snapshot](before.json) matches the prior pilot's records, including its unchanged owner-authored section look. A normal lazy v3 cache miss made one Haiku 5.5 call for **$0.0004693** and stored plan `8cd89ee4aad16a597882ff9ccf05f0f0`. The [response trace](provider.ndjson.gz), [prepared result](preparation.json), [execution record](preparation-execution.json) and [after/history snapshot](after.json) retain the exact response and v3 input marker. The old v2 plan remains in history; all captured non-plan records, including canon, owner look and Elisha correction, are unchanged. No reading pass, look, reference or checker was regenerated.

The response selects both the Ancient of Days and Daniel. Its main subject explicitly places radiance and cloud above an **unoccupied seat**, with situational placement and Daniel's own action instead of the earlier face/body denial. The [pre-image review](plan-review.json) passed that single text response and recorded a remaining risk: “radiance pouring like wool” could influence the image toward cloth-like forms. This use of shared canon effects is not wholesale fixed-description restatement, but the visual result must still be inspected. No semantic retry or silent text rewrite occurred.

[Read-only preflight](preflight.json) and the separate [image preflight](image-preflight.json) retain the same three packets, full no-form canon and protected depiction block, unchanged source quotation, no no-form sheet, and quotes below the 8,000-character limit. All image requests reused the stored look and plan with zero additional preparation calls. The [image execution record](images-execution.json) and [state](state.json.gz) retain exactly three completed image calls for **$0.10248925**. Every output is bound to the provider response by byte count and SHA-256 in [dimensions](dimensions.json).

## Visual result

Open the [gallery](gallery.html), unchanged originals below, [per-image observations](image-reviews.json) or [provisional scores](scores.json). All originals are 1376×768 and were inspected uncropped. As in the prior retest, ambiguous silhouettes remain **review**, never a no-body pass. A whole-case fail means the release gate is not met; an ambiguity is not relabeled a confirmed bodily depiction.

| Style and original | Narrow no-body criterion | Whole-case release gate |
| --- | --- | --- |
| [Classical](outputs/daniel-7-9-ancient-of-days/generic-classical-1.jpg) | Review: white streams form cloth-like folds around the seat; no distinct head or limbs are resolved. | Fail: no confident no-body pass. |
| [Ink & Watercolor](outputs/daniel-7-9-ancient-of-days/generic-watercolor-1.jpg) | Review: draped, occupied-looking radiance around the chair remains ambiguous. | Fail: ambiguity plus exposed white paper margins. |
| [Byzantine Icon](outputs/daniel-7-9-ancient-of-days/generic-icon-1.jpg) | Pass: light columns and fiery thrones have no visible human-form divine occupant. | Fail: the scene repeats in three vertical panels. This is more than an Icon border limitation. |

The [raw report](report.json.gz) correctly remains inconclusive below its three-sample floor. One image per style cannot establish repeatability or continuity; continuity scores remain unassigned. There is no before/after frequency claim, human likeness acceptance or release acceptance. The original matrix remains **236/324**, missing 88 original slots; these newer targeted images do not fill those slots or resolve earlier failures. Local assembly/image timings and five-credit quotes are not actual-app reservation, settlement or full-request latency evidence.

## Accounting and verification

All four responses are charged only to the existing $16 evaluation allowance. Account funds do not increase task authorization.

| Separate authorized bucket | Cumulative measured | Uncertainty reserved | Remaining after reserve |
| --- | ---: | ---: | ---: |
| Preparation, $43 | $3.63511920 | $0.03000000 | $39.33488080 |
| Evaluation, $16 | **$15.88858840** | $0.04500000 | **$0.06641160** |
| Actual-app smoke, $1 | $0.06852150 | $0 | $0.93147850 |

The immediate account snapshot lagged the last image charge. A later [read-only balance](balance.final.json) reconciles the full response total: $11.412528742 before minus $11.309570192 after equals $0.10295855. Task spend uses each response's usage, not a balance delta. The [summary](summary.json) retains the separate buckets and results. No further paid calls belong to this run.

Run without credentials, network or provider calls:

```sh
node llm/releases/2026-10-21-daniel-schema-pilot/verify.mjs
```

The verifier checks every artifact hash, recorded source inputs, provider schema and exact stored response, v2 history and unchanged owner records, preflight/image request identity, original image bytes, all four response costs, scores, budgets and settled balance. Historical source comparisons require the recorded application source; do not rewrite old hashes when later code changes. Sanitized traces omit account identifiers and hash image payloads and opaque encrypted reasoning; credentials and raw traces stay outside git.

The [release runbook](../../workflow/ENGINE_RELEASE.md) still requires reliable visual/likeness acceptance, compatibility/accounting evidence, actual-app latency, follow-up ownership, an explicit public switch and the first-24-hour outcome. The next work is offline investigation of the remaining semantic ambiguity and presentation failures before another funded trial.
