# Image evaluation fixtures

The regression suite ([ADR 0011](../../docs/adr/0011-frozen-multi-work-regression-suite.md), `npm run evals:suite`) reads four things here:

- `suite.json`: the suite's version, seed, holdout share, works (where each analysis comes from, its image styles and consistency groups), random draws and gate.
- `cases.json`: every case. `tuned` marks a case that shaped the engine before the suite (always dev), `drawn` one picked by a seeded draw, and `tiers` a case that takes part in only one tier.
- `faults.json`: the questions scorers answer for plans and for images.
- `analyses/alice-in-wonderland-v2.json`: Alice's current analysis revision, prepared locally for evaluation only. The Bible's and Holmes's come from production, read-only, into each run's snapshot.

Add cases rather than replacing them, and bump the suite version when they change. A random case comes from a draw in `suite.json`, never by hand; the tests replay every draw.

Alice revision 2 removes only `a stern, frowning face and ` from the Queen of Hearts' `queen_of_hearts-main` stage text and marks that entry as owner-corrected. The source has her smile in `the-queens-croquet-ground-51` and frown in `the-mock-turtles-story-30`; either expression belongs to its moment. The [bounded canon review](../../llm/releases/2026-10-31-canon-review-boundary/REVIEW.md) supports this data correction, without establishing image quality. The revision records its parent hash and correction under `preparation`; all other payloads, quotes, identities and section assignments remain exact.

The [original fixture](analyses/alice-in-wonderland.json) and frozen runs remain unchanged. Suite `2026-10-31-suite-v2` selects the [corrected fixture](analyses/alice-in-wonderland-v2.json), retaining v1's seed, cases and holdout split. There is no v2 quality baseline yet: future comparisons need fresh v2 snapshots and preparation on both sides. Do not transplant old guides/plans or compare against a v1 baseline; the existing suite-version check rejects v1 `--from` runs. Historical diagnostics that explicitly name the old file still use it. This revision changes evaluation inputs only, with no model calls or production changes.

`cases.json` is also the committed case set for `npm run evals:images` ([guide](../../llm/workflow/IMAGE_EVAL_AND_RELEASE.md)). Each case fixes a reference, genre, settings and the visual behaviour a reviewer expects; `work`, `unitId` and `styles` describe generic-engine cases. Runs write to `runs/<name>/` (ignored by git): `state.json`, `manifest.json`, `report.json`, `scores.json`, `contact-sheet.html` and `outputs/`. Comparisons write to `compare/`.

Keep the Peter, Red Sea, Genesis and Holmes continuity cases; add cases rather than replacing them so baseline and candidate runs stay comparable.

`consistency.json` names the Bible's fixed groups for `npm run evals:consistency`, and `consistency.holmes-adventures.json` and `consistency.alice-in-wonderland.json` the other works' (pass one with `--groups`) ([ADR 0008](../../docs/adr/0008-consistency-in-the-launch-bar.md)). Character groups cover one canon entry across stories; setting groups cover neighbouring verses of one section. Scorers follow `consistency-scoring.md`. Add groups and verses rather than replacing them, and render every named verse in each launch matrix.

`style-trials/watercolor-full-frame.json` is an unapproved rendering trial for the observed Watercolor paper margins, separate from the shared library. It specifies a continuous coloured underwash instead of a field-study/sketch presentation. Its [nine-image follow-up](../../llm/releases/2026-10-20-engine-funded-evaluation/README.md#watercolor-correction-rejected) failed: eight clear margin failures and one ambiguous result; the style was not promoted.

`--omit-style-reference` offers a separate generic evaluation control with unchanged style wording, selected sheets and trim decisions. Use a new run name and preflight fixed inputs before any funded comparison; the mode is recorded and cannot switch on resume, including after a saved dry run. See the [retained reference-input audit](../../llm/releases/2026-10-21-reference-input-audit/README.md) for exact input evidence and limits. The [12-image matched-input comparison](../../llm/releases/2026-10-21-reference-comparison/README.md) cost $0.40941850 and retained failures in both modes; omission was not promoted as a production correction.
