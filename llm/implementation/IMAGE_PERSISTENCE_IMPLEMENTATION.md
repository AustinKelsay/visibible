# Image Persistence Implementation Guide

This document describes how verse image persistence and history browsing are implemented with Convex.

---

## Architecture Overview

Image persistence is Convex-backed and uses a server-controlled write boundary. The flow is:

1. `HeroImage` checks whether Convex is available.
2. If enabled, it queries Convex for the verse's image history.
3. New image generation goes through `/api/generate-image`, and that API route persists the image by calling `api.verseImages.saveImage` with `CONVEX_SERVER_SECRET`.
4. The API response includes `savedImageId`; the UI follows that ID once it appears in history.

Key entry points:
- `src/components/convex-client-provider.tsx`
- `src/components/hero-image.tsx`
- `src/components/chapter-gallery.tsx`
- `src/components/verse-strip.tsx`
- `convex/schema.ts`
- `convex/verseImages.ts`

---

## Data Model

`convex/schema.ts` defines the `verseImages` table:

```ts
verseImages: defineTable({
  verseId: v.string(),
  imageUrl: v.optional(v.string()),
  storageId: v.optional(v.id("_storage")),
  prompt: v.optional(v.string()),
  reference: v.optional(v.string()),
  verseText: v.optional(v.string()),
  chapterTheme: v.optional(
    v.object({
      setting: v.string(),
      palette: v.string(),
      elements: v.string(),
      style: v.string(),
    })
  ),
  generationNumber: v.optional(v.number()),
  promptVersion: v.optional(v.string()),
  promptInputs: v.optional(
    v.object({
      reference: v.optional(v.string()),
      aspectRatio: v.optional(v.string()),
      generationNumber: v.optional(v.number()),
      prevVerse: v.optional(verseContextValidator),
      nextVerse: v.optional(verseContextValidator),
    })
  ),
  translationId: v.optional(v.string()),
  provider: v.optional(v.string()),
  providerRequestId: v.optional(v.string()),
  creditsCost: v.optional(v.number()),
  costUsd: v.optional(v.number()),
  durationMs: v.optional(v.number()),
  aspectRatio: v.optional(v.string()),
  sourceImageUrl: v.optional(v.string()),
  imageMimeType: v.optional(v.string()),
  imageSizeBytes: v.optional(v.number()),
  imageWidth: v.optional(v.number()),
  imageHeight: v.optional(v.number()),
  model: v.string(),
  createdAt: v.number(),
  generationId: v.optional(v.string()),
  nostrEventId: v.optional(v.string()),
  nostrPublishedAt: v.optional(v.number()),
  nostrRelays: v.optional(v.array(v.string())),
  impressionCount: v.optional(v.number()),
  lastImpressionAt: v.optional(v.number()),
})
  .index("by_verse", ["verseId", "createdAt"])
  .index("by_generationId", ["generationId"])
  .index("by_createdAt", ["createdAt"]);
```

Notes:
- `verseId` is derived from the verse reference string.
- Images are stored newest-first via `createdAt` sorting.
- `imageUrl` is used as a fallback when storage upload fails.
- `promptVersion` + `promptInputs` capture how the prompt was constructed.
- `promptInputs.prevVerse`/`nextVerse` use `{ number, text, reference? }` context.
- `translationId` records the translation used for generation.
- `provider` and `providerRequestId` store OpenRouter identifiers for traceability.
- `sourceImageUrl` and image metadata store origin + file details (mime, size, dimensions).
- `generationId` is used for idempotency to avoid duplicate saves.
- `nostrEventId` / `nostrPublishedAt` / `nostrRelays` store Nostr publication metadata on persisted images.
- `impressionCount` / `lastImpressionAt` store lightweight local display activity used to rank scheduled Nostr candidates.

---

## Convex Queries & Mutations

`convex/verseImages.ts` exposes the main verse-image browsing and persistence operations:

### `getLatestImage` (query)
Returns the newest image for a verse, preferring a permanent URL for storage-backed images (`/image/{storageId}` on Convex HTTP actions domain). Includes prompt + metadata.

### `getChapterImageStatus` (query)
Returns a list of verse numbers in a chapter with their image counts. Used by `src/components/verse-strip.tsx` to display per-verse stacked dots (1 dot for single image, up to 3 overlapping dots for multiple images).

```ts
getChapterImageStatus({ book, chapter })
// Returns: [{ verse: 1, imageCount: 3 }, { verse: 5, imageCount: 1 }, ...]
```

### `getChapterGallery` (query)
Returns all saved images for a chapter, ordered by verse and newest-first within each verse. Used by `src/components/chapter-gallery.tsx` for the optional chapter gallery view.

```ts
getChapterGallery({ book, chapter })
// Returns: [{ verse: 1, imageCount: 3, imageId, imageUrl, model, createdAt, isLatest }, ...]
```

- The query scans the chapter prefix once via the `by_verse` index.
- It returns every saved image record for the chapter, sorted by verse ascending and newest-first within each verse.
- Storage URLs are resolved for each returned image so the gallery can render either a flat `All images` gallery or a grouped `By verse` view without additional round trips.
- The UI uses the same response to render a full-screen gallery with a filters section at the top and placeholders where no art exists yet.

### `getBooksWithImages` (query)
Returns all book slugs that have at least one image. Used for showing image indicators in the book menu.

**Performance optimization:** Instead of scanning the entire `verseImages` table, this query performs 66 parallel existence checks (one per Bible book) using the `by_verse` index with prefix ranges. Each check fetches at most one record, making the query O(66) index lookups instead of O(n) full table scan.

### `getChaptersWithImages` (query)
Returns all chapter numbers that have at least one image for a given book. Used for showing image indicators in the book menu chapter grid.

### `getImageHistory` (query)
Returns all images for a verse, newest first, including prompt + metadata.

```ts
getImageHistory({ verseId, limit?, refreshToken? })
```

- `limit` can restrict the history length.
- `refreshToken` is a cache-busting value used by the UI to force a re-run of the query.
- Results include prompt version/inputs, translation, provider identifiers, and image file metadata when present.

### `recordImageImpression` (mutation)
Records that a persisted image was actually displayed in the UI.

```ts
recordImageImpression({ imageId })
// Returns: { success: true } or { success: false }
```

- Public client mutation used by `src/components/hero-image.tsx`.
- Increments `impressionCount` and updates `lastImpressionAt` with the current timestamp.
- The current hero-image flow records at most one impression per loaded image ID per page lifetime.
- This data is not part of the Vercel Analytics stream; it exists so scheduled Nostr publishing can rank saved images directly inside Convex.

### `saveImage` (action, server-authenticated)
Handles both base64 data URLs and standard URLs.

Security boundary:

- Requires `serverSecret` and validates it against `CONVEX_SERVER_SECRET`.
- Intended for trusted server callers (Next.js API routes), not browser-direct usage.

Input and fetch validation:

- **Base64 data URL**: decode to bytes, store in Convex storage, then save `storageId`.
- **Regular URL**: enforce HTTPS + host allowlist, reject local/private hosts, then fetch + store in Convex storage (10s timeout).
- **Validation failures** (host/mime/size) are rejected and do **not** fall back to URL persistence.
- **Network/storage failures** still fall back to `saveImageWithUrl`.
- **Idempotency**: if `generationId` already exists, the existing record is returned.
- **Metadata**: prompt details, provider info, translation, and image file metadata (mime, size, dimensions) are persisted alongside the image.

Additional behavior:
- `provider` defaults to the model prefix if not supplied.
- MIME type is normalized and dimensions are parsed for PNG/JPEG/GIF/WebP when possible.
- Blob size is capped (`MAX_IMAGE_BYTES`, currently 10 MiB).

#### MIME allowlist

Only these content types are accepted: `image/png`, `image/jpeg`, `image/webp`, `image/gif`.

#### Remote host allowlist

Default allowed hosts (defined in `convex/verseImages.ts`):

| Host pattern | Rationale |
|---|---|
| `openrouter.ai` / `*.openrouter.ai` | OpenRouter API and CDN |
| `openrouterusercontent.com` / `*.openrouterusercontent.com` | OpenRouter user content CDN |
| `*.googleusercontent.com` | Google-hosted model outputs (Gemini) |
| `*.gstatic.com` | Google static content CDN |
| `*.oaistatic.com` | OpenAI static content CDN |
| `*.blob.core.windows.net` | Azure blob storage (provider outputs) |

The `IMAGE_FETCH_ALLOWLIST` env var accepts a comma-separated list of additional hosts (e.g., `extra.example.com,*.cdn.example.net`). Wildcard patterns use `*.domain.tld` syntax to match the domain itself and all subdomains.

#### Blocked IP ranges (SSRF protection)

The following are blocked when the URL hostname resolves to an IP:

- `10.0.0.0/8` (RFC 1918 private)
- `172.16.0.0/12` (RFC 1918 private)
- `192.168.0.0/16` (RFC 1918 private)
- `127.0.0.0/8` (loopback)
- `169.254.0.0/16` (link-local)
- `0.0.0.0/8` (unspecified)
- `::1` (IPv6 loopback)
- `fe80::/10` (IPv6 link-local)
- `fc00::/7` (IPv6 unique-local / private)
- `localhost` and `*.localhost`, `*.local`

#### Redirect handling limitation

The initial URL is validated against the allowlist before `fetch()`. However, `fetch()` follows redirects by default — if an allowed host issues a redirect to a non-allowlisted destination, the redirect is followed without re-validation. This is acceptable because the allowlisted hosts are well-known CDN providers where open redirects are unlikely, but it should be noted for future hardening.

Internal mutations:
- `saveImageWithStorage`
- `saveImageWithUrl`

The action returns `{ success: true, type: "storage" | "url" | "existing", id }`.

---

## Client Integration

### Convex Availability Gate

`src/components/convex-client-provider.tsx` creates the Convex client only when the environment variable is present. It exposes `useConvexEnabled()` for feature gating.

### HeroImage Integration

`src/components/hero-image.tsx` splits behavior:

- `HeroImage`: runtime switch based on `useConvexEnabled()`.
- `HeroImageWithConvex`: hooks for `useQuery(getImageHistory)`.
- `HeroImageBase`: UI + generation logic used by both modes.

Key details in `HeroImageWithConvex`:

```tsx
const imageHistory = useQuery(api.verseImages.getImageHistory, { verseId, refreshToken });
```

`refreshToken` is incremented when a reload is needed (e.g., failed image load).
Persisted images also trigger `recordImageImpression({ imageId })` the first time each displayed image ID is shown on the page.

---

## History Navigation & Selection

`HeroImageBase` keeps image navigation state local:

- `selectedImageId`: `null` means "show newest".
- `pendingImageId`: set after saving a new image to Convex.
- `pendingFollowLatest`: remembers whether the user was on the newest image when generation started.

Navigation behavior:

- History is sorted newest-first, so index `0` is the latest.
- "Older" moves forward in the list; "Newer" moves backward.
- After saving, the component waits until the new ID appears in `imageHistory` before switching.

---

## Persistence + Generation Handshake

When a new image is generated:

1. `/api/generate-image` returns a URL or base64 image data plus `model`, `prompt`, and metadata.
2. The same API route calls `saveImage` server-side (with `serverSecret`) and returns `savedImageId` when persistence succeeds.
3. The UI waits until `getImageHistory` includes `savedImageId` before switching the display.
4. If persistence fails, the API still returns `imageUrl`; the UI displays it as an ephemeral fallback.

A `generation` query param is also sent to the API when there are existing images to encourage variety.

---

## Image Reloads

If an image fails to load:

- The UI attempts to refresh the Convex query via `refreshToken` (up to 3 tries).
- This forces `getImageHistory` to re-run and recover from transient fetch failures.
- If `getImageHistory` still fails after retries, treat the failure as either transient or persistent:
  - **Transient**: network interruptions, timeouts, 429s, and 5xx responses. Keep the image active and continue bounded retry/backoff.
  - **Persistent**: 401/403 permission failures, 404 missing files, checksum/content mismatch, or invalid/corrupted image bytes. Stop automatic retries and move to remediation.

For persistent failures:

- Mark affected records as invalid in image metadata (or soft-delete from history), including reason and timestamp.
- Surface this state in the UI as unavailable/corrupted image history items instead of silently failing.
- Include identifiers in remediation UX and logs (at minimum: `imageId`, user/session ID, and error code).

Recovery playbook (preferred order):

1. Attempt automated re-upload from `sourceImageUrl` (or other original source) when available.
2. Trigger an admin cleanup job to re-validate history, remove/soft-delete broken pointers, and repair ordering/latest selection.
3. Restore storage objects from backup when the original source cannot be recovered.
4. Offer manual regeneration as the final fallback.

Observability requirements:

- Emit structured logs + metrics for persistent failures and each recovery attempt.
- Track identifiers needed for triage/alerting: `imageId`, `verseId`, user/session ID, `generationId`, `providerRequestId`, `storageId`, error class/code, and HTTP status when present.
- Alert operators on persistent-failure rate spikes and repeated failed recoveries.

---

## Environment Requirements

```bash
NEXT_PUBLIC_CONVEX_URL=https://your-deployment-name.convex.cloud
CONVEX_SERVER_SECRET=your-server-secret
# Optional extra host allowlist for remote image fetch persistence
# IMAGE_FETCH_ALLOWLIST=openrouter.ai,*.openrouter.ai
```

`NEXT_PUBLIC_CONVEX_URL` is required for Convex-backed history and generation flows.  
`CONVEX_SERVER_SECRET` is required for server-authenticated persistence writes.  
`IMAGE_FETCH_ALLOWLIST` is optional; defaults include trusted OpenRouter/provider image hosts (see "Remote host allowlist" above for the full list).

For deployment targeting with Convex CLI, use:

- `.env.convex.dev` with `CONVEX_DEPLOYMENT=dev:...`
- `.env.convex.prod` with `CONVEX_DEPLOYMENT=prod:...`

See `llm/workflow/CONVEX_WORKFLOWS.md`.
