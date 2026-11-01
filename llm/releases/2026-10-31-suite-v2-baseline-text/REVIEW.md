# Fresh v2 reference: completed, not quality-approved

All 113 cases produced plans using the unchanged production engine and fresh preparation. This supplies a reproducible v2 text reference after the Queen fixture correction. It does not establish an acceptable quality baseline, causal improvement, image quality or a release gate. No candidate or production input was activated by this run.

## What the inspection establishes

The [inspection](inspection.json) covers every final plan once. Its narrow moment-state labels are **55 clear, 27 conflict and 31 uncertain**. These are unblinded model observations, not overall acceptance verdicts or exhaustive fault-key answers. “Clear” means no concrete state conflict was identified in that inspection; it does not clear lettering, likeness, reference selection, depicted form or every other fault. The [report](report.json) preserves the counts and limitations. The named holdout was already exposed in earlier diagnostics.

Concrete examples in [results.ndjson](results.ndjson), identified by `caseId`:

| Case | Source and retained plan | Interpretation |
| --- | --- | --- |
| `alice-cat-head-talks` | The Queen “smiled and passed on.” The final plan keeps her smile, while putting the Cat on a branch. The next supplied paragraph calls it the Cat's head; the earlier croquet-ground passage establishes its floating head. | The corrected Queen input permits the requested expression in this sample. The scene still changes another subject's state. One fresh sample is not a matched control for the removed clause. |
| `alice-refuses-to-leave` | The plan calls Alice “small” during the court's discussion of her enormous height. | A source-state concern persists. The focal dialogue is available, but the earlier explicit growth paragraph is outside this case's supplied context; this limits attribution to the planner alone. |
| `the-adventure-of-the-noble-bachelor-178` | Lestrade gestures at the open door while Holmes rises for his coat. The text places Holmes's rise after Lestrade shuts the door. | Successive instants remain combined. The final grounding itself says `singleInstant: false`, and the review records `kept with: not_one_instant sherlock_holmes`. This is the existing advisory-review policy, not an execution failure. |
| `holmes-speckled-band-vigil` | Holmes lashes the bell-pull while the cry sounds. The text explicitly says he had ceased striking before the cry. | Another sequence conflict remains; the final review has one round and no recorded problems. |
| `advice-from-a-caterpillar-59` | Alice's long neck coils among branches as the Pigeon protests. | A successful preservation of unusual temporary form. The run does not support a claim that every changing-state scene fails. |

The observations remain in the saved outputs; none were repaired. Two additional broader-source checks are explicitly marked in `inspection.json`. In particular, the Eyford journey's earlier morning timing supports questioning the repeated dusk setting, but those paragraphs were not in the local renderer/planner context, and no exact arrival time is asserted. The local-window uncertainties are retained.

## Preparation and review behavior

The 411 paid text exchanges comprise 98 fresh section guides, 155 plans and 158 reviews. Of 113 final plans, 71 have one semantic review round and 42 have two. Three additional review calls are the existing malformed-report retries: Psalm 137:1, Matthew 1:1 and Romans 10:17 replies used an empty `entryId` for `unselected_figure`, which the validator rejects. Psalm 137:1 did so twice; the unavailable review is retained. Every HTTP response, rejected reply, review reason and final advisory note remains in [provider.ndjson](provider.ndjson) and the results. All responses returned HTTP 200 and provider usage; there were no moderation refusals, failed case rows, blocked accounting or unsettled calls.

A network-blocked replay through the actual suite and text adapter reproduced all 411 request bodies and all 113 result rows exactly, excluding only elapsed time. The replay verified 28 execution-source hashes against the frozen commit, 19 preflight input hashes and 55 reference files. All recorded charges fit their reserved ceilings. The closing pricing catalog reproduces those ceilings, but is explicitly a post-execution capture, not independent evidence of the catalog at each paid request. See [verification](verification.json).

The [funding close](funding-close.json) preserves the first account observation, whose usage lagged the responses, and the later settled observation. Provider costs and the later account/key deltas reconcile to **$0.181192** for this run, zero uncertainty, and **$6.82885455 / $7** cumulative. **$0.17114545** remains authorized. The recorded closing account balance is **$8.653987538**, preserving the **$5** reader reserve. No images, paid scoring or production mutations occurred.

## Decision and next boundary

Preserve this run as a **provisional reference**, and do not broaden to images from it. The data now contains concrete plan errors that can be investigated without further generation. The smallest next investigation is an offline trace of the Cat/Queen scene through its source window, stable canon, generated guide, first plan, review and final plan. That can distinguish missing local context from a conflicting appearance instruction or an uncorrected model interpretation before proposing a change. It does not presume that more prompting, deleting review, or a new schema is the remedy.

Do not add a review layer, state database or work-specific rule on this evidence. Any eventual change should use the existing source/preparation boundary and be tested against a declared failure and a nearby valid scene. No follow-up implementation, paid run or larger budget is included in this evidence package.

The ordinary [scorer packs](scoring/SCORING.md) are retained but **unscored**. Before formal blind scoring, resolve the inherited instruction ambiguities about neighbouring context and which fault keys to answer. No formal v2 gate result is reported here. These artifacts contain no visual test or human acceptance.
