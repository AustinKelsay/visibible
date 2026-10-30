# Scene preparation

[Preparation](../../src/lib/engine/preparation.ts) makes one style-neutral scene plan for a moment, stores it in the work’s active analysis generation, and reuses it until its inputs change. The model chooses the scene and visible cast in one call. There is no generated section look, semantic review, cast repair, or feedback re-plan. A malformed reply receives one retry.

The source, the work’s interpretation, recurring visual identity, and rendering treatment remain separate:

- Imported reference text supplies the moment and its same-section neighbours.
- The work brief supplies tone, era and depiction rules. Work-specific instructions live in the [depiction profile](WORK-PREPARATION.md#depiction-profile), not Bible branches in the engine.
- Canon and reference sheets preserve recurring designs across moments, keyed by work, entry and life stage.
- Art style supplies rendering treatment. Image model, aspect ratio and resolution are rendering settings; none is a plan or canon identity.

## Planning contract

The configured [text model](../../src/lib/reading-pass/model.ts) receives the brief, section title, moment text, same-section neighbours, section cast and any owner-authored constraints. Neighbour excerpts are bounded to 400 characters. The model is asked to choose one representative instant, select only cast visible in it, leave fixed appearance to canon, and describe pose, action and situational details without an art style. Unnamed people and crowds may appear without canon when the source requires them.

The strict provider reply contains `focusQuote`, `instant`, `selectedCast: [{ entryId, evidence }]`, and seven scene fields: `primarySubject`, `action`, `setting`, `secondaryElements`, `mood`, `timeOfDay`, and `composition`.

Code checks structure and section cast IDs, drops duplicate IDs, and trims scene fields over 400 characters with an ellipsis. It does not extract source facts, judge the evidence, or reinterpret the cast. An unknown ID or malformed reply is retried once; two invalid replies stop preparation. These checks establish a usable contract, not semantic accuracy. The [evaluation suite](../workflow/IMAGE_EVAL_AND_RELEASE.md) measures that separately.

## Owner constraints and no-form subjects

Generated section looks are ignored, including their revisions. Historical records remain readable. They enter neither the planning prompt nor the plan’s dependencies or image provenance.

Owner looks and historical looks with unknown provenance remain literal constraints. The planner receives their place, time, weather, light and clothing; rendering uses those values verbatim. `lookVersion` exists in the packet only when constraints were selected. Adding, removing, editing or changing ownership of constraints invalidates the plan.

A work’s depiction profile supplies its rules for subjects without form. Effects-mode entries provide no canon description to the planner and no canon prose or reference sheet to rendering; their selected identity activates the work’s effects instructions. Symbol-mode entries use their declared canon form. A work without a configured effects mode cannot prepare a section containing an effects-mode entry. These are work data and structural requirements, not a new semantic reviewer. The finished-image check remains in place.

## Persistence and invalidation

The stored plan contains selected `{ entryId, stageId }` entries, the seven scene fields, and the model’s source/instant audit. `grounding.singleInstant: true` records the requested model contract, not an independently verified claim. Historical `review` metadata remains readable; new plans do not write it.

Plan dependencies are the moment, section, brief, section cast canon, selected owner constraints (or the `no-owner-look-v1` marker), and the applicable planning/depiction prompt versions. A version change refreshes a plan lazily. Styles, reader translations, image models and output dimensions do not invalidate analysis. Images and admitted generation requests retain the exact packet and versions they used.

Before publication, preparation rechecks owner constraints. The Convex mutation also checks their presence/version transactionally, including an owner constraint created after the final application read. Assembly rechecks section assignments and selected canon before loading references. Missing canon or an unavailable assigned stage stops preparation rather than substituting a different stage.

## Concurrency, spend and failures

Concurrent requests share an in-process promise and a durable preparation claim across instances. The existing 120-second claim and 90-second bounded wait remain. Every model attempt is recorded as owner preparation spend; guests pay only for admitted image generation. Failed preparation precedes image reservation and provider work.

Unreadable replies, unavailable required inputs, stale dependencies and an unresolved concurrent preparation return a retryable error. There is no legacy fallback. Prompt overflow is rejected before image spend. Clearing a plan requests fresh preparation without altering saved images. [Image generation](IMAGE-GENERATION.md#generic-generation-path) describes admission, immutable request replay, settlement and the finished-image check.

## Evidence and history

[Preparation tests](../../src/lib/__tests__/preparation.test.ts) exercise structural normalization, shared reuse, owner spending and concurrent publication through the real Convex validator. [Presence tests](../../src/lib/__tests__/engine-presence.test.ts) cover cast IDs and no-form delivery; [owner-constraint tests](../../src/lib/__tests__/moment-situation.test.ts) cover provenance and ownership races. Golden requests cover the Bible, Holmes and Alice. Scripted providers establish mechanics; they do not establish image quality.

The subtraction experiment compares [no generated looks](../releases/2026-10-30-no-generated-looks-text/README.md) and [no looks or semantic review](../releases/2026-10-30-no-plan-review-text/README.md), followed by [image and consistency evaluation](../releases/2026-10-30-no-plan-review-image/README.md). The first arm failed its text gate; the second passed. Image release approval is recorded in the image run and [release status](../releases/STATUS.md), not inferred from unit tests.

Earlier decisions and evidence remain in [ADR 0004](../../docs/adr/0004-forgiving-scene-preparation.md), [ADR 0005](../../docs/adr/0005-one-scene-description-unnamed-presence.md), [ADR 0006](../../docs/adr/0006-unseen-presence-speakers-and-launch-bar.md) and [ADR 0009](../../docs/adr/0009-reference-priority-over-a-shared-place.md). The historical review and generated-look contracts are not active runtime paths.
