# Nostr Auto-Publishing

High-level behavior for Visibible's optional Nostr publishing flow.

## Overview

When configured, newly generated verse images are published to Nostr as background work.
The app delays publish by 5 minutes and does not block user flows on Nostr outcomes.

## Configuration

Configured via Convex env vars:

- `NOSTR_PRIVATE_KEY` (required to publish)
- `NOSTR_RELAYS` (optional override list)
- `NOSTR_IMAGE_BASE_URL` (optional URL base override)

Image base URL resolution order:
1. `NOSTR_IMAGE_BASE_URL`
2. `CONVEX_SITE_URL`
3. `CONVEX_CLOUD_URL`

If key or URL base is missing, publication is skipped.

## Relays

Default relay set:
- `wss://relay.nostr.band`
- `wss://nos.lol`
- `wss://relay.damus.io`
- `wss://relay.primal.net`

If `NOSTR_RELAYS` is provided, only valid `wss://` values are used.

## Post Shape

Each post includes:
- scripture reference
- verse text
- permanent image URL (`/image/:storageId`) with extension hint fragment
- canonical Visibible verse URL

When available, post tags include NIP-92 `imeta` metadata (`url`, mime type, dimensions).

## Data Recording

Successful publishes write:
- `nostrEventId`
- `nostrPublishedAt`
- `nostrRelays`

on the corresponding `verseImages` row.

## Safety/Resilience

- Idempotency guard prevents duplicate publishing.
- Nostr errors are logged but never block generation.
- If image storage falls back to non-permanent source URL mode, Nostr publishing is skipped.

## Key Files

- `convex/nostr.ts`
- `convex/http.ts`
- `convex/verseImages.ts`
- `convex/schema.ts`

## Related Docs

- `llm/implementation/NOSTR_IMPLEMENTATION.md`
- `llm/context/IMAGE-GENERATION.md`
- `llm/context/snstr/snstr-readme.md`
