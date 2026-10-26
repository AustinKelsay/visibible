# Image check: results

**Both visual blockers remain, and a new availability blocker appeared.** The run made **18 images and 31 text calls for $0.6426833** ($0.6156230 images, $0.034 each; $0.0270603 text) under the $2.00 cap, with no uncertain usage or production writes. [Ledger](ledger.json), [budget](budget.json), [results](results.ndjson), [thumbnails](thumbs/).

## What ran

| Case | Preparation | Images |
| --- | --- | --- |
| Numbers 3:39 | stored | 4: classical ×2, icon ×2. Watercolor refused, prompt 8,016 > 8,000 characters |
| Daniel 7:9 | stored | **8**: all styles and both Watercolor controls |
| Exodus 16:15 | refused (review: look conflict for God) | 0 |
| Exodus 14:22 | stored | 2: classical. Watercolor 8,085 and icon 8,022 characters, refused |
| Luke 10:34 | stored | 4: classical ×2, icon ×2. Watercolor refused, 8,010 characters |
| Exodus 40:34 (backup) | refused (unselected camp of Israel) | 0 |
| Exodus 19:18 (backup) | refused (Israelites lack evidence) | 0 |
| Isaiah 6:1 (backup) | stored, but the classical prompt is 8,014 characters | 0 |

Five cases stored plans; four produced images. Isaiah 6:1's stored plan could not render even its shortest style. The harness stopped that case after its first packet failed, before trying icon or watercolor. Their prompts run longer than classical, so they would almost certainly have failed too. Only Daniel 7:9 tests both blockers.

**Harness note.** The runner counts a case toward the five once its plan stores and its first packet renders, as `plan.json` declares. It does not wait for all eight images. In this run only four cases counted, so every backup was attempted and none was skipped. `run-finished.json`'s `blocked: null` means no provider, usage or cap stop; incomplete image sets appear as `refused` rows in `results.ndjson`. A future harness should count complete image sets and report incompleteness explicitly; the frozen script is left unchanged.

## Blind scores

Two independent model scorers inspected every image at full resolution. They agreed on 13 of 18 overall verdicts and on every no-form-figure and edge label. The operator viewed the disputed images and adjudicated before unblinding (commit `669dfc3`). [Instructions](SCORING.md), [scorer A](scorer-a.json), [scorer B](scorer-b.json), [adjudicated](operator-scores.json), [key](blind-key.json).

| Images | Acceptable | Flawed | Uncertain |
| --- | --- | --- | --- |
| Production-like (16) | 8 | 5 | 3 |
| Watercolor controls without style reference (2) | 0 | 2 | 0 |

**No-form God (blocker 1): not cleared.** A robed, glowing figure with hands appears above the throne in [Daniel classical 2](thumbs/daniel-7-9__classical__2.jpg), and fainter standing figures in both Watercolor controls. None of the four Daniel images sent with a style reference (icon ×2, Watercolor ×2) shows a figure. Classical sends no style reference, so it produced a figure in 1 of 2.

**Watercolor edges (blocker 2): cleared where it renders.** Both normal Watercolor images reach all four edges. Both controls without the style reference show white paper at the corners. The style reference therefore appears to fix the margins, on one case and two images. But Watercolor rendered for only 1 of the 5 stored cases. Its prompt exceeded the limit in 3 more, and Isaiah 6:1 never reached it.

**Other defects in production-like images:**

- Daniel classical 1 is acceptable. Daniel Watercolor 1 has a garbled throne with a burning fragment floating in the sky.
- Exodus 14:22 classical 2 draws God's "glow at its heart" as a literal heart shape.
- Luke 10:34 classical 2 has a painted signature in the corner.
- Numbers 3:39 icon 1 shows Moses' staff standing upright with no one holding it.
- Faint writing-like marks appear on a scroll, a tally and a throne seat. These are scored uncertain.

## New blocker: prompt length

The renderer refuses any prompt over 8,000 characters after trimming. Scenes with several selected cast members land at 7,950–8,085 characters. Watercolor's style text is the longest, so it fails first. In this check, Watercolor failed in 3 of the 4 cases where it was attempted, icon in 1 and classical in 1 (Isaiah 6:1). This is deterministic and needs no model judgment. It is a code and budget fix, and no paid call is needed to confirm it.

## Meaning

In this small sample, images sent with a style reference showed no God figure and full-bleed Watercolor. Classical has no style reference, and it still draws God as a figure. The prompt-length limit blocks most Watercolor output today. Text preparation also refused 3 of 8 cases. These results go to the owner; see the canonical [release status](../STATUS.md).

## Retained evidence

[provider.ndjson](provider.ndjson) keeps every request and response with reported usage. Reference and output images were already replaced by their SHA-256 hashes during the run. After the run, each opaque `reasoning_details` data or signature string over 1,000 characters (about 2 MB per image reply) was replaced by its SHA-256 and length, cutting the file from 33 MB. No usage, status or content field changed. Full-size images remain in the ignored `evals/images/runs/2026-10-26-image-check/` directory, with hashes in [results.ndjson](results.ndjson). Committed thumbnails are 640 pixels wide.
