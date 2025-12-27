# Navigation Context

High-level overview of how Visibible navigation works. Details may change.

## Overview

Visibible provides three ways to navigate the Bible:

1. **URL-based** — Direct links like `/genesis/1/1` or `/john/3/16`.
2. **Arrow navigation** — Prev/next buttons that cross chapter and book boundaries.
3. **Book menu** — Book icon menu with collapsible book/chapter picker.

## URL Structure

```
/{book}/{chapter}/{verse}
```

Examples:
- `/genesis/1/1` — Genesis 1:1
- `/john/3/16` — John 3:16
- `/1-samuel/17/50` — 1 Samuel 17:50
- `/revelation/22/21` — Last verse of the Bible

## Arrow Navigation

Arrows appear on the hero image and below the scripture text.

Navigation is seamless across boundaries:
- Genesis 1:31 → Genesis 2:1 (next chapter)
- Genesis 50:26 → Exodus 1:1 (next book)
- Matthew 1:1 → Malachi 4:6 (previous book, OT→NT boundary)

At the extremes:
- Genesis 1:1 has no previous (start of Bible)
- Revelation 22:21 has no next (end of Bible)

## Book Menu

Book icon in the header opens a slide-out panel:

1. **Testament sections** — Collapsible Old Testament (39 books) and New Testament (27 books).
2. **Book list** — Click a book to see its chapters.
3. **Chapter grid** — Click a chapter number to navigate to verse 1.

## Entry Points

- Navigation helpers: `src/lib/navigation.ts`
- Book menu UI: `src/components/book-menu.tsx`
- Menu state: `src/context/navigation-context.tsx`
- Header with menu trigger: `src/components/header.tsx`
- Arrow navigation: `src/components/hero-image.tsx`, `src/components/scripture-reader.tsx`
