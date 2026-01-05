# Navigation Context

High-level overview of how Visibible navigation works. Details may change.

## Overview

Visibible provides three ways to navigate the Bible:

1. **URL-based** — Direct links like `/genesis/1/1` or `/john/3/16`.
2. **Arrow navigation** — Prev/next buttons that cross chapter and book boundaries.
3. **Book menu** — BookOpen icon menu with collapsible book/chapter picker.

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

Arrows appear in the hero image Control Dock and below the scripture text.

Navigation is seamless across boundaries:
- Genesis 1:31 → Genesis 2:1 (next chapter)
- Genesis 50:26 → Exodus 1:1 (next book)
- Matthew 1:1 → Malachi 4:6 (previous book, OT→NT boundary)

At the extremes:
- Genesis 1:1 has no previous (start of Bible)
- Revelation 22:21 has no next (end of Bible)

## Book Menu

BookOpen icon in the header opens a slide-out panel:

1. **Testament sections** — Collapsible Old Testament (39 books) and New Testament (27 books).
2. **Book list** — Click a book to see its chapters. Books with existing images show an accent dot.
3. **Chapter grid** — Click a chapter number to see its verses. Chapters with images show an accent dot.
4. **Verse grid** — Click a verse number to navigate to that verse. Verses with images show an accent dot.

The accent dots indicate which books/chapters/verses have AI-generated images (requires Convex).

## Chat Sidebar

The NavigationContext manages the chat sidebar state:

- `isChatOpen`, `openChat`, `closeChat`, `toggleChat` — Controls sidebar visibility
- `sidebarTab`, `setSidebarTab`, `openFeedback` — Controls which tab is active (Chat or Feedback)
- `chatContext`, `setChatContext` — Stores verse data (book, chapter, verses, prev/next) passed to the chat AI

**Sidebar Tabs:**
The sidebar has two tabs:
1. **Chat** — AI chat interface for asking about verses
2. **Feedback** — Simple form for submitting user feedback

Calling `openChat()` opens to the Chat tab. Calling `openFeedback()` opens to the Feedback tab.

**Context Source:** Verse pages use `ChatContextSetter` component (`src/components/chat-context-setter.tsx`) to set the chat context when mounted. This client component calls `setChatContext` on mount and clears it on unmount.

**Keyboard Shortcut:** Pressing Escape closes the sidebar when it's open.

**Responsive Behavior:**
- Desktop (md+): Fixed 384px width on right side
- Mobile: Full width overlay with backdrop (click backdrop to close)

## Feedback Prompt

A popout CTA that occasionally appears to ask users for feedback:

- **Trigger**: Shows after 5-15 random verse visits
- **Cooldown**: 24 hours after dismissal before showing again
- **Position**: Above the ChatPrompt on mobile, same position on desktop
- **Action**: Clicking opens the sidebar to the Feedback tab

See `llm/context/FEEDBACK.md` for more details.

## Verse Strip

A horizontal scrollable strip below the hero image showing all verses in the current chapter:
- Current verse is highlighted with accent color
- Verses with images show an accent dot
- Verses without images show a muted dot
- Click any verse to navigate directly

## Entry Points

- Navigation helpers: `src/lib/navigation.ts`
- Book menu UI: `src/components/book-menu.tsx`
- Menu state: `src/context/navigation-context.tsx`
- Header with menu trigger: `src/components/header.tsx`
- Arrow navigation: `src/components/hero-image.tsx`, `src/components/scripture-reader.tsx`
- Verse strip navigator: `src/components/verse-strip.tsx`
- Chat sidebar (with tabs): `src/components/chat-sidebar.tsx`
- Chat context setter: `src/components/chat-context-setter.tsx`
- Feedback form: `src/components/feedback.tsx`
- Feedback prompt: `src/components/feedback-prompt.tsx`

## Related Docs

- Feedback feature: `llm/context/FEEDBACK.md`
- Image persistence & history browsing: `llm/context/IMAGE-PERSISTENCE.md`
- Image generation flow: `llm/context/IMAGE-GENERATION.md`
