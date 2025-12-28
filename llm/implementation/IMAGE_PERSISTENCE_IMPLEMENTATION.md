# Image Persistence Implementation Guide

This document describes how verse image persistence and history browsing are implemented with Convex.

---

## Architecture Overview

Image persistence is optional and is enabled only when `NEXT_PUBLIC_CONVEX_URL` is set. The flow is:

1. `HeroImage` checks whether Convex is available.
2. If enabled, it queries Convex for the verse's image history and saves new images via a Convex action.
3. If disabled, the UI still generates images but does not persist them (browser cache only).

Key entry points:
- `src/components/convex-client-provider.tsx`
- `src/components/hero-image.tsx`
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
  model: v.string(),
  createdAt: v.number(),
})
  .index("by_verse", ["verseId", "createdAt"]);
```

Notes:
- `verseId` is derived from the verse reference string.
- Images are stored newest-first via `createdAt` sorting.
- `imageUrl` is used as a fallback when storage upload fails.

---

## Convex Queries & Mutations

`convex/verseImages.ts` exposes three main operations:

### `getLatestImage` (query)
Returns the newest image for a verse, resolving a storage URL if needed.

### `getImageHistory` (query)
Returns all images for a verse, newest first.

```ts
getImageHistory({ verseId, limit?, refreshToken? })
```

- `limit` can restrict the history length.
- `refreshToken` is a cache-busting value used by the UI to force a re-run of the query.

### `saveImage` (action)
Handles both base64 data URLs and standard URLs:

- **Base64 data URL**: decode to bytes, store in Convex storage, then save `storageId`.
- **Regular URL**: attempt to fetch + store in Convex storage (10s timeout).
- **Fallback**: if fetch fails, store the original URL in `imageUrl`.

Internal mutations:
- `saveImageWithStorage`
- `saveImageWithUrl`

The action returns `{ success: true, type: "storage" | "url", id }`.

---

## Client Integration

### Convex Availability Gate

`src/components/convex-client-provider.tsx` creates the Convex client only when the environment variable is present. It exposes `useConvexEnabled()` for feature gating.

### HeroImage Integration

`src/components/hero-image.tsx` splits behavior:

- `HeroImage`: runtime switch based on `useConvexEnabled()`.
- `HeroImageWithConvex`: hooks for `useQuery(getImageHistory)` and `useAction(saveImage)`.
- `HeroImageBase`: UI + generation logic used by both modes.

Key details in `HeroImageWithConvex`:

```tsx
const imageHistory = useQuery(api.verseImages.getImageHistory, { verseId, refreshToken });
const saveImageAction = useAction(api.verseImages.saveImage);
```

`refreshToken` is incremented when a reload is needed (e.g., failed image load).

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

1. `/api/generate-image` returns a URL or base64 image data plus `model`.
2. `saveImage` action stores the image in Convex and returns the new record ID.
3. The UI waits until `getImageHistory` includes that ID before switching the display.

A `generation` query param is also sent to the API when there are existing images to encourage variety.

---

## Image Reloads

If an image fails to load:

- The UI attempts to refresh the Convex query via `refreshToken` (up to 3 tries).
- This forces `getImageHistory` to re-run and resolve fresh storage URLs.
- If it still fails, the user can manually regenerate a new image.

---

## Environment Requirements

```bash
CONVEX_DEPLOYMENT=prod:your-deployment-name
NEXT_PUBLIC_CONVEX_URL=https://your-deployment-name.convex.cloud
```

These are required to enable persistence in the UI and should match the Convex deployment used for the `verseImages` table.
