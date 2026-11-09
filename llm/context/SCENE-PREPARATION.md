# Scene preparation (removed)

Until 9 November 2026 each moment was prepared before its image: a model-written **section look** (place, time, weather, light, clothing), a **scene plan** choosing one instant, its visible cast and seven scene fields, a **plan review** with at most one re-plan, and a **check of the finished image** with one retry. The look and plan were stored as analysis records and every call was owner spend in the preparation ledger.

The request path now makes one image call built from the moment's own text ([ADR 0012](../../docs/adr/0012-one-image-call-from-the-text.md); [Image generation](IMAGE-GENERATION.md#generic-generation-path); [prompt spec](../implementation/IMAGE_PROMPT_SPEC.md)). The preparation code, its tests and its owner commands (`edit-look`, `clear-plan`) were removed afterwards.

**What remains.** Stored looks and plans stay in each deployment's analysis as the record of the images made from them, and saved images keep their `lookVersion` and `planVersion`. The Convex functions that wrote them (derived records, preparation claims and the preparation ledger) stay deployed for now, so a rollback to a deployment from before the switch still runs; a later change removes them.

**History.** [ADR 0002](../../docs/adr/0002-consistent-images-from-canon-and-reference-images.md) to [ADR 0009](../../docs/adr/0009-reference-priority-over-a-shared-place.md) record the decisions, and the release folders under [llm/releases](../releases/STATUS.md) the measurements, including the [closed simplification investigation](../releases/2026-11-01-correction-final-review/REVIEW.md) and the [comparison](../releases/2026-11-09-lean-engine/README.md) that replaced it all. The code is in git history before the removal.
