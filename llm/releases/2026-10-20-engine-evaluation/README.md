# Initial release evaluation — 20 October 2026

Retained evidence for [#183](https://github.com/AustinKelsay/visibible/issues/183), before the Bible candidate run. This snapshot contains the complete legacy Bible baseline, the first 27 generic Holmes samples and a failed nine-image Watercolor correction trial. It does not record release acceptance. Austin Kelsay remains the human release owner; all scores here are provisional agent assessments, including every proposed accepted limitation. Human review of depiction, adaptation likeness, compatibility, accounting and latency is pending.

## Runs and spend

| Run | Completed samples | Provider spend | Provisional case/style verdicts |
| --- | --- | --- | --- |
| `release-2026-10-20-baseline` | 99: 33 Bible cases × 3 repeats | $3.34206675 | 19 pass, 9 proposed limitations, 5 fail |
| `release-2026-10-20-generic` | 27: 3 Holmes cases × 3 styles × 3 repeats | $0.94095520, including $0.00180070 scene preparation | 3 Classical pass, 3 Watercolor fail, 3 Icon proposed limitations |
| `release-2026-10-20-watercolor-correction` | 9: the same Holmes cases × Watercolor × 3 repeats | $0.31134575 | All 3 rows fail |

Total evaluation spend in this snapshot is **$4.59436770**. Both the primary candidate run and its failed correction count toward the separate $12 candidate allowance inside the authorized $16 evaluation cap. The baseline has a $4 cap. Full Bible preparation uses the separate $43 preparation allowance; guest credits were not reserved by the evaluation harness.

The $4 baseline/$12 candidate split above was the agent’s initial allocation inside the single authorized $16 evaluation cap. Subsequent prompt-v2 work reallocates unused baseline headroom within that same $16 cap, counts every earlier run and failed trial, and reserves an explicit $0.04 interruption allowance. See the [later production evidence](../2026-10-20-engine-production/README.md) for the current accounting. The historical manifests and prompts below remain unchanged.

The baseline's configured Nvidia planner returned 404 on all 99 attempts. Every image used the existing legacy fallback prompt. [The retained diagnostic](baseline-planner-diagnostic.json), prompts and `plannerOutcome` fields disclose this; this is the observed configured baseline, not successful planner output. All 99 image calls completed and supplied usage.

The Holmes manifest retains the complete 324-sample candidate plan, while its state and report contain only the 27 completed Holmes samples at this point. This original planning manifest predates #209: two Holmes labels still say `¶1` and `¶20`; the corrected case file, actual sample state and report use A Scandal in Bohemia Part I `¶1` and `¶42`. The original 324-call plan and its hash are retained as historical inputs, not represented as text sent to the provider. The 297 Bible candidate samples remain outstanding at this snapshot. No case, style, setting or required repeat was removed to improve the scores. [The corrected source references](https://github.com/AustinKelsay/visibible/pull/209) match the imported Holmes text.

## Visual failures and limits

Baseline failures remain visible in [scores](baseline/scores.json): Genesis 1:3, Job 38:4, Isaiah 6:2 and Daniel 7:9 include a human depiction of God in one or more repeats; Judges 19:29 includes explicit dismemberment. These are failures under the fixed evaluation expectations, not accepted limitations or evidence that the candidate has passed.

The registered Watercolor style produces white paper edges or unpainted corners in at least one repeat of every Holmes case. A correction trial strengthened the full-frame scene wording and removed the travelling-artist framing. Its changed style version omitted the earlier style reference, but margins still appeared. [The exact trial style](watercolor-trial/style.json), packets, images and failure scores remain retained. The registered style was restored; the failed trial is not a shipped correction, and the full-bleed requirement has not been weakened.

Classical Holmes images show useful identity consistency with room and clothing variation. Icon images have gold framing, partial perspective and one halo-like ring around the red-haired client; these are proposed limitations for human judgment. No real performer has been identified in these outputs, but that observation does not certify the prohibited-likeness gate.

- Baseline contact sheets: [1](baseline/contact-1.jpg), [2](baseline/contact-2.jpg), [3](baseline/contact-3.jpg), [4](baseline/contact-4.jpg), [5](baseline/contact-5.jpg), [6](baseline/contact-6.jpg).
- Holmes: [Classical](holmes/contact-classical.jpg), [Watercolor](holmes/contact-watercolor.jpg), [Icon](holmes/contact-icon.jpg).
- Failed trial: [Watercolor](watercolor-trial/contact-watercolor.jpg).

## Measurement boundaries

The harness renders through the engine's assembly, but it does not make an actual app image request. Its `total` timing excludes session admission, reservation, saving and settlement. The baseline harness total p90 was 4,840 ms over 99 samples. Holmes Classical cold p90 was 23,934 ms over three samples, and its prepared p90 was 10,937 ms over six samples. These do not satisfy or replace the required full-request prepared/cold production measurements.

The original Holmes run had 27 unavailable reference-input quotes. Its report's zero-sample quote mean and `withinLiteTarget` flag cannot prove quote accuracy. Original estimates remain unchanged. [PR #211](https://github.com/AustinKelsay/visibible/pull/211) repairs quoting using verified Lite reference-input usage; the subsequent trial has nine five-credit quotes and nine five-credit actual estimates. Neither harness run proves real guest reservation and settlement. The pricing usage fixture and its calculation are [documented separately](../2026-10-20-disabled-engine/reference-pricing.md).

## Reproducibility and preparation

Each run directory contains the original `manifest.json`, `report.json`, `state.json` with exact prompts and provider accounting, and the scored `scores.json`. Generic sample packets retain their own prompt, work, brief, style, canon, look, plan and reference versions. The run-level `promptVersion` is the older harness header; use each generic packet's version for its actual assembly. Initial inputs are retained in `baseline/cases.json` and `holmes/cases.json`; trial settings and style are retained beside the trial. Full-resolution outputs remain in the owner's ignored `evals/images/runs/<run>/outputs/`; the committed contact sheets expose every sampled output for this review. Paths to full-resolution files in the original JSON remain unchanged and resolve in that run directory.

CodeRabbit's evidence review raised three minor issues. The red-haired-client note was removed from the two unrelated Icon score rows; scores remain provisional and are editable review notes. All ten linked JPGs are present and listed in [the artifact hashes](sha256.json); CodeRabbit excluded binary files from its review, so the reported missing contacts were verified as present. The recorded prompts say `ART STYLE below` even though the style block is above the references. This is a generator wording defect requiring a future correction and affected-example verification. Historical `state.json` prompts are deliberately preserved, not rewritten to imply the correction was used for these images.

The [independent Bible audit](bible-reading-coverage.json) validates all 66 books, 31,102 units and 2,790 sections. [The Acts correction](acts-correction.json) removes a city from a character-only mention list while preserving section ranges and its actual setting. Coverage alone is not readiness: the original cast merge omitted 1,270 member placements and is being repaired before canon or activation. The approved production briefs are [Holmes #206](https://github.com/AustinKelsay/visibible/pull/206) and [Bible #212](https://github.com/AustinKelsay/visibible/pull/212). Holmes has active production analysis and [selected optional references](holmes-references.json); a failed room sheet was omitted after three attempts.

Public generic admission remains disabled. Full Bible canon/readiness, the remaining fixed candidate matrix, verified corrections, actual app accounting/latency, explicit human acceptance and the post-switch 24-hour observation remain required. Legacy execution is retained. Follow the [release runbook](../../workflow/ENGINE_RELEASE.md); do not infer an activation decision from successful provider calls or provisional scores.
