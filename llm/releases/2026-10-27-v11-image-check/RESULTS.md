# Unseen presence: image check results

**Sinai and the unseen "God was seen" scenes are clear; three God figures remain, and the gate fails.** The run made **24 images and 24 text calls for $0.8324257** ($0.8210953 images; $0.0113304 text) under the $0.94 cap, with no uncertain usage, refusals or production writes. [Ledger](ledger.json), [budget](budget.json), [results](results.ndjson), [thumbnails](thumbs/).

## What ran

All eight cases stored a plan and rendered three images each. Daniel 7:9, which refused preparation in v10, now renders. In every case with a no-form cast entry, the prompt carried neither the verse, the neighbours, the subject's name nor its canon.

## Blind scores

Two independent model scorers inspected all 24 images. They agreed on 21 of 24 overall verdicts and on every God-figure label but one, a faint hand in the Isaiah 6:1 Watercolor doorway. The operator viewed the four disputed images and counted that hand as a figure, conservatively, before unblinding (commit `96ac927`). [Scorer A](scorer-a.json), [scorer B](scorer-b.json), [adjudicated](operator-scores.json), [key](blind-key.json).

| Case | God drawn as a figure | Other defects |
| --- | --- | --- |
| Exodus 19:18 (Sinai) | 0 of 3 (v10: 3 of 5) | Watercolor margin |
| Isaiah 6:1 (throne) | 1 of 3, a faint hand in Watercolor (v10: 3 of 5) | |
| Daniel 7:9 | 1 of 3, Classical (v10: refused) | |
| Exodus 14:22 | 0 of 3 (v10: 1 of 5) | signature in 2 |
| Ezekiel 1:26 (unseen) | 1 of 3, Classical | |
| Exodus 24:10 (unseen) | 0 of 3 | |
| Genesis 28:13 (unseen) | 0 of 3 | signature in Classical |
| 1 Kings 22:19 (no God in the section cast) | 2 of 3 | |

**Gate: fails.** God was drawn in **3 of 21** images of the seven cases with a no-form cast entry (14%; the bar is at most 1, and none in unseen cases). v10 drew God in 7 of 30. Overall, 15 of 24 images are acceptable: Classical 3 of 8, Watercolor 5 of 8, Icon 7 of 8. Three images carry a small signature-like scribble in the bottom-right corner, two of them Classical. One Watercolor image has a margin.

## Why the figures remain

The three plans that produced figures still describe the subject, despite the new planner rule:

- **Ezekiel 1:26 and Isaiah 6:1** copy God's canon almost word for word into the plan: "a brilliant white-gold radiance veiled by slow-moving cloud with a fire-like glow at its heart", and for Ezekiel "throne-light with no visible figure seated in it". The planner still receives that canon as planning context, so the plan reintroduces what the image prompt left out.
- **Daniel 7:9** says "a seated presence is marked only by radiance and fire pouring outward from the central seat", matching the section look's "fire-light from the central throne". The plan review flagged only an unselected group and missed it.
- **1 Kings 22:19** has no God entry in its section cast, so none of the no-form handling applies and the prompt quotes "I saw Yahweh sitting on his throne". This is an analysis gap, not a prompt rule.

The same canon copying adds an unselected "veiled white-gold" glow to text plans in the [paired text check](../2026-10-27-v11-fresh-check/RESULTS.md).

## Meaning

Not describing the subject in the image prompt works when the plan follows the rule: Sinai, Exodus 24:10 and Genesis 28:13 show no figure in any style. The remaining leak is the planner's own input. The next general fix is to stop giving the planner and section look the no-form canon text, and to align the no-form look rule, which still permits "an unoccupied seat". See the canonical [release status](../STATUS.md).
