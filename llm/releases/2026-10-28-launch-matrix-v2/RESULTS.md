# Launch matrix rerun results

**Better, but still short of the bar: 68 of 96 shown images are acceptable (71%; the bar is 75%).** Classical (84%) and Watercolor (78%) pass on their own; together they reach 52 of 64 (81%). Icon fell to 50%, mostly from fake writing and gold border bands that come from icon tradition. One God figure in 18 shown images of scenes that select God misses the 1-in-20 limit by a single image.

The run made **103 images (96 shown, 7 retries), 120 text calls and 206 check calls for $3.6419788**, under the $6.00 cap, with no uncertain usage and no production write. [Plan](plan.json), [budget](budget.json), [ledger](ledger.json), [results](results.ndjson), [summary](summary.json), [contact sheet](contact-sheet.jpg), [thumbnails](thumbs/), [first run](../2026-10-27-launch-matrix/RESULTS.md).

## Launch bar (ADR 0006 as amended), on the images shown

| Measure | First run | This run | Bar | Pass |
| --- | --- | --- | --- | --- |
| Acceptable, all styles | 62/99 (63%) | 68/96 (71%) | at least 75% | no |
| Classical | 25/33 (76%) | 27/32 (84%) | at least 65% | yes |
| Watercolor | 16/33 (48%)* | 25/32 (78%) | at least 65% | yes |
| Icon | 21/33 (64%) | 16/32 (50%) | at least 65% | no |
| No-form figure, scenes that select one | 1/21 | 1/18 | at most 1 in 20 | no, by one image |

\* The first run counted soft Watercolor edges as faults; the owner has since accepted them.

**Exodus 14:22 has no images, because of a harness fault.** The harness gives each case its own in-memory store, but in-progress preparation is shared across the whole process. Exodus 14:21 and 14:22 share a section and ran at the same time, so 14:22 received 14:21's new section look, which its own store never held. Its consistency check then refused. Production uses one shared store, so this cannot happen there. Scoring the missing three as all acceptable or all flawed would give 69–72% (68 or 71 of 99), under the bar either way.

## What the fixes changed

- **Genealogy scrolls are gone.** Ruth 4:22 is now acceptable in all three styles (it failed all three), and Matthew 1:1 in Classical and Watercolor.
- **The unseen angel and the unselected throne are gone.** Daniel 6:22 (it failed two styles) and Revelation 4:6 (God was on the throne in Classical) are now clean in every style.
- **Watercolor passes** now that soft white edges are part of the style. The check no longer retries them, so retries fell from 28 to 7 and the owner's cost per image from $0.0105 to $0.0032.
- Joshua 6:20 and John 21:7 also improved, though these draws vary from run to run.

## What still fails (28 shown)

- **Icon (16 of 32 flawed), mostly from icon traditions the model reproduces:**
  - Greek letters in cross-shaped halos (Isaiah 11:6, Matthew 14:29, Matthew 27:35).
  - Signature-like scribbles on ground or rocks (Matthew 1:1, Genesis 19:24, Isaiah 6:2, Luke 15:20, Psalm 23:2).
  - Gold border bands (Mark 4:39, Matthew 27:35, Exodus 14:21).
  - Christian crosses on Bethel's domes (2 Kings 2:23) and a Chi-Rho on a Philistine shield.
  - Lettering is the only fault in 7 of these. The check caught only 3 of 14 lettering faults on first attempts, because the marks are small and faint.
- **Scenes only partly matched or incoherent:**
  - David and Goliath (1 Samuel 17:49) fails in every style again.
  - Isaiah 6:2 still shows a single seraph holding the coal from verse 6.
  - Revelation 21:1 reads as a calm lake against "the sea is no more".
- **One God figure:** Daniel 7:9 Watercolor seats a white-robed figure on the flaming throne. Its plan called the presence "a seated presence shown only as blazing fire", and the image model drew the seated part.

## The check, on first attempts

| Fault | Caught | False alarms |
| --- | --- | --- |
| Lettering | 3 of 14 | 0 |
| Painted frame (Classical and Icon) | 5 of 5 | 0 of 59 |
| No-form figure | 0 of 1 | 1 |

It retried 1 of 66 acceptable first images. Every caught Icon frame was retried. The check passed four of the retries, yet the scorers still saw a frame in three shown images (Mark 4:39, Matthew 27:35 and Exodus 14:21), so the fix belongs in the style text.

- **Cost:** the reader pays $0.0342 per shown image; the owner's share is $0.0032 per sample.
- **Harness time per sample:** median 9.5 s, p90 24.6 s.

## Scoring

- Sixteen independent model scorers, two per batch of 12–13 images, inspected every image blind to style label, attempt and whether it was shown. Each saved its scores as it went.
- They agreed on 95 of 103 overall verdicts.
- The operator resolved 32 field disputes on 27 images (counting the scene-match field) by viewing the images and detail crops, using the first run's written rules, and committed before unblinding (commit `5ee9942`).
- **Sensitivity:** if every disputed shown verdict went the other way, acceptable would range from 64 to 72 of 96, under the bar either way.
- [Scorer A](scorer-a.json), [scorer B](scorer-b.json), [adjudicated](operator-scores.json), [key](blind-key.json), [instructions](SCORING.md).
- These are model judgments, not human acceptance.

## Meaning

The planning and prompt fixes worked on the cases they targeted, and Classical and Watercolor now meet the bar on their own. Icon needs its own fixes. Both remaining problems come from icon tradition and from the style text, which says nothing about inscriptions or halos:

1. Icon's style text should forbid inscriptions, halo letters, monograms, scribbles and border bands. Changing it changes the style's version, so the production Icon style reference must be remade (about $0.04), and Icon re-measured (about $1.40 for 33 images).
2. Plans should never call a no-form subject seated or standing. The review already treats that as embodiment but missed "a seated presence".

The owner's options are to launch Classical and Watercolor first while Icon is fixed, or to fix Icon and re-measure before any launch. Across both runs, Classical and Watercolor drew God as a figure in 1 of 26 shown images of scenes that select him.
