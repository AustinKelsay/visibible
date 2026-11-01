# Second style bake-off results

**All three candidates passed the predeclared screen (8 of 12), and two cleared it comfortably: Charcoal 10/12, Storybook 10/12, Pastel 8/12 shown images acceptable.** No candidate drew a figure for God or any no-form subject in any of the 16 shown images of the five scenes that select one, and none produced a frame. The Fresco bake-off on the same 12 hard cases reached 6/12 for Fresco and 4 to 5 for Icon.

The run made **44 images (36 shown, 8 retries), 47 text calls and 88 check calls for $1.5494905** by provider-reported usage, under the $2.20 cap, with no uncertain usage and no production write. The account moved $2.49 during the run window; the $0.94 difference is disclosed in [funding-close.json](funding-close.json), not attributed. [Plan](plan.json), [grant](funding.json), [budget](budget.json), [ledger](ledger.json), [results](results.ndjson), [per-style summary](bakeoff-summary.json), [contact sheet](contact-sheet.jpg), [thumbnails](thumbs/), [Fresco bake-off](../2026-10-28-style-bakeoff/RESULTS.md).

## Results on the images shown (12 cases each)

| Style | Acceptable | First attempts acceptable | Retries | Faults in flawed shown images | Lettering, all attempts | Margins, all attempts |
| --- | --- | --- | --- | --- | --- | --- |
| Charcoal | 10/12 | 10 | 4 | scene partly 1, incoherent 1, lettering 1 | 2 of 16 | 0 of 16 |
| Storybook | 10/12 | 10 | 0 | scene partly 2, incoherent 2, extra figure 1 | 0 of 12 | 0 of 12 |
| Pastel | 8/12 | 6 | 4 | scene partly 3, incoherent 3, margin 1 | 4 of 16 | 1 of 16 |

The same 12 cases, chosen for the known failure classes: God scenes, writing-prone scenes, crowds and moments. For comparison on this subset, Classical reached 7 to 8 of 12 and Watercolor 4 to 9 across the three launch-matrix runs.

- **No-form figure:** 0 of 15 shown images of the five scenes that select God or another formless subject (Genesis 1:3, Exodus 14:21, Isaiah 6:2, Daniel 7:9, Revelation 4:6), and 0 of 44 across every attempt.
- **Lettering** appeared in 6 of 44 attempts: a signature in the grass of Charcoal's Psalm 23:2 (shown, flawed) and five first attempts the check caught and retried (one Charcoal, four Pastel). Storybook produced none.
- **Edges:** the check flagged six Charcoal first attempts for edges; the scorers found none of the shown Charcoal images had a margin, so those were false alarms on a toned ground. One Pastel image (Genesis 1:3) kept a thin band of toned ground along two edges and is recorded as a margin by operator adjudication.
- **Scene faults** dominate the remaining flaws for every style, as in every earlier run: Isaiah 6:2 collaged a later moment in all three styles, and 1 Samuel 17:49 and Matthew 27:35 were only partly matched in one or two styles each. These come from the plan, not the style text.

## Meaning

- **Charcoal** and **Storybook** are the measured leaders and tie on the count. Both look clearly different from the three live styles: Charcoal is the only monochrome option, and Storybook the only simplified, flat-shaped one. The tie-break rule on faults favors Storybook (no lettering, no edge faults, no retries) over Charcoal (one signature shown, two across attempts).
- **Pastel** passes the screen but sits closest to Watercolor in look and had the weakest first attempts (6 of 12), the most lettering in first attempts (4), and the one margin.
- **Candidates ran without a style reference.** A registered style gets one, which usually tightens composition further; Icon's one experiment in that direction went the other way, so this is not assumed.

The choice between Charcoal and Storybook is the owner's, by look, from the [contact sheet](contact-sheet.jpg). The chosen style then runs the full 33-case matrix against the per-style bar (at least 65%) before any release, about $1.40. The account balance after this run is $5.74, so that matrix would dip below the $5 reader reserve without a top-up.

## Scoring

- Eight independent model scorers, two per batch of 11 images, scored all 44 images (shown and retries) blind to style label, attempt and whether it was shown, from the [instructions](SCORING.md) and [blinded packet](blind-images.json).
- They agreed on 42 of 44 overall verdicts and on every field for 41 images.
- The operator resolved three disputed images (Isaiah 6:2 coherence, 1 Samuel 17:49 scene match, Genesis 1:3 edge) by viewing the full images and a detail crop, using the written rules, and committed the [adjudicated scores](operator-scores.json) before unblinding (commit `4ceeabc`). Two of the three rulings went against the candidate.
- These are model judgments, not human acceptance. Twelve cases and one image per case and style are a screen, not a release measurement.

## Method

Each case was prepared once, cold, in one shared memory store seeded from a [read-only production snapshot](snapshot.json) (123 queries, no writes; production now registers Fresco and depiction profiles, and offers 15 reference sheets for these cases), then rendered in each candidate style through the engine's `styleOverride` with no style reference, on `google/gemini-3.1-flash-lite-image` at 1K 16:9. Every first image was checked by the production scene check; a faulty one got one retry, exactly as the request path does. Pipeline: moment-cast v15, formless-effects v17, plan-review v12, generic v15, scene-check v4 at commit `d05a497`. The [offline rehearsal](offline-rehearsal.json) passed its complete, refusal and provider-error scenarios before the funded run. Harness time per sample: median 7.2 s, p90 25.4 s (three cases concurrently).
