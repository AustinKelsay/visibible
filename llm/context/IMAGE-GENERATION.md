# Image Generation Context

Current high-level overview of Visibible image generation.

## Current State (Phase 1 + Phase 2)

Image generation is Convex-orchestrated, includes scene-plan caching, and now uses Neutral Cost for cost quoting/tracking.

- Request lifecycle is tracked in Convex (`queued`, `planning`, `generating`, `succeeded`, `failed`).
- The UI subscribes to live request status and shows phase labels.
- Prompt assembly uses strict char budgets and section-priority compaction.
- Scene plans are cached in Convex by `(verseId, translationId, styleProfileId)`.
- Cache hits skip planner API calls and skip planner credit reservations.
- Neutral Cost is used to quote USD->credit charges and persist per-generation cost records.
- If real-time cost persistence times out/fails, events are queued in Convex outbox and retried by cron.
- Structured observability events/metrics are emitted for rate-limit blocks, timeout paths, and settlement outcomes.

## End-to-End Flow

1. Verse page fetches verse context and passes theme/context into `HeroImage`.
2. `HeroImage` sends `/api/generate-image` request with:
   - `requestId`
   - verse/context payload
   - model + ratio + resolution
   - `translation` id
3. API validates security/session/rate limit/credits and creates lifecycle record in Convex.
4. API checks scene plan cache using `(verseId, translationId, styleProfileId)`.
5. If cache hit:
   - planner call is skipped
   - planner cost is not reserved
   - cache hit metadata is updated
6. If cache miss:
   - optional planner call runs
   - successful plan is upserted into cache
7. API builds compact prompt packet, updates status to `generating`, calls OpenRouter.
8. API settles credits and writes terminal lifecycle state.
9. API persists a Neutral Cost event for the generation (metadata + final charge details).
10. API persists the generated image server-side via `saveImage` (server-secret authenticated) and returns image payload (including `savedImageId` when persistence succeeds).
11. UI follows status via Convex query and updates generation phase messaging.

## Convex Data Model

### `imageGenerationRequests`

Lifecycle + observability table.

Key fields:
- identity: `requestId`, `sid`, `verseId`, `translationId`
- settings: `modelId`, `aspectRatio`, `resolution`, `scenePlannerModel`
- status/timing: status + timestamps + `durationMs`
- diagnostics: `error`, `scenePlannerUsed`, `scenePlanFromCache`, `usedFallbackEstimate`
- costs: estimated and actual credits/USD
- prompt metadata: `promptVersion`, `promptPacket`

### `scenePlanCache`

Reusable planner outputs.

Key fields:
- key: `verseId`, `translationId`, `styleProfileId`
- payload: `scenePlan`, `plannerModel`, `promptVersion`
- usage/freshness: `hitCount`, `lastUsedAt`, `updatedAt`

### Neutral Cost Component Tables

Managed by Convex component `neutralCost`:
- `toolsPricing`
- `costPerTools`
- `markupMultiplier`

### Cost Event Outbox

Table: `costEventOutbox`

- Stores failed/timeout cost events for later replay.
- Cron retries pending events every 5 minutes.
- Replay is idempotent by generation id check before recording cost event.

## Convex Functions

In `convex/verseImages.ts`:

Lifecycle:
- `createGenerationRequest`
- `updateGenerationRequest`
- `getGenerationRequestStatus`

Scene plan cache:
- `getScenePlanCache`
- `markScenePlanCacheHit`
- `upsertScenePlanCache`

Neutral cost:
- `quoteUsdCost`
- `recordImageCostEvent`

Image persistence (see `llm/implementation/IMAGE_PERSISTENCE_IMPLEMENTATION.md` for full data model):
- `saveImage` (server-authenticated action)

All write operations and cache lookup in server flows are gated by `CONVEX_SERVER_SECRET`.

## Prompt Strategy

Prompting now favors bounded, reusable context over raw expansion:

- continuity hints are short (`vN: ...`) and clipped
- narrative continuity section is omitted when scene plan exists
- section-level compaction enforces prompt budget (`PROMPT_MAX_CHARS`)
- `promptPacket` records exactly what survived compaction

## Current UI Behavior

`HeroImage`:
- creates/sends `requestId`
- subscribes to request status
- displays phase labels:
  - `Planning scene...`
  - `Generating image...`

## Theme Wiring

Genesis 1 chapter theme is now actively passed from the verse page into image generation.

## Entry Points

- API route: `src/app/api/generate-image/route.ts`
- UI: `src/components/hero-image.tsx`
- Verse page: `src/app/[book]/[chapter]/[verse]/page.tsx`
- Convex schema: `convex/schema.ts`
- Convex functions: `convex/verseImages.ts`
