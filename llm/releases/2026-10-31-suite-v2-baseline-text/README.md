# Fresh v2 text reference run

**Completed; provisional reference only.** All 113 text cases produced plans using the unchanged engine and corrected Alice evaluation fixture. The [assessment](REVIEW.md), [report](report.json), [inspection](inspection.json) and [verification](verification.json) preserve the results. Source-state errors remain, so this is not a quality-approved baseline, activation or justification for an image follow-up.

## Fixed scope

Use the existing `evals:suite` runner for all 113 text cases across the Bible, Holmes and Alice, including the same 20 holdout cases. The suite seed, cases, split and fault definitions are unchanged. These cases have appeared in earlier diagnostics; the named holdout is not a newly unseen sample.

The [plan](plan.json) has no `from` run. Take a new read-only snapshot of Bible and Holmes analysis and load Alice from `evals/images/analyses/alice-in-wonderland-v2.json`. Preserve any literal owner constraints the normal snapshot loader finds. Generated section guides, plans and advisory reviews are made fresh; do not transplant v1 preparation. Retain the snapshot's ordered reference metadata and local byte hashes even though this run makes no images.

Keep all production prompts, models, schemas, work data, styles and provider settings unchanged. Alice v2's Queen expression correction is already selected by suite v2; this run makes no other input correction. The earlier v1 results remain evidence and are not a matching-version gate baseline or a causal control for this fresh run.

## Funding and stops

The user approved a $7 cumulative evaluation hard cap and then accepted the recommendation to establish a fresh baseline with corrected inputs ("your rec"). The last [funding close](../2026-10-31-canon-review-boundary/funding-close.json) records $6.64766255 conservative cumulative spend. The [funding record](funding.json) caps this one run at $0.30, bounding cumulative spend at $6.94766255 and preserving $5 for readers. The runner rechecks the account, key allowance and catalog pricing before paid execution and reserves each request's ceiling before sending it.

No images, paid scoring, production mutations, repeated run or cap increase are included. Commit the reviewed preparation before execution. Use the existing one-shot guards and ledger; retain partial outcomes and uncertain costs if the run stops. A finished marker alone is not success: inspect completeness, blocked accounting and unsettled calls before treating the result as usable. Do not restart a stopped run.

## Assessment declared before execution

Inspect every planned scene against its supplied source and record refusals and failures. Separate narrow observations about changing state from overall scene quality. In particular, check whether a plan preserves the focal instant, a source-stated change of size/expression/clothing/light, and the identity of its recurring subjects. Continuing identities and state may come from supplied neighbours, but a neighbouring event does not become part of the focal instant. Do not edit captured outputs to repair mistakes.

This first inspection is an unblinded model assessment for choosing a concrete follow-up, with independent evidence review. It cannot establish a blind release gate, a reliable improvement from one removed clause, visual quality or human acceptance. Keep ordinary scorer packs for later use, but do not claim that generating packs constitutes scoring. The two [previously disclosed scoring-template ambiguities](../2026-10-31-scene-description-text/README.md#review-disposition) must be resolved before a formal blind-scoring pass. There is no approved v2 quality baseline until that assessment is completed.

Choose a subsequent rendering comparison only if the completed evidence identifies a concrete, bounded change with a source-grounded expectation. Do not force another prompt or schema experiment from inconclusive results. Any proposed image comparison needs its own fixed inputs, declared criterion and available funding; this preparation does not authorize it.

## Reproduction

The [preflight](preflight.json) verifies 113 cases, 468 snapshot records and all 55 retained reference files. The snapshot used read-only queries and made no paid calls or production mutations. Relative to the retained v1 snapshot, Bible and Holmes record versions and references are unchanged; Alice differs only in the corrected Queen entry. This is an input inventory, not a paired quality comparison. The network-blocked rehearsal completed all 113 plans with 324 synthetic text calls, no image/check calls, no blocked ledger and no uncertain usage. All 27 focused suite, runner and actual-CLI tests passed.

The plan and snapshot are immutable run inputs. Before rehearsing in another checkout, copy the ignored reference JPEGs from the snapshot's original environment into `evals/images/runs/2026-10-31-suite-v2-baseline-text/references/`. Verify every file's SHA-256 and byte count against its `files` entry in `snapshot.json`; the snapshot contains metadata, not image bytes. Rehearse with scripted providers and no paid calls:

```sh
npm run works:import
npm run evals:suite -- run --run 2026-10-31-suite-v2-baseline-text --offline
```

The reviewed execution used the existing private evaluation environment and `--execute` once. All provider exchanges, ledger entries, results and source hashes are retained. The prepared `preflight.json` is intentionally unchanged and describes the pre-execution checks. The completed network-blocked raw-response replay reproduced 411 exact request bodies and 113 exact result rows (excluding elapsed time). No paid rerun is part of reproduction.

The run spent $0.181192 with zero uncertainty, bringing conservative cumulative spend to $6.82885455 of the approved $7. The settled account/key deltas agree; the $5 reader reserve remains intact. See [funding-close.json](funding-close.json), which retains the earlier lagging observation.

The full application suite passed: 1,053 tests, one skipped. Typecheck passed; lint completed with zero errors and three existing warnings. Preparation review by GPT-6.1 Sol approved with no findings. Local CodeRabbit preparation review found one documentation gap about ignored reference JPEGs; the reproduction paragraph above fixes it. Final evidence review by GPT-6.1 Sol independently reproduced the requests, results, hashes and accounting and approved with no findings. Two Sol rounds approved preparation and completed evidence; neither is a quality-gate or activation approval.


## Review disposition

The final local CodeRabbit review completed with warnings: four findings (three distinct issues), with one file reported unreviewed. Sol independently covered the complete 23-file package. The report now explicitly marks Psalm 137:1's review unavailable after both validation attempts, so recorded round counts cannot be mistaken for completed reviews. The claimed missing `plan.json`, `snapshot.json` and `funding.json` are present in this directory and were committed in preparation commit `c917199899f167132cdd5ccb9f32fc1bd8645343`; they were simply outside CodeRabbit's uncommitted diff.

The `/tmp` check-log paths in `verification.json` identify local session evidence and are deliberately not included in the repository. Their hashes were verified during independent review; a clean checkout can run the documented commands and repository checks, but cannot recover those local logs from a hash. Frozen inputs and raw model exchanges are retained here; reference JPEG availability is explained above.

**Deferred before formal scoring:** correct the shared scorer template's neighbouring-context rule, `ask` versus “every fault” wording, and the undefined `accepted` reference for text items. The repeated CodeRabbit scoring-instruction finding is valid, but this package preserves the original, explicitly unscored output of the existing CLI; silently editing one generated pack would not fix future packs. No score or gate result depends on these instructions in this run.
