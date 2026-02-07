# Image Prompt Specification

Current prompt construction spec for `src/app/api/generate-image/route.ts`.

## Version

- `PROMPT_VERSION`: `2026-01-07`

## Core Principles

- Keep the model constrained and scene-faithful.
- Prefer compact continuity signals over raw adjacent verse dumps.
- Avoid prompt sprawl with deterministic section-priority compaction.
- Persist a compact packet of what was actually used.

## Inputs

### Required generation inputs
- current verse text
- sanitized scripture reference
- model + image settings

### Optional inputs
- prev/next verse context
- chapter theme
- generation number (for variation note)
- client request id
- translation id (`translation` query param)

## Sanitization and normalization

- reference and verse text are sanitized.
- planner fields are normalized and length-limited.
- request IDs and translation IDs are sanitized before use.

## Scene Planner + Cache Behavior

The planner path is now cache-aware:

1. Cache lookup in Convex by `(verseId, translationId, styleProfileId)`.
2. On cache hit:
   - use cached `scenePlan`
   - mark cache hit metadata
   - skip planner API call and planner credit reservation
3. On cache miss:
   - run planner (if enabled)
   - normalize output
   - upsert plan into cache

## Prompt Sections

1. Priority rules
2. Scene directive
3. Optional scene plan block
4. Optional narrative continuity block
5. Optional chapter theme block
6. Style profile block
7. Global negatives
8. Aspect ratio instruction

## Context Compression

Continuity is represented as short hints:
- `Previous: vN: ...`
- `Next: vN: ...`

When a scene plan exists, narrative continuity section is omitted.

## Budget Controls

- `PROMPT_MAX_CHARS = 2800`
- `CONTINUITY_HINT_MAX_CHARS = 160`
- `SCENE_PLANNER_VERSE_MAX_CHARS = 280`

Compaction order:
1. drop narrative continuity
2. drop generation variation note
3. reduce style detail verbosity
4. hard truncate

## Prompt Packet (Persisted)

Stored in Convex lifecycle metadata (`imageGenerationRequests.promptPacket`):

- identifiers: `verseId`, `translationId`, `reference`
- semantic core: `currentVerse`, optional `scenePlan`, optional continuity hints
- style/settings: `styleProfileId`, `aspectRatio`, `resolution`, optional chapter theme
- flags: planner/cache usage and included sections
- budget: max chars vs final chars

## Planner Cost Semantics

- planner credits are only reserved/charged when a planner call is actually needed.
- cache-hit generations carry scene-plan benefits with planner cost = 0.
- planner failure refund logic remains in place for reserved planner calls that did not produce a usable plan.

## Cost Engine Notes

- image USD->credit quoting is now routed through Convex Neutral Cost (`quoteUsdCost`) with fallback to local math.
- completed generations are recorded as Neutral Cost tool events (`recordImageCostEvent`) with prompt/cache metadata.
- cost-event write is awaited with timeout; failures are enqueued (`enqueueImageCostEventOutbox`) and replayed by cron.
