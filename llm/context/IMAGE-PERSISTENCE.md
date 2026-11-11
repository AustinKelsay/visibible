# Saved images

[The image route](../../src/app/api/generate-image/route.ts) calls server-secret-protected `saveImage` in [verseImages.ts](../../convex/verseImages.ts). Browser components query history; they do not call this write action directly.

Verse IDs group history by reference (for example `genesis-1-1`), without translation. Records retain translation and generation metadata, so shared history may include multiple translations. [HeroImage](../../src/components/hero-image.tsx) defaults to the latest image and supports older/newer selection; [Navigation](NAVIGATION.md) describes gallery and `?image=` selection.

## Storage and fallback

- `saveImage` stores only image bytes returned with the provider response (a data URL). The data must be padded standard base64, of a declared PNG, JPEG, WebP or GIF type whose parser can read the bytes, and at most 10 MiB. Malformed base64, non-image or mislabelled bytes and oversize data are refused and nothing is saved. When a response names both bytes and a remote URL, the engine takes the bytes ([image-response.ts](../../src/lib/image-response.ts)).
- A remote image URL is refused without being fetched. Convex's runtime cannot resolve a URL's destination, so a fetch could not be kept off private or DNS-rebound addresses, and the 80 most recent production images, back to April 2026, all arrived as data. Remote fetching, the host allowlist (`IMAGE_FETCH_ALLOWLIST`, now unread) and the URL-backed fallback record were removed on 10 November 2026 (#80). Older URL-backed records still read as before.
- A refused or failed save throws; it never creates a record. The image route logs it and still answers with the image, without a `savedImageId`; a generation can therefore succeed in the browser without a durable stored image (#81).

[convex/http.ts](../../convex/http.ts) serves stored bytes at `/image/:storageId`. Image link construction uses `NOSTR_IMAGE_BASE_URL`, then `CONVEX_SITE_URL`, then `CONVEX_CLOUD_URL`; configure a base that actually serves that HTTP route. Storage rows can be reused across browser sessions within the same deployment.

[Public API](PUBLIC-IMAGE-API.md) describes the reduced external response, which intentionally omits prompts and cost details. [Nostr](NOSTR.md) describes scheduled sharing.

The engine's analysis (sections, moments, canon and references) lives in separate tables described in [Analysis storage](ANALYSIS-STORAGE.md); saved image records are not changed by analysis activations or owner corrections.

Reference sheets and style references for the generic engine are image blobs in the same file storage, written by the `storeReferenceBlob` action in the format the model returned and recorded in `referenceImages` with their input versions ([Reference images](WORK-PREPARATION.md#reference-images)). At request time the engine reads them through the server-only `getReferenceBlobUrl` query, converts them to JPEG with sharp, and keeps the JPEG bytes in a bounded per-instance cache (`createReferenceBlobCache`) before sending them inline; they are never fetched from a browser.

## Art style at read time

Images rendered by the generic engine store `artStyleId`; historical images have none and every library read ([verseImages.ts](../../convex/verseImages.ts)) reports them as `classical` through `artStyleOf`. The style-aware queries (`getImageHistory`, `getLatestImage`, `getChapterImageStatus`, `getChapterGallery`, `getBooksWithImages`, `getChaptersWithImages` and the public queries) take an optional `artStyle`, and the browser queries also `otherStyles: true` for an "other styles" view; the filter runs inside the database read so history, counts, markers, existence checks and pages agree. Book and chapter existence checks for one style read the style-leading `by_artStyle_verse` index (Classical also checks images with no stored style); the "other styles" form has no bounded index and scans the range. Omitting the style preserves the previous all-styles behavior. Each record also reports `engine` and `requestTranslationId` (the reader's translation at request time) beside the saved `translationId`, which names the image's own source text.

## Generic-engine provenance

Images saved by the generic engine carry `engine: "generic"` and a `provenance` object: work, moment, section and era, the art style and its file version, the brief version, the prompt version, the work's depiction profile version (from 30 October 2026; earlier images have none), the analysis generation, the selected canon stages with their versions, and the references actually sent with their versions, plus `requestTranslationId`, the reader's selected translation at request time. Images saved before 10 November 2026 also carry `lookVersion` and `planVersion`, the full engine's versions or `none` from the first lean images; newer images omit both ([ADR 0012](../../docs/adr/0012-one-image-call-from-the-text.md)). Their `verseText` is the work's reference text and their `translationId` names it (`web` for the Bible). Both fields are optional: historical images have neither, their source stays unknown, and nothing rewrites them. The accepted request keeps the full `renderingPacket` snapshot, persisted before the provider attempt, so an image can be explained from its request as well as its record.
