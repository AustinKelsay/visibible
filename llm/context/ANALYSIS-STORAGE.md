# Analysis storage

A work's **analysis** is everything the engine makes for it: story sections, moments, entries (canon with stages), section looks and scene plans, plus reference images and attention items. Owner-authored inputs (the work file, the approved brief and the style library) are repo files; the analysis is per-deployment Convex data in [analysis.ts](../../convex/analysis.ts) and never copied between deployments. Saved images and generation requests keep their existing tables.

## Records and versions

Every analysis record carries its work ID, the generation it belongs to, a stable record ID, a content-hash **version** of its payload ([contentVersion.ts](../../convex/_helpers/contentVersion.ts)), a `generated` or `owner` **source**, and the exact input versions it was made from. Stable IDs: entries by slug, sections and moments by their first unit, looks by section, plans by moment. Records are never edited in place; a new version supersedes the old one, and superseded or retired versions stay readable through `getRecordVersion` and `listRecordHistory` for provenance. Sections and entries name no inputs, since they come from the work file and brief; looks, plans and references name the record versions they were made from.

## Generations and activation

A full reread is staged as a **candidate analysis generation** (`stageGeneration`, `putRecords`), distinct from a *generation* in the glossary's sense of one requested image. Only one candidate is open per work; staging another abandons it, and `abandonGeneration` gives one up explicitly. `activateGeneration` requires the open candidate, a match with the deployed work and brief versions registered by `registerWork`, and structural validity: sections and entries exist, sections and moments are anchored to their first unit, moments name existing sections, casts and plans name existing entry stages, characters and locations have one to three stages and objects exactly one. The check runs on what would actually serve, owner versions included, so an owner edit that no longer fits the reread blocks activation with the conflicting record named in the error. A failed or incomplete activation changes nothing, so the current active generation keeps serving.

On activation, owner versions from the previously active generation are carried forward where their record ID still exists; the rest become `unmatched_owner_edit` attention items. The previous generation and its records are retired.

## Readiness

`getWorkStatus` reports `ready` only when an active generation exists and was read against the registered work and brief versions. A registered brief alone is not enough. Missing or failed reference images and open attention items do not affect readiness. Reads of the active generation (`getActiveRecord`, `listActiveRecords`) never return candidate records.

## Corrections and staleness

`correctRecord` writes an owner version into the active generation; later rereads never overwrite it. `listStaleDependents` lists current records and reference images whose inputs name an older version of a record, for targeted remaking; nothing is regenerated automatically and saved images are never touched. `clearRecord` removes a look or plan so the next image remakes it, and `putDerivedRecord` adds a look or plan with the inputs it used.

## References and attention

`putReference` records a sheet or style reference blob in Convex file storage with its inputs and a fingerprint of them; `getReference` reports whether the stored reference is stale against expected inputs, and a pinned reference (`pinReference`) is never stale and cannot be replaced until unpinned. `noteAttention` opens or re-counts an attention item by reason, kind and record; `closeAttention` records a disposition. Writes use the server secret like `saveImage`; reads are public queries.
