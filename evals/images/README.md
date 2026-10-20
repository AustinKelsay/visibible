# Image evaluation fixtures

`cases.json` is the committed case set for `npm run evals:images` ([guide](../../llm/workflow/IMAGE_EVAL_AND_RELEASE.md)). Each case fixes a reference, genre, settings and the visual behaviour a reviewer expects; `work`, `unitId` and `styles` describe generic-engine cases. Runs write to `runs/<name>/` (ignored by git): `state.json`, `manifest.json`, `report.json`, `scores.json`, `contact-sheet.html` and `outputs/`. Comparisons write to `compare/`.

Keep the Peter, Red Sea, Genesis and Holmes continuity cases; add cases rather than replacing them so baseline and candidate runs stay comparable.
