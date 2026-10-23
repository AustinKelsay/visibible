# No-form effects must select their cast entry

**The revised review caught all 12 repeated omission cases, against 0/12 under the old rules, without flagging God in any of 9 ordinary-light controls.** The full planning run stored 15 of 21 plans, with **no unselected no-form effect in those stored scene fields**. It did not pass the stricter full-pipeline gate: operator scoring found 12 acceptable stored plans, 3 flawed stored plans and 6 refusals. No images or production reads/writes were made.

The owner chose option A on 23 October 2026 after a quoted $0.05–0.15 text-evaluation increase. The [committed protocol](plan.json) applies the upper bound, raising the evaluation allowance from $16.80 to $16.95, and caps this operation at $0.12. It spent **$0.0651948 in 114 calls**, with zero uncertain usage.

## Change and scope

The planner (`formless-effects-v6`) explicitly counts effects representing a no-form cast member as its presence, including unnamed/background radiance. The entry must be selected with current-moment evidence. If the moment does not establish the presence, the planner must omit the effect instead. Ordinary sunlight, lamplight, embers and weather remain setting details.

The review (`plan-review-v3`) covers those effects under `unselected_figure` and unsupported manifestations under `outside_instant`. Both prompt dependencies refresh old plans lazily; the section-look contract is unchanged. A [scripted assembly regression](../../../src/lib/__tests__/formless-selection.test.ts) first failed under the old cache versions, then passed: a cached omission is reviewed again, a corrected selection delivers the full no-form canon/depiction constraints to rendering, and a second rejection stops before rendering. Scripted replies prove plumbing, not model compliance.

Inspection also found the shared look can still carry divine effects when the scene omits them. A separate rendering instruction (`generic-v6`) requires a no-form subject to be both selected and described by the scene plan before rendering its effects, including effects in the shared look. This protected rule outranks the look and survives prompt trimming. The look remains verbatim; code does not parse or rewrite prose. This rendering follow-up was added separately from the frozen text pipeline and has **not been tested with an image model**.

## Fixed cases and method

The preceding run's [sensitivity check](../2026-10-23-cast-policy-check/sensitivity.json) was explicitly a keyword upper bound of seven plans. Inspection of rendering-bound fields found four clear divine effects and three ordinary-light controls:

| Retained id | Verse | Rendering-bound field |
| --- | --- | --- |
| s001 | Numbers 3:39 | Radiance and cloud above the mountain/tabernacle; God unselected |
| s059 | Ezekiel 40:24 | Veiled cloud-radiance at the edge; God unselected |
| s067 | Numbers 5:24 | Radiance and fire-like glow over the tabernacle; God unselected |
| s074 | Jeremiah 10:14 | Veiled radiance and fire-like glow in the sky; God unselected |
| s027 | Exodus 14:5 | Sunset and sea glow; divine radiance occurs only in the withheld audit instant |
| s034 | Lamentations 4:7 | Ember glow from burnt buildings |
| s035 | Isaiah 10:31 | Fading evening light |

The rules, [dry-run request hashes](dry-run.json), case ids, repeats, acceptance criteria, spending rules and runner were committed at `ed25901` **before any paid call**. All model-facing preparation/review code stayed unchanged throughout the run.

For each defect, the old and revised reviewer ran three times, interleaved old/new, over the exact same retained plan. The candidate also reviewed each ordinary-light control three times. Then all seven verses ran through ordinary `prepareMoment` three times each in fresh in-memory stores over the retained production records. This includes cold looks where the retained snapshot had no look. The production adapter, Anthropic-only route, planning defaults and low-reasoning review configuration were retained. Only the normal malformed-reply retry and one re-plan were allowed; there was no prompt tuning, paid rerun, source correction or outcome replacement.

## Results

| Review test | Old v2 | Revised v3 |
| --- | ---: | ---: |
| God reported as unselected on defective plans | 0/12 | **12/12** |
| God-related flags on ordinary-light controls | Not run | **0/9** |
| Unavailable reviews | 0 | 0 |

One control repetition also reported distant soldiers as outside the instant (Isaiah 10:31); that is an unrelated placement judgment, not a God/lighting false alarm. The controls were chosen for ordinary lighting, not as a guarantee of correctness on every review category.

The stricter full-pipeline criterion required all 21 first runs to store acceptable scenes, including no unsupported selected presence. **It failed.** [Operator scores](operator-scores.json) retain every first outcome and exact scene quotes:

| Verse | Stored / 3 | Acceptable / 3 | Retained failures |
| --- | ---: | ---: | --- |
| Numbers 3:39 | 2 | 1 | One unsupported selected manifestation; one review refusal for unselected God |
| Exodus 14:5 | 3 | 3 | — |
| Lamentations 4:7 | 1 | 1 | One evidence refusal; one review refusal for unselected God |
| Isaiah 10:31 | 2 | 2 | One twice-overlong look |
| Ezekiel 40:24 | 3 | 3 | — |
| Numbers 5:24 | 1 | 0 | Unsupported selected manifestation and framing Moses; one review refusal for an unselected group and one for God |
| Jeremiah 10:14 | 3 | 2 | One plan both holds the idol and puts it on the bench |
| **Total** | **15** | **12** | **3 flawed stored, 6 refused** |

No stored scene field describes an unselected no-form presence, and none embodies a no-form subject. God is selected in two stored plans, so its canon reaches rendering; both are nevertheless flawed under the stricter source criterion:

- **Numbers 3:39, repeat 1:** “veiled radiance above the tabernacle” is selected from “at the commandment of Yahweh”. The commandment does not establish a visible manifestation during the census.
- **Numbers 5:24, repeat 3:** a veiled cloud over the tabernacle is selected from the woman's drinking the bitter water. The same plan adds Moses watching the ritual, though he only frames its instruction. The review caught the first plan's unselected God, but accepted this replacement after it selected God without removing the unsupported effect.

The third flawed stored plan, Jeremiah 10:14 repeat 2, holds the idol in its primary subject and puts it down in the action. The six refusals are one look-length failure, one evidence failure and four review failures (three for unselected God, one for an unselected group). Refusals are not counted as accepted repairs.

This is a deliberately selected seven-verse diagnostic with repeated model replies and an unblinded operator, **not a new random-verse acceptance estimate or independent blind quality evaluation**. The existing 74/98 result remains evidence for the earlier pipeline. Source grounding, review misses, incidental-figure interpretation, latency, image behavior and human acceptance remain open. No claim of improved image quality follows from these results.

## Spending and checks

| Bucket | Authorized | Measured cumulative | Retained uncertainty | Remaining |
| --- | ---: | ---: | ---: | ---: |
| Preparation | $43 | $3.65680320 | $0.03 | $39.31319680 |
| Evaluation | $16.95 | $16.80293550 | $0.045 | **$0.10206450** |
| Owner production smoke | $1 | $0.68579500 | $0 | $0.31420500 |

The [ledger](ledger.json) and [114 retained provider replies](provider.ndjson) determine spending; the OpenRouter key is shared with live legacy traffic, so balance changes are not attributed to this operation. No evaluation funds came from preparation/smoke, and no credits were granted. Production stays on its existing disabled frontend/backend; no backend schema deployment or activation was performed.

Verification: lint and typecheck passed; **966 tests passed, 1 skipped**. The new rendering test covers all three styles and protection through look-detail trimming. There is no visible UI change.

CodeRabbit raised 0 issues in its initial tracked production diff (preparation, review, existing look-cache fixture). The broader review and the later rendering-diff review returned `rerun_with_use_credits` and `Error: An unexpected error occurred`, quoting maximum charges of $3.50 and $1.25. Neither was rerun with paid credits. Their exact logs and [disposition](review-disposition.json) are retained; this is not a claim that CodeRabbit reviewed the new harness, new test or rendering change.

## Offline audit

After `npm run works:import`, run:

```sh
npx tsx llm/releases/2026-10-23-formless-selection-check/audit.mts
```

The frozen [replay](verify.mts) forbids network, checks frozen source/fixture hashes, verifies request bodies and configuration, replays all 114 replies through `reviewPlan`/`prepareMoment`, reproduces every result and call count, and reconciles costs/caps. It recomputes [review tallies](tally.json). The supplemental [audit](audit.mts) checks the final [artifact/source manifest](sha256.json), exact operator-quoted scene text, complete unique score coverage, counts and the two declared gate verdicts. Bookkeeping checks do not validate the operator's semantic judgments. The supplemental audit, scores and rendering rule are outside the frozen model experiment, and the manifest excludes itself.
