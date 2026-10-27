# Section looks and scene plans

[Lazy preparation](../../src/lib/engine/preparation.ts) makes the two pieces of text the generic engine needs before it can draw a moment. It runs the first time they are needed and stores them in the work's active analysis generation ([Analysis storage](ANALYSIS-STORAGE.md)). The legacy route's scene planner and its `scenePlanCache` are separate and untouched.

Preparation is **forgiving** (moment-cast v14, formless-effects v14, formless-look v2, plan-review v12, rendering generic-v13; [ADR 0004](../../docs/adr/0004-forgiving-scene-preparation.md), [ADR 0005](../../docs/adr/0005-one-scene-description-unnamed-presence.md), [ADR 0006](../../docs/adr/0006-unseen-presence-speakers-and-launch-bar.md)). The plan review advises rather than gates. A usable plan is kept with notes instead of being refused, and only a few hard faults stop a moment. [ADR 0004](../../docs/adr/0004-forgiving-scene-preparation.md) records the decision.

## Section look

There is one look per story section, holding the situational place, time of day, weather, light and clothing. Fixed appearance is left to canon.

- **Generated looks** (`source: "generated"`) are advisory guides. The planner receives one as `SECTION LOOK GUIDE (a suggestion; keep what fits this moment)` and resolves its own conditions; rendering never uses the raw look.
- **Owner looks, and historical looks with unknown provenance**, are literal constraints. The planner receives them as `OWNER LOOK CONSTRAINTS (copy all values exactly)` to keep its setting and time consistent, and rendering takes all five values verbatim from the look record. A generated look is never regenerated over an owner look.
- **Inputs:** the section version, the brief version, the canon versions of the section's cast, and, when the cast includes a no-form entry, the prompt marker `section_look_formless_presence`. A changed input remakes the look lazily; history is retained.
- Looks use five required string fields (900-token ceiling, 350 expected). No-form sections use a stricter look prompt (formless-look v2) and a local 200-character check per field, retried once like any malformed reply. That prompt lists no-form cast by name only, with no canon, and permits their presence only as smoke, cloud, fire, wind or light spread through the place, never a throne, seat, robe or figure.

## Scene plan

There is one plan per moment, shared by every art style and reader translation. Claude Haiku 5.5 (reasoning off; 2,400-token ceiling, 1,200 expected) receives:

- The brief's tone, depiction rules and era.
- The section title.
- The moment's reference text and its same-section neighbours, each trimmed to 400 characters (a section boundary gives none).
- The section cast as `id: name`, with `hasForm` when any member has no form.
- The look guide or owner constraints.
- No canon for no-form cast: since formless-effects v14 the planner sees only their name and `hasForm: false`, so it cannot copy a fixed description (for God, "veiled white-gold light… throne-light") back into the plan.

The system prompt is a short, general contract: one scene at one instant; when a moment is mostly someone's words (prophecy, poem, proverb, prayer, letter, argument, teaching, or a told story or vision), draw what the words describe and leave the speaker, writer and listeners out unless the text puts them inside that scene, and never make a speaker a figure of their own words; select every visible cast entry, including places, objects and presences shown through effects; unnamed roles and crowds may appear without canon; describe pose, action and situational detail but not fixed appearance, art style or text; keep the depiction rules; and let the scene fields carry this moment's place, time, light and clothing, using the section look guide as a suggestion (or keeping consistent with owner look constraints). Sections with no-form cast add one paragraph: such a subject is never drawn. When the moment shows it appearing or acting, the plan shows the place and the witnesses and describes, in plain words, only the physical effects the text names (smoke, cloud, fire, wind, light filling a place), spread through the scene rather than gathered into one glowing shape. It never names the subject or gives it a throne, seat, chariot, robe, train, face, hands, hair or body.

**Reply format** (strict provider schema; all keys required; moment-cast v12 dropped the separate `situation`, the largest source of flaws in the [re-measurement](../releases/2026-10-27-forgiving-fresh-check/RESULTS.md)):

- `focusQuote`: a few words from the moment naming what the image shows.
- `instant`: one sentence fixing the instant.
- `selectedCast`: `[{ entryId, evidence }]`. IDs are limited to the section's cast by the provider schema (an empty cast allows any string, and code drops IDs outside the cast).
- Seven scene fields: `primarySubject`, `action`, `setting`, `secondaryElements`, `mood`, `timeOfDay`, `composition`.

There is no `grounding` object, `consideredCast` or `missingCast`. Evidence quotes are audit data only and are not checked against the source. A reply that fails the schema, including an ID outside the cast or a missing key, is retried once; two malformed replies stop preparation.

**Normalization in code:** repeated IDs are dropped (first kept). Scene fields over 400 characters are trimmed with an ellipsis rather than refused. A generated section look is advisory and never rendered; owner look constraints are rendered verbatim from the look record (`prepared.situation`), so the planner never restates them.

## Plan review (advisory)

Each plan is reviewed before storage by a second Haiku 5.5 call: reasoning `low`, 4,000-token ceiling ([plan-review.ts](../../src/lib/engine/plan-review.ts)). The review sees the moment and neighbours, the depiction rules, the section cast with `hasForm`, the selected IDs, the seven fields, any literal `OWNER LOOK CONSTRAINTS` that rendering will use (none for a generated look, so a `look_conflict` citing it is invalid), and the complete canon of the selected stages. It is told to report only clear problems a careful reader would agree with. Kinds:

- `unselected_figure`: a section cast entry is clearly depicted but not selected.
- `outside_instant`: a selected or described person or presence does not belong in this moment, such as a speaker, writer or listener put into a scene their words only describe (or made a figure of their own words), a narrator, another event, or an unshown no-form presence.
- `not_one_instant`: the fields give incompatible poses or places, or successive steps.
- `embodied_formless`: a `hasForm: false` entry gets a body, face, hands, clothing, a robe or train, a silhouette, a throne or seat of its own, or a seated or standing figure.
- `look_conflict`: a condition contradicts the scene, text or depiction rules (quoting the condition).
- `canon_conflict`: a scene field contradicts selected canon.
- `missing_canon`: a named recurring identity with no cast entry is depicted.

Code accepts a report only when each problem quotes the right input and names a cast ID of the right kind (`invalidReview`). A report failing that, or invalid JSON, is retried once; after that the review is **unavailable**.

What preparation does with the verdict:

| Verdict | Action |
| --- | --- |
| Review unavailable | Keep the plan; the reason goes into `review.notes`. |
| `unselected_figure` naming a section cast entry | Select it with its assigned stage, so it gets canon; note `selected <id>: depicted but not selected`. No re-plan by itself. |
| `missing_canon`, or `look_conflict` under owner constraints | Note only (`noted: …`). A re-plan cannot add canon or change owner text. |
| Any other kind in round 1 | One re-plan: the same request plus the problems as feedback. |
| Problems left after the re-plan | Keep the second plan with `kept with: <kind> <id>`. |
| `embodied_formless` left after the re-plan | Refuse: retryable `plan unavailable: a subject without form is still drawn as a figure`. |

The only refusals are an embodied no-form subject that survives the re-plan and two malformed planner replies. The look-stage refusals described below also stop preparation. The worst case is two plan replies and two reviews, each with one malformed-reply retry; claims last 120 s and waiters poll for 90 s.

## Stored plan

The plan payload (validated by the Convex `planPayloadValidator`) holds:

- `entries`: `{ entryId, stageId }`, the planner's selections plus any auto-selected ones.
- The seven `plan` fields (no `situation` since moment-cast v12).
- `grounding`: `focusQuote`, `instant`, `singleInstant` (false only when a `not_one_instant` problem remains) and one `in_scene` record per planner selection, with `momentQuote` set to its evidence.
- `review`: `rounds` (1 or 2), `problems` (the round-1 problems that caused the re-plan) and `notes`.

All of these are in the content hash and excluded from image prompts. `review.notes` is an additive optional field: deploy the Convex schema before an application that writes it.

**Inputs and invalidation.** A plan depends on:

- The moment, the section (directly, so a stage reassignment refreshes it even when the look's bytes match), the look version and its ownership policy (`scene_plan_look_ownership`), the brief and the cast's canon versions.
- The prompt markers `scene_plan_moment_cast` and `scene_plan_review`, plus `scene_plan_formless_presence` for no-form sections.

A missing or older marker refreshes the plan on next use and reuses a current look. Nothing about a style or a translation enters the plan. Changing look ownership invalidates plans even for identical look bytes.

**Stale writes.** Before storing, preparation rereads the look and refuses (`look unavailable: section look changed during preparation`) if its version or ownership changed while the plan was being made. Assembly rereads the section and refuses a concurrent stage reassignment or canon change before loading references. A missing canon entry or blank assigned stage stops preparation before any model call; it never substitutes another stage.

## No-form presences

For `hasForm: false` cast, neither the look nor the plan request receives canon: each sees only the name and `hasForm: false` ([ADR 0006](../../docs/adr/0006-unseen-presence-speakers-and-launch-bar.md)). In the [v11 check](../releases/2026-10-27-v11-image-check/RESULTS.md), plans that copied God's canon produced the remaining God figures. The plan review still sees the complete canon of selected entries. Selected no-form entries are recorded in the rendering packet and trigger its unseen-presence line, but supply no prompt text and never a sheet. Rendering shows such a subject only when it is selected. A plan that still embodies one after the re-plan is refused, as above.

## Concurrency, spend and failure

- **Concurrency:** within an instance, the same promise is shared. Across instances, `claimPreparation` lets one holder fund the call while others poll for the record and otherwise return a retryable error. `getPreparationStatus` reports `missing`, `preparing` or `ready` for a moment's look and plan.
- **Spend:** every attempt, successful or not, including reviews and retries, is written to `preparationLedger` as owner spend (`getPreparationSpend`). No guest credit is reserved or charged for preparation.
- **Failure:** `PreparationUnavailableError` is retryable and raised before any reference load, request record, reservation or image call. `clearRecord` on a plan forces a future re-plan; saved images are never touched.

## In the request path

The generic engine ([generation.ts](../../src/lib/engine/generation.ts)) calls preparation through `assembleRendering` before building the rendering packet. A preparation refusal, or a packet over the prompt budget, is declined as `sceneUnavailable` before any request record exists. For an unbound Classical request the route then serves the legacy engine, so the reader still gets an image. Other styles, and requests bound to the generic engine, get the retryable 503 "Preparing scene" with the moment's preparation status. See [Image generation](IMAGE-GENERATION.md#generic-generation-path).

## Tests

[preparation.test.ts](../../src/lib/__tests__/preparation.test.ts) and [plan-review.test.ts](../../src/lib/__tests__/plan-review.test.ts) cover each forgiving rule through the real Convex payload validator: auto-selection, a single re-plan then keep, notes, an unavailable review, the `embodied_formless` refusal, trimming and repeated IDs. [engine-presence.test.ts](../../src/lib/__tests__/engine-presence.test.ts) covers the provider schema, no-form canon and three-style reuse. [moment-situation.test.ts](../../src/lib/__tests__/moment-situation.test.ts) covers owner constraints and ownership races. Scripted replies prove mechanics, not model judgment.

## History

From 21 to 26 October 2026, preparation used increasingly strict contracts:

- Evidence quotes checked against the source.
- `missingCast` stops.
- Separate selected and considered lists.
- A gating review that refused after one re-plan.

Each round fixed one failure class while others refused. The last measurement of that design stored acceptable plans for only 6 of 30 cases and refused 16 ([fresh measurement](../releases/2026-10-26-fresh-conditions-check/RESULTS.md); [image check](../releases/2026-10-26-image-check/RESULTS.md)). The owner then chose a forgiving, general contract with a legacy fallback ([ADR 0004](../../docs/adr/0004-forgiving-scene-preparation.md)). Moment-resolved conditions come from [ADR 0003](../../docs/adr/0003-resolve-conditions-with-each-moment.md). The full evaluation record and the current release gates are in the [release status](../releases/STATUS.md); earlier release folders hold each contract's evidence.
