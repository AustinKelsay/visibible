# Image Generation Implementation Guide

This document describes the current image generation implementation. It is intentionally high-level and will evolve.

---

## Architecture Overview

Visibible generates AI illustrations for each scripture verse using OpenRouter with Google's Gemini model.

- Each verse page fetches current, previous, and next verses from the Bible API.
- Page passes verse text, chapter theme, and **prev/next verse context** to `HeroImage`.
- Client fetches `/api/generate-image` with text, theme, prevVerse, nextVerse params.
- Server builds a **storyboard-aware prompt** for visual narrative continuity.
- Server generates an image via OpenRouter (Gemini) and returns the URL or base64 data.
- Browser caching controls regeneration behavior per-verse.

---

## Chapter Theme System

### Theme Data Structure

Themes are defined per-chapter in the data files:

```ts
// src/data/genesis-1.ts
export const genesis1Theme = {
  setting: "Creation of the cosmos",
  palette: "deep cosmic blues, radiant golds, ethereal whites",
  elements: "primordial void, divine light rays, swirling waters, emerging forms",
  style: "classical religious art, Baroque lighting, majestic and reverent",
};
```

### Theme Interface

```ts
interface ChapterTheme {
  setting: string;   // Scene/context description
  palette: string;   // Color palette guidance
  elements: string;  // Recurring visual elements
  style: string;     // Artistic style direction
}
```

### Purpose

Themes ensure visual consistency across all verses in a chapter:
- Same color palette throughout
- Recurring visual motifs
- Unified artistic style
- Coherent narrative progression

---

## Client Flow

### UI Entry Point

- `src/components/hero-image.tsx` (hero image display and fetch logic)

### Component Props

```tsx
interface VerseContext {
  number: number;
  text: string;
  reference?: string;  // e.g., "Genesis 1:2"
}

interface HeroImageProps {
  alt?: string;
  caption?: string;
  verseText?: string;           // The verse text to generate an image for
  chapterTheme?: ChapterTheme;  // Theme for visual consistency
  verseNumber?: number;         // Current verse (for navigation arrows)
  totalVerses?: number;         // Total verses (for navigation arrows)
  prevVerse?: VerseContext;     // Previous verse for storyboard context
  nextVerse?: VerseContext;     // Next verse for storyboard context
  currentReference?: string;    // e.g., "Genesis 1:3"
}
```

### Component State

Four state variables manage the UI:

```tsx
const [imageUrl, setImageUrl] = useState<string | null>(null);
const [isLoading, setIsLoading] = useState(true);
const [showSkeleton, setShowSkeleton] = useState(false);  // Delayed loading indicator
const [error, setError] = useState<string | null>(null);
```

### Fetch Trigger

- `useEffect` triggers fetch when verse or context changes.
- Dependencies: `[verseText, chapterTheme, prevVerse, nextVerse, currentReference]`
- Builds URL with query params for text, theme, and storyboard context.
- Uses `AbortController` for cleanup on unmount or prop change.

```tsx
useEffect(() => {
  const abortController = new AbortController();

  async function generateImage() {
    const params = new URLSearchParams();
    if (verseText) params.set("text", verseText);
    if (chapterTheme) params.set("theme", JSON.stringify(chapterTheme));
    if (prevVerse) params.set("prevVerse", JSON.stringify(prevVerse));
    if (nextVerse) params.set("nextVerse", JSON.stringify(nextVerse));
    if (currentReference) params.set("reference", currentReference);
    const url = `/api/generate-image${params.toString() ? `?${params.toString()}` : ""}`;

    const response = await fetch(url, { signal: abortController.signal });
    // ...
  }

  generateImage();
  return () => abortController.abort();
}, [verseText, chapterTheme]);
```

### Delayed Loading Pattern

To prevent a flash of loading state for cached responses, we delay showing the skeleton:

```tsx
// Only show skeleton after a delay to prevent flash for cached responses
useEffect(() => {
  if (!isLoading) {
    setShowSkeleton(false);
    return;
  }

  const timer = setTimeout(() => {
    if (isLoading) {
      setShowSkeleton(true);
    }
  }, 300);  // 300ms delay

  return () => clearTimeout(timer);
}, [isLoading]);
```

**Behavior:**
- **Fast/cached response (<300ms):** Placeholder → Image (no skeleton shown)
- **Slow response (>300ms):** Placeholder → Skeleton shimmer → Image

### Placeholder UI

While loading or on error, a gradient placeholder is shown:

- Warm gradient background (amber/orange/rose)
- Decorative blur element simulating light
- Skeleton shimmer animation (only after 300ms delay)
- Error text in red if generation fails

### Floating Navigation Arrows

When `verseNumber` and `totalVerses` are provided, floating arrow buttons appear on the image:

```tsx
{hasPrevious && (
  <Link href={`/verse/${verseNumber - 1}`} className="absolute left-3 top-1/2 ...">
    <ChevronLeft size={24} strokeWidth={2} />
  </Link>
)}
{hasNext && (
  <Link href={`/verse/${verseNumber + 1}`} className="absolute right-3 top-1/2 ...">
    <ChevronRight size={24} strokeWidth={2} />
  </Link>
)}
```

- Positioned at left/right edges, vertically centered
- Semi-transparent background with backdrop blur
- Only show when navigation is available (not on first/last verse)

### Image Display

- Uses native `<img>` tag (not Next.js Image, for external URLs and data URLs)
- `object-cover` fills the container
- Aspect ratio: 16:9 mobile, 21:9 desktop
- Caption overlay at bottom with verse text

---

## Server Flow

### API Endpoint

- `src/app/api/generate-image/route.ts` handles GET requests.

### Next.js Caching

```ts
export const dynamic = 'force-dynamic';
```

This disables Next.js server-side caching so the browser cache has full control.

### OpenRouter API Setup

The implementation uses direct HTTP requests to OpenRouter's chat completions API. The API key is validated early to prevent requests with missing credentials:

```ts
// Validate OpenRouter API key before proceeding
const openRouterApiKey = process.env.OPENROUTER_API_KEY;
if (!openRouterApiKey || openRouterApiKey.trim() === "") {
  console.error("OPENROUTER_API_KEY is missing or empty");
  return NextResponse.json(
    { error: "Server configuration error: OpenRouter API key is not configured" },
    { status: 500 }
  );
}
```

Uses direct HTTP requests to OpenRouter's chat completions API with image modality support.

### Query Parameter Handling

```ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const verseText = searchParams.get("text") || DEFAULT_TEXT;
  const themeParam = searchParams.get("theme");
  const prevVerseParam = searchParams.get("prevVerse");
  const nextVerseParam = searchParams.get("nextVerse");
  const reference = searchParams.get("reference") || "Scripture";
  // ...
}
```

- Reads `text` param for current verse content
- Reads `theme` param as JSON string for chapter styling
- Reads `prevVerse` and `nextVerse` as JSON for storyboard context
- Reads `reference` for verse location (e.g., "Genesis 1:3")
- Falls back gracefully if any are missing

### Prompt Building

The API builds **storyboard-aware prompts** that include narrative context:

```ts
// Build narrative context section
let narrativeContext = "";
if (prevVerse || nextVerse) {
  narrativeContext = "\n\nNARRATIVE CONTEXT (for visual continuity - this is a storyboard):";
  if (prevVerse) {
    narrativeContext += `\n- Previous scene (v${prevVerse.number}): "${prevVerse.text}"`;
  }
  narrativeContext += `\n- CURRENT SCENE (the verse to illustrate): "${verseText}"`;
  if (nextVerse) {
    narrativeContext += `\n- Next scene (v${nextVerse.number}): "${nextVerse.text}"`;
  }
  narrativeContext += "\n\nThis is part of a visual storyboard through Scripture...";
}
```

**Full prompt structure:**
```
Create a biblical illustration for Genesis 1:3: "And God said, Let there be light..."

NARRATIVE CONTEXT (for visual continuity - this is a storyboard):
- Previous scene (v2): "And the earth was without form, and void..."
- CURRENT SCENE (the verse to illustrate): "And God said, Let there be light..."
- Next scene (v4): "And God saw the light, that it was good..."

This is part of a visual storyboard through Scripture. Maintain visual consistency
with the flow of the narrative while focusing on THIS verse's moment.

Setting: Creation of the cosmos
Visual elements: primordial void, divine light rays, swirling waters
Color palette: deep cosmic blues, radiant golds, ethereal whites
Style: classical religious art, Baroque lighting, majestic and reverent

Generate the image in WIDESCREEN LANDSCAPE format with a 16:9 aspect ratio.
Generate a beautiful, reverent image. Do not include any text in the image.
```

The storyboard context helps the AI:
- Understand where we are in the narrative
- Create visual continuity from verse to verse
- Focus on THIS verse while maintaining consistency

### Image Generation Call

```ts
const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${openRouterApiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.OPENROUTER_REFERRER || "http://localhost:3000",
    "X-Title": process.env.OPENROUTER_TITLE || "vibible",
  },
  body: JSON.stringify({
    model: "google/gemini-2.5-flash-image-preview",
    messages: [{ role: "user", content: prompt }],
    modalities: ["image", "text"],
  }),
});
```

- **Provider**: OpenRouter (chat completions endpoint with image modality)
- **Model**: `google/gemini-2.5-flash-image-preview`
- **Pricing**: ~$0.30/M input tokens, ~$2.50/M output tokens
- **Prompt**: Verse text + storyboard context + theme styling

### Response Handling

The API handles multiple response formats from OpenRouter:

```ts
const data = await response.json();
const message = data.choices?.[0]?.message;

// OpenRouter returns images in a separate "images" field
if (message?.images && Array.isArray(message.images)) {
  for (const image of message.images) {
    if (image.image_url?.url) {
      return NextResponse.json({ imageUrl: image.image_url.url }, {
        headers: { 'Cache-Control': 'private, max-age=3600' },
      });
    }
  }
}

// Fallback: check content array (some models use this format)
const content = message?.content;
if (Array.isArray(content)) {
  for (const part of content) {
    if (part.type === "image_url" && part.image_url?.url) {
      return NextResponse.json({ imageUrl: part.image_url.url }, {
        headers: { 'Cache-Control': 'private, max-age=3600' },
      });
    }
    if (part.inline_data?.data) {
      const mimeType = part.inline_data.mime_type || "image/png";
      return NextResponse.json({
        imageUrl: `data:${mimeType};base64,${part.inline_data.data}`
      }, {
        headers: { 'Cache-Control': 'private, max-age=3600' },
      });
    }
  }
}
```

The implementation checks for images in the `message.images` array first, then falls back to checking the `content` array for both URL-based and inline base64 image data.

---

## Caching Implementation

### Browser Cache Strategy

The `Cache-Control: private, max-age=3600` header tells the browser:

- Cache this response privately (not shared/CDN)
- Consider it fresh for 1 hour

### Per-Verse Caching

Each unique URL (including theme) caches separately:

- `/api/generate-image?text=In%20the%20beginning...&theme={...}` → cached image for verse 1
- `/api/generate-image?text=And%20the%20earth...&theme={...}` → cached image for verse 2

### Refresh Behavior

| Action | Browser Behavior | Result |
|--------|------------------|--------|
| Normal navigation between verses | Uses cached response | Same image (fast) |
| Page refresh (Cmd+R or Cmd+Shift+R) | Bypasses fetch cache once | New image for current verse |
| Navigate after refresh | Uses cached response | Cached images for other verses |

**Implementation Note:** JavaScript `fetch()` doesn't automatically respect hard refresh. We detect page reload via the Performance API, but must be careful: the navigation entry persists during client-side navigation. We use `sessionStorage` to ensure we only bypass cache **once** per reload:

```tsx
const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
const isReload = navEntry?.type === 'reload';
const pageLoadId = String(navEntry?.startTime ?? '');
const handledPageLoad = sessionStorage.getItem('image-cache-bypassed-for');

// Only bypass cache once per page reload session
const shouldBypassCache = isReload && handledPageLoad !== pageLoadId;

if (shouldBypassCache) {
  sessionStorage.setItem('image-cache-bypassed-for', pageLoadId);
}

fetch(url, { cache: shouldBypassCache ? 'reload' : 'default' });
```

This ensures:
- Refresh generates a new image for the current verse
- Navigating to other verses still uses cached images
- Each new refresh properly bypasses cache again

---

## Verse Page Integration

### Page Component

`src/app/verse/[number]/page.tsx` passes verse text, theme, and navigation info to HeroImage:

```tsx
import { genesis1Verses, genesis1Theme } from "@/data/genesis-1";

const verse = genesis1Verses[verseNumber - 1];
const totalVerses = genesis1Verses.length;

<HeroImage
  verseText={verse.text}
  caption={verse.text}
  chapterTheme={genesis1Theme}
  verseNumber={verseNumber}
  totalVerses={totalVerses}
/>
```

### Data Flow

```
URL: /verse/3
    ↓
Verse page parses number, looks up genesis1Verses[2]
    ↓
Imports genesis1Theme for chapter-level styling
    ↓
Passes verse.text + genesis1Theme to HeroImage
    ↓
HeroImage fetches /api/generate-image?text={verse}&theme={theme JSON}
    ↓
API builds enhanced prompt: verse + setting + elements + palette + style
    ↓
OpenRouter (Gemini) generates image
    ↓
Image URL or base64 returned and displayed
```

---

## Error Handling

### Server Errors

- Missing or empty `OPENROUTER_API_KEY` returns HTTP 500 with clear error message
- OpenRouter API failures caught and logged
- Returns `{ error: "Failed to generate image" }` with 500 status
- Missing image data returns `{ error: "No image generated - model may not support image output" }` with 500 status
- Invalid theme JSON falls back to simple prompt

### Client Errors

- Non-OK responses throw and set error state
- AbortError ignored (normal cleanup)
- Error message displayed in placeholder area
- Console logs full error for debugging

---

## Environment Requirements

```bash
OPENROUTER_API_KEY=sk-or-...        # Required
OPENROUTER_REFERRER=http://localhost:3000
OPENROUTER_TITLE=vibible
ENABLE_IMAGE_GENERATION=true        # Set to enable
```

---

## Files to Know

| File | Purpose |
|------|---------|
| `src/data/genesis-1.ts` | Verse data + `genesis1Theme` export |
| `src/app/api/generate-image/route.ts` | API endpoint, OpenRouter client, prompt building |
| `src/components/hero-image.tsx` | Client component, `chapterTheme` prop, fetch logic |
| `src/app/verse/[number]/page.tsx` | Verse page, imports and passes theme |
| `.env.local` | OpenRouter API key configuration |

---

## Adding New Chapter Themes

To add a theme for a new chapter:

1. Create/edit the data file (e.g., `src/data/genesis-2.ts`)
2. Export a theme object:
   ```ts
   export const genesis2Theme = {
     setting: "Description of the chapter's setting",
     palette: "color descriptions",
     elements: "recurring visual elements",
     style: "artistic style guidance",
   };
   ```
3. Import and pass to `HeroImage` in the verse page
