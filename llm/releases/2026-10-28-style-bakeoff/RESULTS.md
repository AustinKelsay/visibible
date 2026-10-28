# Third-style bake-off results

**No candidate passed the predeclared screen (8 of 12), but neither does Watercolor reliably on these hard cases. Fresco and Engraving are the distinct options; Gouache looks too much like Classical.** Fresco 6/12, Gouache 5/12 and Engraving 5/12 shown images were acceptable. Fresco drew God as a figure once (Daniel 7:9).

The work ran in two operations because a server restart killed the first after 16 of 36 samples. A recorded [continuation](continuation-plan.json) finished the remaining 7 cases in all three styles. Matthew 1:1 was redone so its styles share one plan, and the first run's Matthew 1:1 Gouache image is excluded.
- **Cost:** $1.5805033 in total (first run $0.6655491, continuation $0.9149542), within the existing allowance.
- **Uncertain:** $0.014 for four calls in flight when the first run died.
- **Nothing registered or deployed:** candidates were injected with the engine's `styleOverride` and never registered.

[Plan](plan.json), [budget](budget.json), [summary](bakeoff-summary.json), [contact sheet](contact-sheet.jpg), [candidate styles](candidates/).

## Results on the images shown (12 cases each)

| Style | Acceptable | First attempts acceptable | Retries | Faults in flawed images |
| --- | --- | --- | --- | --- |
| Fresco | 6/12 | 6 | 1 | scene partly 4, incoherent 3, lettering 2, God figure 1 |
| Gouache | 5/12 | 4 | 2 | scene partly 5, incoherent 4, lettering 1, margin 1, extra figure 1 |
| Engraving | 5/12 | 5 | 3 | scene partly 5, incoherent 4, lettering 3, margin 1 |

The 12 cases were chosen for the known failure classes: God scenes, writing-prone scenes, crowds and moments. The live styles do no better here.

| Style, same 12 cases | First run | Rerun | Third run |
| --- | --- | --- | --- |
| Classical | 7/12 | 8/12 | 8/11 |
| Watercolor | 4/12 | 9/12 | 5/11 |
| Icon | 5/12 | 4/12 | 3/11 |

With 12 cases the differences between candidates are within noise. The screen's 8/12 threshold was stricter than the live styles reach on this subset.

## Meaning

- **Fresco** (soft Renaissance color) and **Engraving** (black-and-white, in the manner of nineteenth-century illustrated Bibles) look clearly different from Classical and Watercolor.
- **Gouache** reads as another painterly oil style.
- **Fresco's risk:** the one God figure.
- **Engraving's risks:** corner marks and plate margins, its own tradition's signatures and borders.

The choice between them is the owner's, by look. The chosen style then runs the full 33-case matrix against the per-style bar (at least 65%) before any release, about $1.40.

## Scoring

- Eight independent model scorers, two per batch of 10–11 images, scored all 42 images (shown and retries) blind to style label, attempt and whether it was shown.
- They agreed on 38 of 42 overall verdicts.
- The operator resolved 11 field disputes on 8 images (counting the scene-match field) by viewing the images and detail crops, using the earlier written rules, and committed before unblinding (commit `e01cb7c`).
- These are model judgments, not human acceptance.
