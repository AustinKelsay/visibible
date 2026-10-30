# Daniel re-check with his new sheet (partial)

**Daniel's new sheet helps, but his canon text still pulls one scene away from it.** In Classical and Watercolor, his four group verses now show the same man in 6 of 12 judged pairs. Before the sheet, the same styles matched in 2 of 6. All six misses involve Daniel 6:22, where he stands among the lions. Both styles drew him there with close-cropped black hair and darker skin. Leaving out Daniel 6:22, he matches 6 of 6.

The run stopped before Fresco. The shared OpenRouter key reached its $50 spending limit at the first Fresco image, which was refused with 402 ("requires at least $1.00 in balance"). It made **9 images (8 shown, 1 retry) from 10 image calls, 23 text calls and 18 check calls for $0.3277782**, under the $0.60 cap. The refused call reported no usage, so its $0.06 reserve stays uncertain, though OpenRouter does not charge a refusal. [Plan](plan.json), [funding](funding.json), [budget](budget.json), [report](report.json).

## Results

| | Classical | Watercolor | Both |
| --- | --- | --- | --- |
| Before the sheet ([consistency verses](../2026-10-29-consistency-verses/README.md)) | 1 of 3 | 1 of 3 | 2 of 6 |
| With the sheet | 3 of 6 | 3 of 6 | 6 of 12 |
| With the sheet, leaving out Daniel 6:22 | 3 of 3 | 3 of 3 | 6 of 6 |

The lions' den pairs (Daniel 6:22 and 6:23) matched in Watercolor. In Classical they differed: an iron grille at the steps in one, a round wooden door in an arched wall in the other.

## Why Daniel 6:22 still differs

The sheet was attached in every image. Daniel 6:22 shows him as a small figure in the middle of the den. His canon stage text, which goes into every prompt, reads "a lean, dignified Judean man in his youth grown to a grave, graying elder; olive-brown skin; dark hair cropped close and a short trimmed beard flecked with grey". The sheet shows close-cropped greying hair and a grey beard. Where the figure is small, the model followed "dark hair" and drew a younger, darker man.

The owner approved the next step: an owner correction to make Daniel's stage text agree with his sheet, a remade sheet, and a re-check in all three styles. The [second re-check](../2026-10-29-daniel-recheck-2/README.md) did that on the local dev key: 7 of 12 pairs matched across the three styles, and Watercolor's Daniel 6:22 now agrees.

## Method

- **Inputs.** [run.mts](run.mts) is the [consistency-verse runner](../2026-10-29-consistency-verses/README.md) with this plan: Daniel 5:17, 6:22, 6:23 and 7:9 in Classical, Watercolor and Fresco. It used production's engine (the code `main` deploys) and a fresh read-only [snapshot](snapshot.json) that holds Daniel's sheet. The section looks were seeded from the earlier runs where they existed ([seeds.json](seeds.json)), so little changed apart from the sheet.
- **Before paying.** A free [rehearsal](offline-rehearsal.json) covered a complete run, a refusal and a provider error.
- **Scoring.** `npm run evals:consistency -- pairs` over this run gave 14 pairs from the 8 shown images. Two independent blind model scorers judged them under the clarified [scoring instructions](../../../evals/images/consistency-scoring.md), and agreed on 10 ([scorer-a.json](scorer-a.json), [scorer-b.json](scorer-b.json)). The operator settled 4 at full size ([operator.json](operator.json)). The report's gate fails only because this focused run covers two groups.

## Limits

- **The sample is tiny.** There is one image per verse and style, and new plans were prepared, so this is a before-and-after on 12 pairs, not a controlled test of the sheet alone.
- **Fresco wasn't measured here.** The [second re-check](../2026-10-29-daniel-recheck-2/README.md) covers all three styles, after the canon edit.
