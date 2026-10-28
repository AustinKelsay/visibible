# Unnamed presence: image re-check results

**Watercolor margins are fixed in this sample; God-as-figure persists in two scenes.** The run made **35 images and 29 text calls for $1.2141681** ($1.2007585 images; $0.0134096 text) under the $1.65 cap, with no uncertain usage or production writes. [Ledger](ledger.json), [budget](budget.json), [results](results.ndjson), [thumbnails](thumbs/).

## What ran

Seven of eight cases stored and rendered five images each. Daniel 7:9 refused preparation because its plan still drew the Ancient of Days as a figure after the re-plan; in production an unbound Classical request would fall back to the legacy engine. In every God scene the prompt omitted the verse text and neighbours, and the subject was never named (prompts were 6,133–7,463 characters). Watercolor rendered without a style reference: the old one is stale against the revised style wording, and regenerating it failed the edge check six times.

## Blind scores

Two independent model scorers inspected all 35 images. They gave identical God-figure labels on all 35 and agreed on 31 of 35 overall verdicts. The operator viewed the three disputed Watercolor edges (img04, img13, img30: pale skies running off the frame, scored full) and adjudicated before unblinding (commit `0d9dc80`). [Scorer A](scorer-a.json), [scorer B](scorer-b.json), [adjudicated](operator-scores.json), [key](blind-key.json).

| Images | Acceptable | Flawed | Uncertain | God drawn as a figure (God cases) |
| --- | --- | --- | --- | --- |
| Classical (14) | 9 | 4 | 1 | 3 of 12 |
| Watercolor (14) | 8 | 5 | 1 | 3 of 12 |
| Icon (7) | 4 | 2 | 1 | 1 of 6 |
| **Total (35)** | **21** (60%) | 11 | 3 | **7 of 30** |
| 27 Oct forgiving re-check (40) | 17 (43%) | 20 | 3 | 8 of 35 |

**Watercolor edges: 1 of 14 with a margin**, against 12 of 16 the run before. The revised style wording works without a reference image.

**No-form God: not cleared, but now concentrated.** Exodus 16:15, Exodus 40:34 and Numbers 3:39 show no figure in any image. Exodus 19:18 (Sinai) and Isaiah 6:1 (the Lord on the throne, his train filling the temple) show a robed or veiled figure in 3 of 5 images each, and Exodus 14:22 in 1 Watercolor image. Not naming or quoting the subject removed figures from ordinary glory-cloud scenes, but not from enthroned or descending theophanies, where the image model supplies a figure.

**Other defects:** the words "What is it?" and "It is manna." painted into one Exodus 16:15 image; bearded child figures in a Numbers 3:39 icon; Moses with two staffs; one icon with a painted gold frame.

## Meaning

Renderer v10 and the revised Watercolor style together move image acceptance to 60%. The one remaining blocker is the theophany scenes (Sinai, throne visions). Options include refusing those scenes so that the legacy engine serves Classical, or rendering them without the subject at all (only the mountain smoke, or an empty temple). Both are owner decisions; see the canonical [release status](../STATUS.md).
