# Image Generation Context

High-level overview of how Visibible generates scripture illustrations. Details may change.

## Overview

- Each verse has its own AI-generated image.
- Images are generated server-side via OpenRouter.
- **Model selection**: Users can choose any image-capable model from OpenRouter via a header dropdown.
- **Storyboard context**: Images include prev/next verse context for visual narrative continuity.
- **Persistence (Convex)**: When enabled, every image is saved per verse and can be browsed later.
- **Fallback**: When Convex is disabled, images rely on browser HTTP caching only.

## Current Flow

1. Verse page fetches current verse AND prev/next verses from the Bible API using the selected translation.
2. `HeroImage` loads existing image history from Convex (if configured).
3. If no images exist for the verse, `HeroImage` auto-generates the first image.
4. Client requests `/api/generate-image` with text, optional theme, prevVerse, nextVerse, reference, **model**, and generation count.
5. Server builds a **storyboard-aware prompt** using the verse + surrounding context.
6. Server generates the image via OpenRouter using the **user-selected model**.
7. Response returns an image URL (or base64 data URL) and the model used.
8. If Convex is enabled, the image is saved and appended to history; otherwise it is displayed directly.

## Chapter Themes (Optional)

Themes are supported but are not currently passed from the verse page. If a theme is provided, it augments prompts for consistent style.

Example theme structure:

```ts
{
  setting: "Creation of the cosmos",
  palette: "deep cosmic blues, radiant golds, ethereal whites",
  elements: "primordial void, divine light rays, swirling waters, emerging forms",
  style: "classical religious art, Baroque lighting, majestic and reverent"
}
```

## Prompt Construction

Prompts combine verse text with storyboard context (and theme when provided):

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

## Persistence & Caching

- **Convex persistence** stores images per verse and makes history available across sessions.
- `/api/generate-image` responses include `Cache-Control: private, max-age=3600` for HTTP caching.
- Next.js caching is disabled (`dynamic = "force-dynamic"`), so persistence is handled by Convex or the browser cache.

## Model Selection

Users can choose from **any image generation model** available on OpenRouter via a dropdown in the header.

### How It Works

1. Click the image icon (🖼️) in the header to open the model selector.
2. Models are fetched from OpenRouter's `/api/v1/models` endpoint.
3. Only models with image output capability are shown.
4. Selection is persisted in localStorage and triggers image regeneration.

### Default Model

- **Default**: `google/gemini-2.5-flash-image`

## Entry Points

- **Image generation API**: `src/app/api/generate-image/route.ts`
- **Image models API**: `src/app/api/image-models/route.ts`
- **Hero image UI**: `src/components/hero-image.tsx`
- **Model selector UI**: `src/components/image-model-selector.tsx`
- **Preferences context**: `src/context/preferences-context.tsx`
- **Convex persistence**: `convex/verseImages.ts`, `convex/schema.ts`
- **Convex client gate**: `src/components/convex-client-provider.tsx`
- **Verse page**: `src/app/[book]/[chapter]/[verse]/page.tsx`
