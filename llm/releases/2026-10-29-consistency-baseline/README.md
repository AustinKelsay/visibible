# Consistency baseline

**Recurring characters mostly agree, but places in neighbouring verses often don't, and the current launch matrix is too small to gate either.** In the released styles (Classical, Watercolor, Fresco), 21 of 25 judged character pairs show the same person (84%). Only 1 of 3 neighbouring-verse pairs shows the same place. Both measures fail the new [consistency gate](../../../docs/adr/0008-consistency-in-the-launch-bar.md) for too few pairs. The next launch matrix must add the 14 verses that the [groups](../../../evals/images/consistency.json) name.

This baseline made no provider calls and cost nothing. It pairs images the launch matrices had already made: the [third launch matrix](../2026-10-28-launch-matrix-v3/RESULTS.md) for Classical, Watercolor and Icon, and the [Fresco matrix](../2026-10-28-fresco-matrix/RESULTS.md) for Fresco. Every image matched its recorded SHA-256.

## Results

| Measure | Released styles | Icon (owner-only) | Gate |
| --- | --- | --- | --- |
| Same person | 21 of 25 judged (84%); 6 unclear | 9 of 10 | fail: 25 judged pairs, needs 30 |
| Same place, neighbouring verses | 1 of 3 | 1 of 1 | fail: 3 judged pairs, needs 20; 33%, bar 50% |

By group, across all four styles:

| Group | Same | Different | Unclear | Sheet sent |
| --- | --- | --- | --- | --- |
| Jesus (4 verses) | 18 | 0 | 6 | yes |
| Moses (3 verses) | 9 | 3 | 0 | yes |
| Simon Peter (2 verses) | 3 | 1 | 0 | yes |
| Daniel (2 verses, Fresco only) | 0 | 1 | 0 | none exists |
| Red Sea, Exodus 14:21–22 | 2 | 2 | 0 | none exists |

## What differs

All seven pairs judged different are in [different-pairs.jpg](different-pairs.jpg), in pair order.

- **Moses changes hairstyle even with his sheet attached.** In Watercolor he has a full head of white hair at the Red Sea and a bald crown in Leviticus 11:7 (two pairs). In Icon the hair changes from long to short. Neither style had a current style reference in that run.
- **Peter in Fresco changes age.** He has black hair and a dark beard on the water (Matthew 14:29) and grey hair at the shore (John 21:7), with his sheet sent both times.
- **Daniel has no reference sheet in production,** and the two Fresco images show different men: an elderly, light-skinned Daniel in 7:9 and a younger, darker one in the den in 6:22.
- **The Red Sea is drawn as two different places in consecutive verses.** In Classical, 14:21 shows a path between one wall of water and desert cliffs, while 14:22 shows two walls. In Fresco, one verse is in daylight and the next at night. The section look is no longer rendered ([ADR 0005](../../../docs/adr/0005-one-scene-description-unnamed-presence.md)), and production has no Red Sea sheet.
- **The six unclear Jesus pairs** all include Matthew 27:35, where Classical and Watercolor show the crucified figure too small to judge.

Production also lacks sheets for other recurring entries in these cases, including Aaron, the Israelite people, the den of lions and the Sea of Galilee (`skippedReferences` in the matrix results).

## Method

- [`npm run evals:consistency -- pairs`](../../../scripts/evals/consistency.mts) took the shown image for each case and style. It paired images within each [group](../../../evals/images/consistency.json) and style, as [ADR 0008](../../../docs/adr/0008-consistency-in-the-launch-bar.md) describes. A character pair needs the entry selected in both plans and the same canon stage. This left out David, whose Psalm 23 image uses his king stage and his 1 Samuel 17 image his youth stage.
- That gave 45 pairs: 41 character and 4 setting. Five of the 10 groups had no pair yet, because the matrices lack their verses.
- Six independent model scorers, two per batch of 15, judged every pair blind, following the [scoring instructions](../../../evals/images/consistency-scoring.md). They saw only the side-by-side picture, the question and each side's scene description, never the style, verse or group.
- The scorers agreed on 42 of 45. The operator settled the other three ([operator.json](operator.json)) by viewing them at full size, with cropped faces for 008 and 041. All three were ruled different, each on a named visible cue.
- [key.json](key.json) records the pairs and their sources, [pairs.json](pairs.json) what scorers saw, [scorer-a.json](scorer-a.json) and [scorer-b.json](scorer-b.json) their verdicts, and [report.json](report.json) the summary and gate.

Reproduce from a checkout holding the matrix images under `evals/images/runs/` (or pass `--images-root`):

```sh
npm run evals:consistency -- pairs --results llm/releases/2026-10-28-launch-matrix-v3/results.ndjson,llm/releases/2026-10-28-fresco-matrix/results.ndjson --out evals/images/runs/2026-10-29-consistency-baseline
npm run evals:consistency -- report --out evals/images/runs/2026-10-29-consistency-baseline --scores <scorer-a.json>,<scorer-b.json> --operator <operator.json> --styles classical,watercolor,fresco
```

## Limits

- The samples are small: one image per verse and style, and 2 to 4 verses per character. The character rate's uncertainty is roughly ±15 points.
- Model scorers judged likeness. Two disagreed on 3 of 45 pairs, all hair or terrain cues, and the operator chose the stricter reading each time. The same images could come out a few points higher under a looser reading.
- Pairs never cross styles, since a reader compares images in the style they chose.
