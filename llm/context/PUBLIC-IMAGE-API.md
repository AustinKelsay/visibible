# Public image API

The app serves its consumer reference at `/api-docs`, implemented by [the docs page](../../src/app/api-docs/page.tsx) and [public-image-docs.ts](../../src/lib/public-image-docs.ts). The read-only base path is `/api/public/images`.

Endpoints cover discovery, books with images, chapters with images, latest image for a verse, cursor-paginated verse history, and latest image per verse in a chapter. There is no free-text search or bulk export endpoint. Route handlers live under [src/app/api/public/images](../../src/app/api/public/images).

[public-image-api.ts](../../src/lib/public-image-api.ts) supplies validation, envelopes, CORS, cache policy, rate limiting and serialization. Successful responses use `{ data: ... }`; errors use `{ error, message? }`. Browser CORS allows GET/OPTIONS from any origin. Convex and the matching server secret must be configured even though callers do not authenticate.

Public payloads expose selected image metadata and page/image URLs, omitting prompts, costs, provider request IDs, source image URLs and session/analytics fields. [verseImages.ts](../../convex/verseImages.ts) supplies server-protected reads. This HTTP contract does not describe every browser-callable Convex query.

Rate limits are IP-scoped and defined in [rateLimit.ts](../../convex/rateLimit.ts). HTTP 429 includes `Retry-After`. Cache TTLs live in the shared helper; cached responses can remain visible after a new generation. URL-only records can still depend on expiring external URLs; [Image persistence](IMAGE-PERSISTENCE.md) explains the distinction.

Use [public image route tests](../../src/app/api/__tests__/public-images/route.test.ts), [helper tests](../../src/lib/__tests__/public-image-api.test.ts), and [docs tests](../../src/lib/__tests__/public-image-docs.test.ts) to keep runtime and consumer docs aligned.
