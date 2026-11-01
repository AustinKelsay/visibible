# Scene preparation

[Preparation](../../src/lib/engine/preparation.ts) creates a shared section guide and a scene plan for each moment, then stores them in the work's active analysis generation. The pipeline retains its advisory plan review. The [30 October–1 November simplification investigation is closed](#closed-simplification-investigation); its unactivated candidates are historical evidence.

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

## Closed simplification investigation

[Preparation tests](../../src/lib/__tests__/preparation.test.ts), [review tests](../../src/lib/__tests__/plan-review.test.ts), [presence tests](../../src/lib/__tests__/engine-presence.test.ts) and [owner-constraint tests](../../src/lib/__tests__/moment-situation.test.ts) cover mechanics. Golden requests pin the Bible, Holmes and Alice. Scripted providers do not establish visual quality.

**Closed on 1 November 2026.** Keep the existing preparation pipeline. The merged changes removed unused Genesis-theme computation, enabled [high reasoning for cast identity merging](../releases/2026-10-30-identity-alice-merge/README.md), and corrected the Queen's expression in the [evaluation-only Alice fixture](../../evals/images/README.md). Existing completed analyses were not regenerated by the reasoning change. No section-note store, replacement scene schema or additional review layer was activated.

| Question | Retained result and decision |
| --- | --- |
| Remove guides or review? | [Guides alone](../releases/2026-10-30-no-generated-looks-text/README.md), [guides plus review](../releases/2026-10-30-no-plan-review-image/README.md) and [review alone](../releases/2026-10-30-review-only-text/README.md) failed their unchanged gates. Keep the pipeline; these samples do not prove every layer indispensable. |
| Activate the fresh Alice analysis? | The [identity visual diagnostic](../releases/2026-10-30-identity-visuals/REVIEW.md) retained source-state and appearance problems. Improved identity merging did not establish visual acceptance; the analysis stays local. |
| Supply more source? | [Planner/reviewer context](../releases/2026-10-30-source-context/README.md) and [rendering context](../releases/2026-10-31-render-source-visuals/REVIEW.md) failed their declared criteria. Source windows and rendering precedence remain unchanged. |
| Correct inputs or simplify ownership wording? | The [input audit](../releases/2026-10-31-scene-input-conflicts/README.md) found real conflicts. [Corrected-input images](../releases/2026-10-31-scene-input-visuals/REVIEW.md) and [ownership-only images](../releases/2026-10-31-ownership-visuals/REVIEW.md) did not establish the required improvement. Broad corrections and wording candidates remain unapplied. |
| Replace seven fields with one description? | The [paired text comparison](../releases/2026-10-31-scene-description-text/README.md) did not support the replacement. The implementation patch remains archived and unapplied; no image follow-up is scheduled. |
| Change the canon-conflict reviewer? | The [bounded comparison](../releases/2026-10-31-canon-review-boundary/REVIEW.md) also supported removing the Queen's fixed frown. Only the evaluation fixture was corrected; the reviewer patch remains unapplied. The [fresh v2 reference](../releases/2026-10-31-suite-v2-baseline-text/REVIEW.md) is provisional and unscored, with an exposed holdout. |
| Give correction its prior draft? | The [Cat/Queen trace](../releases/2026-10-31-cat-queen-state-trace/README.md) motivated a [bounded comparison](../releases/2026-11-01-replan-draft-text/REVIEW.md); preservation was not fully demonstrated. The [final-review continuation](../releases/2026-11-01-correction-final-review/REVIEW.md) stopped after eight corrections when two reports failed cast-ID validation. Keep the candidate unapplied; no restart. |

Repair, validity and preservation remain separate judgments; a source-valid alternative can lose the original depicted instant. The [correction contract](../releases/2026-11-01-correction-contract/README.md) defines that distinction. Review citations validate attribution, not truth, and an empty report is not acceptance. The retained diagnostics disclose model scoring, source-window gaps and unblinded inspection; none supplies human acceptance or a general continuity guarantee.

The investigation schedules no further model calls or activation. Dated recommendations in its release records describe the investigation's sequence, not a pending queue. Preserve the recorded inputs, scripts, raw results and failed attempts for reproduction; merging evidence does not promote a candidate. [Release status](../releases/STATUS.md) distinguishes this closed series' accounting from earlier grants.

Earlier design decisions remain in [ADR 0005](../../docs/adr/0005-one-scene-description-unnamed-presence.md), [ADR 0006](../../docs/adr/0006-unseen-presence-speakers-and-launch-bar.md) and [ADR 0009](../../docs/adr/0009-reference-priority-over-a-shared-place.md). Existing release gates remain in force.
