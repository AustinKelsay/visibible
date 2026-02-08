# snstr Integration Notes (Visibible)

This document describes how `snstr` is used in this repository.

## Scope

This is **not** the full upstream `snstr` project README.
It is a repo-local integration reference for `convex/nostr.ts`.

## Dependency

- Package: `snstr`
- Declared in: `package.json`
- Current version in this repo: `^0.1.10`

## Where It Is Used

- `convex/nostr.ts` (Node runtime Convex action)

No other app route or component imports `snstr` directly.

## Runtime Requirements

- The action file uses `"use node"`.
- `snstr` is loaded via dynamic import inside the action handler:

```typescript
const { Nostr, createEvent, signEvent, getPublicKey, getEventHash, decodePrivateKey } = await import("snstr");
```

This keeps the dependency in the Node action path (not the edge/runtime client path).

## APIs Used by Visibible

- `new Nostr(relays)`
- `client.connectToRelays()`
- `client.publishEvent(event)`
- `client.disconnectFromRelays()`
- `decodePrivateKey(nsec)`
- `getPublicKey(hexPrivateKey)`
- `createEvent(template, pubkey)`
- `getEventHash(unsignedEvent)`
- `signEvent(eventId, hexPrivateKey)`

## Current Integration Pattern

1. Load private key from Convex env (`NOSTR_PRIVATE_KEY`).
2. Normalize to hex key (supports both hex and `nsec1...`).
3. Build image URL from configured base (`NOSTR_IMAGE_BASE_URL`), then Convex system fallbacks.
4. Build content string and NIP-92 `imeta` tag.
5. Create unsigned event, compute event hash, sign it.
6. Publish to relays.
7. Record `eventId`, relay list, and timestamp in `verseImages`.

## Operational Notes

- `connectToRelays()` is async and awaited.
- `disconnectFromRelays()` is called in `finally` and is not awaited.
- Event ID is computed before publish (`getEventHash`) and that precomputed ID is persisted.
- Publication is skipped if the image already has `nostrEventId` (idempotency guard).

## Relay Configuration

`convex/nostr.ts` supports:

- `NOSTR_RELAYS` (optional): comma/newline-separated relay URLs, `wss://` only
- Default relay list when unset or invalid

## Repo-Specific Warning

This repo does **not** include upstream `snstr` examples/tests/scripts.
Script patterns like `example:*` and paths like `src/nip01/*` are not part of Visibible.

If you need the full library docs, use the upstream project documentation directly.
