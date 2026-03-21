# Nostr Auto-Publishing

High-level behavior for Visibible's optional Nostr publishing flow.

## Overview

When configured, stored verse images are evaluated for Nostr on a recurring
schedule instead of publishing immediately after generation.
The scheduler considers the latest completed 4-hour UTC window and publishes at
most one image from that cohort.

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

Displayed persisted images also record lightweight local impression data on
`verseImages` (`impressionCount`, `lastImpressionAt`) so the scheduler can rank
window candidates without depending on Vercel dashboard data.

## Safety/Resilience

- Idempotency guard prevents duplicate publishing.
- A singleton Convex scheduler state row prevents overlapping cron runs from
  double-publishing the same window.
- Nostr errors are logged but never block generation.
- If image storage falls back to non-permanent source URL mode, Nostr publishing is skipped.

## Key Files

- `convex/nostr.ts`
- `convex/nostrScheduler.ts`
- `convex/http.ts`
- `convex/verseImages.ts`
- `convex/schema.ts`

## Related Docs

- `llm/implementation/NOSTR_IMPLEMENTATION.md`
- `llm/context/IMAGE-GENERATION.md`
- `llm/context/snstr/snstr-readme.md`
