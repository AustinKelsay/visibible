# Consistency verses

**The consistency gate passes.** This run rendered the 14 group verses the launch matrices never ran, in each public style. With the earlier matrices' images, there are now enough pairs to judge. In the released styles (Classical, Watercolor, Fresco):
- 79 of 95 judged character pairs show the same person (83%; floor 75%; baseline 84%).
- 19 of 27 neighbouring-verse pairs show the same place (70%; floor 50%; baseline 1 of 3).

Daniel, who has no reference sheet in production, accounts for most of the misses. Without him, characters reach 76 of 83 (92%). Fresco is the weakest style in both measures.

The owner chose this step by replying "1." ([funding](funding.json)). The run made **43 images (42 shown, 1 retry), 87 text calls and 86 check calls for $1.53891275**, under the $2.00 cap. It had no uncertain usage, refusal or production write. [Plan](plan.json), [budget](budget.json), [report](report.json), [ADR 0008](../../../docs/adr/0008-consistency-in-the-launch-bar.md), [baseline](../2026-10-29-consistency-baseline/README.md).

## Results

| Measure | Classical | Watercolor | Fresco | Released, pooled | Gate |
| --- | --- | --- | --- | --- | --- |
| Same person | 27 of 29 (93%); 6 unclear | 24 of 28 (86%); 7 unclear | 28 of 38 (74%) | 79 of 95 (83%); 13 unclear | pass |
| Same place, neighbouring verses | 7 of 9 | 8 of 9 | 4 of 9 | 19 of 27 (70%) | pass |

Icon is owner-only and not gated. Its pairs are the baseline's (9 of 10 and 1 of 1), because this run made no Icon images.

By group, in the released styles:

| Group | Same of judged | Unclear | Sheet sent |
| --- | --- | --- | --- |
| Jesus | 12 of 12 | 6 | yes |
| Moses | 28 of 30 | 0 | yes |
| Simon Peter | 20 of 23 | 7 | yes |
| David (youth) | 16 of 18 | 0 | yes |
| Daniel | 3 of 12 | 0 | none exists |
| Red Sea, Exodus 14:21–23 | 5 of 9 | 0 | none exists |
| Storm on the lake, Mark 4:37–39 | 7 of 9 | 0 | none exists |
| Breakfast on the shore, John 21:7–9 | 3 of 3 | 0 | none exists |
| The prodigal's return, Luke 15:20–22 | 3 of 3 | 0 | none exists |
| Lions' den, Daniel 6:22–23 | 1 of 3 | 0 | none exists |

## What differs

The 18 new pairs judged different are in [different-pairs.jpg](different-pairs.jpg), labelled. The baseline's are in [its sheet](../2026-10-29-consistency-baseline/different-pairs.jpg).

- **Daniel changes skin tone and hair in every style.** He has 9 of the 16 character differences. Across Daniel 5:17, 6:22, 6:23 and 7:9 he moves between light olive and dark brown skin, and between dark, grey and white hair. Only his blue-and-white robe stays. Production has no Daniel sheet.
- **Fresco's Peter on the water is the odd one out.** All three Peter differences pair the Fresco Matthew 14:29 image, with black hair and a black beard, against a grey-haired Peter elsewhere.
- **Fresco's David ages.** He is a small child at his anointing (1 Samuel 16:13) and a lanky young man in 17:40 and 18:11. All are the youth stage, and the youth sheet was sent.
- **Moses** differs only in the baseline's two Watercolor pairs, where he has a bald crown in Leviticus 11:7.
- **Places flip between day and night, or change layout.** Fresco shows Exodus 14:22 in daylight between night scenes. Watercolor's Exodus 14:21 is a beach beside an unparted sea, and 14:23 a path between two walls of water. Classical's lions' den is lit by day in 6:23 and by night in 6:22, and Fresco builds the den differently in each verse.
- **The unclear pairs have two causes.** Six pair Matthew 27:35, where the crucified figure is too small to judge, as in the baseline. Seven pair John 21:9, whose plans describe "the disciples" without singling out Peter. No style's John 21:9 plan selected Jesus, so he has no pair there.

## Method

- **Rendering.** [run.mts](run.mts) rendered each verse through production's engine (the code `main` deploys, checked file by file) with the production references in a fresh read-only [snapshot](snapshot.json). Classical sent its style reference. Watercolor's is stale and was skipped, and Fresco has none, as in the earlier matrices. Every first image was checked, and a faulty one got one retry.
- **Shared section looks.** Production keeps one look per story section, so a new verse should be planned against the look its neighbours were drawn with. Each style family had its own memory store, seeded with the section looks of the earlier run its images pair with ([seeds.json](seeds.json)): the [third launch matrix](../2026-10-28-launch-matrix-v3/RESULTS.md) for Classical and Watercolor, and the [Fresco matrix](../2026-10-28-fresco-matrix/RESULTS.md) for Fresco. All six setting-group verses used their neighbours' looks in every style. The stores ran one after the other, because the engine shares in-flight preparations across a process.
- **Before paying.** A free [rehearsal](offline-rehearsal.json) ran the runner in throwaway clones with every request intercepted. It covered a complete run, a refusal and a provider error, and confirmed that seeded sections never asked for a new look.
- **Pairs.** `npm run evals:consistency -- pairs` over the three runs' results gave 146 pairs from 171 shown images, with no group verse left unrun.
- **Scoring.** The baseline's 45 pairs kept their two blind verdicts and three operator rulings ([carried.json](carried.json), matched by group, style and both image hashes). The other 101 pairs went to 12 independent model scorers, two per batch of 16 or 17, blind to the [key](key.json). They followed the [scoring instructions](../../../evals/images/consistency-scoring.md) and agreed on 95 pairs.
- **Settlement.** The operator settled the other 6 at full size, cropping faces for pair023 and pair113: three same and three different ([operator-new.json](operator-new.json)). [scorer-a.json](scorer-a.json), [scorer-b.json](scorer-b.json) and [operator.json](operator.json) cover every pair. [report.json](report.json) compares against the baseline's report.

## Limits

- **The scoring instructions miss text-driven change.** In Mark 4:39 the storm stops, so a calm sky after a stormy one is the story, not a new place. The scorers counted it as day against night in both Fresco storm pairs. The operator ruled the disputed Watercolor pair the same. Ruling it different gives 18 of 27 (67%).
- **The operator's choices don't decide the gate.** Taking the stricter verdict on all six disputes gives 77 of 94 characters (82%) and 18 of 27 places (67%), and the gate still passes. pair023's stricter verdict is unclear, not different.
- **Samples are small:** one image per verse and style, and three to nine pairs per group and style.
- **Images come from different days.** The paired images were made on 28 and 29 October. The production references and every shared record were unchanged in between. The brief changed only to add Fresco to its style list, which no look or plan request reads.
- **Model scorers judged likeness.** These are not human judgments.
- **No per-image scoring.** This run measured agreement only. Its images were not scored against the per-image bar, which the launch matrices cover. Daniel 5:17 in Fresco was retried for lettering, and both attempts show the writing on the wall that the verse is about.

## Reproduce

The run itself was one-shot and funded; the rest is free. Images stay under the ignored `evals/images/runs/`. The earlier matrices' images came from the checkout that made them.

```sh
VISIBIBLE_EVAL_ENV_FILE=<private env> npx tsx llm/releases/2026-10-29-consistency-verses/snapshot.mts
npx tsx llm/releases/2026-10-29-consistency-verses/seeds.mts
npx tsx llm/releases/2026-10-29-consistency-verses/rehearse.mts
VISIBIBLE_EVAL_ENV_FILE=<private env> npx tsx llm/releases/2026-10-29-consistency-verses/run.mts --execute
npm run evals:consistency -- pairs --results llm/releases/2026-10-28-launch-matrix-v3/results.ndjson,llm/releases/2026-10-28-fresco-matrix/results.ndjson,llm/releases/2026-10-29-consistency-verses/results.ndjson --out evals/images/runs/2026-10-29-consistency-verses/pairs
npx tsx llm/releases/2026-10-29-consistency-verses/carry.mts split evals/images/runs/2026-10-29-consistency-verses/pairs 17
# Two blind scorers per batch write pairs/scores/batch-N-a.json and batch-N-b.json; the operator writes operator-new.json.
npx tsx llm/releases/2026-10-29-consistency-verses/carry.mts merge evals/images/runs/2026-10-29-consistency-verses/pairs
npm run evals:consistency -- report --out evals/images/runs/2026-10-29-consistency-verses/pairs --scores llm/releases/2026-10-29-consistency-verses/scorer-a.json,llm/releases/2026-10-29-consistency-verses/scorer-b.json --operator llm/releases/2026-10-29-consistency-verses/operator.json --styles classical,watercolor,fresco --baseline llm/releases/2026-10-29-consistency-baseline/report.json
```
