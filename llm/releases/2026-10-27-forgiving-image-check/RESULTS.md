# Forgiving pipeline: image re-check results

**Prompt length is fixed; both visual blockers remain.** The run made **45 images and 29 text calls for $1.5649671** ($1.5494135 images, $0.034 each; $0.0155536 text) under the $2.00 cap, with no uncertain usage or production writes. [Ledger](ledger.json), [budget](budget.json), [results](results.ndjson), [thumbnails](thumbs/).

## What ran

All eight cases stored a plan, and every planned image rendered: 5 per case, plus a Classical control without its style reference for the five God cases. No prompt exceeded the 12,000-character cap; the longest was 8,867 characters (Numbers 3:39). On 26 October, by contrast, 3 of 8 cases refused preparation and Watercolor refused for length in 3 of the 4 cases where it was attempted.

Forgiving preparation now selects God in five scenes (Numbers 3:39, Exodus 14:22, 40:34, 19:18 and Isaiah 6:1). In Numbers 3:39, the 26 October "God absent" census case, the review found God's light depicted and auto-selected God.

## Blind scores

Two independent model scorers inspected all 45 images at full resolution. They gave identical God-figure labels on all 45 and agreed on 42 of 45 overall verdicts. The operator viewed the one disputed edge (img41) and adjudicated before unblinding (commit `2486b90`). [Instructions](SCORING.md), [scorer A](scorer-a.json), [scorer B](scorer-b.json), [adjudicated](operator-scores.json), [key](blind-key.json).

| Images | Acceptable | Flawed | Uncertain | God drawn as a figure (God cases) |
| --- | --- | --- | --- | --- |
| Classical with style reference (16) | 9 | 7 | 0 | **6 of 14** |
| Watercolor with style reference (16) | 4 | 12 | 0 | 1 of 14 |
| Icon with style reference (8) | 4 | 1 | 3 | 1 of 7 |
| **Production-like total (40)** | **17** | **20** | **3** | **8 of 35** |
| Classical control, no style reference (5) | 2 | 3 | 0 | 2 of 5 |

**No-form God (blocker 1): not cleared.** A robed or seated figure appears in 8 of 35 production-like God-case images, mostly Classical. Examples: [Daniel 7:9 classical 1](thumbs/daniel-7-9__classical__1.jpg) shows a figure seated on the throne, and [Exodus 19:18](thumbs/exodus-19-18__classical__1.jpg) a figure in the smoke. The new Classical style reference did not stop it: 6 of 14 with it, against 2 of 5 without. The 26 October suggestion that a style reference prevents the figure does not hold. Selecting God more often also puts God's name and canon into more prompts.

**Watercolor edges (blocker 2): not cleared.** 12 of 16 Watercolor images, all sent with the style reference, show white or unpainted paper at the edges or corners. The two clean images on 26 October were chance. Production has carried an open attention item since 21 October: the Watercolor style reference image itself has unpainted paper at its perimeter. Two of 8 Icon images have a painted border.

**Other defects:**

- Lettering: "Isaiah 6:1" is painted on an Isaiah control image, and one Classical image carries a signature.
- Extra figures: two identical high priests in Numbers 3:39, and onlookers in Isaiah 6:1.
- Moses holds two staffs in several images.

## Meaning

The prompt-length fix works, and every case now renders. The image model still draws God as a figure when the prompt names God and selects God's canon, whatever the style reference; this is the main visual blocker. The Watercolor margins most likely come from the faulty Watercolor style reference image, which can be regenerated. These results go to the owner; see the canonical [release status](../STATUS.md).
