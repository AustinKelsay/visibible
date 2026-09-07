# Scheduled Nostr publishing

[crons.ts](../../convex/crons.ts) runs [nostrScheduler.ts](../../convex/nostrScheduler.ts) hourly. It considers the latest completed four-hour UTC window and selects at most one eligible stored image from that window, rather than posting every generation.

Eligible images have storage, reference and verse text and no recorded Nostr event. [nostrScheduling.ts](../../convex/lib/nostrScheduling.ts) ranks by Convex-tracked impressions and falls back to random selection when no candidate has impressions. The scheduler records window/claim state to coordinate runs; it does not drain all older windows after downtime.

## Convex configuration

- `NOSTR_PRIVATE_KEY`: hex or nsec key, required to publish.
- `NOSTR_RELAYS`: optional comma/newline-separated `wss://` URLs; defaults are in [nostr.ts](../../convex/nostr.ts).
- Image URL base: `NOSTR_IMAGE_BASE_URL`, then `CONVEX_SITE_URL`, then `CONVEX_CLOUD_URL`. Configure a public base that serves `/image/:storageId` through [http.ts](../../convex/http.ts).

These variables belong in the Convex deployment environment. Missing key/base skips publication. URL-only fallback images are excluded because their source URL may expire.

## Publication and failure semantics

[nostr.ts](../../convex/nostr.ts) runs in the Node action runtime and dynamically imports `snstr`. It creates/signs the event, connects to relays, publishes, and disconnects in `finally`. Posts include Scripture text/reference, the image URL, a verse-page URL and available `imeta` image metadata.

Successful recording writes event ID, publication time and relays to the image row. Existing event IDs and scheduler state provide duplicate guards, not a transaction spanning relays and Convex. A publish that succeeds externally but fails to record locally is treated as a terminal scheduler outcome to avoid automatic republishing that window.

Publishing failures do not block image generation. [Scheduler tests](../../convex/lib/__tests__/nostrScheduling.test.ts) cover window, ranking and lock helpers. Impression data is separate from Vercel client analytics.
