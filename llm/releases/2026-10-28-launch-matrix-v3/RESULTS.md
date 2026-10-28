# Launch matrix third run results

**The live styles hold and Icon got worse.** Classical (88%) and Watercolor (75%) together reach 52 of 64 (81%) with no God figure, the same as the rerun. The rewritten Icon style fell to 44%, so it is reverted and Icon stays held. The "seated" planner wording is kept.

The run made **111 images (96 shown, 15 retries), 120 text calls and 222 check calls for $3.9102782**, under the $6.00 cap, with no uncertain usage or production write. [Plan](plan.json), [budget](budget.json), [ledger](ledger.json), [results](results.ndjson), [summary](summary.json), [contact sheet](contact-sheet.jpg), [thumbnails](thumbs/), [rerun](../2026-10-28-launch-matrix-v2/RESULTS.md).

## Results on the images shown

| Measure | Rerun (v2) | This run (v3) | Bar |
| --- | --- | --- | --- |
| Classical | 27/32 (84%) | 28/32 (88%) | at least 65% |
| Watercolor | 25/32 (78%) | 24/32 (75%) | at least 65% |
| Classical + Watercolor | 52/64 (81%) | 52/64 (81%) | at least 75% |
| Icon | 16/32 (50%) | 14/32 (44%) | at least 65% |
| No-form figure, scenes that select one: all styles | 1/18 (fails) | 1/18, Icon (fails) | at most 1 in 20 |
| No-form figure: Classical + Watercolor | 1/12 | 0/12 | at most 1 in 20 |

Across all three runs, Classical and Watercolor drew God as a figure in 1 of the 38 shown images of scenes that select him.

**Daniel 7:9 was refused** in this run: after the re-plan, the plan review still judged that the Ancient of Days had a body. In production a refused plan falls back to the legacy engine for Classical, and the other styles get a retryable "preparing" answer for that verse. In the rerun, the same verse's Watercolor image drew God as a seated figure.

The shared store worked: Exodus 14:21 and 14:22 shared their section look, and every case except Daniel 7:9 rendered.

## Icon

The new Icon text forbade writing, marked halos, Christian symbols and border bands. Because the style version changed, the old Icon style reference was stale and not sent. Icon did worse:

- **Border bands rose.** The check flagged 11 of 33 first images, and 6 shown images kept a band (3 in the rerun).
- **Lettering stayed** at 6 shown images.
- **12 scenes were only partly matched,** including extra figures that read as Mary and the Christ child (Matthew 1:1, Romans 8:28).
- **The only God figure** was Icon's Revelation 4:6, a faint seated figure in the light above the throne.

Naming the faults in the style text may prime them, and losing the style reference may remove the full-bleed composition it modelled. Two rounds of style wording have not reached the per-style bar. The Icon text is reverted to the rerun's version, and Icon stays owner-only.

## Scoring

- Sixteen independent model scorers, two per batch of 13–14 images, scored every image blind to style label, attempt and whether it was shown.
- Two batches cut off by a usage limit were finished by further independent agents; part names in the scorer files record which.
- The scorers agreed on 100 of 111 overall verdicts.
- The operator resolved 22 field disputes by viewing the images and detail crops, using the earlier written rules, and committed before unblinding (commit `a241aa1`).
- **Sensitivity:** if every disputed shown verdict went the other way, all styles would range from 60 to 71 of 96, and Classical with Watercolor from 47 to 55 of 64 (73–86%).
- [Scorer A](scorer-a.json), [scorer B](scorer-b.json), [adjudicated](operator-scores.json), [key](blind-key.json).
- These are model judgments, not human acceptance.
