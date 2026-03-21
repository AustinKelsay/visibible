# Nostr Auto-Publishing Implementation

This document describes the current Nostr auto-publishing implementation for generated verse images.

---

## Overview

When enabled, images stored in Convex are published to Nostr as kind-1 notes with image metadata.
Publishing is asynchronous and scheduler-driven:

- image generation persists all eligible images to Convex as usual
- a recurring Convex cron evaluates the latest completed 4-hour UTC window
- the scheduler posts at most one image from that window
- selection prefers the unposted image with the highest local impression count
- if the window has no impressions yet, selection falls back to a random eligible image

---

## Configuration

Set these in Convex environment variables (not `.env.local`):

| Variable | Required | Purpose |
|----------|----------|---------|
| `NOSTR_PRIVATE_KEY` | Yes (for publishing) | Nostr private key (`hex` 64 chars or `nsec1...`) |
| `NOSTR_RELAYS` | No | Comma/newline-separated relay list; only `wss://` URLs are accepted |
| `NOSTR_IMAGE_BASE_URL` | No | Explicit public base URL for image links in Nostr posts |

Built-in Convex fallbacks for image base URL:
1. `NOSTR_IMAGE_BASE_URL`
2. `CONVEX_SITE_URL`
3. `CONVEX_CLOUD_URL`

If `NOSTR_PRIVATE_KEY` is missing, publication is skipped.
If no image base URL can be resolved, publication is skipped.

---

## Files

| File | Purpose |
|------|---------|
| `convex/nostr.ts` | Publish action, relay parsing, event creation/signing |
| `convex/nostrScheduler.ts` | Window claiming, candidate selection, retry-safe orchestration |
| `convex/http.ts` | Permanent `/image/:storageId` HTTP endpoint |
| `convex/verseImages.ts` | Stores images, records impressions, records publication metadata |
| `convex/schema.ts` | Nostr metadata, impression counters, scheduler state |
| `convex/lib/nostrScheduling.ts` | Pure window/tie-break/random-fallback helper logic |

---

## End-to-End Flow

1. `saveImage` stores image bytes in Convex storage.
2. `src/components/hero-image.tsx` records one local impression for each persisted image the user actually views.
3. `convex/crons.ts` runs an hourly scheduler tick at `minuteUTC: 0`.
4. `internal.nostrScheduler.publishTopImageForLatestWindow` computes the latest completed 4-hour UTC window.
5. `claimScheduledImageForWindow`:
   - skips if that window was already processed
   - reuses an in-flight image if a stale retry is needed
   - otherwise selects the best eligible image for the window
   - records singleton scheduler state to avoid overlapping publishes
6. `publishToNostr` checks:
   - private key exists
   - image record exists
   - image is not already published (`nostrEventId` absent)
7. Action builds permanent URL: `<base>/image/<encoded storageId>`.
8. Action connects to relays, signs event, publishes.
9. Action records publication via `recordNostrPublication`.
10. Scheduler marks the window complete for terminal outcomes (`published`, `already_published`, `image_missing`, `record_failed`) and leaves the window claimed for later retry on transient failures (`config_missing`, `publish_failed`).
11. Completion and failure timestamps are captured at the moment the scheduler finalizes the window so state like `lastPublishedAt` and retry timing reflect the actual end of the publish attempt.

### Important branch

If image storage fails and the system falls back to `saveImageWithUrl`, Nostr publishing is intentionally skipped because source URLs may be temporary and Nostr events are immutable.

Only stored images with `storageId`, `reference`, and `verseText` participate in scheduled selection.

---

## Permanent Image URLs

`convex/http.ts` exposes `GET /image/:storageId` and serves blobs from Convex storage.

Validation behavior:
- decodes URL segment with `decodeURIComponent`
- enforces `^[A-Za-z0-9_]+$` storage ID format
- returns `400` for invalid IDs
- returns `404` for missing blobs

Response headers:
- `Content-Type`: inferred blob type (fallback `image/png`)
- `Cache-Control: public, max-age=31536000, immutable`

---

## Relay Behavior

Default relays (when `NOSTR_RELAYS` is unset or invalid):
- `wss://relay.nostr.band`
- `wss://nos.lol`
- `wss://relay.damus.io`
- `wss://relay.primal.net`

`NOSTR_RELAYS` parsing details:
- split on commas/newlines
- trim and de-duplicate
- keep only entries starting with `wss://`
- log warning for dropped invalid entries

---

## Event Format

The published kind-1 note content is:

```text
<reference>

"<verseText>"

<imageUrlWithExtensionHint>

View more at https://visibible.com/<book>/<chapter>/<verse>
```

Additional metadata:
- NIP-92 `imeta` tag: includes `url`, and when available `m` (mime) and `dim` (`width x height`)
- URL extension hint fragment (`#.jpg`, `#.png`, etc.) for legacy client compatibility

---

## snstr API Pattern

`convex/nostr.ts` uses:
- `Nostr` client for relay transport
- standalone helpers for key/event operations (`decodePrivateKey`, `getPublicKey`, `createEvent`, `getEventHash`, `signEvent`)

Implementation details:
- precomputes `eventId` using `getEventHash()` before publish
- persists that precomputed ID after successful publish
- always disconnects relay client in `finally`

---

## Idempotency and Failure Handling

Idempotency checks:
- skip if image record does not exist
- skip if `nostrEventId` already exists
- skip reprocessing windows already marked complete in `nostrPublishingState`
- keep a single in-flight window/image lock so overlapping cron runs do not double-publish

Failure behavior:
- any relay/publish/signing error is logged
- publication failure does not block image generation/persistence
- transient scheduler failures keep the claimed window/image in Convex state so a later cron tick can retry safely

Selection behavior:
- only images created within the latest completed 4-hour UTC window are considered
- highest `impressionCount` wins
- ties break by most recent `lastImpressionAt`, then newest `createdAt`
- if every eligible image has zero impressions, the scheduler chooses a random image from the window

Convex scheduled actions are at-most-once; idempotency checks are defensive for manual re-runs and future code changes.

---

## Stored Metadata

On successful publish, `verseImages` is patched with:

- `nostrEventId`
- `nostrPublishedAt`
- `nostrRelays`

Displayed persisted images also patch `verseImages` with:

- `impressionCount`
- `lastImpressionAt`

Scheduler coordination state lives in `nostrPublishingState`:

- `lastProcessedWindowStart`
- `processingWindowStart`
- `processingStartedAt`
- `processingImageId`
- `lastOutcome`
- `lastPublishedImageId`
- `lastPublishedAt`
