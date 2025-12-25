# Image Generation Context

High-level overview of how Visibible generates scripture illustrations. Details may change.

## Overview

- Each verse has its own AI-generated image.
- Images are generated server-side via OpenRouter using Google's Gemini model.
- Chapter-level themes provide visual consistency across verses within a chapter.
- **Storyboard context**: Images include prev/next verse context for visual narrative continuity.
- Browser-level caching ensures each verse's image persists across soft refreshes.

## Current Flow

1. Verse page fetches current verse AND prev/next verses from Bible API
2. Page renders `HeroImage` with verse text, chapter theme, and prev/next verse context
3. Client fetches `/api/generate-image` with text, theme, prevVerse, nextVerse params
4. Server builds **storyboard-aware prompt** using verse + surrounding context
5. Server generates image using OpenRouter (`google/gemini-2.5-flash-image-preview`)
6. Response includes `Cache-Control` header for browser caching
7. Generated image URL (or base64 data URL) is displayed in the hero area

## Chapter Themes

Each chapter defines a visual theme for consistency across its verses:

```ts
{
  setting: "Creation of the cosmos",
  palette: "deep cosmic blues, radiant golds, ethereal whites",
  elements: "primordial void, divine light rays, swirling waters, emerging forms",
  style: "classical religious art, Baroque lighting, majestic and reverent"
}
```

This ensures all verses in Genesis 1 share:
- Consistent color palette
- Recurring visual elements
- Unified artistic style

## Prompt Construction

Prompts combine verse text with chapter theme AND storyboard context:

```
Create a biblical illustration for {reference}: "{verse text}"

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

Example for Genesis 1:3:
```
Create a biblical illustration for Genesis 1:3: "And God said, Let there be light: and there was light."

NARRATIVE CONTEXT (for visual continuity - this is a storyboard):
- Previous scene (v2): "And the earth was without form, and void; and darkness was upon the face of the deep. And the Spirit of God moved upon the face of the waters."
- CURRENT SCENE (the verse to illustrate): "And God said, Let there be light: and there was light."
- Next scene (v4): "And God saw the light, that it was good: and God divided the light from the darkness."

This is part of a visual storyboard through Scripture. Maintain visual consistency
with the flow of the narrative while focusing on THIS verse's moment.

Setting: Creation of the cosmos
Visual elements: primordial void, divine light rays, swirling waters, emerging forms
Color palette: deep cosmic blues, radiant golds, ethereal whites
Style: classical religious art, Baroque lighting, majestic and reverent
```

The storyboard context helps the AI:
- Understand where we are in the narrative flow
- Create visual continuity from verse to verse
- Focus on THIS verse's unique moment while maintaining consistency

## Caching Strategy

Browser cache handles persistence per-verse:

- Each verse URL (including theme) caches separately
- **Soft refresh (Cmd+R)**: Browser serves cached response; no API call
- **Hard refresh (Cmd+Shift+R)**: Browser bypasses cache; new image generated
- **Navigate to different verse**: New image generated (different URL)

Server-side Next.js caching is disabled (`dynamic = 'force-dynamic'`) so the browser has full control.

Cache duration is 1 hour (`max-age=3600`).

## Provider & Model

- **Provider**: OpenRouter (OpenAI-compatible API)
- **Model**: `google/gemini-2.5-flash-image-preview`
- **Pricing**: ~$0.30/M input tokens, ~$2.50/M output tokens
- **Response format**: URL or base64 (handled automatically)
- Per-verse caching reduces redundant generation costs

## Entry Points

- API: `src/app/api/generate-image/route.ts`
- UI: `src/components/hero-image.tsx`
- Verse page: `src/app/[book]/[chapter]/[verse]/page.tsx`

Note: Chapter themes are no longer hardcoded. The image generation uses verse text directly to create contextually appropriate illustrations.
