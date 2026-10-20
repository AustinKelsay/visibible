# Image eval and release requirements

Apply this process when changing the image prompt builders in [image-prompts.ts](../../src/lib/image-prompts.ts), the scene planner model or prompt, the default image model, or anything else that can change what a verse's image looks like. It is the image half of [Spec S10](https://github.com/AustinKelsay/visibible/issues/54); the chat half is [Chat eval and release requirements](CHAT_EVAL_AND_RELEASE.md).

## The harness

`npm run evals:images` ([scripts/evals/images.mts](../../scripts/evals/images.mts) over [src/lib/image-evals](../../src/lib/image-evals)) runs the committed cases in [evals/images/cases.json](../../evals/images/cases.json) through the production prompt builders and the same OpenRouter request the route makes, for two arms: `direct` (the verse prompt alone) and `planner` (one scene-planner call, then the prompt with its plan, continuing without a plan when the planner fails, as the route does). Every case has a reference, translation, settings and the visual behaviour a reviewer expects; the set covers narrative, poetry, prophecy, genealogy, symbolic and difficult passages and keeps the Peter, Red Sea and Genesis continuity cases.

- `--dry-run` writes a costed manifest and makes no call. `--budget` is a hard provider-spend limit checked before every paid call; the run stops at it and marks the remaining samples not run. Missing provider usage is recorded as such and charged to the budget at the per-call estimate, never as zero.
- `--repeats` (default 3) samples each case and arm repeatedly; a case is **inconclusive** when an arm has fewer than three completed samples and **incomplete** when the run stopped before every repeat. Both retain the baseline.
- Runs are resumable: `evals/images/runs/<run>/state.json` keeps every sample, and a rerun with the same `--run` never repeats a completed one. A different image or planner model needs a new run name.
- Outputs are kept under `evals/images/runs/<run>/outputs/` and cited by stable path in `report.json`, `contact-sheet.html` (every sample of every case, failures included) and `scores.json`, the template a reviewer fills in. The runs directory is not committed.

## Generic engine arms

`--arms generic` adds one arm per art style (`generic:classical`, `generic:watercolor`, `generic:icon`, or the styles named with `--styles`), rendered through the request engine's own assembly ([engine/assemble.ts](../../src/lib/engine/assemble.ts)): the moment and its in-section neighbours from the imported text, the lazy section look and scene plan, the canon stages the plan marks present, the current reference sheets and style reference, and the validated rendering packet. A case may restrict its styles (`styles`), name a non-Bible work (`work`, `unitId`); the committed set carries three Holmes continuity cases beside the Bible ones.

- `--analysis convex` (the default when the deployment variables are set) reads the deployment's active analysis and references and must match this checkout's work and brief versions; `--analysis <run>` builds an in-memory analysis from `works/<id>/.preparation/<run>/{state.json,canon.json}` with no references, for rehearsals without a deployment.
- Looks and plans made during a run are **owner preparation spend**, recorded per sample apart from the image, charged to the budget (two calls assumed per generic sample in the dry-run manifest), and reported with prepared (look and plan already present) and cold samples told apart, including their latency percentiles.
- Each generic sample keeps its exact prompt, the packet (every input version, the references actually attached with their versions, the trim flags) and the quote the route would have made; the report compares reported usage to the quote (mean and maximum variance, mean quoted and actual credits, whether the five-credit Lite target held) and shows a style matrix of which cases ran in which style.
- `--style-file <path>` runs an owner-authored style trial under its id (`--arms generic:<id>`) without adding it to the library; `--cases` with a new `--run` is the targeted check after a correction ([owner corrections](OWNER-CORRECTIONS.md)).
- `--compare baseline,candidate` renders both runs side by side per arm with each side's verdicts from its `scores.json`, flags every candidate fail or worsening for review, and marks inconclusive or incomplete candidate cases as retaining the baseline.

Generic arms are scored on five dimensions: relevance, character/location identity, section continuity, style and artifacts. An observed depiction-rule or prohibited-likeness violation is a release fail whatever the averages; a known Icon border is recorded as an accepted limitation, never hidden.

## Scoring and gates

Score each arm of each case 0–2 for relevance, clarity and artifacts/style, and record one verdict: `pass`, `accepted limitation` or `fail`, with notes. Review every failed or edge case by eye; averages never hide them. Compare candidate and baseline on the same cases, repeats and settings. Material regressions and failures need review; an inconclusive comparison retains the baseline.

The report carries completions, failures by stage, latency percentiles, provider and planner spend, missing-usage counts and reproducibility metadata (prompt version, models, repeats, sample floor). Attach `report.json`, the scored `scores.json` and the contact sheet to the release PR with the rollback plan and the first-24-hour owner, as the chat process requires.

Nothing here authorizes spend: a paid run is the owner's decision under the `--budget` it names, and the repository tests exercise the harness only with fake providers.
