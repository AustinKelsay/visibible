# Source-first planner comparison — awaiting funding

Issue #183 remains on hold. This is a text-only comparison proposal, not a completed evaluation or a release approval. #269 merged v8 planning and v5 review; its last diagnostic stored neither Lamentations scene and falsely flagged one clean control. The candidate removes shared section-look values from both planner requests. Rendering still receives the look. Source, neighbors, section cast, no-form canon constraints, selection evidence, reviewer, malformed retry and one re-plan remain. Both plan prompt versions advance to v9; look versions stay unchanged. The conservative look-hash dependency stays, so owner look edits still invalidate plans.

The two captured Lamentations looks reproduce the old request exposure in tests. Scripted responses verify isolation and rendering across Classical, Watercolor and Icon, including a re-plan. They do not establish improved model judgment or image compliance. Shared rendering looks may still conflict with a correct plan; the paid protocol scores that separately and such conflicts fail the cold-pipeline gate.

## Frozen proposal

- `plan.json` declares cases, seeds, order, scoring, thresholds, funding and stop rules.
- `sample-set.json` contains seven unchanged historical cases and 23 fresh verses outside the previous 100. The fresh draw used 96 read-only production queries, no model calls or writes. There were no rejected quality-based draws. Source/canon fixtures are local after this snapshot; retained and fresh records have separate keys even when they share an ID.
- `baseline.mts` loads actual v8 preparation from immutable merge `b8b41bd6871d3679b04c05cf61c3d99507ee4dd4`, changing import paths only in a temporary module. Shared dependencies must still match that commit. No prompt substitution or production runtime flag selects the baseline.
- `dry-run.json` pins source/fixture hashes, the baseline source hash, all 66 operations and each exact first request. The offline scripted execution exercises both complete pipelines, including their actual schemas. Its cost scenarios include schema text and room for generated input; they are estimates, not cost guarantees. Generated WEB work bytes are pinned by hash; other inputs must be present in the pre-call git commit. The lockfile pins dependencies.
- Six unchanged direct v5 review controls run first, then 30 alternating-order pairs (15 baseline-first, 15 candidate-first). Each arm has a separate cold store; look outputs are independently generated. There is one draw per arm and no funded tuning or rerun. All first outcomes, reviews and failures remain in the evidence.

The current evaluation allowance is **$16.95**, with **$16.90117330 measured**, **$0.045 retained uncertainty**, and **$0.00382670 remaining**. The requested increase is **$0.25** to **$17.20 total**, with a **$0.25 operation cap**. This proposal grants nothing and transfers no preparation or smoke allowance. No images, production writes, deployment or activation are part of it.

## Commands and guards

```sh
# Completed once: read-only fixture collection (private env path; never print credentials).
VISIBIBLE_EVAL_ENV_FILE=/private/tmp/visibible-owner-final-environment.private.env \
  npx tsx llm/releases/2026-10-23-source-first-check/snapshot.mts

# Offline; capture once, then verify the same frozen inputs and estimates.
npx tsx llm/releases/2026-10-23-source-first-check/dry-run.mts capture
npx tsx llm/releases/2026-10-23-source-first-check/dry-run.mts verify
```

`run.mts --execute` refuses before reading credentials or contacting a provider while `funding.json` is absent. Only after an explicit owner grant may the operator record its exact instruction in `authorization`, `increaseUsd: 0.25`, `authorizedUsd: 17.20` and `operationCapUsd: 0.25`. Commit that record before execution. The runner verifies the committed manifest and every input, refreshes prices/balance, reserves $0.005 before each HTTP request, persists usage/uncertainty and enforces one-shot markers. A provider error, missing usage, unavailable review, request drift or exhausted cap stops the run. An interruption cannot be resumed. Full completion is not guaranteed within the cap.

`npx tsx llm/releases/2026-10-23-source-first-check/rehearse.mts` exercises the runner, replay, masked scoring and rerun refusal in disposable local clones. All HTTP is intercepted, with synthetic responses/grants/usage confined to those removed clones. It covers a complete run, cap exhaustion, an unavailable positive control and missing provider usage. `offline-rehearsal.json` is mechanics evidence only, never model-quality, spend or owner-authorization evidence.

After funding, committed preflight and one-shot execution:

```sh
VISIBIBLE_EVAL_ENV_FILE=/private/tmp/visibible-owner-final-environment.private.env \
  npx tsx llm/releases/2026-10-23-source-first-check/run.mts --execute
npx tsx llm/releases/2026-10-23-source-first-check/audit.mts
npx tsx llm/releases/2026-10-23-source-first-check/score.mts packet
```

Read only `blind-packet.json`, then write `operator-scores.json` with `scorer`, `scoredBeforeUnblinding: true` and one `scores` row per opaque ID: `id`, `verdict` (`acceptable`, `flawed`, `uncertain`), `reason`, `lookContradiction` and `defects` (each has an exact scene/look `quote` and `reason`). Acceptable requires no defects or look contradiction. Uncertain counts against acceptance. Commit the packet and scores before reading the key or running the scored audit. This is procedural masking by one operator, with familiar retained cases; it is not independent adjudication.

Any extra report on a negative direct review needs explicit adjudication in `review-disposition.json`: `id`, exact problem JSON `problemSha256`, `acceptable` and source-based `reason`. Positive controls require no problems. Then run `audit.mts finalize` to save the replay, per-call usage, review disposition and paired score analysis. Scoring disagreements need an explicit sensitivity account; do not overwrite the first score or relabel a refusal as a repair.

All 66 operations must complete; candidate needs zero flawed/uncertain stores and look contradictions, at least 22/23 acceptable fresh cases and 7/7 retained, and more acceptable scenes than baseline overall and on retained cases without more refusals. Report paired tables, discordant counts/exact tests and Wilson intervals. Missing pairs stay incomplete. A pass only supports proposing broader text validation. Images, fresh latency/accounting checks and human release acceptance remain before launch.
