# Image Generation Implementation Guide

Implementation reference for the current Convex-first image generation pipeline.

## Scope

This reflects the current implementation after:
- Phase 1: Convex request lifecycle orchestration
- Phase 2: Scene-plan cache reuse keyed by verse/translation/style
- Neutral Cost integration: Convex component-backed cost quoting and event tracking

## Architecture Summary

`/api/generate-image` is still the generation entrypoint, but orchestration state and reusable planning artifacts are persisted in Convex.

Core changes:
- request lifecycle persisted and queryable
- prompt packet persisted for reproducibility/debugging
- scene planner outputs cached and reused
- planner costs bypassed on cache hit
- Neutral Cost quote path for USD->credits conversion
- Neutral Cost `costPerTools` entries for completed generations
- Durable outbox retry path for failed/timeout cost-event persistence

## Convex Schema Changes

### `imageGenerationRequests`

Tracks lifecycle and diagnostics.

Includes:
- IDs/context: `requestId`, `sid`, `verseId`, `translationId`
- model/settings: `modelId`, `aspectRatio`, `resolution`
- status pipeline: `queued|planning|generating|succeeded|failed`
- planner flags: `scenePlannerUsed`, `scenePlanFromCache`
- cost fields: estimated and actual credits/USD
- prompt metadata: `promptVersion`, `promptPacket`

### `scenePlanCache`

Persistent planner cache keyed by:
- `verseId`
- `translationId`
- `styleProfileId`

Stores:
- `scenePlan`
- `plannerModel`
- `promptVersion`
- `hitCount`
- `lastUsedAt`
- timestamps

### Neutral Cost Component Schema

Configured via `convex/convex.config.ts` (`app.use(neutralCost)`).

Component-managed tables used by this flow:
- `toolsPricing` for tool pricing definitions
- `costPerTools` for persisted generation cost events
- `markupMultiplier` (available for future tuning)

## Convex Functions Added

In `convex/verseImages.ts`:

Lifecycle:
- `createGenerationRequest` (secret-gated mutation)
- `updateGenerationRequest` (secret-gated mutation)
- `getGenerationRequestStatus` (query)

Scene-plan cache:
- `getScenePlanCache` (secret-gated query)
- `markScenePlanCacheHit` (secret-gated mutation)
- `upsertScenePlanCache` (secret-gated mutation)

In `convex/costs.ts`:
- `quoteUsdCost` (secret-gated action)
- `recordImageCostEvent` (secret-gated action)

## API Route Implementation Details

File: `src/app/api/generate-image/route.ts`

### Request lifecycle writes

- create `imageGenerationRequests` before reservation/generation work
- status transitions:
  - `queued` on create
  - `planning` before planner/cache resolution
  - `generating` once prompt packet is finalized
  - `succeeded`/`failed` with terminal metadata

### Main OpenRouter timeout + cleanup

- Main image-generation OpenRouter call is wrapped in an abort timeout (`OPENROUTER_IMAGE_TIMEOUT_MS`, default 45000ms).
- Timeout-triggered aborts are converted into deterministic timeout failures (HTTP `504` with `Image generation timed out`).
- Reserved credits are explicitly released on timeout via `releaseReservation` before returning.
- Timeout failures are written to `imageGenerationRequests` with timeout-specific error context.

### Neutral Cost integration

- API uses `quoteUsdCost` to convert provider USD to billable credits (with secure fallback to local math).
- API records a completed generation via `recordImageCostEvent`, including:
  - final charged credits/USD
  - estimate/reservation values
  - prompt-efficiency and planner cache flags
  - generation metadata (verse/translation/style/settings)
- API waits for cost event persistence with timeout (`COST_EVENT_PERSIST_TIMEOUT_MS`, default 1500ms).
- On timeout/failure, API enqueues event to `costEventOutbox` via `enqueueImageCostEventOutbox`.
- Cron runs `processCostEventOutboxBatch` every 5 minutes for retries.
- Replay path checks existing cost records for the same generation id to avoid duplicate entries.

### Observability instrumentation

`/api/generate-image` emits structured observability signals through `src/lib/observability.ts`:

- `api_rate_limit_blocks_total` + `api.rate_limited` for throttled requests
- `api_timeouts_total` + `api.timeout` for scene planner, upstream generation, and handler timeout paths
- `api.failure` for non-timeout failures (planner, outbox enqueue, handler, reservation release failures)
- `settlement_events_total` + `settlement.event` for reservation/settlement transitions (confirmed, released, shortfall, outbox enqueued, failures)

### Scene-plan cache integration

- parses/sanitizes `translation` query parameter
- computes cache key tuple `(verseId, translationId, styleProfileId)`
- cache hit path:
  - uses cached scene plan
  - marks hit metadata in Convex
  - planner credits = 0
- cache miss path:
  - runs planner if enabled
  - upserts normalized scene plan to Convex cache

### Prompt compaction

Budgeted assembly constants:
- `PROMPT_MAX_CHARS = 2800`
- `CONTINUITY_HINT_MAX_CHARS = 160`
- `SCENE_PLANNER_VERSE_MAX_CHARS = 280`

Compaction order:
1. remove narrative continuity section
2. remove generation note
3. reduce style detail verbosity
4. hard truncate

### Prompt packet

Saved to lifecycle record and includes:
- `verseId`, `translationId`, `reference`
- compact `currentVerse`
- `styleProfileId`, ratio/resolution
- optional theme/continuity/scenePlan
- flags (`scenePlannerUsed`, `scenePlanFromCache`, etc.)
- budget stats

## UI Integration

File: `src/components/hero-image.tsx`

- sends `requestId` and `translation` to generation API
- subscribes to `getGenerationRequestStatus`
- phase-aware labels for planning vs generation
- clears active request tracking on terminal status

## Verse Page Wiring

File: `src/app/[book]/[chapter]/[verse]/page.tsx`

- Genesis 1 theme is now wired into `HeroImage` via `chapterTheme`.

## Operational Notes

- Scene-plan cache is keyed to translation, preventing cross-translation leakage.
- Planner cost reservation is skipped when cache is used.
- Secret-gated cache endpoints prevent unauthenticated tampering.

## Verification Commands

- `npx convex codegen`
- `npm run lint`
- `npm run typecheck`
- `npm test`
