# Rendering source context — paired visual diagnostic

**Status: completed; criterion not met. Do not activate this candidate.** This tests the [committed offline candidate](../2026-10-31-render-source-context-offline/README.md) with the existing suite image runner. All 24 scheduled cases returned, with eight automatic retries and 32 saved attempts. Production rendering and active analyses remain unchanged.

Only one of three chosen candidate gloves images clearly preserves Alice's giant state; the declared criterion required all three. House-entry controls avoid premature growth in both arms. The grown-house scenes retain giant size but include anatomy and placement defects; the candidate cellar scenes combine incompatible light/timing cues. See [the visual review](REVIEW.md), [every attempt's inspection](inspection.json), and [counts by scene and arm](report.json). This is a negative diagnostic, not evidence that the baseline is generally correct or that source context can never help.

The renderer gets either its existing prompt or the whole bounded source section plus source precedence for changing state. The pair keeps the same plan, canon, classical style, image model, settings and exact ordered reference bytes. Source content and precedence change together; this does not isolate their individual effects.

## Frozen scope

Four moments, three retained plans each, two rendering arms: **24 scheduled images**. All plans come from the previous diagnostic's `section` planning arm, including `alice-gloves-section-1`, whose feedback revision omitted Alice's height. Each repeat uses its corresponding frozen plan; this is not three independent renders of one identical plan.

- Alice with the gloves: giant size must remain visible after the Rabbit returns.
- Alice entering the house: no growth before drinking; Rabbit absence can be valid.
- Alice grown inside the house: retain the cramped giant state without combining successive poses.
- Holmes in the cellar: one coherent instant before the arrest; preserve the source's lantern state.

The exact expectations and success criterion are committed in `plan.json` before spending. The existing scene checker and at most one automatic retry remain; every returned attempt will be inspected and retained. Source state is judged separately from identity, extra subjects, lettering and coherence. Incomplete or ambiguous samples stay incomplete or unclear. There are no manual rerolls, new reference designs, prompt revisions or production writes.

This is an exploratory diagnostic using unblinded model inspection, not a release gate, independent blind scoring or human acceptance. Non-literal depiction remains excluded. Existing source/plan defects, future-event leakage and reference-sheet conflicts are not assumed solved.

## Budget and reproducibility

The operation cap is **$2**, within the unused original **$6** authorization: prior conservative spend is **$3.43900025**. The reader reserve remains **$5**. `funding.json` records the user's continuation; `balance-before.json` is the initial read-only balance check. Execution rechecks account balance, key allowance and current catalog pricing. The existing suite ledger reserves a conservative ceiling before every image/check call and stops on missing usage, funding errors or the cap.

`scripts/evals/render-source-visuals.mts --prepare` freezes inputs once. `--offline` rehearses with scripted providers in a temporary folder. `--execute` requires a clean checkout and committed funding/input manifest, then starts the run once with an exclusive marker. It regenerates the offline packets, matches their report exactly, and verifies every source hash. Each paid image request checks the baseline prompt and ordered attachment hashes before substituting only the selected prompt. The suite retains its own assembly and stale-plan refusal. No new text generation is permitted. A failed image or invalid frozen input stops later cases; a built-in retry failure may retain its already returned first image under the existing checker policy.

Run from the repository root with `node --import tsx scripts/evals/render-source-visuals.mts <mode>`. Live execution uses the existing private `VISIBIBLE_EVAL_ENV_FILE`. The original reference pixels must be present locally. Returned pixels go to ignored `evals/images/runs/2026-10-31-render-source-visuals/`; committed results retain their hashes and paths. Provider exchanges are scrubbed of credentials and inline image pixels. No credentials or production mutation client are introduced.

Offline rehearsal completed all 24 cases with scripted lettering retries and zero text calls. The live run used zero text calls, 32 image calls and 64 automatic checker calls. [Verification](verification.json) reconciles all frozen hashes, actual prompts, ordered attachment bytes, image hashes/MIME signatures, checker answers and provider usage. The live command exited successfully; all calls settled. Actual wire settings use the adapter's default image size with 16:9 for the configured 1K model; settings are identical across arms.

Measured operation spend is **$1.12653505**, with **$0 uncertain** for this run. The [conservative cumulative total](funding-close.json), including prior uncertainty, is **$4.56553530 / $6**. The account fell from $12.043841838 to $10.917306788, matching this run's ledger; the $5 reader reserve remains intact. No additional paid scoring calls or production mutations were made.

Pre-spend Sol review found S1: the suite catches prompt/reference validation errors as failed image rows, so the diagnostic must stop on `failed` as well as `error` and `refused`. An in-memory mismatched-prompt reproduction previously reached 24 rows and 32 later fake image calls; after the one-line fix it stops at the first failed row with zero calls and no finished marker. See `preflight.json`. No retained inputs were altered and no paid calls were made.

CodeRabbit also found S2: the suite can time out before the underlying checker settles, allowing a premature completion summary. The checker now times out at 25 seconds, below the suite’s 30 seconds, and completion rejects any ledger call still in flight. A delayed scripted-provider reproduction exposed two unsettled calls at suite return; a shorter provider timeout blocks the ledger and retains both uncertain ceilings. No completion is permitted in either incomplete state. Full application tests pass (1,052 passed, one skipped); typecheck and focused lint pass. Full repository lint also passes with three existing unused-variable warnings in older release scripts.

Pre-execution review: GPT-6.1 Sol on xhigh approved after three rounds, resolving S1 and S2. The round-three before/after snapshot matched `bb1c783c974dbe1f2e78e68a09326f752b68c940`. CodeRabbit completed with only S2, subsequently fixed and verified by Sol. A subsequent CLI attempt skipped after the inputs had been committed.

Final evidence review: round four approved the negative conclusion with no new findings. Sol independently reconciled all 27 input hashes, 96 provider exchanges and charges, inspected all 32 original images, and confirmed the existing guards remain intact. The before/after snapshot matched `3711dbca77697d6a30086f45b2325022cda22c7c`. The final CodeRabbit CLI review completed with zero findings. No review approved candidate activation; visual judgments remain unblinded model inspection.
