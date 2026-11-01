# Fresh v2 text reference run

**Prepared; not executed.** Establish a fresh reference run for the unchanged engine using the corrected Alice evaluation fixture. This is input collection and diagnostic assessment, not a candidate activation or a completed quality baseline.

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

The reviewed execution uses the existing private evaluation environment and `--execute` once. Preserve all provider exchanges, ledger entries, results and source hashes. Final spend and outcome reconciliation will be added after execution; no completion or quality result is claimed here.
