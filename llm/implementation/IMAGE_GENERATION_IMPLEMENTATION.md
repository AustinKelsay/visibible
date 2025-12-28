# Image Generation Implementation Guide

This document describes the current image generation implementation, including Convex-backed persistence.

---

## Architecture Overview

Visibible generates AI illustrations per verse using OpenRouter. Users select an image model, and each verse maintains an image history when Convex is enabled.

High-level flow:

- Verse page fetches current verse + prev/next verse context using the selected translation.
- `HeroImage` loads existing images from Convex (if available).
- If no images exist, `HeroImage` auto-generates the first image.
- New images are generated via `/api/generate-image` and saved to Convex.
- Users can browse older/newer images and generate new ones at any time.

---

## Model Selection System

Users can choose from any image generation model available on OpenRouter.

### Type Definitions

```ts
// src/lib/image-models.ts
export interface ImageModel {
  id: string;        // e.g., "google/gemini-2.5-flash-image"
  name: string;      // Human-readable name
  provider: string;  // e.g., "Google", "OpenAI"
  pricing?: { imageOutput?: string };
}

export const DEFAULT_IMAGE_MODEL = "google/gemini-2.5-flash-image";
```

### Models API Endpoint

`src/app/api/image-models/route.ts` fetches and filters OpenRouter models:

- Filters by `architecture.output_modalities` containing `"image"`
- Groups by provider
- Falls back to the default list if the API fails

### Preferences Integration

`src/context/preferences-context.tsx` stores the selected model:

- Persisted in `localStorage` (`vibible-preferences`)
- Stored as cookie `vibible-image-model`
- Triggers `router.refresh()` to regenerate the image with the new model

---

## Chapter Theme System (Optional)

Theme support exists but is not currently wired in from the verse page. If provided, themes augment the prompt:

```ts
interface ChapterTheme {
  setting: string;
  palette: string;
  elements: string;
  style: string;
}
```

---

## Client Flow (HeroImage)

### Entry Point

- `src/components/hero-image.tsx`

### Convex Gate

`HeroImage` checks `useConvexEnabled()`:

- If Convex is available, it uses `HeroImageWithConvex`.
- Otherwise it renders `HeroImageBase` with no persistence.

### Convex Integration

```tsx
const imageHistory = useQuery(api.verseImages.getImageHistory, { verseId, refreshToken });
const saveImageAction = useAction(api.verseImages.saveImage);
```

- `verseId` is derived from `currentReference` (e.g., `genesis-1-1`).
- `refreshToken` forces Convex to re-run the query on demand.

### Generation Trigger

Image generation is explicit (manual) and automatic (first image):

- **Auto-generate** when `imageHistory` is loaded and empty.
- **Manual** via the "New image" button.

`generateImage()` builds the request:

```ts
const params = new URLSearchParams();
if (verseText) params.set("text", verseText);
if (chapterTheme) params.set("theme", JSON.stringify(chapterTheme));
if (prevVerse) params.set("prevVerse", JSON.stringify(prevVerse));
if (nextVerse) params.set("nextVerse", JSON.stringify(nextVerse));
if (currentReference) params.set("reference", currentReference);
if (imageModel) params.set("model", imageModel);

const existingImageCount = imageHistory?.length || 0;
if (existingImageCount > 0) {
  params.set("generation", String(existingImageCount + 1));
}
```

The response returns `{ imageUrl, model }`.

### Saving to Convex

When Convex is enabled, the image is saved before display:

```ts
const savedId = await onSaveImage({ verseId, imageUrl, model });
setPendingImageId(savedId);
```

The UI waits until the new ID appears in `imageHistory` before switching to it.

### History Navigation

- History is sorted newest-first.
- `selectedImageId = null` means "show latest".
- **Older** = move forward in the list.
- **Newer** = move backward.
- Image count label shows `index / total` and "Latest" when on newest.

### Loading + Error States

- `isGenerating` shows a loading overlay.
- `isImageLoading` tracks actual `<img>` load state.
- Image load failures trigger a Convex refresh (up to 3 retries), then an error panel.

---

## Server Flow (`/api/generate-image`)

### API Endpoint

- `src/app/api/generate-image/route.ts`
- `export const dynamic = "force-dynamic"` disables Next.js caching

### Prompt Building

The API builds a storyboard-aware prompt:

- Verse text + reference
- Optional prev/next verse context
- Optional chapter theme
- Optional generation note (2nd+ images)
- Strict "no text" and framing instructions

### OpenRouter Call

Uses chat completions with image modality support:

```ts
const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${openRouterApiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: modelId,
    messages: [{ role: "user", content: prompt }],
    modalities: ["image", "text"],
    image_config: { aspect_ratio: "16:9" },
  }),
});
```

### Response Handling

- Checks `message.images` first.
- Falls back to `message.content` for `image_url` or inline base64 data.
- Returns `{ imageUrl, model }` with `Cache-Control: private, max-age=3600`.

---

## Persistence Layer (Convex)

Convex persistence is documented in detail in:

- `llm/implementation/IMAGE_PERSISTENCE_IMPLEMENTATION.md`

---

## Verse Page Integration

`src/app/[book]/[chapter]/[verse]/page.tsx` provides:

- `verseText` and `caption` (current verse text)
- `prevVerse` and `nextVerse` for storyboard continuity
- `currentReference` (e.g., "Genesis 1:3")
- navigation URLs + counts

---

## Error Handling

### Server

- Missing `OPENROUTER_API_KEY` returns HTTP 500 with clear error.
- OpenRouter API errors are logged and return `{ error: "Failed to generate image" }`.
- Unsupported model responses return `{ error: "No image generated - model may not support image output" }`.

### Client

- Non-OK responses surface a user-facing error message.
- AbortError is ignored during unmount or re-generation.
- Image load errors attempt Convex refresh before showing "Try Again".

---

## Environment Requirements

```bash
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_REFERRER=http://localhost:3000
OPENROUTER_TITLE=vibible
ENABLE_IMAGE_GENERATION=true
CONVEX_DEPLOYMENT=prod:your-deployment-name
NEXT_PUBLIC_CONVEX_URL=https://your-deployment-name.convex.cloud
```

---

## Files to Know

| File | Purpose |
|------|---------|
| `src/lib/image-models.ts` | Type definitions + default model |
| `src/app/api/image-models/route.ts` | Fetch/filter OpenRouter models |
| `src/app/api/generate-image/route.ts` | OpenRouter client + prompt building |
| `src/components/image-model-selector.tsx` | Model selection dropdown |
| `src/components/hero-image.tsx` | Hero image UI + generation flow |
| `src/components/convex-client-provider.tsx` | Convex client gating |
| `convex/verseImages.ts` | Queries/actions for image persistence |
| `convex/schema.ts` | `verseImages` table definition |
| `src/context/preferences-context.tsx` | User preferences (translation + image model) |
| `src/app/[book]/[chapter]/[verse]/page.tsx` | Verse page wiring |

---

## Adding New Chapter Themes

To add a theme for a new chapter:

1. Create/edit a data file (e.g., `src/data/genesis-2.ts`).
2. Export a theme object:
   ```ts
   export const genesis2Theme = {
     setting: "Description of the chapter's setting",
     palette: "color descriptions",
     elements: "recurring visual elements",
     style: "artistic style guidance",
   };
   ```
3. Pass it to `HeroImage` via the `chapterTheme` prop.
