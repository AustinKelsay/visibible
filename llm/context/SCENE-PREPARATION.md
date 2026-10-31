# Scene preparation

[Preparation](../../src/lib/engine/preparation.ts) creates a shared section guide and a scene plan for each moment, then stores them in the work's active analysis generation. The current pipeline retains its advisory plan review. The October 30 subtraction experiments failed the existing quality gates; they are evidence, not active alternatives.

## Separate responsibilities

- **Source:** the work adapter supplies reference text, the focal moment and same-section neighbours. It owns navigation and source identity.
- **Interpretation:** the work brief supplies tone, era and depiction rules. The [depiction profile](WORK-PREPARATION.md#depiction-profile) holds work-specific wording and supported depiction modes. Bible rules belong in Bible data.
- **Recurring appearance:** model-authored canon and reference sheets identify characters, places and objects by work, entry and life stage. They preserve designs across sections and do not learn from previously generated images.
- **Art style:** shared rendering treatment stays separate from the source, brief and cast. A deliberate change of setting or interpretation belongs in work data, not a surface style.
- **Rendering settings:** image model, resolution and aspect ratio affect the image request, not canon or plan identity. Reader translation is request context; planning uses the work's reference text.

These boundaries let the same engine illustrate the Bible, Holmes and Alice. They do not guarantee identical faces across models or styles. The [evaluation suite](../workflow/IMAGE_EVAL_AND_RELEASE.md) measures source fidelity and visual consistency separately.

## Guide, plan and review

A **section look** holds place, time, weather, light and situational clothing. A generated look is a suggestion to the planner and is never rendered verbatim. An owner-authored look, or a historical look with unknown provenance, is a literal constraint: rendering uses all five values from the saved record. Generated preparation never replaces an owner look.

The **moment planner** receives the brief, section title, moment text, neighbours bounded to 400 characters each, section cast and the look. It chooses one representative instant and the visible cast. Unnamed roles and crowds can appear without canon. Fixed designs come from canon; pose, action and changing conditions come from the plan.

The strict reply has `focusQuote`, `instant`, `selectedCast: [{ entryId, evidence }]`, and seven fields: `primarySubject`, `action`, `setting`, `secondaryElements`, `mood`, `timeOfDay`, `composition`. Code checks structure and cast IDs, drops duplicate IDs, and trims scene fields over 400 characters. Evidence is retained for audit, not verified as fact. A malformed reply gets one retry.

The **semantic review** sees the source, plan, selected canon and any literal owner constraints. It reports quoted problems; code checks the report's citations and IDs. Its actions are bounded:

- A depicted section-cast entry omitted from selection is added so it receives canon.
- Missing canon and conflicts with owner constraints are noted; re-planning cannot create canon or rewrite owner text.
- Other clear problems trigger one feedback re-plan. Remaining problems are kept as notes, except a still-embodied effects-mode subject, which stops preparation.
- An unavailable review keeps the plan with an explanatory note.

This is advisory model judgment, not a source-fact database or a guarantee of correctness. The [review module](../../src/lib/engine/plan-review.ts) defines its problem types and validation; [ADR 0004](../../docs/adr/0004-forgiving-scene-preparation.md) explains why most problems no longer refuse an image.

## Depiction modes

A work's profile defines how its cast may be shown. Effects-mode entries provide no canon prose to the guide or planner and no canon prose or sheet to rendering; a section cast containing an effects-mode entry activates the guide/planner wording, while selected effects-mode entries activate the rendering block. The reviewer still sees their canon. Symbol-mode entries use their declared canon form. A work without wording for a mode cannot prepare an entry in that mode. These contracts are work data, not Bible branches in the engine; see [ADR 0010](../../docs/adr/0010-work-depiction-profiles.md).

## Persistence and requests

A look depends on its section, brief and section-cast versions, plus applicable depiction instructions. A plan depends on the moment, section, look version and ownership policy, brief, cast versions, and planning/review/depiction prompt versions. Changes refresh affected preparation lazily. Styles and reader translations do not invalidate it.

Stored plans hold selected entries and stages, scene fields, source/instant audit data, and review rounds/problems/notes. Generated images and admitted requests retain their exact packet and provenance. An existing request replays its accepted inputs rather than selecting newer versions.

Preparation rechecks the look's version and ownership before publication; the Convex mutation validates dependencies transactionally. Assembly checks section assignments and selected canon before loading references. Missing canon or an unavailable assigned stage stops preparation rather than substituting a different stage.

Concurrent requests share an in-process promise and a durable claim. Claims last 120 seconds; other callers wait up to 90 seconds. Every guide, planning, review and retry attempt is recorded as owner preparation spend. Guest image charging remains in the generation route.

Unavailable or malformed required preparation returns retryable `503 Preparing scene` before image admission and spend. Prompt overflow returns non-retryable `503 Scene unavailable`. There is no legacy fallback. Clearing a plan affects future preparation, not saved images. See [Image generation](IMAGE-GENERATION.md#generic-generation-path) for admission, immutable replay, settlement and finished-image checks.

## Evidence and history

[Preparation tests](../../src/lib/__tests__/preparation.test.ts), [review tests](../../src/lib/__tests__/plan-review.test.ts), [presence tests](../../src/lib/__tests__/engine-presence.test.ts) and [owner-constraint tests](../../src/lib/__tests__/moment-situation.test.ts) cover mechanics. Golden requests pin the Bible, Holmes and Alice. Scripted providers do not establish visual quality.

The October 30 pass measured three removals without tuning prompts or relaxing gates: [generated guides alone](../releases/2026-10-30-no-generated-looks-text/README.md) failed text fidelity; [guides plus review](../releases/2026-10-30-no-plan-review-image/README.md) failed image quality and Bible setting consistency; [review alone](../releases/2026-10-30-review-only-text/README.md) failed text fidelity. The existing pipeline remains. These single-run model-scored results do not prove that every retained layer is necessary; they do prevent claiming these removals preserve quality.

The [same-section source diagnostic](../releases/2026-10-30-source-context/README.md) subsequently added complete source context only to local planner/review requests: 36 plans and 12 image trials. It reduced premature growth in the small house-entry sample but did not reliably preserve Alice’s giant state; a feedback re-plan dropped height despite retaining the source. It failed its declared criterion, so production source windows remain unchanged. These are unblinded model observations, not a release gate.

The subsequent [offline rendering-context candidate](../releases/2026-10-31-render-source-context-offline/README.md) preserves full source through final prompt assembly and gives it authority over changing state within the existing brief and constraints. It replays 24 eligible Alice/Holmes packets with fixed plans and ordered attachments and excludes 12 non-literal Bible packets. Its [paired visual diagnostic](../releases/2026-10-31-render-source-visuals/README.md) returned 24 scheduled images plus eight automatic retries. Only one of three chosen candidate gloves images clearly retains giant size, and candidate cellar images mix light/timing cues. The declared criterion failed; these unblinded model observations do not justify activation. The production prompt and source windows remain unchanged.

Before changing canon/state ownership or collapsing the plan fields, read the [offline input-conflict audit](../releases/2026-10-31-scene-input-conflicts/README.md): it traces episode-specific canon, successive poses and contradictory review responses to saved packets, and proposes bounded data corrections plus a separate ownership simplification. The [prepared correction copies](../releases/2026-10-31-scene-input-corrections/README.md) remain offline. Their [bounded visual comparison](../releases/2026-10-31-scene-input-visuals/README.md), using the unchanged prompt, failed its criterion: the entry control preserved pre-growth state, but the grown-house pose and the cellar lighting conflicts persisted. These unblinded model observations do not support activation or broadening.

Before changing rendering precedence, read the [ownership-only candidate](../releases/2026-10-31-scene-input-ownership/README.md) and its [completed visual comparison](../releases/2026-10-31-ownership-visuals/README.md): two replacement lines with original inputs held fixed. The candidate preserved the pre-growth control but failed the grown-house body and late cellar criteria in the small, unblinded sample. Do not activate or broaden on this evidence.

The [one-description implementation candidate](../releases/2026-10-31-scene-description/README.md) is an unapplied patch tested offline: one scene paragraph feeds review, rendering and image checking, while ordered cast IDs prioritize reference sheets. It preserves historical readers and changes no active runtime. Its mechanical checks do not establish visual quality; activation remains unapproved.

Earlier design decisions remain in [ADR 0005](../../docs/adr/0005-one-scene-description-unnamed-presence.md), [ADR 0006](../../docs/adr/0006-unseen-presence-speakers-and-launch-bar.md) and [ADR 0009](../../docs/adr/0009-reference-priority-over-a-shared-place.md). The [release status](../releases/STATUS.md) records deployments and current gates.
