# Public Image API Implementation

## Goal

Expose a simple read-only public API for already-generated verse images without introducing auth, search, or bulk export complexity in v1.

## Route Contract

Base path: `/api/public/images`

Endpoints:

- `GET /api/public/images`
- `GET /api/public/images/books`
- `GET /api/public/images/books/{book}/chapters`
- `GET /api/public/images/chapters/{book}/{chapter}`
- `GET /api/public/images/verses/{book}/{chapter}/{verse}`
- `GET /api/public/images/verses/{book}/{chapter}/{verse}/images?limit=20&cursor=...`

Response envelope:

- success: `{ data: ... }`
- error: `{ error, message? }`

Public image fields:

- `id`
- `imageUrl`
- `reference`
- `pageUrl`
- `model`
- `translationId`
- `aspectRatio`
- `imageMimeType`
- `imageWidth`
- `imageHeight`
- `createdAt`

Excluded from public responses:

- prompts
- prompt inputs
- cost metadata
- provider request IDs
- source image URLs
- session and analytics fields

## Rate Limits

Convex-backed anonymous IP rate limits:

- `public-images-discovery`: 120/minute
- `public-images-verse`: 60/minute
- `public-images-history`: 30/minute
- `public-images-chapter`: 20/minute

Blocked requests return `429` with `Retry-After`.

## Caching And CORS

CORS headers:

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, X-Request-Id`

Cache headers:

- discovery endpoints: `public, s-maxage=300, stale-while-revalidate=3600`
- verse/chapter/history endpoints: `public, s-maxage=60, stale-while-revalidate=300`

## Data Access Strategy

The public API uses Next.js route handlers as the public boundary and server-secret-protected Convex read functions behind them.

Query strategy:

- books with images: bounded per-book existence checks
- chapters with images: bounded per-chapter existence checks
- verse latest: indexed newest-first lookup on `by_verse`
- verse history: cursor pagination on `by_verse`
- chapter latest-per-verse: one indexed latest lookup per verse in the chapter

Public image URLs prefer permanent Convex HTTP image URLs when `storageId` exists:

1. `NOSTR_IMAGE_BASE_URL`
2. `CONVEX_SITE_URL`
3. `CONVEX_CLOUD_URL`
4. fallback to stored external `imageUrl`

## Why V1 Excludes Search And Prompts

Free-text search would require extra indexing, ranking, and public contract decisions that are unnecessary for the first release.

Prompt exposure is intentionally excluded because prompts are internal generation details and would make the public contract heavier and harder to change.

The first pass is optimized for stable public consumption of the shared image library, not for reproducing or reverse-engineering generation internals.
