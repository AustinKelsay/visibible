# Cat/Queen trace: the repair loses a correct detail

**Finding:** the first draft preserves the Cat's floating head. A review flags only the croquet hoops. The replacement draft repairs the hoops but changes the Cat to one perched on a branch. The correction request says to keep what was correct without including the draft it is supposed to preserve.

This is a free, offline trace of `alice-cat-head-talks` from the [fresh v2 reference](../2026-10-31-suite-v2-baseline-text/README.md), not a new experiment or an applied fix. Runtime, prompts, fixtures and production inputs remain unchanged. No model/image/account calls or spending occurred.

```text
Source + generated guide
  → first draft: floating head, wrong hoops
  → review: fix the hoops
  → original inputs + complaint (no previous draft)
  → replacement: correct hoops, Cat perched on a branch
  → review: add flamingo and hedgehogs to selected cast
  → stored plan and render prompt retain the perch
```

## Captured path

The [trace](trace.json) records source excerpts, original line hashes, both draft/review pairs, the exact retry suffix, field differences and reconstruction checks. Its `sourceHashes` bind the audit to the retained inputs and code at `b3a9dbca42a6ada54ffc9c9e8de2606a2e8a43bc`.

| Boundary | Verified observation |
| --- | --- |
| Source window | The focal moment covers The Queen's Croquet-Ground ¶49–51. ¶45–47 establish that the Cat appears in the air and stops at its head; they are outside the planner's immediate-neighbour window. The next supplied paragraph, ¶52, still refers to the Cat's head. The first draft gets the floating state right despite that limited window. |
| Generated guide | [Provider line 376](../2026-10-31-suite-v2-baseline-text/provider.ndjson#L376), made under `alice-cat-grin-appears/text`, reads the section's first moment, including the floating head. It invents “mushroom-shaped arches.” Its five fields supply no Cat perch. The same stored guide is reused for the target. |
| First draft | [Line 380](../2026-10-31-suite-v2-baseline-text/provider.ndjson#L380) explicitly describes the grinning head floating at Alice's shoulder. It copies the incorrect arches from the guide. |
| First review | [Line 385](../2026-10-31-suite-v2-baseline-text/provider.ndjson#L385) reports one `canon_conflict`: the hoops should be doubled-up soldiers. It does not ask to change the Cat. |
| Correction input | [Line 387](../2026-10-31-suite-v2-baseline-text/provider.ndjson#L387) has the same system message, original user prefix and provider settings as the first draft. Its only addition is the complaint and an instruction to keep what was correct. There are exactly two messages, system and user: no assistant history, previous draft or floating-head description is carried forward. |
| Replacement draft | The response on line 387 introduces “perched on a branch.” All seven scene fields change in wording; only one reported problem prompted the rewrite. Not every changed word is itself a defect. |
| Second review | [Line 390](../2026-10-31-suite-v2-baseline-text/provider.ndjson#L390) reports only unselected flamingo and hedgehogs. It does not flag the perch. Preparation adds those selections and stores the replacement. |
| Rendering boundary | [Result line 107](../2026-10-31-suite-v2-baseline-text/results.ndjson#L107) retains that plan. Reassembly produces the same recorded 8,267-character Watercolor prompt length and reference metadata; all seven saved fields appear verbatim. It has **zero reference attachments**. No image was generated, so this is prompt evidence only. |

The [feedback function](https://github.com/AustinKelsay/visibible/blob/b3a9dbca42a6ada54ffc9c9e8de2606a2e8a43bc/src/lib/engine/preparation.ts#L208) takes only problem strings. The [retry call site](https://github.com/AustinKelsay/visibible/blob/b3a9dbca42a6ada54ffc9c9e8de2606a2e8a43bc/src/lib/engine/preparation.ts#L345) never passes the draft. The [text adapter](https://github.com/AustinKelsay/visibible/blob/b3a9dbca42a6ada54ffc9c9e8de2606a2e8a43bc/src/lib/reading-pass/model.ts#L76) sends a fresh system/user request each time; it supplies no implicit conversation history. Assembly's [plan handoff](https://github.com/AustinKelsay/visibible/blob/b3a9dbca42a6ada54ffc9c9e8de2606a2e8a43bc/src/lib/engine/assemble.ts#L181) and [rendering block](https://github.com/AustinKelsay/visibible/blob/b3a9dbca42a6ada54ffc9c9e8de2606a2e8a43bc/src/lib/engine/prompt.ts#L216) carry the replacement fields forward.

## What this rules out, and what it does not

1. **The initial planner did not miss the floating head in this sample.** The missing earlier paragraphs may make the state harder to infer, but they cannot explain a claim that the first draft was already perched. Both planner calls receive the same local source.
2. **Canon does not directly instruct the correction planner to sit on a branch.** Normal formed-character canon is absent from both planner requests; those get cast IDs and names. The Cat's saved stage says “sitting posture” and also says its body is often absent. That prose reaches the reviewer and renderer, not this planner. The review feedback sent back to the planner concerns only hoops. The trace cannot establish whether latent associations, phrasing or other model influences caused the replacement's choice.
3. **The first observed perch is in the replacement response.** It is not a mutation introduced by cast selection, prompt assembly, art style or a reference image. The second review misses it. This is an observed repair regression alongside a concrete missing-draft handoff, not a controlled causal demonstration that adding the draft fixes the model.

A separate [retained wood scene](../2026-10-31-suite-v2-baseline-text/results.ndjson#L108), `alice-cheshire-cat-bough`, legitimately places the Cat on a branch. The earlier croquet-ground appearance retains its floating head, though its sequence compression was already marked flawed in the baseline inspection. These are scope checks, not quality controls from a new experiment. A blanket ban on perching, a permanent head-only canon or a Cat-specific rule would be wrong.

## Smallest next candidate

Let the existing single correction request receive the **current draft's normalized scene fields and effective selected cast**, in addition to the existing source, brief, guide and review problems. Ask it to revise the identified problem while preserving other source-consistent details. Keep the source authoritative: the draft is a proposal, not a new canon or a set of facts.

```text
Current: source + guide + complaint → generate another plan
Candidate: source + guide + current draft + complaint → revise that draft
```

This is a change to the existing feedback construction, not a new schema, verifier, revision table or extra model call. It also need not send the model's unverified evidence/grounding claims as if they were source. Including the draft increases request tokens; it is not a demonstrated cost saving. Prompt versioning, existing owner constraints, cast updates, depiction restrictions and accounting must remain intact if the candidate is implemented.

A bounded follow-up should first verify that the actual retry request contains the effective draft, source and complaint, with no additional calls. A paired text check can then measure whether it repairs the hoops **and** preserves the floating head, retains the Queen's source-stated smile, and still allows the earlier valid branch scene. Include a case where a real source/depiction error requires changing the draft so preservation does not become an instruction to freeze mistakes. Use the existing machinery and declare repeated-sample criteria and funding before paid execution. The broader quality gates still apply before production activation. This audit neither applies that candidate nor claims it will pass.

## Verification and limits

The existing preparation and plan-review suites pass: **38 tests** (`npm test -- --run src/lib/__tests__/preparation.test.ts src/lib/__tests__/plan-review.test.ts`). These cover existing mechanics, not a candidate fix or visual outcome.

A temporary network-blocked replay seeds the already captured section guide, retains only the section, its three moments and seven cast entries (**11 records**), and feeds the target's four captured provider replies through the actual suite/text adapter. It reproduces all four request bodies and the final result exactly, excluding elapsed time. Its source-state assertion fails as expected:

```text
exactRequests: 4; exactFinalRows: 1; networkCalls: 0
AssertionError: Known source-state failure: Cat remains perched on a branch
```

Separately, the normal assembly path reconstructs the saved plan without model calls. The trace records its prompt hash, packet and empty ordered reference list. Both replays use original outputs; neither simulates a successful corrective model response. The symptom check is deterministic only for the frozen replies, not a regression test proving a future model request succeeds. No runtime test or new evaluation runner is added for this documentation-only audit.

The historical source and line hashes can be recomputed directly from the retained files; reconstruct the saved Watercolor packet using the recorded look and plan in the existing in-memory preparation store. The temporary investigation helpers and logs are local session evidence, not repository dependencies. This checkout already contains the ignored imported work JSON; a clean checkout must run `npm run works:import` before replay. No reference JPEGs are required for this target because it has no attachments.

The result is one captured sequence, inspected unblinded by a model. It establishes the path and missing retry input, not general failure frequency, image quality, human acceptance or the value of deleting the reviewer. The earlier [review-removal experiment](../2026-10-30-review-only-text/README.md) remains negative evidence; this trace does not overturn it. No new paid authorization was used, and the last cumulative evaluation spend remains $6.82885455.
