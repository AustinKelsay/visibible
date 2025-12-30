# Image Generation Implementation Guide

This document describes the current image generation implementation, including Convex-backed persistence.

---

## Architecture Overview

Visibible generates AI illustrations per verse using OpenRouter. Users select an image model, and each verse maintains an image history when Convex is enabled.

High-level flow:

- Verse page fetches current verse + prev/next verse context using the selected translation (prev/next only included for same-chapter verses).
- `HeroImage` loads existing images from Convex (if available).
- If no images exist, `HeroImage` auto-generates the first image when generation is allowed.
- New images are generated via `/api/generate-image` and saved to Convex.
- Users can browse older/newer images and generate new ones when credits allow.

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
  creditsCost?: number | null;
  etaSeconds?: number;
}

export const CREDIT_USD = 0.01;
export const PREMIUM_MULTIPLIER = 1.25;
export const DEFAULT_ETA_SECONDS = 12;
export const DEFAULT_IMAGE_MODEL = "google/gemini-2.5-flash-image";
```

### Models API Endpoint

`src/app/api/image-models/route.ts` fetches and filters OpenRouter models:

- Filters by `architecture.output_modalities` containing `"image"`
- Drops `-preview` models when a stable counterpart exists
- Computes `creditsCost` from OpenRouter pricing (`CREDIT_USD` + `PREMIUM_MULTIPLIER`)
- Merges ETA from Convex `modelStats` (defaults to 12s)
- Returns a `creditRange` (min/max) for onboarding copy
- Falls back to the default list if the API fails or key is missing

### Preferences Integration

`src/context/preferences-context.tsx` stores the selected model:

- Persisted in `localStorage` (`visibible-preferences`)
- Stored as cookie `visibible-image-model`
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

### Pricing + Credits Gate

`HeroImage` fetches `/api/image-models` to surface the current model's `creditsCost` and ETA in the UI:

- Defaults: 20 credits and 12s for unpriced models.
- `canGenerate` is true when Convex is disabled, admin tier is active, or paid tier has enough credits.
- Auto-generation only runs when `canGenerate` is true and the session has loaded.

### Unpriced Model Behavior

Models with `creditsCost === null` (no pricing data from OpenRouter) are **disabled in the selector UI**:

```tsx
// src/components/image-model-selector.tsx
onClick={() => model.creditsCost != null && handleSelect(model.id)}
disabled={model.creditsCost == null}
```

This prevents users from selecting models where costs cannot be calculated. Unpriced models appear in the list but are grayed out and unclickable.

### Generation Trigger

Image generation is explicit (manual) and automatic (first image):

- **Auto-generate** when `imageHistory` is loaded and empty **and** generation is allowed.
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

The response returns `{ imageUrl, model, prompt, generationId, ...metadata }`.

### Saving to Convex

When Convex is enabled, the image is saved before display:

```ts
const savedId = await onSaveImage({
  verseId,
  imageUrl,
  model,
  prompt,
  promptVersion,
  promptInputs,
  generationId,
  reference,
  verseText,
  chapterTheme,
  generationNumber,
  translationId,
  provider,
  providerRequestId,
  creditsCost,
  costUsd,
  durationMs,
  aspectRatio,
});
setPendingImageId(savedId);
```

The UI waits until the new ID appears in `imageHistory` before switching to it.

Saved metadata includes `translationId` (current translation), `promptVersion`/`promptInputs`, and provider identifiers for traceability.

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

### Credits & Sessions (Reservation Pattern)

When Convex is configured, the endpoint enforces credits using a two-stage reservation pattern to prevent race conditions:

1. Verify session cookie via `getSessionFromCookies()`.
2. Resolve model pricing and compute `creditsCost` (default 20 if unpriced).
3. **Reserve credits atomically** via `reserveCredits()` - deducts from balance immediately and creates a `reservation` ledger entry.
4. If reservation fails (insufficient credits), return 402 with `required`/`available` amounts.
5. Generate image via OpenRouter.
6. **Convert reservation to charge** via `deductCredits()` - uses double-entry bookkeeping (creates `generation` + compensating `refund` to convert the reservation).
7. If generation fails, **release reservation** via `releaseReservation()` to restore credits.
8. If post-charge fails, return 402 and discard the generated image.

**Why reservation?** Prevents over-spending when concurrent requests race. Credits are atomically reserved before the slow OpenRouter call, ensuring the balance check is authoritative.

**Server-side only:** The reservation system is entirely server-side. The client's `useSession()` context only sees the final balance update via `updateCredits()` after generation completes.

### Prompt Building

The API builds a storyboard-aware prompt:

- Verse text + reference
- Optional prev/next verse context
- Optional chapter theme
- Optional generation note (2nd+ images)
- Strict "no text" and framing instructions
- `promptVersion` (date string, e.g., `"2025-12-30"`) + `promptInputs` recorded for reproducibility

`promptInputs` shape:

```ts
{
  reference,
  aspectRatio,
  generationNumber?,
  prevVerse?,
  nextVerse?
}
```

### OpenRouter Call

Uses chat completions with image modality support:

```ts
const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${openRouterApiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.OPENROUTER_REFERRER || "http://localhost:3000",
    "X-Title": process.env.OPENROUTER_TITLE || "visibible",
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
- `provider` is derived from the model ID; `providerRequestId` uses OpenRouter's response `id`.
- Returns `{ imageUrl, model, provider, providerRequestId, prompt, promptVersion, promptInputs, generationId, creditsCost, costUsd, durationMs, aspectRatio, credits? }` with `Cache-Control: private, max-age=3600`.

### Model Stats (ETA)

After a successful generation, the server records the duration via `api.modelStats.recordGeneration` (fire-and-forget, implemented in `convex/modelStats.ts`). `/api/image-models` merges these stats into per-model `etaSeconds`.

---

## Persistence Layer (Convex)

Convex persistence is documented in detail in:

- `llm/implementation/IMAGE_PERSISTENCE_IMPLEMENTATION.md`

---

## Verse Page Integration

`src/app/[book]/[chapter]/[verse]/page.tsx` provides:

- `verseText` and `caption` (current verse text)
- `prevVerse` and `nextVerse` for storyboard continuity (only when in same chapter)
- `currentReference` (e.g., "Genesis 1:3")
- navigation URLs + counts

---

## Error Handling

### Server

- Missing `OPENROUTER_API_KEY` returns HTTP 500 with clear error.
- `ENABLE_IMAGE_GENERATION=false` returns HTTP 403.
- Missing session (when Convex is enabled) returns HTTP 401.
- Insufficient credits returns HTTP 402 with required/available amounts.
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
OPENROUTER_TITLE=visibible
ENABLE_IMAGE_GENERATION=true
CONVEX_DEPLOYMENT=prod:your-deployment-name
NEXT_PUBLIC_CONVEX_URL=https://your-deployment-name.convex.cloud
SESSION_SECRET=your-session-secret-here  # Required for credit-gated generation
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
| `convex/modelStats.ts` | ETA tracking for image models |
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
