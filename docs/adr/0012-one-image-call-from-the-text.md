---
status: accepted
date: 2026-11-09
---

# One image call from the text

On 9 November 2026 the owner asked whether the consistency pipeline had grown too bloated, approved a measured comparison, and on its result chose the lean engine ("Yep, let's go with the slim pipeline"). This record replaces the per-moment preparation of [ADR 0002](0002-consistent-images-from-canon-and-reference-images.md) and its successors. The reading pass, canon, reference sheets, briefs, styles and depiction profiles of those records stand.

## Decision

- **One paid call per image.** A new image is one request to the image model. Nothing is prepared for a moment first: no section look, no scene plan, no plan review, and no finished-image check or retry.
- **The model reads the text.** The prompt carries the moment's own reference text and its in-section neighbours, the work brief, the art style, and the fixed canon of the section's cast. The image model chooses the instant and the composition.
- **No model selects the cast.** Every member of the section's cast is offered with the canon stage the section assigns. Members the moment or a neighbouring verse names come first; the rest are listed as cast the moment may involve. Matching names alone finds only 60% of the cast a planner selects, because verses say "he" and "they", so nobody is dropped.
- **Places have their own block.** The section's places are listed as the setting, to be kept unless the moment is plainly elsewhere. Listed with the optional cast, they were redrawn from scratch each time.
- **Subjects without form keep their work's wording** ([ADR 0010](0010-work-depiction-profiles.md)). Their names are replaced in every text the prompt carries, including other entries' canon and captions, and a rule tells the model that words giving such a subject a seat, clothing or a body are imagery.
- **References:** the style reference and up to four sheets, for the best-ranked character, the best-ranked place, then the rest in rank order. A reference is used only when it is current for its inputs and its bytes load.
- **Nano Banana 2.1 is the image model.** It follows reference sheets where Nano Banana 2 Lite drifts. Sheets and style references are still made on Lite.
- **Same engine identity.** Requests stay `engine: "generic"`; the prompt version (`lean-v6` at this decision) tells the pipelines apart. The stored packet and provenance keep their shape, with `lookVersion` and `planVersion` reading `none`.

## Why

The [comparison](../../llm/releases/2026-11-09-lean-engine/README.md) scored 206 lean images blind beside 204 from the full engine, on the same suite, canon and sheets, judged against the text.

| | Full engine, Lite | Lean, 2.1 |
| --- | --- | --- |
| Acceptable images | 123 of 204 | 130 of 206 |
| Bible | 107 of 144 | 113 of 144 |
| Same person across images | 86% | 97% |
| Same place across images | 93% | 76% |
| God figure drawn | 1 of 42 | 2 of 42 |

The suite gate passed with the full engine as baseline. The [setting block](../../llm/releases/2026-11-09-lean-setting/README.md) then raised same place from 30 of 38 pairs to 35 of 39, with the Bible at 27 of 27.

Earlier attempts to simplify removed parts of the full engine while keeping Lite, and failed their gates ([closed investigation](../../llm/context/SCENE-PREPARATION.md#closed-simplification-investigation)). The plan, review and check each worked around what Lite could not do with a long text and several references. A model that can read the passage makes them unnecessary.

## Consequences

- **Price.** An image costs about $0.043 at the provider: 6 credits against 5. The quote allows 600 response text tokens for the reasoning 2.1 bills with every image.
- **Speed.** About 10 s median and 15 s at p90 for every image. A new moment no longer waits for preparation; a moment that had cached preparation is about 4 s slower.
- **No preparation failures.** "Preparing scene" now means only that the work's analysis or inputs are not ready. There is no owner spend per moment.
- **No second look.** A faulty image is shown as made. Readers regenerate; nothing retries for them. The two God figures the comparison found drove the imagery rule and the renaming in other entries' canon; a six-image check afterwards showed none, unscored.
- **More narrator figures.** With no planner, a prophet or author appears beside their own words more often (18 images against 13).
- **Owner looks are no longer read.** Production held none at the switch (52 looks and 65 plans, all generated). The stored looks and plans were archived and deleted on 10 November 2026 ([record](../../llm/releases/2026-11-10-remove-preparation/README.md)); saved images keep the versions they were made from.
- **Bulk jobs** bound to the generic engine continue on the lean pipeline. None was running at the switch.
- **No rollback.** Until 10 November 2026 promoting `dpl_fVVRrsY5DS3kZvetCpPMRUbiJv6W` (main `b69b40c`) would have restored the full engine. The owner then gave that up: its app code (PR #395) and its Convex functions, record kinds and tables were removed ([record](../../llm/releases/2026-11-10-remove-preparation/README.md)). Restoring it now means reverting those changes from git history, and it would remake every look and plan.
- **What is measured.** The comparison changed pipeline and model together, its scorers were models, and its holdout is 49 images. Holmes and Alice, which are not served, did worse on places and on Alice's card people than the Bible did.
