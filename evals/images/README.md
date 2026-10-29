# Image evaluation fixtures

`cases.json` is the committed case set for `npm run evals:images` ([guide](../../llm/workflow/IMAGE_EVAL_AND_RELEASE.md)). Each case fixes a reference, genre, settings and the visual behaviour a reviewer expects; `work`, `unitId` and `styles` describe generic-engine cases. Runs write to `runs/<name>/` (ignored by git): `state.json`, `manifest.json`, `report.json`, `scores.json`, `contact-sheet.html` and `outputs/`. Comparisons write to `compare/`.

Keep the Peter, Red Sea, Genesis and Holmes continuity cases; add cases rather than replacing them so baseline and candidate runs stay comparable.

`consistency.json` names the fixed groups for `npm run evals:consistency` ([ADR 0008](../../docs/adr/0008-consistency-in-the-launch-bar.md)). Character groups cover one canon entry across stories; setting groups cover neighbouring verses of one section. Scorers follow `consistency-scoring.md`. Add groups and verses rather than replacing them, and render every named verse in each launch matrix.

`style-trials/watercolor-full-frame.json` is an unapproved rendering trial for the observed Watercolor paper margins, separate from the shared library. It specifies a continuous coloured underwash instead of a field-study/sketch presentation. Its [nine-image follow-up](../../llm/releases/2026-10-20-engine-funded-evaluation/README.md#watercolor-correction-rejected) failed: eight clear margin failures and one ambiguous result; the style was not promoted.

`--omit-style-reference` offers a separate generic evaluation control with unchanged style wording, selected sheets and trim decisions. Use a new run name and preflight fixed inputs before any funded comparison; the mode is recorded and cannot switch on resume, including after a saved dry run. See the [retained reference-input audit](../../llm/releases/2026-10-21-reference-input-audit/README.md) for exact input evidence and limits. The [12-image matched-input comparison](../../llm/releases/2026-10-21-reference-comparison/README.md) cost $0.40941850 and retained failures in both modes; omission was not promoted as a production correction.
