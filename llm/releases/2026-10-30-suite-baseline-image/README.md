# Regression suite baseline: images and consistency

**This is the suite's first baseline ([ADR 0011](../../../docs/adr/0011-frozen-multi-work-regression-suite.md)).** Later runs are gated against it. In short:

- **121 of 206 shown images are acceptable (59%)**; on the holdout, 28 of 49 (57%).
- **The Bible holds up:** 106 of 144 (74%). Its consistency gate passes, at 97% same person and 89% same place.
- **Holmes fails:** 1 of 30. Production's Holmes and Watson reference sheets are likenesses of Benedict Cumberbatch and Martin Freeman, and every Holmes image copies them.
- **Alice is in between:** 14 of 32 (44%). Lettering and film-style creatures cause most of its misses.

The run drew the plans of the [text baseline](../2026-10-30-suite-baseline-text-2/README.md), in each work's image styles, through the same scene check and retry readers get. It made **228 image calls and 456 check calls for $7.9841808**, under its $9.00 cap. It had no uncertain usage, no refusal and no production write. Links: [funding](funding.json), [plan](plan.json), [report](report.json), [items](items.json).

## Images

| Work | Dev | Holdout | All |
| --- | --- | --- | --- |
| Bible (Classical, Watercolor, Fresco) | 84 of 117 | 22 of 27 | 106 of 144 (74%) |
| Holmes (Classical, Watercolor) | 0 of 22 | 1 of 8 | 1 of 30 (3%) |
| Alice (Classical, Watercolor) | 9 of 18 | 5 of 14 | 14 of 32 (44%) |
| **All** | 93 of 157 | **28 of 49** | **121 of 206 (59%)** |

By style: Fresco 35 of 48 (73%), Classical 49 of 79 (62%), Watercolor 37 of 79 (47%). Fresco runs only on the Bible, so these rates partly reflect the work mix.

| Fault | Bible | Holmes | Alice | All |
| --- | --- | --- | --- | --- |
| Depiction rule broken | 6 | 27 | 6 | 39 (19%) |
| Lettering | 7 | 19 | 11 | 37 (18%) |
| Incoherent | 13 | 3 | 4 | 20 (10%) |
| Scene not shown | 7 | 0 | 1 | 8 (4%) |
| Extra figure | 4 | 0 | 3 | 7 (3%) |
| Anatomy | 5 | 0 | 2 | 7 (3%) |
| Unseen subject drawn | 4 of 30 | n/a | n/a | 4 of 30 |
| Painted frame | 0 | 0 | 0 | 0 |

Watercolor shows unpainted paper at an edge in 46 of its 79 images. The style accepts this ([ADR 0006](../../../docs/adr/0006-unseen-presence-speakers-and-launch-bar.md)), so it is recorded in [items.json](items.json) and counts as 0 in the table and the gate.

### What fails

- **Holmes is drawn as the BBC's Sherlock.** In 27 of 30 images both scorers name a Cumberbatch likeness for Holmes, and in 15 a Martin Freeman likeness for Watson. The cause is upstream of rendering: the production reference sheets themselves are those likenesses ([holmes-likeness.jpg](holmes-likeness.jpg)). Each image is told to "match its identity exactly". Every Holmes image was sent the Holmes sheet, so this run cannot tell whether the model would reach for the actor without one. The same images also carry 19 lettering faults, mostly papers, notes and certificates in Baker Street interiors.
- **Alice borrows from film and gives creatures human traits.** The Caterpillar has a human old man's face, bowler and waistcoat in both styles. The Queen echoes the animated or 2010 film designs in two images. Card soldiers are people in tabards. Its 11 lettering faults are card indices, scrolls and court papers.
- **The Bible's faults are the known ones.**
  - Isaiah's seraphim get two or four wings, not six covering face and feet (all three styles).
  - God appears as a figure in 4 of 30 images: the Ancient of Days, the throne in Revelation 4, and twice the pillar of fire taking a human outline.
  - Thirteen images are incoherent: a temple or tabernacle drawn twice, Moses holding two staffs, or the stone still in David's sling after Goliath is struck.

## Consistency

Pairs of shown images that should agree, judged blind ([ADR 0008](../../../docs/adr/0008-consistency-in-the-launch-bar.md)). Character pairs ask "the same person?" and setting pairs ask "the same place?".

| Work | Same person | Same place | Gate |
| --- | --- | --- | --- |
| Bible (3 styles) | 91 of 94 (97%); 20 unclear | 24 of 27 (89%) | **pass** (floors 75% and 50%; last measurement 83% and 70%) |
| Holmes (2 styles) | 45 of 50 (90%) | 4 of 4; 4 unclear | fail: too few place pairs (4 of 20 needed) |
| Alice (2 styles) | 24 of 24 | 8 of 12 (67%) | fail: too few pairs (24 of 30 and 12 of 20 needed) |

The Holmes and Alice gates fail on sample size, not on any rate. Neither work is served to readers. These numbers are their baseline, not a release decision.

By group:
- **Bible characters:** Jesus 18 of 18, David 18 of 18, Peter 18 of 18 (12 unclear), Daniel 17 of 18, Moses 20 of 22 (8 unclear).
- **Bible places:** Red Sea 9 of 9, storm 9 of 9, breakfast on the shore 3 of 3, prodigal's return 3 of 3, lions' den 0 of 3.
- **Holmes:** Holmes 30 of 30, Watson 15 of 20, bank cellar 2 of 2, Eyford fire 2 of 2 (4 unclear).
- **Alice:** Alice 20 of 20, Cheshire Cat 2 of 2, Hatter 2 of 2, croquet-ground 6 of 6, tea table 2 of 6.

What the numbers mean:
- **Daniel now holds** (3 of 12 on 29 October). Production gained his sheet that day ([second re-check](../2026-10-29-daniel-recheck-2/README.md)).
- The three Bible character misses are skin tone: Daniel once, and Moses twice in Watercolor.
- **Holmes's 30 of 30 is the wrong kind of consistency.** He matches because every image copies the same actor. Watson is sent his sheet too, yet drifts in 5 of 20 pairs.
- **Alice's tea table** changes its house between moments: ochre plaster against grey stone, and different porches.

## How it was scored

- **Images.** The 206 images went blind to two independent model scorers in 8 batches each, following [SCORING.md](scoring/SCORING.md) with the suite's [fault questions](../../../evals/images/faults.json). They agreed fully on 158 items. On the 48 disputed items, two adjudicator agents drafted rulings, 24 items each. Each viewed only the image, its item, and both scorers' answers and notes. The operator spot-checked i007, i016, i109 and i192 against the images, adopted all 48 ([operator.json](scoring/operator.json)) and re-settled ([scores.json](scoring/scores.json)). [disputes.json](scoring/disputes.json) lists what was disputed; [adjudication-1.json](scoring/adjudication-1.json) and [-2](scoring/adjudication-2.json) are what the adjudicators saw.
- **Consistency.** `npm run evals:consistency -- pairs` built 141 Bible, 58 Holmes and 36 Alice pairs from this run's results. The Holmes and Alice pairs used their [group files](../../../evals/images/consistency.holmes-adventures.json). Two blind scorers judged every pair from the [instructions](../../../evals/images/consistency-scoring.md), in 8 batches each, and agreed on 215 of 235. One adjudicator agent drafted the 20 rulings. The operator spot-checked pair041 (Holmes) and pair073 (Bible) and adopted them all. Each work's pairs, key, scorer files, operator file and report are under [consistency/](consistency/). Alice's scorers were told that her size changes in the story, so size is not an identity cue.
- **The line on unnamed figures.** A figure the plan picks out by role (the elder with the staff beside Aaron, the companion with the doctor's bag) counts as the subject. "The disciples", with no one singled out, is unclear, as in the [last measurement](../2026-10-29-consistency-verses/README.md).
- Composites and blind copies stay in `evals/images/runs/2026-10-30-suite-baseline-image/` (ignored). The pairs commands are reproducible from the committed results.

## Limitations

- One image per case and style. The holdout is 49 images, and the consistency groups have 2 to 30 pairs each.
- Scorers and adjudicators are models. The likeness calls are unanimous and are confirmed in the sheet images. Other borderline calls (faint lettering, how prominent a bystander is) are noted in the operator file.
- The Holmes result measures the production sheets as they are. It does not show how well the engine resists likenesses on its own.

## Accounting

| Run | Calls | Spent | Uncertain |
| --- | --- | --- | --- |
| [Text, stopped](../2026-10-30-suite-baseline-text/README.md) | 67 text | $0.0264611 | $0.0026066 |
| [Text](../2026-10-30-suite-baseline-text-2/README.md) | 404 text | $0.1782921 | 0 |
| Images (this run) | 228 image, 456 check | $7.9841808 | 0 |
| **Suite baseline** | | **$8.1889340** | $0.0026066 |

All three runs are evaluation spend. The owner's grant raised evaluation by **$9.25 to $49.55**: $0.25 for the text runs and $9.00 for this one ([funding](funding.json)).
- **Total.** Measured evaluation is now **$49.39280750**, with **$0.12160660** of retained uncertainty. That leaves **$0.03558590**.
- **Earlier overage.** The $1.02287350 overage from before this grant now fits inside the new total. The grant did not cover it, so ratifying it remains the owner's call.

Scoring ran on agents with no OpenRouter spend. No run wrote to production; the text runs only read it for their snapshots.

## Follow-ups

1. **Remake the Holmes and Watson sheets without an actor likeness, and check canon and sheets for borrowings from adaptations before they are pinned.** Alice's drafted canon also gives her the blue dress and pinafore that the text scorers read as Disney's. Remaking production sheets is a production write with preparation spend, so the owner must approve it. It should come before Holmes is served or used to tune prompts.
2. **Cut lettering in cluttered interiors.** Papers, notes and cards cause most lettering faults in Holmes and Alice.
3. **Grow the Holmes and Alice consistency groups** until their gates can be judged (30 character and 20 place pairs each).
