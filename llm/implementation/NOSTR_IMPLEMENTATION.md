# Nostr Auto-Publishing Implementation

This document describes the current Nostr auto-publishing implementation for generated verse images.

---

## Overview

When enabled, images stored in Convex are published to Nostr as kind-1 notes with image metadata.
Publishing is asynchronous and scheduled 5 minutes after image persistence.

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
| `convex/http.ts` | Permanent `/image/:storageId` HTTP endpoint |
| `convex/verseImages.ts` | Schedules publish and records publication metadata |
| `convex/schema.ts` | `nostrEventId`, `nostrPublishedAt`, `nostrRelays` fields |

---

## End-to-End Flow

1. `saveImage` stores image bytes in Convex storage.
2. `saveImage` schedules `internal.nostr.publishToNostr` with 5-minute delay.
3. `publishToNostr` checks:
   - private key exists
   - image record exists
   - image is not already published (`nostrEventId` absent)
4. Action builds permanent URL: `<base>/image/<encoded storageId>`.
5. Action connects to relays, signs event, publishes.
6. Action records publication via `recordNostrPublication`.

### Important branch

If image storage fails and the system falls back to `saveImageWithUrl`, Nostr publishing is intentionally skipped because source URLs may be temporary and Nostr events are immutable.

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
- pre-computes `eventId` using `getEventHash()` before publish
- persists that precomputed ID after successful publish
- always disconnects relay client in `finally`

---

## Idempotency and Failure Handling

Idempotency checks:
- skip if image record does not exist
- skip if `nostrEventId` already exists

Failure behavior:
- any relay/publish/signing error is logged
- publication failure does not block image generation/persistence

Convex scheduled actions are at-most-once; idempotency checks are defensive for manual re-runs and future code changes.

---

## Stored Metadata

On successful publish, `verseImages` is patched with:

- `nostrEventId`
- `nostrPublishedAt`
- `nostrRelays`
