# Scene check benchmark results

**The check finds edge, frame and lettering faults well, but only half of the hard God figures on the holdout set, so it fails its predeclared figure criterion.** Three runs, 256 checks, cost **$0.0848577**: dev $0.0228899, revised dev $0.0303614 and holdout $0.0316064, under caps of $0.10, $0.10 and $0.06. There was no uncertain usage, no new images and no production access. [Budget](budget.json), [plan and criteria](plan.json).

## What ran

Claude Haiku 5.5 (low reasoning) looked at each finished image with the scene's selected characters and plan description. The labels are the adjudicated blind scores of 128 earlier images: 80 for development ([forgiving](../2026-10-27-forgiving-image-check/RESULTS.md) and [v10](../2026-10-27-v10-image-check/RESULTS.md) checks) and 48 held out ([v11](../2026-10-27-v11-image-check/RESULTS.md) and [v12](../2026-10-27-v12-image-check/RESULTS.md), the hardest God scenes).

| Run | God figure caught | Edge or frame caught | Lettering caught | Good images it would retry |
| --- | --- | --- | --- | --- |
| Dev, v1 (direct question) | 17/17, 8/63 false alarms | 14/16, 0/64 | 2/4, 2/76 | 6/40 |
| Dev, v2 (describe first) | 16/17, 0/63 | 7/16, 2/64 | 3/4, 4/76 | 3/40 |
| Dev, v3 = v1 edges + v2 figures (scored offline) | 16/17, 0/63 | 14/16, 0/64 | 3/4, 4/76 | 1/40 |
| **Holdout, v3 (one run)** | **4/9**, 1/39 | **6/7**, 0/41 | **4/7**, 0/41 | **1/27** |

- **v2:** in v1 the answers came before the description, so in two lettering images the model noted a signature yet answered false. v2 describes the edges, bright areas and marks first. That fixed figures and lettering but halved edge recall, because it accepted pale paper as sky.
- **v3:** both unchanged questions, run in parallel, each used for the faults it measured best. It was chosen from dev evidence and declared before the holdout run (commit `978625c`).
- **Criteria:** figure recall at least 0.8 with at most 10% false alarms, border recall at least 0.7, lettering recall at least 0.6, and at most 20% of good images retried.

## Holdout: what it missed

The five missed figures are the faintest, or sit in a heavenly court the plan describes:

- **Ezekiel 1:26 (Classical):** the model saw "a faint luminous form" but answered false.
- **Isaiah 6:1 (Watercolor):** the faint pencil hand, which the operator counted conservatively.
- **1 Kings 22:19 (Classical and Icon):** the model saw "a seated figure on a throne" and "a glowing light figure", but excused them as the "host of heaven" the plan names. The direct question caught the Icon one.
- **Numbers 12:5 (Classical):** a small standing figure inside the cloud pillar.

The one false alarm was a flame-shaped glow in an Ezekiel 1:26 Icon image.

## Meaning

As a retry trigger, v3 rarely touches good images (2 of 67 across dev and holdout). It catches most edge, frame and lettering faults, and about three in four God figures overall (20 of 26), but only 4 of 9 in the hardest held-out scenes. A retry after a caught fault still lowers the rate of shown faults. The figure question should be improved against new labelled images, not these, because the holdout is now spent. Model-scored labels are not human judgments.
