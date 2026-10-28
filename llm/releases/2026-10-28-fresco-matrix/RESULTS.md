# Fresco matrix results

**Fresco meets the per-style bar: 24 of 33 shown images are acceptable (73%; the bar is 65%), with no God figure in its 10 God scenes.** With Classical and Watercolor from the third run (52/64), the three styles reach 76 of 97 (78%) against the 75% overall bar.

The run made **36 images (33 shown, 3 retries), 126 text calls and 72 check calls for $1.300342**, under the $1.80 cap, with no uncertain usage, refusal or production write. Fresco was injected with the engine's `styleOverride` on the live pipeline (formless-effects v17) and is not yet registered. [Plan](plan.json), [budget](budget.json), [summary](summary.json), [contact sheet](contact-sheet.jpg), [style](candidates/fresco.json), [bake-off](../2026-10-28-style-bakeoff/RESULTS.md).

## Results

| Measure | Result | Bar |
| --- | --- | --- |
| Acceptable shown images | 24/33 (73%) | at least 65% |
| No-form figure, scenes that select one | 0/10 | at most 1 in 20 |
| All three styles (with the third run's Classical and Watercolor) | 76/97 (78%) | at least 75% |

The 9 images that are not acceptable:
- **Scenes only partly matched or incoherent:** David and Goliath, Isaiah 6:2's seraph holding verse 6's coal, Matthew 27:35, Genesis 22:10 and Daniel 6:22.
- **Lettering:** Revelation 4:6 and Psalm 23:2.
- **A painted side band:** Genesis 1:3.
- **Uncertain:** Matthew 14:29.

The check retried 3 images.

## Scoring

- Six independent model scorers, two per batch of 12, scored all 36 images blind to attempt and whether each was shown. They saved as they went.
- They agreed on 34 of 36 overall verdicts.
- The operator resolved 7 field disputes with the earlier written rules and committed before unblinding (commit `753fe52`).
- The two disputed shown verdicts (Joshua 6:20 and Exodus 14:21) were both resolved as acceptable. Counting both as flawed still gives 22/33 (67%).
- [Scorer A](scorer-a.json), [scorer B](scorer-b.json), [adjudicated](operator-scores.json), [key](blind-key.json).
- These are model judgments, not human acceptance; the owner chose Fresco by its look.
