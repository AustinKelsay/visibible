# Exact-citation validation: complete, gates failed

The owner authorized the separate frozen run by replying “continue” to the quoted **$0.30 cap within the existing $17.50 evaluation allowance**, with no increase. [Funding](funding.json) was committed at `6bafeffd2b9b5d38a3bc08b2193996ba38647843` before the first call. This attempt completed **92/92 operations, 233 charged calls and $0.14488520**, with zero new uncertain usage, images, production queries or mutations. No application/backend deployment or activation occurred. The one-shot grant has ended; unused allowance does not authorize another run.

The frozen [proposal README](README.md), protocol, fixtures and executable sources remain unchanged, including their pre-run “awaiting authorization” wording. This file records the subsequent outcome. The preceding [3/92 stopped attempt](../2026-10-24-rendering-review-check/RESULTS.md) remains separate and incomplete.

## Complete-packet outcomes

Actual baseline review v6 (`599fcca`) and citation-fix v7 (`dbcdab6`) use identical semantic prompts, planner v9, look generation and model settings. Each arm independently generated a cold look and plan from the same source/canon snapshot. All 30 pairs completed; refusals count against availability.

| First masked verdict | Baseline v6 | Candidate v7 |
| --- | ---: | ---: |
| Acceptable complete packets | 4/30 | 3/30 |
| Flawed stored packets | 0 | 2 |
| Uncertain stored packets | 1 | 1 |
| Refused preparations | 25 | 24 |
| Acceptable fresh packets | 4/23 | 3/23 |
| Acceptable retained packets | 0/7 | 0/7 |
| Stored look contradictions | 0 | 1 |

Overall acceptable-rate 95% Wilson intervals are **5.3–29.7%** for baseline and **3.5–25.6%** for candidate. On the 23 fresh cases they are **7.0–37.1%** and **4.5–32.1%**; on the seven retained cases both are **0–35.4%**. Fresh paired outcomes are two acceptable in both arms, two baseline-only, one candidate-only and 18 neither; all seven retained pairs are unacceptable in both. Exact acceptable-discordance p = **1.0**. These small descriptive results do not establish a population rate or a semantic effect of citation handling, especially with independent generated inputs.

The candidate fails the frozen absolute gates: all 16 controls, at least 22/23 acceptable fresh and 7/7 retained, and zero flawed/uncertain stores or look contradictions. It also falls below baseline acceptable count. No threshold was relaxed after execution. [Exact tally](tally.json), [derived outcomes](outcome-analysis.json).

## What the citation repair established

The time-conflict control sent exactly the same recorded HTTP request in both arms. Candidate v7 accepted `timeOfDay":"night` in one reply. Baseline v6 received `"timeOfDay":"night"`, then `timeOfDay":"night`; both failed its value-only citation validator, so its control was unavailable after the bounded retry.

Offline v7 validation accepts all three retained replies without changing their quotes or calling a provider. This confirms the exact-format fix on actual replies. It does not replace baseline's failed outcome or create another paid control score. [Citation-format replay](citation-format-replay.json).

| Frozen control result | Baseline v6 | Candidate v7 |
| --- | ---: | ---: |
| Strict passes | 12/16 | 14/16 |
| Clean controls with zero reports | 7/7 | 7/7 |
| Unavailable controls | 1 | 0 |

Baseline additionally misses the unsupported Aaron identity. Both arms identify the unsupported Moses identity semantically, but quote the action field rather than the frozen required primary-subject field. Both identify the forbidden human God look, but omit the required `god` entry ID. Those cases remain failures. Both also incorrectly report the separate generic “plain linen clothing” field as a God conflict: the supplied field does not attach that clothing to God. These two unsupported reports are in adverse controls, not false alarms on the seven clean controls. Four semantically justified extra reports and these two unsupported reports have exact, source-based [dispositions](review-disposition.json); disposition does not waive missing required metadata.

## Remaining defects and refusal limits

Both arms terminate **17 preparations for reported look conflicts**. These categories describe reviewer output; they are not independently validated counts of defective looks. Baseline also has three reported canon gaps, two terminal plan-review rejections, one unavailable review, one oversized-look schema failure and one successive-instants grounding failure. Candidate has five reported canon gaps and two terminal plan-review rejections. [Per-case categories](outcome-analysis.json).

Some conflicts expose independent look/plan choices: retained Exodus 14:5 gets a sea-shore look paired with Pharaoh's palace scene, and fresh Exodus 23:16 pairs low late-afternoon light with a late-morning plan. Other judgments are questionable: baseline Judges 5:12 treats “Canaanite hill country” and “hill country of Israel” as distinct fixed places despite the supplied Canaan canon's Israel relationship. Refusal is containment of a reported conflict; it is neither repair nor proof that the report was correct.

Candidate's two flawed stores also survive review: Romans 4:7 inserts framing Paul and background soldiers from the shared look; Revelation 3:12 selects a formed adult Jesus stage while the scene says there is no human figure and represents the Son only as radiance. The uncertain candidate store has a disputed midday/late-day light conflict. Fixing ownership of situational conditions alone cannot establish correct source identity, canon selection or reviewer judgment. The [next decision](NEXT.md) separates that ownership proposal from the remaining semantic work.

## Masking and sensitivity

The complete opaque packet, first scores and explicit disputed-reading alternatives were committed together at **`64e0b2730cf057ce647392c447e6960b38dcce79` before unblinding/scored audit**. First scores are unchanged. One operator knew progress and familiar retained cases; this is procedural masking, not independent adjudication or proof that labels could not be inferred.

All **486** predeclared alternative-score combinations fail the pipeline gate. Acceptable counts range from 2–5 in each arm, with candidate-minus-baseline ranging from −3 to +3. Even accepting every stored packet gives baseline only 5/30 and candidate 6/30, with **0/7 retained** for either; disputed scores cannot rescue availability. These alternatives supplement the first scores and are not substituted for them. [First scores](operator-scores.json), [alternatives](scoring-sensitivity.json), [sensitivity tally](sensitivity-tally.json).

## Accounting and offline reproduction

The run finished at `2026-10-26T03:12:15.111Z` after starting at `2026-10-26T02:55:11.306Z`. Total measured evaluation spend is now **$17.20161110**, retained uncertainty **$0.045**, and remaining evaluation allowance **$0.25338890 / $17.50**. Preparation remains **$39.31319680 / $43** and production smoke **$0.314205 / $1**; no transfers occurred. [Ledger](ledger.json), [budget](budget.json).

The eight free pre-run rehearsals remain mechanical evidence. Post-run verification exactly replays all 233 retained HTTP responses, requests, usage and 92 outcomes with network calls intercepted. It verifies the frozen hashes and unchanged first-score bytes, then probes the one-shot refusal using an environment-file path that does not exist: refusal occurs at `run-started.json` before credentials, with paid artifacts unchanged. The local exact-credential scan passes without printing the credential. [Execution verification](execution-validation.json).

```sh
npx tsx llm/releases/2026-10-25-citation-validation/dry-run.mts verify
npx tsx llm/releases/2026-10-25-citation-validation/audit.mts finalize
npx tsx llm/releases/2026-10-25-citation-validation/summarize.mts verify
# Local credential-absence scan only; no provider calls or production access.
VISIBIBLE_EVAL_ENV_FILE=/private/tmp/visibible-owner-final-environment.private.env \
  npx tsx llm/releases/2026-10-25-citation-validation/validate-execution.mts verify
```

Retain/fetch branch `eval/citation-validation-results` for the funding and masked-score commits. A squash merge into `dev` does not preserve those intermediate commits as ancestors. Reproduction requires their git objects, locked dependencies and the same imported work bytes; frozen hashes must not be updated to fit later application changes. Raw paid artifacts were committed separately at `e12d192` after scoring.

No further paid tuning, image pilot or release acceptance follows. Current full-request latency/accounting, visual compliance/likeness, human acceptance, explicit activation and the named 24-hour follow-up remain held. See the canonical [release status](../STATUS.md).

## Publication checks

Lint, type checking and all **31** targeted citation/rendering-contract tests pass. CodeRabbit's final uncommitted analysis/documentation review covered all 14 submitted files and raised one minor issue: an earlier status paragraph needed its pre-validation measurement claim marked historical. That wording is corrected. The separate funding review raised zero issues. An earlier broader branch review reported zero issues with a warning that **one file was unreviewed**, without identifying it; that review is not complete branch coverage. The final 14-file review excludes the already committed funding, first-score and raw paid artifacts. Exact offline replay verifies all 233 retained provider responses independently of that review coverage.
