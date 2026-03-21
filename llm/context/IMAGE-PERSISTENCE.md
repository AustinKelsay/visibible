# Image Persistence Context

High-level overview of how verse images are persisted and browsed. Details may change.

## Overview

- When Convex is configured, every generated image is saved per verse and reused across sessions.
- A verse can have multiple images; users can browse older/newer images in the hero image dock.
- Users can optionally enable a primary chapter gallery view that groups all saved images by verse in mini-galleries, newest-first within each verse.
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
- New images are persisted by the server (`/api/generate-image` -> `api.verseImages.saveImage`) and appended to history.
- History is shared across devices for the same Convex deployment.
- Browser code does not call `saveImage` directly; persistence writes are server-authenticated with `CONVEX_SERVER_SECRET`.
- Remote URL persistence fetches are restricted by host allowlist + local/private host blocking and image MIME/size validation.

## Browsing History

- Controls in the hero image dock let users move to newer/older images.
- The image count indicator shows the current position and total (e.g., `3 / 7 · Latest`).
- Selecting older images does not change the verse content; it only swaps the displayed art.
- The optional chapter gallery uses a chapter-scoped query to fetch all saved images for the chapter, grouped by verse, and falls back to placeholders for verses without art.
- The chapter gallery toggle is stored as a user preference and is off by default.

## Visual Indicators

- Accent dots indicate verses with images across the UI:
  - **Verse Strip** (`src/components/verse-strip.tsx`): Shows stacked dots below each verse number
  - **Book Menu** (`src/components/book-menu.tsx`): Shows single dots next to books, chapters, and verses with images
  - **Onboarding Modal** (`src/components/buy-credits-modal.tsx`): Shows stacked dots in the MiniVerseStrip demo component
- Dot styling:
  - Size: `w-2 h-2` (8px) for better visibility
  - Outline: Subtle `border border-[var(--background)]/30` for definition
  - Stacked dots: Overlapping with 6px spacing between dots (capped at 3 dots for cleanliness)
  - Colors: Accent color for verses with images, muted for verses without images
- This lets users quickly see which verses have multiple images to explore.

## Dependencies

- `NEXT_PUBLIC_CONVEX_URL` enables Convex-backed history queries and generation flows.
- `CONVEX_SERVER_SECRET` is required for server-authenticated image persistence writes.
- `IMAGE_FETCH_ALLOWLIST` (optional) extends allowed hosts for server-side image fetch persistence.
- `CONVEX_DEPLOYMENT` is used by Convex CLI targeting (`.env.convex.dev` / `.env.convex.prod`), not by Next.js runtime on Vercel.
