# Daniel presence retest — 21 October 2026

**The planner selects the missing subject; the rendering still fails. Keep public generic admission disabled, retain the baseline, and leave [#183](https://github.com/AustinKelsay/visibible/issues/183) open.** All nine Daniel packets now contain the Ancient of Days canon and the protected FORMLESS SUBJECTS block. Full-resolution agent inspection found three narrow no-body passes, five clear failures and one ambiguous depiction. All three style rows fail overall. These are provisional agent assessments, with human visual and likeness acceptance still pending.

This evidence follows the [previous failed correction study](../2026-10-21-formless-corrections/README.md) and [planner fix #228](https://github.com/AustinKelsay/visibible/pull/228), merged at `93227e8`. No application code changes in this evidence PR. The generic image prompt stays `2026-10-21-generic-v3`; affected lazy plans use `2026-10-21-formless-presence-v1`. Registered styles, briefs, model selection, reader translation fetching, verse URLs and public image routing are unchanged.

## Selection and execution evidence

The [fixed plan](plan.json) allocates a **$0.40 subcap from the existing $0.47752830 evaluation remainder**, at most nine images and two plan attempts. It fixes Daniel 7:9 × Classical/Watercolor/Icon × three repeats, Gemini 3.1 Flash Lite Image, 16:9, fixed 1K and Haiku 5.5 preparation. [Dry-run manifest](manifest.json) records nine planned samples and a fitting estimate. Per-call reserves ($0.05 image / $0.005 preparation) are admission guards, not provider billing guarantees; an incomplete run is preferable to exceeding the allowance. Unknown usage blocks further paid calls.

[Before](before.json) and [after](after.json) snapshots show ready Bible generation 1, unchanged source hashes, cast, canon and owner corrections. Public catalog observations keep Watercolor/Icon unavailable. The private environment remained disabled; no deployment or public switch was made.

The cached Daniel plan `dcf9ed4a77ff18ad1f9c3132b0f3641e` described the divine presence but selected only Daniel. Normal lazy preparation refreshed it once, without a manual clear or edit. The generated plan `5951003af8b1ab4f397ac57297b9d786` selects `the_ancient_of_days` and `daniel_prophet_of_babylon`, and its inputs retain the new planner prompt version. Other section cast members remain absent. [Preparation evidence](preparation.json) and the exact returned JSON in the [first trace](attempt1/provider.ndjson.gz) bind that selection to the stored plan. The old plan remains in history. The owner look `1469b2542a3afbf77ed9921c8f727f20` and Elisha correction `55d396a737e0eb4a8072cb8f3e3807fb` remain intact.

Before any image call, [read-only preflight](preflight.json) assembled all nine exact prompts with the no-form canon/block, valid quotes, original owner look, reference hashes and a maximum of **6,928 characters**. No no-form sheet was selected. Classical sends zero references; Watercolor/Icon each send one registered style reference. The wrapper requires the Ancient of Days selection and blocks images on omission; a valid semantic omission would not cause a selective plan retry.

An initial local guard incorrectly required explicit `image_size: "1K"`. The production adapter omits that field for fixed-1K Lite (`supportsResolution` only returns true for models with multiple sizes). Consequently **all nine attempts were rejected locally, with zero image provider calls**, after the one successful preparation call. The unchanged [initial wrapper](run.mts), [failed state](attempt1/state.json.gz), [report](attempt1/report.json.gz), [score template](attempt1/scores.json.gz), [trace](attempt1/provider.ndjson.gz) and [execution counters](attempt1/execution.json) retain this operational failure.

The [image-only continuation](continuation.json) used a new run ID, the cached plan, zero allowed text calls and the remaining **$0.39965630** subcap. Its [wrapper](resume-images.mts) accepts the adapter's default 1K while retaining the model/aspect/packet/reference/count/budget guards. [Continuation dry run](image-manifest.json), [all-nine validation](image-preflight.json) and [read-only postflight](postflight.json) retain the exact same prompts and attachments as the initial preflight. Each prompt was sent to the image provider once; no paid image was retried or replaced. No new plan, look, reading pass, checker, reference generation or owner correction was made during the continuation.

## Visual result

Every original is retained unchanged and was inspected uncropped at full resolution. The [gallery](gallery.html) exposes all nine; [per-image notes](image-reviews.json) distinguish narrow criteria from [whole-case scores](scores.json). A hidden face, body made of light or garment-shaped seated figure fails the no-body constraint. Ambiguity stays unresolved.

| Style | No-body: pass / fail / review | Material retained failures |
| --- | --- | --- |
| Classical | 0 / 2 / 1 | Repeats 2 and 3 retain draped bodies; repeat 1 is ambiguous and has a signature-like mark |
| Watercolor | 2 / 1 / 0 | Repeat 3 retains a draped body; repeats 2 and 3 expose paper margins |
| Icon | 1 / 2 / 0 | Repeat 2 retains a seated draped body; repeat 3 has a glowing human silhouette |

Examples: [Classical 3](outputs/daniel-7-9-ancient-of-days/generic-classical-3.jpg) has visible hands and white drapery; [Icon 3](outputs/daniel-7-9-ancient-of-days/generic-icon-3.jpg) shows why faceless light is insufficient. [Watercolor 1](outputs/daniel-7-9-ancient-of-days/generic-watercolor-1.jpg) and [Icon 1](outputs/daniel-7-9-ancient-of-days/generic-icon-1.jpg) show empty fiery thrones with non-figurative radiance, but those narrow successes do not make their repeated rows pass. No actor or public figure is identified or likeness acceptance inferred.

The previous nine Daniel packets omitted the new canon-derived block and had seven clear body failures. These nine include it and still have five clear failures plus ambiguity. Planner wording and selected canon changed together; this small stochastic retest cannot isolate causality or establish a reliable improvement. The selection gap and image-model compliance are distinct. Repeating the current wording unchanged is unsupported by this evidence.

The original v2 matrix remains **236 / 324**, with 88 missing slots. These nine changed-preparation v3 images cannot fill those slots. Earlier Watercolor, seraphim and Revelation failures remain open. No failure is averaged away into a release pass.

## Accounting and verification

The nine images cost **$0.30743025** and the single preparation call **$0.00034370**, totaling **$0.30777395**. All ten provider responses returned measured usage, with no new uncertainty. The new preparation call belongs only to the $16 evaluation bucket. The image-only [native state](state.json.gz) totals images alone; [both execution records](execution.json), [both traces](provider.ndjson.gz) and the [summary](summary.json) reconcile preparation and images across the retained attempts.

| Separate authorized bucket | Cumulative measured | Uncertainty reserved | Remaining after reserve |
| --- | ---: | ---: | ---: |
| Preparation, $43 | $3.63511920 | $0.03000000 | $39.33488080 |
| Evaluation, $16 | **$15.78524565** | $0.04500000 | **$0.16975435** |
| Actual-app smoke, $1 | $0.06852150 | $0 | $0.93147850 |

Account snapshots are separate from authorization and can lag provider response accounting. [Final account observation](provider-balance.after.json) is retained; task spend uses exact response usage rather than account deltas. No account purchase or transfer between budget buckets occurred. No further paid calls are authorized by this bundle.

The [native report](report.raw.json.gz) and [score template](scores.template.json.gz) remain unchanged. The [derived report](report.json.gz) corrects only the legacy reproducibility prompt header to v3; packets already carry v3. “1 ready” means sample completion, not visual acceptance. CLI timings do not measure actual-app full-request p90 or prove the prepared/cold latency gates.

Run offline, without keys, models, network or deployment:

```sh
node llm/releases/2026-10-21-daniel-presence-retest/verify.mjs
```

[Hashes](sha256.json) cover every bundle file except the hash list. Verification checks the nine original byte hashes against provider responses, all prompt/reference/quote bindings, the versioned plan and unchanged owner records, retained local guard rejection, actual usage and separate budgets. Traces replace image data and opaque encrypted reasoning with byte counts/SHA-256 and omit account `user_id`; exact request/response text, request IDs and usage remain. Private raw traces and credentials stay outside git. Snapshot/postflight scripts are explicit live read-only evidence utilities; neither they nor execution wrappers are routine verification commands. The execution flag is a prerequisite, not spending authorization or permission to replay.

The [release runbook](../../workflow/ENGINE_RELEASE.md) remains in force. Human visual/likeness, compatibility/accounting, actual-app latency, named first-24-hour ownership/outcome and deliberate public-switch gates remain unsatisfied. Baseline retention and disabled public admission continue; legacy retirement is separate.
