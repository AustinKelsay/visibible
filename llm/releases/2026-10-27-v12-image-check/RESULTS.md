# No-form canon out of preparation: image check results

**Five of eight God-appearance scenes now show no figure in any style; God still appears in 4 of 24 images, so the gate fails.** The run made **24 images and 28 text calls for $0.8329181** ($0.8206243 images; $0.0122938 text) under the $0.94 cap, with no uncertain usage, refusals or production writes. [Ledger](ledger.json), [budget](budget.json), [results](results.ndjson), [thumbnails](thumbs/).

## Blind scores

Two independent model scorers inspected all 24 images, agreed on 23 of 24 overall verdicts and on every God-figure label. The operator resolved the two disputes from both scorers' notes (an Icon gilt border counts as a frame; a tiny pencil mark counts as initials) before unblinding (commit `4a019a8`). [Scorer A](scorer-a.json), [scorer B](scorer-b.json), [adjudicated](operator-scores.json), [key](blind-key.json).

| Case | God drawn as a figure | v11 | Other defects |
| --- | --- | --- | --- |
| Daniel 7:9 | **0 of 3** | 1 of 3 | |
| Isaiah 6:1 | **0 of 3** | 1 of 3 | Icon frame; Watercolor margin and initials |
| Exodus 19:18 (Sinai) | **0 of 3** | 0 of 3 | |
| Revelation 4:2 (unseen) | **0 of 3** | — | extra elders and beasts in Classical |
| Exodus 33:22 (unseen) | **0 of 3** | — | Watercolor margin |
| Ezekiel 1:26 | 2 of 3 (Classical, Watercolor) | 1 of 3 | pseudo-letters in Icon |
| Exodus 34:5 (unseen) | 1 of 3 (Classical) | — | margins and writing on the tablets |
| Numbers 12:5 (unseen) | 1 of 3 (Classical) | — | Icon frame, two staffs |

**Gate: fails.** God was drawn in **4 of 24** images (17%; v11 3 of 21, v10 7 of 30), two of them in unseen cases. The bar is at most 1 and none in unseen cases. Overall, 12 of 24 are acceptable, 4 in each style. Defects other than God figures grew: Watercolor margins in 3 of 8 (v11: 1 of 8), two Icon gilt frames, and writing on Moses' tablets.

## Why the figures remain

The plans no longer copy God's canon, and they cleared Daniel, Isaiah and Revelation's "one sitting on the throne". The remaining figures follow plan wording the rules already forbid, or a central object the image model fills:

- **Ezekiel 1:26:** "a shining, throne-like form… with no visible figure within it". The plan still names a throne, and the negation names a figure.
- **Exodus 34:5:** "as God's presence stands with him". God's name is "God / Yahweh, the Father and God of Israel", so the bare "God" was not replaced. Renderer v13 now also matches the parts of a slash-separated name; this is not separately measured.
- **Numbers 12:5:** "a tall pillar of cloud standing at the door"; the figure appeared inside the pillar.

The plan review missed "stands" and "throne-like form" in all three.

## Meaning

Wording changes have reduced, but not removed, God figures in the hardest scenes: about one image in six in these chosen theophanies, which are a small share of all verses. The same images show style defects (margins, frames, lettering) at similar rates. Each round of prompt wording fixes some cases and misses others, so the next lever is structural: check each finished image for these defects and retry once. See the canonical [release status](../STATUS.md).
