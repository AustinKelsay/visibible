# Image eval and release requirements

Apply this process when changing the image prompt builders in [image-prompts.ts](../../src/lib/image-prompts.ts), the scene planner model or prompt, the default image model, or anything else that can change what a verse's image looks like. It is the image half of [Spec S10](https://github.com/AustinKelsay/visibible/issues/54); the chat half is [Chat eval and release requirements](CHAT_EVAL_AND_RELEASE.md).

## The harness

`npm run evals:images` ([scripts/evals/images.mts](../../scripts/evals/images.mts) over [src/lib/image-evals](../../src/lib/image-evals)) runs the committed cases in [evals/images/cases.json](../../evals/images/cases.json) through the production prompt builders and the same OpenRouter request the route makes, for two arms: `direct` (the verse prompt alone) and `planner` (one scene-planner call, then the prompt with its plan, continuing without a plan when the planner fails, as the route does). Every case has a reference, translation, settings and the visual behaviour a reviewer expects; the set covers narrative, poetry, prophecy, genealogy, symbolic and difficult passages and keeps the Peter, Red Sea and Genesis continuity cases.

- `--dry-run` writes a costed manifest and makes no call. `--budget` is a hard provider-spend limit checked before every paid call; the run stops at it and marks the remaining samples not run. Missing provider usage is recorded as such and charged to the budget at the per-call estimate, never as zero.
- `--repeats` (default 3) samples each case and arm repeatedly; a case is **inconclusive** when an arm has fewer than three completed samples and **incomplete** when the run stopped before every repeat. Both retain the baseline.
- Runs are resumable: `evals/images/runs/<run>/state.json` keeps every sample, and a rerun with the same `--run` never repeats a completed one. A different image or planner model needs a new run name.
- Outputs are kept under `evals/images/runs/<run>/outputs/` and cited by stable path in `report.json`, `contact-sheet.html` (every sample of every case, failures included) and `scores.json`, the template a reviewer fills in. The runs directory is not committed.

## Scoring and gates

Score each arm of each case 0–2 for relevance, clarity and artifacts/style, and record one verdict: `pass`, `accepted limitation` or `fail`, with notes. Review every failed or edge case by eye; averages never hide them. Compare candidate and baseline on the same cases, repeats and settings. Material regressions and failures need review; an inconclusive comparison retains the baseline.

The report carries completions, failures by stage, latency percentiles, provider and planner spend, missing-usage counts and reproducibility metadata (prompt version, models, repeats, sample floor). Attach `report.json`, the scored `scores.json` and the contact sheet to the release PR with the rollback plan and the first-24-hour owner, as the chat process requires.

Nothing here authorizes spend: a paid run is the owner's decision under the `--budget` it names, and the repository tests exercise the harness only with fake providers.
