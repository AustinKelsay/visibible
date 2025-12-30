# Image Persistence Context

High-level overview of how verse images are persisted and browsed. Details may change.

## Overview

- When Convex is configured, every generated image is saved per verse and reused across sessions.
- A verse can have multiple images; users can browse older/newer images in the hero image dock.
- The newest image is shown by default, and the "New image" action always generates another one.
- Each saved image stores the generating model and displays a small model badge in the UI.
- If Convex is not enabled, images are ephemeral and only benefit from browser HTTP caching.

## Verse Identity

- Verse ID is derived from the human reference string:
  - "Genesis 1:1" -> `genesis-1-1`
  - "1 John 3:16" -> `1-john-3-16`
- The verse ID (used for grouping) does not include translation, so history can include images generated from different translations of the same verse. Each image record stores its `translationId` for traceability.

## Persistence Behavior

- On page load, the app queries Convex for the verse's image history (newest first).
- If history is empty, the hero image auto-generates the first image.
- New images are appended to the history and become immediately browseable.
- History is shared across devices for the same Convex deployment.

## Browsing History

- Controls in the hero image dock let users move to newer/older images.
- The image count indicator shows the current position and total (e.g., `3 / 7 (Latest)`).
- Selecting older images does not change the verse content; it only swaps the displayed art.

## Dependencies

- `NEXT_PUBLIC_CONVEX_URL` enables Convex image persistence on the client.
- `CONVEX_DEPLOYMENT` configures the Convex backend (see `.env.example`).
