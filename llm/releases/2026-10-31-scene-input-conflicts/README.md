# Scene input conflicts — offline audit

**Recommendation: repair the saved descriptions before adding instructions.** The retained Alice and Holmes packets contain episode-specific events in canon and successive poses in a single plan. The rendering prompt also ranks whole blocks in an order that conflicts with its own division of responsibilities. These are concrete input defects; this audit does not establish which caused a particular image failure.

Reviewed at `7f68f6e144f49a42749bd4ea072d6c4d43301d31`, after the [paired rendering diagnostic](../2026-10-31-render-source-visuals/README.md) failed its criterion. This pass reads existing source, provider exchanges and saved packets. It makes no provider calls, changes no production inputs and creates no evaluation runner. The examples below are diagnostic records, not a read of the active production database.

Source links below point to committed compressed snapshots. Paragraph numbers refer to the generated `work.json` files; `npm run works:import` rebuilds them offline from those snapshots.

## Intended ownership

```text
Source + work brief → what happens and what may be depicted
Scene plan          → one instant and its changing state
Canon + references  → recurring appearance
Art style           → visual treatment
Model/settings      → how the image request is executed
```

Rendering rules, work depiction rules and literal owner constraints still apply. A giant Alice can remain a seven-year-old with a child's build. Her age and identity do not need to change when her size does.

## What the saved inputs demonstrate

**1. Location canon contains events.** The [Rabbit-house canon](../2026-10-30-identity-visuals/canon.json#L1045) ends with “the house visibly strains around a grown Alice.” That sentence travels with the house even before Alice drinks. The cellar canon supplied in [provider row 94](../2026-10-30-source-context/text-provider.ndjson#L94) includes “a tunnel mouth dug through the wall.” In the [source snapshot](../../../works/sources/pg1661.txt.gz), *The Red-Headed League* ¶190–192, light first appears between floor stones and a floor stone is lifted later. A permanent wall opening supplies both the wrong geometry and a later event. The [canon drafting prompt](../../../src/lib/reading-pass/canon.ts#L61) already asks for identity only and excludes other people/actions from locations; another general prohibition would repeat an existing rule. Saved entries require explicit correction or redrafting.

**2. Plans combine successive states.** In `alice-house-grown-section-1`, the primary subject has an arm out the window and a foot up the chimney, while the action keeps an elbow against the door and the other arm around her head. [Provider rows 46–47](../2026-10-30-source-context/text-provider.ndjson#L46) preserve both the plan and the review identifying this conflict. The [source snapshot](../../../works/sources/pg11.txt.gz), *The Rabbit Sends in a Little Bill* ¶7, explicitly progresses from the earlier pose to the window/chimney pose. The plan is retained with `singleInstant: false` and a note, as the advisory policy permits.

`holmes-cellar-section-1` likewise says Holmes “has just shut” his lantern while including the floor-light cue that follows an hour and a quarter of waiting ([rows 95–96](../2026-10-30-source-context/text-provider.ndjson#L95); source ¶186, ¶190). Its generated guide attributes that glint to the shuttered lantern ([saved row 32](../2026-10-30-source-context/text-results.ndjson#L32)). These are conflicting inputs even without inspecting an image. They do not explain every cellar failure: other retained plans choose the later instant without the “just shut” clause.

**3. Feedback can discard correct state or contradict its own verdict.** The first gloves plan explicitly says Alice is very tall. A review objects to the Rabbit flinging rather than dropping the gloves; the re-plan fixes that action but drops Alice's height ([rows 4–7](../2026-10-30-source-context/text-provider.ndjson#L4)). This is a demonstrated loss during feedback, not proof that the image model cannot infer size from source.

The grown-house and cellar reviewers also return nonempty `canon_conflict` items whose reasons say there is no clear conflict ([rows 45](../2026-10-30-source-context/text-provider.ndjson#L45) and [94](../2026-10-30-source-context/text-provider.ndjson#L94)). The [caller](../../../src/lib/engine/preparation.ts#L339) re-plans because the problem list is nonempty. Citation validation does not establish the meaning of the reason. Parsing phrases such as “not a conflict” in code would add a brittle language rule; deleting review outright would ignore its [failed removal experiment](../2026-10-30-review-only-text/README.md).

**4. The prompt has two competing ownership rules.** [The precedence line](../../../src/lib/engine/prompt.ts#L98) ranks canon, then art style, then scene plan. Beside it, domain ownership assigns light, clothing and action to the plan. The [plan heading](../../../src/lib/engine/prompt.ts#L216) repeats its subordination to canon and style. That leaves changing state subordinate to blocks that should supply appearance or treatment. Classical “luminous, dramatic lighting” can depict a dark scene; it does not itself require a lit lantern. The conflict is in the contract, and its visual effect remains unmeasured in isolation.

## Concrete subtraction proposal

First prepare corrections to the existing inputs, preserving the originals and their provenance. These are proposed data edits, not applied changes:

| Input | Remove | Retain |
|---|---|---|
| Rabbit-house canon | “so the house visibly strains around a grown Alice” | Modest room scale and recurring architecture |
| Cellar canon | “and a tunnel mouth dug through the wall” | Vault architecture, stone floor and crates; the opening belongs to the chosen moment |
| Grown-house plan 1 | The earlier elbow/arm-around-head pose from `action` | The selected window/chimney instant |
| Cellar plan 1 | “has just shut” and earlier waiting-stage details when choosing the later floor-light instant | Shuttered lantern, hidden observers and the source's later floor-light cue |

Do not replace the wall tunnel with a permanent floor hole. Do not remove Alice's childlike build. Repairing these inputs creates a cleaner control; it is not evidence of improved rendering and does not justify activating the previously rejected candidate. A canon correction must use the existing version/correction path and handle dependent reference sheets and plans; editing an old diagnostic file would erase evidence without updating readers' inputs.

For a separate, generic prompt simplification, replace whole-block ranking with ownership in the existing builder. Proposed wording:

> Follow the rendering rules and work brief; owner look constraints remain binding. Within those constraints, explicit source facts and changes govern the depicted moment. The plan selects one instant and its changing state. Canon supplies recurring appearance. Art style supplies visual treatment.

Shorten the plan heading to `SCENE PLAN (one instant and its changing state):`. This retires competing instructions instead of adding another authority layer. It is a candidate contract, not an approved runtime change. Keep source clipping, depiction handling, plan fields, reference selection and model settings fixed when assessing it; the preceding diagnostic changed source content and precedence together and cannot isolate this wording.

## Keep the next change bounded

The stored `grounding.instant` is audit data; rendering and review consume seven scene fields. Replacing those fields with the sentence is not a proven shortcut: the initial grown-house sentence itself combines poses, while [reference priority](../../../src/lib/engine/prompt.ts#L141) uses `primarySubject`/`action` and [the finished-image check](../../../src/lib/engine/generation.ts#L366) uses `primarySubject`/`secondaryElements`. A schema collapse would need to preserve those consumers and earn its own evidence.

The useful result here is a small correction list and one isolated ownership proposal. Preserve the existing release gates, source/depiction boundaries, financial admission and reference machinery. No new state extractor, semantic parser, review layer or book-specific engine branch follows from these examples. Offline inspection establishes contradictory text and its path to rendering, not perceptual causality, general quality or human acceptance.

Verification: the cited provider answers, source paragraphs, saved plan state and actual prompt clauses reconcile. The initial filesystem-only link check missed two ignored generated source files; CodeRabbit's PR review caught them. Both links now target committed snapshots, and all 40 local links and line targets in this audit and its context page were rechecked against Git. Offline source verification reproduces the cited work inputs. GPT-6.1 Sol on xhigh approved in one round with one citation nit, fixed by pointing the precedence link to line 98. CodeRabbit CLI reported zero findings. Application suites were not rerun for this documentation-only change.
