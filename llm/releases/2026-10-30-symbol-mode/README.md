# Symbol-mode check: Satan and the foolish woman

**The pre-declared pass bar fails, so under its own rule the mode is not shipped and no production entry changes.** Satan improved clearly: he appears as his canon's red dragon in 15 of 15 symbol-mode images, against 6 of 15 in today's effects mode, and acceptable images rose from 12 to 14. Two clauses fail:

- **The foolish woman was never tested.** For Proverbs 9:14 ("She sits at the door of her house") the planner selected Wisdom, not her, in both arms, so the mode never applied to her (0 of 3; bar 2 of 3).
- **Figures in light: 3 in the symbol arm, against 2.** All three come from one Revelation 12:9 plan, which every style shares. It described "a faint angelic host in the upper air, their gold-girdled garments catching light", and Michael's host is a separate no-form entry. Today's two come from one Matthew 4:3 plan that drew the tempter as a human silhouette in dust: the failure the symbol mode removes.

**Owner decision (30 October): ship for Satan only** ([decision.json](decision.json)). Asked with this result, the owner overrode the bar for Satan. The mode merges after a code review and is released, and only Satan is set to `symbol` in production. The foolish woman stays as she is.

## Authorization and spend

- **Authorization.** The owner ratified the $1.02287350 evaluation overage ("yes i approve"). The owner then chose "Yes, up to $3" to build this mode and check it with paid images, on the condition that it ships only if the images pass ([funding.json](funding.json)). The evaluation authorization is now **$44.3228735**.
- **Spend.** The run cost **$1.41453055** of its $3.00 cap on the local dev OpenRouter key (ending `1292`), with no uncertain usage and no block:
  - 40 images (4 retries after the image check);
  - 53 text calls;
  - 80 check calls.
- **Production.** No writes. The run read one read-only snapshot ([snapshot.json](snapshot.json)) into memory stores. Measured evaluation is now $42.61840405 against $44.3228735 authorized, leaving $1.70446945. Retained uncertainty is $0.119.

## Design

The engine is the candidate commit `3fe2772`, frozen in [plan.json](plan.json) before any paid call (`frozen-commit.json` records the commit the run started from).

- **Arms.** There are two arms, each with its own memory store, run one after the other:
  - `effects`: production's entries as they are.
  - `symbol`: Satan and the foolish woman set to the symbol mode, as `works:correct set-depiction` would write them.
- **Cases.** Six verses in Classical, Watercolor and Fresco, one image each:
  - Revelation 12:3 and 12:9, where the text names the dragon.
  - Job 1:6, Zechariah 3:1 and Matthew 4:3, where the dragon comes only from Satan's canon.
  - Proverbs 9:14, for the foolish woman.
- **Preparation and checks.** Every case was prepared afresh in each arm. Every first image went through the image check, and a faulty one got one retry.
- **Offline rehearsal.** A free rehearsal ([offline-rehearsal.json](offline-rehearsal.json)) proved the arms differ as designed on all 36 samples:
  - In the symbol arm, the symbolic-form line and the entry's canon are in the prompt, the entry is not among the selected characters, and the planner sees its form.
  - In the effects arm, today's presence handling applies.

## Scoring

- **Scorers.** Two independent blind model scorers ([scorer-a.json](scorer-a.json), [scorer-b.json](scorer-b.json)) saw the 36 shown images in random order, under blind ids. They had the verse and the entry's canon form, but not the arm, the prompts or the key ([key.json](key.json)).
- **Agreement.** They agreed on 31 of 36.
- **Settlements.** The operator viewed the five disputes at full size and settled them ([operator.json](operator.json)):
  - b07 and b12: the tempter as a dust silhouette, a figure in cloud, so not acceptable.
  - b19: the dragon with a solid woman, so acceptable.
  - b21: Satan absent, so not acceptable.
  - b35: no legible seat at the door, so not acceptable.
- **Sensitivity.** Counting b35 acceptable gives effects 13 against symbol 14. No conclusion changes.

| | effects | symbol |
| --- | --- | --- |
| Satan as the red dragon (of 15 selected) | 6 (all six in Revelation, where the verse names it) | **15** |
| Satan as a person or human-like figure | 2 (Matthew 4:3) | 0 |
| Satan as light or cloud only | 4 | 0 |
| Satan absent or unclear | 3 (Zechariah 3:1, Job 1:6) | 0 |
| Foolish woman selected (of 3) | 0 | 0 |
| Acceptable images (of 18) | 12 | **14** |
| Figures in light | 2 (one Matthew 4:3 plan) | 3 (one Revelation 12:9 plan) |
| Lettering, frames, edges | 0 | 1 frame (b36, Proverbs, Watercolor) |

[report.json](report.json) has every count. [results.ndjson](results.ndjson) has every sample's prompt, plan, references and checks, and `provider.ndjson.gz` has every provider exchange with keys redacted.

## Next

The owner's options:

- **Ship the mode for Satan only.** This overrides the bar's foolish-woman clause and its figure-in-light clause. The figure-in-light count comes from Michael's host, not Satan.
- **Keep the PR open** with no change.
- **Fund a narrow re-check.** A different Proverbs 9 verse that selects the foolish woman, plus repeats of Revelation 12:9.

Two separate findings:

- The planner reads Proverbs 9:14's "she" as Wisdom.
- One Revelation 12:9 plan gave Michael's no-form host garments, and the plan review did not catch it.

## Reproduce

```sh
VISIBIBLE_EVAL_ENV_FILE=<private env with GENERIC_ENGINE_MODE=disabled> npx tsx llm/releases/2026-10-30-symbol-mode/snapshot.mts   # read-only, once
npx tsx llm/releases/2026-10-30-symbol-mode/rehearse.mts                                                                       # free
VISIBIBLE_EVAL_ENV_FILE=<…> npx tsx llm/releases/2026-10-30-symbol-mode/run.mts --execute                                      # paid, one-shot
```

Images and references stay outside git under `evals/images/runs/2026-10-30-symbol-mode/`, and their SHA-256 hashes are in the results.
