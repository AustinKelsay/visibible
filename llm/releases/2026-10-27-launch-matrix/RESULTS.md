# Launch matrix results

**The launch bar fails: 62 of 99 shown images are acceptable (63%; the bar is 75%), and watercolor reaches only 48%.** No-form figures pass: God appears as a figure in 1 of 21 shown images of scenes that select him. Most other failures come from two causes, visible lettering and watercolor white edges, and each has a direct fix.

The run made **127 images (99 shown, 28 retries), 121 text calls and 254 check calls for $4.4754949**, under the $6.00 cap. There was no uncertain usage, no refusal or failure, and no production write. [Plan](plan.json), [budget](budget.json), [ledger](ledger.json), [results](results.ndjson), [summary](summary.json), [contact sheet](contact-sheet.jpg), [thumbnails](thumbs/).

## Launch bar (ADR 0006), on the images shown

| Measure | Result | Bar | Pass |
| --- | --- | --- | --- |
| Acceptable, all styles | 62/99 (63%) | at least 75% | no |
| Classical | 25/33 (76%) | at least 65% | yes |
| Watercolor | 16/33 (48%) | at least 65% | no |
| Icon | 21/33 (64%) | at least 65% | no |
| God or another no-form subject drawn as a figure | 1/21 | at most 1 in 20 | yes |
| Watercolor margins | 10/33 | at most 1 in 10 | no |

Before the check and retry (first attempts only), 57/99 were acceptable (58%). The check retried 28 samples. 5 retries replaced a flawed image with an acceptable one; in 19 both attempts were flawed.

## Why images failed (37 shown)

- **Visible lettering (13):**
  - Genealogy verses fail in every style because the plan asks for a scroll of names, drawn as pseudo-script: Ruth 4:22 and Matthew 1:1.
  - Icon halos and the cross's title carry glyphs: Matthew 27:35, John 11:43, John 21:7 and Joshua 6:20.
  - Seven of the 13 have no other fault.
- **Scene only partly matched or incoherent (21 combined):**
  - David and Goliath (1 Samuel 17:49) fails in all three styles: Goliath has already fallen while David's sling is still loaded.
  - Peter on the water (Matthew 14:29) swaps who is in the boat.
  - Daniel 6:22 draws the "unseen" angel as a winged figure.
  - Exodus 14:21 adds an unselected chariot army.
  - Isaiah 6:2 shows one seraph with bare feet holding the coal from verse 6.
- **Watercolor margins (10):** soft fades to white paper along an edge or the bottom, the classic watercolor vignette.
  - Retries do not fix them: in three watercolor samples the check found edge faults on both attempts.
  - Trimming 3–8% from each edge does not remove most of them.
  - Six of the 10 have no other fault.
- **No-form figure (2 shown, 1 in a case that selects God):**
  - Isaiah 6:2 Icon draws God's robe train spilling over the temple floor, with no wearer.
  - Revelation 4:6 Classical selects only the creatures and the throne room, yet both attempts seat a robed figure on the throne. God is in the section's cast but was not selected, so the image prompt carried no unseen-presence line, while the plan's throne invited a figure. The other two styles were clean.

If only the images whose single fault is lettering or a margin were fixed, 75 of 99 would be acceptable (76%), with Watercolor at 67% and Icon at 76%.

## The check, on new labels

On first attempts, which the check had never seen:

| Fault | Caught | False alarms |
| --- | --- | --- |
| Edge or frame | 10 of 13 | 5 of 86 |
| Lettering | 10 of 15 | 2 of 84 |
| No-form figure | 1 of 2 | 2 of 97 |

It retried 3 of 57 acceptable first images.

Cost per sample:
- **Reader:** $0.0342 for the shown image.
- **Owner:** $0.0105 for checks and unshown retries ($1.0381 in this run), 31% on top of the image cost for +5 acceptable images per 99.

Harness time per sample: median 14.7 s, p90 27.6 s, including preparation on each case's first style.

## Scoring

- Two independent model scorers per batch inspected every image (first attempts and retries) blind to style label, attempt and whether it was shown.
- Three of the eight batch scorers were cut off by network errors and a server restart. Further independent agents finished their images with the unchanged instructions. The part names in the scorer files record who scored what.
- The scorers agreed on 111 of 127 overall verdicts.
- The operator resolved 35 field disputes by viewing each image, with border and detail crops, and committed before unblinding (commit `9b92b0c`). The rules are in [operator-scores.json](operator-scores.json):
  - **Margins:** a margin is unpainted paper that reads as a band, a fade to white or a visibly unpainted corner at normal size. Pale painted sky and flecks seen only on zoom are not margins.
  - **Lettering:** halo and title glyphs and corner scribbles count, even when the plan asks for writing.
- **Sensitivity:**
  - If every disputed shown verdict went the other way, acceptable would range from 57 to 68 of 99, under the bar either way.
  - Scorer B alone would count 17 watercolor margins, scorer A 10.
- [Scorer A](scorer-a.json), [scorer B](scorer-b.json), [adjudicated](operator-scores.json), [key](blind-key.json), [instructions](SCORING.md).
- These are model judgments, not human acceptance.

## Meaning

The engine is not ready for launch at the declared bar. The God-figure work holds at launch scale, and Classical passes on its own. The next changes are:

1. Plans never ask for visible writing (scrolls of names, inscriptions), and the image prompt asks for plain halos and blank title boards.
2. A decision on watercolor's soft white edges: either a stronger full-bleed instruction for that style, or the owner accepts the vignette as part of the style and the margin bar is revised.
3. Keep a throne empty whenever the section's cast holds a no-form subject, even if the plan does not select it (Revelation 4:6).

A rerun of this matrix after those changes costs about $4.50. The evaluation allowance has $1.78 left, so it needs a new grant.
