# Nostr Auto-Publishing Implementation

This document describes the optional Nostr auto-publishing feature for generated verse images.

---

## Overview

When configured, newly generated verse images are automatically published to Nostr relays as kind-1 text notes with embedded image metadata. Publication is fire-and-forget with a 5-minute delay to disperse posts.

---

## Configuration

**Important:** `NOSTR_PRIVATE_KEY` must be set in the **Convex Dashboard** (Settings → Environment Variables), not in `.env.local`. Convex actions cannot read `.env.local` - they only have access to environment variables configured in the dashboard.

| Variable | Value | Example |
|----------|-------|---------|
| `NOSTR_PRIVATE_KEY` | Hex (64 chars) or nsec format | `nsec1abc...` |

`CONVEX_CLOUD_URL` is a built-in Convex system variable that's automatically available - no manual configuration needed.

If the private key is unset, Nostr publishing is silently skipped.

---

## Architecture

### Files

| File | Purpose |
|------|---------|
| `convex/nostr.ts` | Nostr publishing action (snstr library) |
| `convex/http.ts` | HTTP endpoint for permanent image URLs |
| `convex/verseImages.ts` | Schedules publication, records results |
| `convex/schema.ts` | Nostr metadata fields on `verseImages` |

### Flow

1. `saveImage` action saves image to Convex storage, receives `storageId`
2. Schedules `publishToNostr` via `ctx.scheduler.runAfter(5 * 60 * 1000, ...)` passing `storageId`
3. `publishToNostr` constructs permanent URL from `CONVEX_CLOUD_URL` + `storageId`
4. Connects to relays, creates/signs event with permanent URL, publishes
5. On success, calls `recordNostrPublication` to store event ID and relays

### Permanent Image URLs

Nostr events are immutable - once published, they cannot be edited. To ensure images remain accessible forever, we serve images via a custom HTTP action endpoint:

```
${CONVEX_CLOUD_URL}/image/${storageId}
```

Example: `https://your-deployment.convex.cloud/image/kg2abc123...`

The HTTP endpoint (`convex/http.ts`) fetches from Convex storage and returns the blob with appropriate cache headers.

**Why not `ctx.storage.getUrl()`?** That returns temporary signed URLs that expire. Using those would result in broken images in Nostr posts.

**StorageId Validation:** The endpoint validates that the storageId matches the expected Convex ID format (`/^[A-Za-z0-9_]+$/`) and applies `decodeURIComponent` for URL-encoded segments. Invalid IDs return 400; valid but non-existent IDs return 404.

### Relays

Published to 4 relays (defined in `convex/nostr.ts`):
- `wss://relay.nostr.band`
- `wss://nos.lol`
- `wss://relay.damus.io`
- `wss://relay.primal.net`

---

## Event Format

Kind-1 text note with:

```
Genesis 1:1

"In the beginning, God created the heavens and the earth."

https://<deployment>.convex.cloud/image/<storageId>#.png

View more at https://visibible.com/genesis/1/1
```

### NIP-92 imeta Tag

When image metadata is available, includes imeta tag for enhanced rendering:

```json
["imeta", "url https://...", "m image/png", "dim 1920x1080"]
```

**Note:** Image metadata (mime type, dimensions) is only available when the image was successfully fetched and stored in Convex. If storage failed and only the direct URL was saved, the imeta tag will be minimal (URL only).

### URL Extension Hint

For legacy clients that don't support NIP-92, the image URL includes a fragment extension hint:
```
https://storage-url.com/abc123#.png
```

---

## Schema Fields

Added to `verseImages` table:

```typescript
nostrEventId: v.optional(v.string()),     // Nostr event ID
nostrPublishedAt: v.optional(v.number()), // Unix timestamp
nostrRelays: v.optional(v.array(v.string())), // Relay URLs
```

---

## Library

Uses [snstr](https://github.com/AustinKelsay/snstr) - a TypeScript Nostr library.

```typescript
// convex/nostr.ts (requires "use node" directive)
const { Nostr, createEvent, signEvent, getPublicKey, getEventHash, decodePrivateKey } = await import("snstr");
```

### API Pattern

The `Nostr` client handles relay connections; standalone functions handle event creation/signing:

| Function | Signature | Purpose |
|----------|-----------|---------|
| `decodePrivateKey` | `(nsec: string) => string` | Convert nsec bech32 to hex |
| `getPublicKey` | `(hexKey: string) => string` | Derive pubkey from hex private key |
| `createEvent` | `(template, pubkey) => UnsignedEvent` | Create unsigned event with pubkey |
| `getEventHash` | `(event) => Promise<string>` | Compute deterministic event ID |
| `signEvent` | `(eventId, hexKey) => Promise<string>` | Sign event ID with hex private key |
| `client.publishEvent` | `(signedEvent) => Promise<Result>` | Broadcast to connected relays |

### Key Format Handling

Both hex (64-char) and nsec (bech32) private key formats are supported:

```typescript
const hexKey = privateKey.startsWith("nsec1")
  ? decodePrivateKey(privateKey as `nsec1${string}`)
  : privateKey;
```

**Note:** The `Nostr` client is only used for relay connection management (`connectToRelays`, `publishEvent`, `disconnectFromRelays`). Event signing uses standalone functions with the hex key passed directly—do NOT call `client.setPrivateKey()` as it has no effect on manually signed events.

**API Quirk:** `connectToRelays()` returns `Promise<void>` (async), but `disconnectFromRelays()` returns `void` (sync). Do not `await` the disconnect call.

**Important:** The event ID is computed *before* publishing via `getEventHash()`. Always use this pre-computed ID for recording publications rather than parsing the result of `publishEvent()`, as the return type may vary across snstr versions.

---

## Idempotency

The `publishToNostr` action includes an idempotency check to prevent duplicate posts:

1. Queries the image document via `getImageById`
2. If image doesn't exist (deleted), skips publication
3. If `nostrEventId` already set, skips publication

**Note:** Convex scheduled actions execute at-most-once and are NOT automatically retried ([docs](https://docs.convex.dev/scheduling/scheduled-functions)). This check is defensive programming for edge cases like manual re-triggering or future code changes—not for scheduler retries.

---

## Error Handling

- Missing `NOSTR_PRIVATE_KEY`: Silently skipped with log message
- Missing `CONVEX_CLOUD_URL`: Silently skipped with log message (rare - built-in variable)
- Image not found: Skipped (may have been deleted)
- Already published: Skipped (idempotency check)
- Relay connection failures: Caught and logged, doesn't affect image save
- Publication failures: Logged but don't block the main flow

Fire-and-forget design ensures Nostr issues never impact image generation.

---

## Testing

Verify publication by searching for your public key on:
- https://nostr.band
- https://primal.net

---

## Future Considerations

- Retry logic for failed publications
- User opt-in/opt-out preference
- Multiple account support
- Zap integration for image tips
