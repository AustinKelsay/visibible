# Saved images

[The image route](../../src/app/api/generate-image/route.ts) calls server-secret-protected `saveImage` in [verseImages.ts](../../convex/verseImages.ts). Browser components query history; they do not call this write action directly.

Verse IDs group history by reference (for example `genesis-1-1`), without translation. Records retain translation and generation metadata, so shared history may include multiple translations. [HeroImage](../../src/components/hero-image.tsx) defaults to the latest image and supports older/newer selection; [Navigation](NAVIGATION.md) describes gallery and `?image=` selection.

## Storage and fallback

- Data URLs are decoded and validated before Convex storage. Remote URLs are checked against a host allowlist before fetch, then validated for image MIME type and size (10 MiB maximum).
- `IMAGE_FETCH_ALLOWLIST` extends the built-in host list. Set it in the **Convex deployment environment**, where `saveImage` runs.
- URL validation checks hostname/IP literals, not DNS resolution. Remote fetch follows redirects without revalidating the destination. These checks are not a complete network-level SSRF boundary.
- Non-validation fetch/storage failures on the remote URL path fall back to a URL-backed record. Such URLs may expire and are excluded from scheduled Nostr publication. Validation failures are rejected.
- A generation can succeed even if persistence fails; only successful storage establishes a durable stored image.

[convex/http.ts](../../convex/http.ts) serves stored bytes at `/image/:storageId`. Image link construction uses `NOSTR_IMAGE_BASE_URL`, then `CONVEX_SITE_URL`, then `CONVEX_CLOUD_URL`; configure a base that actually serves that HTTP route. Storage rows can be reused across browser sessions within the same deployment.

[Public API](PUBLIC-IMAGE-API.md) describes the reduced external response, which intentionally omits prompts and cost details. [Nostr](NOSTR.md) describes scheduled sharing.

The engine's analysis (canon, looks, plans, references) lives in separate tables described in [Analysis storage](ANALYSIS-STORAGE.md); saved image records are not changed by analysis activations or owner corrections.

Reference sheets and style references for the generic engine are image blobs in the same file storage, written by the `storeReferenceBlob` action in the format the model returned and recorded in `referenceImages` with their input versions ([Reference images](WORK-PREPARATION.md#reference-images)). At request time the engine reads them through the server-only `getReferenceBlobUrl` query, converts them to JPEG with sharp, and keeps the JPEG bytes in a bounded per-instance cache (`createReferenceBlobCache`) before sending them inline; they are never fetched from a browser.

## Art style at read time

Images rendered by the generic engine store `artStyleId`; historical images have none and every library read ([verseImages.ts](../../convex/verseImages.ts)) reports them as `classical` through `artStyleOf`. The style-aware queries (`getImageHistory`, `getLatestImage`, `getChapterImageStatus`, `getChapterGallery`, `getBooksWithImages`, `getChaptersWithImages` and the public queries) take an optional `artStyle`, and the browser queries also `otherStyles: true` for an "other styles" view; the filter runs inside the database read so history, counts, markers, existence checks and pages agree. Book and chapter existence checks for one style read the style-leading `by_artStyle_verse` index (Classical also checks images with no stored style); the "other styles" form has no bounded index and scans the range. Omitting the style preserves the previous all-styles behavior. Each record also reports `engine` and `requestTranslationId` (the reader's translation at request time) beside the saved `translationId`, which names the image's own source text.

## Generic-engine provenance

Images saved by the generic engine carry `engine: "generic"` and a `provenance` object: work, moment, section and era, the art style and its file version, the brief version, the look and plan versions, the prompt version, the work's depiction profile version (from 30 October 2026; earlier images have none), the analysis generation, the selected canon stages with their versions, and the references actually sent with their versions, plus `requestTranslationId`, the reader's selected translation at request time. Their `verseText` is the work's reference text and their `translationId` names it (`web` for the Bible). Both fields are optional: historical images have neither, their source stays unknown, and nothing rewrites them. The accepted request keeps the full `renderingPacket` snapshot, persisted before the provider attempt, so an image can be explained from its request as well as its record.
