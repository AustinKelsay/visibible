# Image Generation Context

High-level overview of how Visibible generates scripture illustrations. Details may change.

## Overview

- Each verse has its own AI-generated image.
- Images are generated server-side via OpenRouter.
- When sessions/credits are enabled, generation is credit-gated and requires a session cookie.
- **Model selection**: Users can choose any image-capable model from OpenRouter via a header dropdown.
- **Storyboard context**: Images include prev/next verse context for visual narrative continuity (only when verses are in the same chapter).
- **Persistence (Convex)**: When enabled, every image is saved per verse and can be browsed later.
- **Cost visibility**: Credit cost varies by model; the UI surfaces model-specific costs and ETA estimates.
- **Transparency**: Saved images include prompt + prompt version/inputs, translation, provider metadata, and image file metadata (mime/size/dimensions) in addition to costs and timing.
- **Availability**: Image generation requires Convex configuration (sessions, credits, rate limiting). If Convex is disabled, the API returns 503 and generation is unavailable.

## Current Flow

1. Verse page fetches current verse AND prev/next verses from the Bible API using the selected translation.
2. `HeroImage` loads existing image history from Convex (if configured).
3. If no images exist for the verse, `HeroImage` auto-generates the first image **only when generation is allowed** (admin/paid with enough credits and Convex enabled).
4. Client requests `/api/generate-image` with text, optional theme, prevVerse, nextVerse, reference, **model**, and generation count.
5. The server requires Convex and a valid session cookie, then pre-checks credits (admin bypass). Credit cost is derived from model pricing; unpriced models are rejected.
6. Server builds a **storyboard-aware prompt** with strict "no text" + framing guardrails and stamps `promptVersion` + `promptInputs`.
7. Server generates the image via OpenRouter using the **user-selected model**.
8. On success, credits are charged (post-charge) and the response includes image URL + prompt + metadata (including `generationId`, provider info, and prompt version/inputs).
9. If Convex is enabled, the image and metadata are saved and appended to history (including translation + file metadata); otherwise it is displayed directly.
10. On failure, no credits are charged.

## Chapter Themes (Optional)

The `HeroImage` component accepts an optional `chapterTheme` prop that augments prompts for consistent style. Theme data files can be created per chapter and passed through the verse page to enable themed image generation.

Example theme structure:

```ts
{
  setting: "Creation of the cosmos",
  palette: "deep cosmic blues, radiant golds, ethereal whites",
  elements: "primordial void, divine light rays, swirling waters, emerging forms",
  style: "classical religious art, Baroque lighting, majestic and reverent"
}
```

## Scene Planner

An optional scene planner (enabled by default) runs before prompt construction to produce a structured scene plan that anchors the image composition.

- **Default model**: `openai/gpt-oss-120b` (paid, additional cost)
- **Configurable**: Set `OPENROUTER_SCENE_PLANNER_MODEL` for a different model
- **Credit metering**: Scene planner credits are reserved upfront and refunded if it fails
- **Non-fatal**: Planner failures don't block image generation

## Prompt Construction

Prompts combine verse text with storyboard context (and theme when provided). The API also prepends guardrails (no-text, framing) and records a `promptVersion` for reproducibility.

```
Render a stylized biblical-era scene for {reference}: "{verse text}"

NARRATIVE CONTEXT (for visual continuity - this is a storyboard):
- Previous scene (v{N-1}): "{prev verse text}"
- CURRENT SCENE (the verse to illustrate): "{verse text}"
- Next scene (v{N+1}): "{next verse text}"

This is part of a visual storyboard through Scripture. Maintain visual consistency
with the flow of the narrative while focusing on THIS verse's moment.

Setting: {theme.setting}
Visual elements: {theme.elements}
Color palette: {theme.palette}
Style: {theme.style}

Generate the image in WIDESCREEN LANDSCAPE format with a 16:9 aspect ratio.
```

When multiple images already exist for the verse, a "generation" note is added to encourage variety.
Prompt inputs (reference, aspect ratio, generation number, prev/next context) are stored alongside the prompt for reproducibility.

## Persistence & Caching

- **Convex persistence** stores images per verse and makes history available across sessions.
- **Metadata** includes prompt + prompt inputs/version, translation, provider identifiers, costs, duration, aspect ratio, and image file details (source URL, mime type, size, dimensions).
- `/api/generate-image` responses include `Cache-Control: private, max-age=3600` for HTTP caching.
- Next.js caching is disabled (`dynamic = "force-dynamic"`), so persistence is handled by Convex or the browser cache.

## Credits & Sessions

- Image generation is only available when Convex is configured; credits are enforced for non-admin sessions.
- Admin sessions bypass credit checks but **all usage is logged** for security monitoring.
- Credit cost is derived from OpenRouter pricing; unpriced models are rejected.
- **Scene planner costs** are included by default (scene planner model is paid).
- Daily spending limit of $5/session protects against runaway costs.
- Response includes cost breakdown: `imageCreditsCost`, `scenePlannerCredits`, `scenePlannerUsed`.
- See `llm/context/SESSIONS_AND_CREDITS.md` for user-facing behavior and `llm/implementation/SESSIONS_AND_CREDITS.md` for implementation details.

## Model Selection

Users can choose from **any image generation model** available on OpenRouter via a dropdown in the header.

### How It Works

1. Click the image icon in the header to open the model selector.
2. Models are fetched from OpenRouter's `/api/v1/models` endpoint.
3. Only models with image output capability are shown; each model includes a credit cost and ETA estimate.
4. Selection is persisted in localStorage and triggers image regeneration.

### Default Model

- **Default**: `google/gemini-2.5-flash-image`

## Session Integration

The `HeroImage` component uses the `useSession` hook from `src/context/session-context.tsx` to:
- Check if the user can generate (tier + credits)
- Display generation UI only when allowed
- Update credits after successful generation

## Model Stats & ETA Estimation

Every generation records timing data via `convex/modelStats.ts`:
- After generation succeeds, the API calls `api.modelStats.recordGeneration({ modelId, durationMs })`
- Stats are used to compute ETA estimates shown in the model selector
- Uses exponential moving average (EMA) for `avgMs`

## Entry Points

- **Image generation API**: `src/app/api/generate-image/route.ts`
- **Image models API**: `src/app/api/image-models/route.ts`
- **Hero image UI**: `src/components/hero-image.tsx`
- **Model selector UI**: `src/components/image-model-selector.tsx`
- **Preferences context**: `src/context/preferences-context.tsx`
- **Session context**: `src/context/session-context.tsx`
- **Convex persistence**: `convex/verseImages.ts`, `convex/schema.ts`
- **Model stats**: `convex/modelStats.ts`
- **Convex client gate**: `src/components/convex-client-provider.tsx`
- **Verse page**: `src/app/[book]/[chapter]/[verse]/page.tsx`
