# Finish the existing review of the retained corrections

**Stopped; partial evidence only.** Eight of the 24 retained corrections reached final review. The eighth exhausted the existing invalid-report retry, so the diagnostic preserved its result and stopped after nine paid calls. No rerun or activation is supported. See the [completed inspection and accounting](REVIEW.md), [report](report.json) and [stop record](run-stopped.json). The preparation below remains the pre-execution contract; its scripts and frozen inputs are unchanged.

The intended comparison continues the [24 saved corrections](../2026-11-01-replan-draft-text/answers.ndjson) through the existing final semantic review and inspects the saved results. This measures the stage omitted from the correction-only diagnostic. The draft-aware candidate remains unapplied; no new planner, guide, image or image-check call was made.

The [offline contract and trace](../2026-11-01-correction-contract/README.md) established that final-review findings can restore cast IDs through to rendering. It did not establish whether a model would report the right findings. This continuation asks that narrower question, using the existing reviewer and its normal one-retry handling.

## Fixed experiment

- Four exposed cases, both retained arms and three retained corrections per arm: **24 continuations**, in their original saved order. There is one final review per correction, with at most one retry for an invalid report. Maximum **48 paid calls**; review model, reasoning and output limit remain the existing Haiku 5.5 / low / 4,000-token configuration.
- [replay.mts](replay.mts) recreates each original preparation in memory. It injects the saved first draft and first review (including the declared synthetic branch-control edit), then the captured correction. Only the final review reaches the paid adapter. The unchanged engine's correction request is the baseline request even for a retained candidate answer; this is an explicitly injected continuation, not evidence that the current request generated that answer.
- Each final-review request gets the corrected seven scene fields, its current selected canon, original focal text/neighbours, section cast, depiction rules and applicable owner constraints. Original initial requests and baseline correction requests are checked exactly. The existing preparation code handles final-review findings, storage and assembly; the diagnostic does not implement its own cast repair.
- All reference lookups return null and the style is Watercolor, 16:9, with no variation. That omission is deliberate: this is a text/canon inspection, not a faithful replay of every prior image attachment. No reference bytes or images are sent. A resulting prompt is retained for inspection but never rendered.
- Runtime, prompts, work inputs, styles, historical evidence and release gates remain unchanged. [manifest.json](manifest.json) freezes 53 inputs, including these diagnostic scripts, the plan/funding records, prior responses and the relevant engine/source files. [verification.json](verification.json) pins every final-review request hash and its cost ceiling.

## Assessment frozen before execution

Inspect every raw report, quoted phrase, assigned ID and resulting stored scene. Empty reports establish only that the reviewer reported no problem. Evaluate the following separately, as proposed by the [correction contract](../2026-11-01-correction-contract/README.md#source-span-and-depicted-instant):

| Question | Evidence to inspect |
| --- | --- |
| Repair | Whether the original target fault is absent in the retained scene; report any remaining defect. The final review does not rewrite the seven scene fields. |
| Validity | Whether each reported problem and cast attribution is supported by the actual input, and whether final canon introduces a conflict. Include inherited source/depiction defects and missed problems; a clean report is not acceptance. |
| Preservation | Whether the compatible depicted instant/details remain or a source-valid alternative was chosen. Retain the prior smile/camp judgments; this run cannot retroactively pass their preservation targets. |

Inspect newly selected cast separately from omitted cast. For the cottage, the retained reviewer’s March Hare-house attribution is a hypothesis, not established by the local dialogue. A repeated attribution is not independent proof. Removing the cottage can justify omitting its ID. Inspect croquet props, narrated story versus storyteller, selected canon and the existing source-window limits as well. The newly added canon is not reviewed again in the existing pipeline; inspect it manually as part of the evidence review without adding a runtime loop.

The source text and plans have already been exposed to the assessor. Assessment will be unblinded model inspection, not human acceptance, a blind suite score or visual evidence. Broader-source checks must be labeled and distinguished from the text actually sent. Preserve every report, failure, uncertainty and partial result. Existing ADR 0011/0008 release gates are unchanged. No possible result of this small continuation alone authorizes activation.

## Budget and stops

The user approved a **$7 cumulative cap**, then accepted the recommendation to continue with this bounded comparison. [Prior funding close](../2026-11-01-replan-draft-text/funding-close.json) records **$6.84241275** conservative spend. The **$0.13 operation cap** bounds cumulative spend at **$6.97241275**, preserving the **$5 reader reserve** and requiring no new authorization or top-up. [funding.json](funding.json) records that existing grant.

At retained catalog prices, all 24 reviews plus all 24 possible retries have a combined ceiling of **$0.1268612**. Live execution rechecks prices, account funding and key allowance before starting, then rechecks funding before every paid request. If updated prices do not fit every allowed attempt, it stops before spending. Every paid call uses the existing evaluation ledger and a 25-second timeout.

[run.mts](run.mts) verifies the frozen request and sources before each paid call. Accounting/provider faults prevent another paid attempt, even when the existing reviewer catches an error and attempts its normal retry. A malformed or invalid report may use its existing retry; unavailability after that retry or an assembly refusal preserves the result and stops the run. Unsettled/uncertain calls prevent completion. Partial results remain inconclusive, and the exclusive start marker prohibits restarting a paid run.

## Reproduction

For a fresh checkout, prepare the generated work files with `npm run works:import`, then run:

```sh
node --import tsx llm/releases/2026-11-01-correction-final-review/run.mts
```

The default mode reads no credentials and blocks network access. Its rehearsal covers all 24 continuations, all 48 retry-path calls, and eight stops: HTTP failure, twice-unreadable report, missing usage, over-ceiling usage, thrown transport failure, unexpected model, truncated output and mismatched packet hash. Faults are synthetic. It writes only `verification.json`; the saved hashes should reproduce exactly in the recorded Node environment.

Execution is reserved for the independently reviewed, committed preparation, using an isolated evaluation environment:

```sh
VISIBIBLE_EVAL_ENV_FILE=/path/to/private.env node --import tsx llm/releases/2026-11-01-correction-final-review/run.mts --execute
```

The environment must contain Visibible's OpenRouter key and `GENERIC_ENGINE_MODE=disabled`, with no owner-check session binding. It is never stored in this directory. The execution command above documents the original run, not permission to restart: `run-started.json` already exists. The retained partial output includes raw requests/replies, the ledger, each captured stored scene and assembled prompt, plus stop and closing-account records. There is no `run-finished.json` because execution stopped. Every result still requires inspection and independent final evidence review.
