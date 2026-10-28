# Funded evaluation continuation — 20 October 2026

**Retain the baseline. Public generic admission remains disabled, and [#183](https://github.com/AustinKelsay/visibible/issues/183) remains open.** Classical and Icon now have all 108 fixed candidate samples each, but visual failures prevent acceptance. The nine-image Watercolor underwash trial failed its intended correction and is not promoted. This bundle changes no application code, registered style, approved brief, production configuration or existing image.

This follows the [production preparation and partial matrix](../2026-10-20-engine-production/README.md), the [Watercolor checker calibration and trial plan](../2026-10-20-watercolor-edge-check/README.md), and the fail-fast evaluation harness merged in [#225](https://github.com/AustinKelsay/visibible/pull/225). The source commit is `f1d244eed0c9edf5a7316e9cbb3d1b1bcd15b20d`. Dates use the owner's 20 October session; provider timestamps pass midnight in UTC.

## Completed requests and visual assessments

| Run | Completed | Newly rendered | New measured usage | Agent case verdicts: pass / limitation / fail |
| --- | ---: | ---: | ---: | --- |
| Classical | 108 / 108 | 87 | $2.96257065 | 19 / 12 / 5 |
| Icon | 108 / 108 | 95 | $3.26122425 | 17 / 15 / 4 |
| Separate Watercolor underwash trial | 9 / 9 | 9 | $0.30738975 | 0 / 0 / 3 |

There were **191 new image calls and two text preparation calls**, all HTTP 200 with known returned usage, and no new provider errors or uncertainty. Completion is distinct from visual acceptance. These are provisional agent assessments; Austin Kelsay's human visual/likeness, compatibility, accounting and latency acceptance is pending. A score of 2 or a provisional case pass does not supply that acceptance. No actor or public figure is identified by this review.

All 216 Classical/Icon outputs were inspected on uncropped contact sheets, ordered by the [unchanged fixed cases](cases.json), three repeats per row. Flagged originals were inspected at full resolution; [Classical](classical/image-reviews.json) and [Icon](icon/image-reviews.json) state exactly which. The nine trial originals were all inspected at full resolution. The [scores](classical/scores.json) and [Icon scores](icon/scores.json) include indirect genre illustrations, uncertain moment action, pending likeness review, and known Icon borders as explicit limitations. The original score templates have stale output lists initialized before resume; they are retained unchanged, and scored lists are reconstructed from completed state.

| Cases in each sheet | Classical | Icon |
| --- | --- | --- |
| Genesis light through Exodus sea walls | [1](classical/contacts/1.jpg) | [1](icon/contacts/1.jpg) |
| Leviticus pig through Elisha | [2](classical/contacts/2.jpg) | [2](icon/contacts/2.jpg) |
| Job through Isaiah's peaceful animals | [3](classical/contacts/3.jpg) | [3](icon/contacts/3.jpg) |
| Ezekiel through Peter walking | [4](classical/contacts/4.jpg) | [4](icon/contacts/4.jpg) |
| Peter at the sea through Romans | [5](classical/contacts/5.jpg) | [5](icon/contacts/5.jpg) |
| Crucifixion, Revelation and Holmes | [6](classical/contacts/6.jpg) | [6](icon/contacts/6.jpg) |

Material failures are retained as failures rather than averaged into a style score:

- **Daniel 7:9, both styles:** every repeat depicts a white-robed human body on the fiery throne. Classical adds a clear bearded face; Icon's masked face still leaves a body. The exact prompts already contain the brief's prohibition, no-form canon and scene-plan instruction to use radiance/fire. This is a rendering failure, not an absent instruction. Full-resolution [Classical](classical/exhibits/daniel-7-9-ancient-of-days-1.jpg) and [Icon](icon/exhibits/daniel-7-9-ancient-of-days-1.jpg) exhibits retain the violation.
- **Isaiah 6:2, both styles:** six-wing/covered-face/covered-feet fidelity is unreliable. [Classical repeat 2](classical/exhibits/isaiah-6-2-seraphim-2.jpg) has exposed feet, a cursive signature-like mark and a human-form presence in throne radiance. [Icon repeat 1](icon/exhibits/isaiah-6-2-seraphim-1.jpg) exposes angel faces/feet and puts a white-robed human body in upper radiance. Hiding the latter's face does not satisfy the body prohibition.
- **Elisha, both styles:** all repeats show short hair. The [Classical original](classical/exhibits/2-kings-2-23-bears-2.jpg) matches the exact canon's “short dark hair”, which conflicts with WEB's baldness detail and the fixed case expectation. This is a source/canon conflict. No canon edit or selective rerender was made during the matrix.
- **Classical genealogy:** [Matthew repeat 2](classical/exhibits/matthew-1-1-genealogy-2.jpg) contains rows of pseudo-writing despite the no-text rule. **Classical Revelation 4:** [repeat 1](classical/exhibits/revelation-4-6-living-creatures-1.jpg) has a robed/limbed silhouette around throne radiance; conservatively scored as a depiction failure. The [Icon counterpart inspected](icon/exhibits/revelation-4-6-living-creatures-2.jpg) remains a limitation requiring human review of the abstract throne/creature imagery, not an unqualified pass.
- **Icon crucifixion:** [repeat 1](icon/exhibits/matthew-27-35-crucified-1.jpg) has blurred duplicate side extensions around a sharp central panel, violating the continuous full-frame scene requirement. This is distinct from the specification's known Icon border limitation. The [David border](icon/exhibits/1-samuel-17-49-sling-2.jpg) and Peter border remain explicit accepted limitations.

The full fixed matrix still requires **324 samples** (36 cases × three styles × three repeats). There are now **236 completed original candidate samples**: Classical 108, Icon 108, original Watercolor 20. Watercolor still owes 88, and its completed original images already fail margins. The separate trial's nine changed-style images are excluded from this count and never relabelled as a successful corrected matrix. This is not a completed baseline/candidate comparison or a release pass.

## Watercolor correction rejected

The trial uses the exact [continuous-underwash style](watercolor-trial/style.json) prepared in #224, hash `27d726fe9919b5f6b987de21368bc64889068468bd86f1fe1a0b4e57067425a5`. The [fresh preflight](watercolor-trial/preflight.json) assembled all nine packets with cached preparation, no writes and no paid calls. Every actual packet omits the stale Watercolor style reference; Holmes character references remain available. The retained pre-run dry-run manifests, original/derived reports, state, exact sanitized provider trace, scores and nine unchanged full-resolution originals are retained in [watercolor-trial](watercolor-trial/).

The [image reviews](watercolor-trial/image-reviews.json) record **eight clear paper-margin failures and one ambiguous near-full-frame Holmes output**. All three case rows fail. Genesis repeat 1 also contains a possible robed silhouette requiring human depiction review. The trial cost **$0.30738975**, below the existing **$0.35 subcap**, with no preparation calls. It does not establish whether a newly remade reference would help. Registered Watercolor and the faulty references are unchanged; their earlier owner attention items remain relevant.

## Lineage, execution and accounting

The [preflight](matrix-preflight.json.gz) actually assembled 210 of 216 packets without mutation. Six packets (Elisha, three repeats in each style) hit a stale section look/scene plan after cast-input changes. A coarse preparation status alone had called those ready; actual assembly is the stronger evidence. The bounded run made two Claude Haiku 5.5 calls to refresh that style-neutral pair in Classical; Icon reused it. Their **$0.00049490** is included in evaluation spend, not charged again to the $43 preparation bucket.

All **34 previously completed Classical/Icon samples** had matching current prompts and packets in the preflight and remain exactly unchanged in final state. Their original costs were already in the previous ledger. Saved before-states, manifests and original reports retain the interrupted 402 history. The [resume plan](matrix-resume-plan.json) retained the original independent cumulative caps from [the production plan](../2026-10-20-engine-production/candidate-budget-plan.json): Classical **$3.78135925**, Icon **$3.78387625**. Final cumulative run usage is **$3.69525780** and **$3.71284275**, respectively. Each process also enforced its remaining image count, at most two text calls, model IDs, known usage before further calls, and a per-call reserve before its cap. No model substitution was used: image generation is Gemini 3.1 Flash Lite Image and text preparation is Claude Haiku 5.5.

The provider balance rose to **$10.725094442** after the user funded the account, then ended at **$4.193909792**. [Before](provider-balance.before.json), [after trial](provider-balance.after-trial.json) and [after both runs](provider-balance.after.json) snapshots are point-in-time account evidence. The intermediate balance lagged individual settlement; task accounting uses exact returned response usage, not a balance delta. No purchase was made by the agent.

| Separate authorized bucket | Measured cumulative | Uncertainty reserved | Remaining after reserve |
| --- | ---: | ---: | ---: |
| Preparation, $43 | $3.63511920 | $0.03000000 | $39.33488080 |
| All evaluation, $16 | **$13.00424880** | $0.04500000 | **$2.95075120** |
| Actual-app smoke, $1 | $0.06852150 | $0 | $0.93147850 |

New measured evaluation usage is **$6.53118465**, added once to the previous **$6.47306415**. The previous uncertainty reserve remains unchanged. The [summary](summary.json) keeps this ledger separate from run totals and their previously counted prefixes. Even the remaining 88 original Watercolor outputs would cost roughly $3 at observed per-image usage, before correcting and retesting failures. Do not infer that the remaining $2.95 can complete a corrected full matrix. Retain the baseline when inconclusive; no further paid calls are made by this bundle.

The files named `manifest.dry-run.json` retain the harness’s earlier planning snapshots, not post-run completion records. The CLI writes `manifest.json` only during `--dry-run`, so the files remained unchanged during live execution. The trial snapshot still says 0 done / 9 planned and is byte-identical to its before-manifest. Classical and Icon still say 9 done / 99 planned and match their retained before-manifests; those snapshots predate the interrupted Bible prefix and this resume. Their `withinBudget: false` compares **already spent seed usage plus estimated remaining usage**, not `estimatedUsd` alone: $3.564 estimated + $0.31135925 Classical seed (or $0.31387625 Icon seed) exceeds the cumulative cap. The fresh actual-packet preflight/resume plan above supersedes those coarse estimates. Final state, native reports and provider traces supply completion and measured accounting; the historical manifests are not regenerated to imply they were new plans.

Native reports retain all usage, completion, estimate variance and image-stage timing measurements. Their run-level prompt header is stale (`2026-09-08-canonical`); every actual packet identifies `2026-10-20-generic-v2`. Derived reports correct only that reproducibility metadata and preserve the native originals. “36 ready” is harness sampling readiness, not a visual verdict. These CLI timings do not measure actual-app full-request p90 and cannot satisfy the 10-second prepared / 20-second cold gate.

## Offline verification and next correction

Run without a key, network, provider call or deployment:

```sh
node llm/releases/2026-10-20-engine-funded-evaluation/verify.mjs
```

[Artifact hashes](sha256.json) cover this directory except the hash list itself. Verification parses compressed states/reports/traces; checks request counts, model IDs, exact retained-sample lineage, image hashes, prompt/reference binding, response usage, caps, failed-trial verdicts and aggregate budgets. Sanitized traces retain exact request text, returned text, provider IDs and usage. Image data URLs are replaced with MIME/byte count/SHA-256; encrypted opaque reasoning data is replaced with byte count/SHA-256; account `user_id` is omitted. Original private traces remain outside git. Full-resolution hashes identify all 225 originals; nine trial originals and eleven inspected exhibits are committed, while the other matrix originals remain in the owner's ignored run directories. Contact sheets resize each image to fit without cropping; their hashes are never substituted for source-image hashes.

Do not overwrite these paid runs or remove traces to force a repeat. A correction needs a new bounded plan/run, refreshed actual packet assembly and affected-case inspection. The next narrow correction should address human-form divine renderings and the Elisha source/canon contradiction, then retest affected examples within the remaining evaluation allowance. Watercolor needs a different demonstrated correction or an explicit human specification decision; this failed wording change supplies neither. Do not weaken the no-body or no-text rules to turn these into passes.

Actual-app cold/prepared/all-style latency measurements, human visual/likeness, compatibility and accounting acceptance, a named first-24-hour follow-up owner, the deliberate public switch and the follow-up outcome remain outstanding. The prior [disabled configuration and rollback proof](../2026-10-20-engine-production/README.md#final-configuration-and-outstanding-gates) remains the last deployed state; this evaluation made no deployment or admission change. Follow the [release runbook](../../workflow/ENGINE_RELEASE.md). Leave #183 open and legacy execution available for its separate retirement release.
