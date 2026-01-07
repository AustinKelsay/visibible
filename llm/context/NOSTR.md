# Nostr Auto-Publishing

High-level overview of how Visibible publishes generated images to Nostr.

## Overview

When configured with a Nostr private key, newly generated verse images are automatically published to Nostr relays as kind-1 text notes. This is an optional feature that runs fire-and-forget in the background.

## How It Works

1. User generates a verse image
2. Image is saved to Convex storage
3. After 5-minute delay, image is published to Nostr
4. Event ID and relay list are recorded on the image record

The delay disperses posts over time rather than publishing immediately. Publishing includes a defensive idempotency check (verifies image exists and hasn't been published) for edge cases like manual re-triggering. Note: Convex scheduled actions execute at-most-once and don't automatically retry.

## Configuration

Requires one environment variable set in the **Convex Dashboard** (not `.env.local`):
- `NOSTR_PRIVATE_KEY` - hex or nsec format private key

`CONVEX_CLOUD_URL` is a built-in Convex system variable (no manual config needed).

If the private key is unset, publishing is silently skipped.

## Relays

Images are published to:
- relay.nostr.band
- nos.lol
- relay.damus.io
- relay.primal.net

## Post Format

```
Genesis 1:1

"In the beginning, God created the heavens and the earth."

https://<deployment>.convex.cloud/api/storage/<storageId>#.png

View more at https://visibible.com/genesis/1/1
```

Uses permanent Convex storage URLs via `CONVEX_CLOUD_URL` (not expiring signed URLs). Includes NIP-92 imeta tag with image URL, mime type, and dimensions when available.

## Key Files

| File | Purpose |
|------|---------|
| `convex/nostr.ts` | Publishing action using snstr library |
| `convex/verseImages.ts` | Schedules publication on image save |
| `convex/schema.ts` | Nostr metadata fields |

## Related Docs

- Implementation details: `llm/implementation/NOSTR_IMPLEMENTATION.md`
- snstr library reference: `llm/context/snstr/snstr-readme.md`
- Image generation: `llm/context/IMAGE-GENERATION.md`
