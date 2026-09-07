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
