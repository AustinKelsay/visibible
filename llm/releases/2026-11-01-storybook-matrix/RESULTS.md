# Storybook matrix results

**Storybook meets the per-style bar: 28 of 33 shown images are acceptable (85%; the bar is 65%), with no God figure in its 9 scenes that select one.** With the third run's Classical and Watercolor (52/64) and the Fresco matrix (24/33), the four styles reach 104 of 130 (80%) against the 75% overall bar. Storybook is the highest per-style result measured on this matrix; Fresco reached 73%, Classical 88% and Watercolor 75% in their runs.

The run made **35 images (33 shown, 2 retries), 114 text calls and 70 check calls for $1.26600235**, under the $1.70 cap, with no uncertain usage, refusal or production write. The account moved $1.27, matching the ledger. Storybook was injected with the engine's `styleOverride` on the live pipeline (formless-effects v17, generic v15) without a style reference and is not registered. [Plan](plan.json), [grant](funding.json), [budget](budget.json), [funding close](funding-close.json), [summary](summary.json), [contact sheet](contact-sheet.jpg), [thumbnails](thumbs/), [style](candidates/storybook.json), [bake-off](../2026-11-01-style-bakeoff-2/RESULTS.md), [Fresco matrix](../2026-10-28-fresco-matrix/RESULTS.md).

## Results

| Measure | Result | Bar |
| --- | --- | --- |
| Acceptable shown images | 28/33 (85%) | at least 65% |
| No-form figure, scenes that select one | 0/9 shown, 0/35 all attempts | at most 1 in 20 |
| All four styles (with the third run's Classical and Watercolor and the Fresco matrix) | 104/130 (80%) | at least 75% |

The 5 images that are not acceptable:
- **Lettering (3):** a row of glyph-like marks on the harp arm in Psalm 23:2, a small inscription-like scribble on the sand in Ezekiel 37:4, and writing on the genealogy scroll in Matthew 1:1. Two of these were operator rulings against the candidate on disputed images.
- **Scenes only partly matched or incoherent (2):** Isaiah 6:2 again collaged verse 6's coal and tongs with two-winged seraphim, and 1 Samuel 17:49 again showed the sling thrown with the stone. Both failed in every style of the bake-off and in the Fresco matrix; they are plan faults, not style faults.

No margin, frame, extra figure or God figure appeared in any of the 35 attempts. The check retried 2 images (Ezekiel 37:4 for lettering, Acts 9:3 for an edge); the retry of Acts 9:3 removed a caption that the first attempt carried, and the retry of Ezekiel 37:4 still carried a small scribble. On first attempts the check caught 1 of the 3 lettering or edge faults the scorers found and raised 1 false alarm on 30 clean images.

## Scoring

- Six independent model scorers, two per batch of 11 to 12, scored all 35 images (shown and retries) blind to attempt and whether each was shown, from the [instructions](SCORING.md) and [blinded packet](blind-images.json).
- They agreed on 31 of 35 overall verdicts and on every field for 24 images.
- The operator resolved 11 field disputes: six that could change the verdict or a text/edge field by viewing the image and detail crops, five field-only disputes from both scorers' notes. The [adjudicated scores](operator-scores.json) were committed before unblinding (commit `1a19ab4`). Counting the two judgment-call lettering rulings the other way gives 30/33 (91%); counting every disputed shown image as flawed gives 25/33 (76%). The bar holds under either reading.
- These are model judgments, not human acceptance. The owner delegated the pick ("your call!"); the operator chose Storybook by the bake-off's predeclared tie-break.

## Method

Each case was prepared once, cold, in one shared memory store seeded from a [read-only production snapshot](snapshot.json) taken for this run, then rendered in Storybook through `styleOverride` on `google/gemini-3.1-flash-lite-image` at 1K 16:9, with the production scene check and one retry, three cases at a time, at commit `bc5f125`'s frozen inputs. The [offline rehearsal](offline-rehearsal.json) passed its complete, refusal and provider-error scenarios before the funded run. Harness time per sample: median 16.4 s, p90 21.7 s.

## Release path, not taken here

Following Fresco ([ADR 0006 amendment 4](../../../docs/adr/0006-unseen-presence-speakers-and-launch-bar.md)): add `styles/storybook.json` to the shared library and the Convex style-id list, the Bible brief's `styleIds` and `PUBLIC_GENERIC_STYLE_IDS`; deploy; run `npm run works:amend-brief-styles` against production immediately after; verify `/api/image-models` lists four available styles. Storybook ships as measured here, without a style reference: a reference would change every Storybook prompt, so one is made only after a run with it has met the bar. Icon stays in the library for saved images and remains owner-only. The consistency part of the launch bar ([ADR 0008](../../../docs/adr/0008-consistency-in-the-launch-bar.md)) is measured separately, from this run's images plus the 14 group verses it does not cover. These are production changes and wait on the owner's release decision and a top-up that restores the $5 reader reserve (balance $4.48 after this run).
