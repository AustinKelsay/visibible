# Storybook consistency verses

**The consistency gate passes with Storybook pooled in.** This run rendered the 14 group verses the [Storybook matrix](../2026-11-01-storybook-matrix/RESULTS.md) did not, in Storybook, so every ADR 0008 group verse has a Storybook image. Pairing them with the matrix images gives 47 Storybook pairs; pooled with the suite baseline's released-style verdicts:

- 129 of 132 decided character pairs show the same person (98%; floor 75%; baseline 97%).
- 33 of 36 neighbouring-verse pairs show the same place (92%; floor 50%; baseline 89%).
- Storybook alone: 38 of 38 character pairs and 9 of 9 setting pairs the same, with no unclear pair.

CodeRabbit's review of the release PR (#374) noted that [ADR 0008](../../../docs/adr/0008-consistency-in-the-launch-bar.md) had not been measured for Storybook; the owner had delegated the release path ("ok lets continue", "your call!"). The run made **15 images (14 shown, 1 retry), 46 text calls and 30 check calls for $0.54832865**, under the $0.90 cap, with no uncertain usage, refusal or production write; the account moved the same amount. [Plan](plan.json), [grant](funding.json), [budget](budget.json), [funding close](funding-close.json), [report](report.json), [pairs](pairs.json), [key](key.json), [scorer A](scorer-a.json), [scorer B](scorer-b.json), [operator](operator.json), [carried verdicts](carried.json).

## Results

| Measure | Classical | Watercolor | Fresco | Storybook | Released, pooled | Gate |
| --- | --- | --- | --- | --- | --- | --- |
| Same person | 29 of 31 (94%); 7 unclear | 31 of 32 (97%); 6 unclear | 31 of 31 (100%); 7 unclear | 38 of 38 (100%); 0 unclear | 129 of 132 (98%); 20 unclear | pass |
| Same place, neighbouring verses | 8 of 9 | 8 of 9 | 8 of 9 | 9 of 9 | 33 of 36 (92%) | pass |

The Classical, Watercolor and Fresco columns are the [suite baseline's](../2026-10-30-suite-baseline-image/README.md#consistency) verdicts, carried unchanged (141 pairs matched by group, style and both image hashes). Storybook's groups: Jesus 6 pairs, Moses 10, Simon Peter 10, David 6, Daniel 6; Red Sea 3, storm on the lake 3, breakfast on the shore 1, the prodigal's return 1, lions' den 1. Every group verse was attempted.

Storybook has no unclear pair where the other styles have 6 or 7 each, mostly on Matthew 27:35 and John 21:9. Its simplified, large-figure staging keeps the subject readable at the sizes those verses produce. Daniel, who has no reference sheet and drifted in the 29 October run, holds his grey hair, short beard and blue-and-white robe across Daniel 5:17, 6:22, 6:23 and 7:9 in Storybook.

## Method

- **Rendering.** [run.mts](run.mts) rendered each verse through production's engine (the code `main` deploys at `7a4771a`, checked file by file) with the production references in a fresh read-only [snapshot](snapshot.json), injecting Storybook through `styleOverride` from the byte-identical [candidate file](candidates/storybook.json), with no style reference, as the matrix did and as it would ship. Every first image was checked and a faulty one got one retry (Daniel 5:17, for lettering; the verse is about writing on the wall).
- **Shared section looks.** Production keeps one look per story section, so the six setting-group verses were planned against the looks the matrix drew their neighbours with ([seeds.json](seeds.json)); the eight other verses prepared fresh looks. Since ADR 0010 a look with a no-form subject also records the depiction profile's look wording as an input, which the seeding reproduces.
- **Before paying.** A free [rehearsal](offline-rehearsal.json) ran the runner in throwaway clones with every request intercepted: a complete run, a refusal and a provider error, and confirmed seeded sections never asked for a new look.
- **Pairs.** `npm run evals:consistency -- pairs` over the suite baseline's Bible results, the Storybook matrix and this run gave 188 pairs; [carry.mts](carry.mts) kept the baseline's 141 verdicts and batched the 47 new pairs.
- **Scoring.** Six independent model scorers, two per batch of 13 to 17, judged the 47 new pairs blind to the key from the [instructions](../../../evals/images/consistency-scoring.md). They agreed on all 47, every one `same`. After scoring, the operator viewed four pairs at full size (two Daniel pairs, a Red Sea pair and a Peter pair) and found the verdicts sound; no settlement was needed. The 11 carried operator rulings are the baseline's.
- **Report.** `report --styles classical,watercolor,fresco,storybook --baseline <suite baseline Bible report>`.

## Limits

- One image per verse and style; three to ten pairs per group and style. A unanimous 47 of 47 on a sample this size is encouraging, not a guarantee.
- Model scorers judged likeness; these are not human judgments.
- The carried verdicts are from a 30 October run. Production references and shared records were unchanged in between; this snapshot's section and entry versions matched the matrix's for every seeded section.
- This run measured agreement only. Its 14 images were not scored against the per-image bar, which the matrix covers.

## Reproduce

```sh
VISIBIBLE_EVAL_ENV_FILE=<private env> npx tsx llm/releases/2026-11-01-storybook-consistency/snapshot.mts
npx tsx llm/releases/2026-11-01-storybook-consistency/seeds.mts
npx tsx llm/releases/2026-11-01-storybook-consistency/rehearse.mts
VISIBIBLE_EVAL_ENV_FILE=<private env> npx tsx llm/releases/2026-11-01-storybook-consistency/run.mts --execute
npm run evals:consistency -- pairs --results llm/releases/2026-10-30-suite-baseline-image/results.ndjson,llm/releases/2026-11-01-storybook-matrix/results.ndjson,llm/releases/2026-11-01-storybook-consistency/results.ndjson --out evals/images/runs/2026-11-01-storybook-consistency/pairs
npx tsx llm/releases/2026-11-01-storybook-consistency/carry.mts split evals/images/runs/2026-11-01-storybook-consistency/pairs 17
# Two blind scorers per batch write pairs/scores/batch-N-a.json and batch-N-b.json.
npx tsx llm/releases/2026-11-01-storybook-consistency/carry.mts merge evals/images/runs/2026-11-01-storybook-consistency/pairs
npm run evals:consistency -- report --out evals/images/runs/2026-11-01-storybook-consistency/pairs --scores llm/releases/2026-11-01-storybook-consistency/scorer-a.json,llm/releases/2026-11-01-storybook-consistency/scorer-b.json --operator llm/releases/2026-11-01-storybook-consistency/operator.json --styles classical,watercolor,fresco,storybook --baseline llm/releases/2026-10-30-suite-baseline-image/consistency/bible-web/report.json
```
