# Navigation Implementation Guide

This document describes how Visibible handles navigation across the entire Bible.

---

## Architecture Overview

Navigation consists of six parts:

1. **Navigation Helpers** (`navigation.ts`) — Pure functions for prev/next logic.
2. **Navigation Context** (`navigation-context.tsx`) — React context for menu and chat sidebar state.
3. **Book Menu** (`book-menu.tsx`) — Slide-out panel for book/chapter selection with image indicators.
4. **Arrow Navigation** — Embedded in `hero-image.tsx` (Control Dock) and `scripture-reader.tsx`.
5. **Verse Strip** (`verse-strip.tsx`) — Horizontal verse navigator with image indicators.
6. **Chat Sidebar State** — Manages chat panel visibility and verse context for AI.

---

## Navigation Helpers

### File: `src/lib/navigation.ts`

Pure functions that calculate navigation without side effects.

### Data Types

```typescript
interface VerseLocation {
  book: BibleBook;   // From bible-structure.ts, includes chapters array (verse counts)
  chapter: number;
  verse: number;
}
```

### Core Functions

#### `getNextVerse(current: VerseLocation): VerseLocation | null`

Returns the next verse, crossing chapter and book boundaries.

```typescript
// Same chapter
getNextVerse({ book: genesis, chapter: 1, verse: 5 })
// → { book: genesis, chapter: 1, verse: 6 }

// Next chapter
getNextVerse({ book: genesis, chapter: 1, verse: 31 })
// → { book: genesis, chapter: 2, verse: 1 }

// Next book
getNextVerse({ book: genesis, chapter: 50, verse: 26 })
// → { book: exodus, chapter: 1, verse: 1 }

// End of Bible
getNextVerse({ book: revelation, chapter: 22, verse: 21 })
// → null
```

#### `getPreviousVerse(current: VerseLocation): VerseLocation | null`

Returns the previous verse, crossing chapter and book boundaries.

```typescript
// Same chapter
getPreviousVerse({ book: genesis, chapter: 1, verse: 5 })
// → { book: genesis, chapter: 1, verse: 4 }

// Previous chapter (last verse)
getPreviousVerse({ book: genesis, chapter: 2, verse: 1 })
// → { book: genesis, chapter: 1, verse: 31 }

// Previous book (last verse of last chapter)
getPreviousVerse({ book: exodus, chapter: 1, verse: 1 })
// → { book: genesis, chapter: 50, verse: 26 }

// Start of Bible
getPreviousVerse({ book: genesis, chapter: 1, verse: 1 })
// → null
```

#### `verseToUrl(location: VerseLocation): string`

Converts a location to a URL path.

```typescript
verseToUrl({ book: genesis, chapter: 1, verse: 1 })
// → "/genesis/1/1"
```

#### `parseVerseUrl(book, chapter, verse): VerseLocation | null`

Parses URL parameters into a validated location.

```typescript
parseVerseUrl("genesis", "1", "1")
// → { book: genesisBook, chapter: 1, verse: 1 }

parseVerseUrl("invalid", "1", "1")
// → null
```

#### `getNavigationUrls(location): { prevUrl, nextUrl }`

Convenience function that returns both navigation URLs.

```typescript
getNavigationUrls({ book: genesis, chapter: 1, verse: 5 })
// → { prevUrl: "/genesis/1/4", nextUrl: "/genesis/1/6" }
```

#### `formatReference(location: VerseLocation): string`

Formats a location as a human-readable reference.

```typescript
formatReference({ book: genesis, chapter: 1, verse: 1 })
// → "Genesis 1:1"
```

### Implementation Logic

The navigation logic uses static data from `bible-structure.ts`:

```typescript
import { BibleBook, BIBLE_BOOKS, BOOK_BY_SLUG } from "@/data/bible-structure";

function getNextVerse(current: VerseLocation): VerseLocation | null {
  const { book, chapter, verse } = current;
  const versesInChapter = book.chapters[chapter - 1];

  // Same chapter, next verse
  if (verse < versesInChapter) {
    return { book, chapter, verse: verse + 1 };
  }

  // Next chapter in same book
  if (chapter < book.chapters.length) {
    return { book, chapter: chapter + 1, verse: 1 };
  }

  // Next book
  const bookIndex = BIBLE_BOOKS.findIndex((b) => b.id === book.id);
  if (bookIndex < BIBLE_BOOKS.length - 1) {
    const nextBook = BIBLE_BOOKS[bookIndex + 1];
    return { book: nextBook, chapter: 1, verse: 1 };
  }

  // End of Bible
  return null;
}

function getPreviousVerse(current: VerseLocation): VerseLocation | null {
  const { book, chapter, verse } = current;

  // Same chapter, previous verse
  if (verse > 1) {
    return { book, chapter, verse: verse - 1 };
  }

  // Previous chapter in same book
  if (chapter > 1) {
    const prevChapterVerses = book.chapters[chapter - 2];
    return { book, chapter: chapter - 1, verse: prevChapterVerses };
  }

  // Previous book
  const bookIndex = BIBLE_BOOKS.findIndex((b) => b.id === book.id);
  if (bookIndex > 0) {
    const prevBook = BIBLE_BOOKS[bookIndex - 1];
    const lastChapter = prevBook.chapters.length;
    const lastVerse = prevBook.chapters[lastChapter - 1];
    return { book: prevBook, chapter: lastChapter, verse: lastVerse };
  }

  // Beginning of Bible (Genesis 1:1)
  return null;
}

function parseVerseUrl(
  bookSlug: string,
  chapter: string,
  verse: string
): VerseLocation | null {
  const book = BOOK_BY_SLUG[bookSlug.toLowerCase()];
  if (!book) return null;

  const chapterNum = parseInt(chapter, 10);
  const verseNum = parseInt(verse, 10);

  if (isNaN(chapterNum) || isNaN(verseNum)) return null;
  if (chapterNum < 1 || chapterNum > book.chapters.length) return null;
  if (verseNum < 1 || verseNum > book.chapters[chapterNum - 1]) return null;

  return { book, chapter: chapterNum, verse: verseNum };
}

function verseToUrl(location: VerseLocation): string {
  return `/${location.book.slug}/${location.chapter}/${location.verse}`;
}

function formatReference(location: VerseLocation): string {
  return `${location.book.name} ${location.chapter}:${location.verse}`;
}
```

---

## Navigation Context

### File: `src/context/navigation-context.tsx`

React context for managing menu open/close state.

### Provider

```typescript
<NavigationProvider>
  {children}
</NavigationProvider>
```

Wrap the app in `layout.tsx`:

```typescript
<body>
  <NavigationProvider>{children}</NavigationProvider>
</body>
```

### Hook

```typescript
const {
  // Book menu
  isMenuOpen, openMenu, closeMenu, toggleMenu,
  // Chat sidebar
  isChatOpen, openChat, closeChat, toggleChat,
  // Sidebar tab control
  sidebarTab, setSidebarTab, openFeedback,
  // Chat context
  chatContext, setChatContext
} = useNavigation();
```

#### Book Menu State

| Property | Type | Description |
|----------|------|-------------|
| `isMenuOpen` | `boolean` | Current menu state |
| `openMenu` | `() => void` | Open the menu |
| `closeMenu` | `() => void` | Close the menu |
| `toggleMenu` | `() => void` | Toggle menu state |

#### Sidebar State

| Property | Type | Description |
|----------|------|-------------|
| `isChatOpen` | `boolean` | Current sidebar visibility state |
| `openChat` | `() => void` | Open sidebar to Chat tab |
| `closeChat` | `() => void` | Close sidebar |
| `toggleChat` | `() => void` | Toggle sidebar visibility |
| `sidebarTab` | `SidebarTab` | Active tab: `"chat"` or `"feedback"` |
| `setSidebarTab` | `(tab: SidebarTab) => void` | Switch active tab |
| `openFeedback` | `() => void` | Open sidebar to Feedback tab |
| `chatContext` | `PageContext \| null` | Verse data for AI context |
| `setChatContext` | `(ctx: PageContext \| null) => void` | Update chat context |

#### SidebarTab Type

```typescript
export type SidebarTab = "chat" | "feedback";
```

Escape key closes the sidebar automatically.

#### PageContext Type

The `chatContext` uses the `PageContext` type which includes:

```typescript
interface PageContext {
  book?: string;           // Book name (e.g., "Genesis")
  chapter?: number;        // Chapter number
  verseRange?: string;     // Verse number as string (e.g., "3")
  heroCaption?: string;    // The verse text displayed as caption
  imageTitle?: string;     // Title for the hero image
  verses?: Array<{ number?: number; text?: string }>;
  prevVerse?: { number: number; text: string; reference?: string };
  nextVerse?: { number: number; text: string; reference?: string };
}
```

Note: `verseRange`, `heroCaption`, and `imageTitle` are used for display purposes and chat context but may not appear in all navigation-related documentation.

---

## Book Menu

### File: `src/components/book-menu.tsx`

Slide-out panel for navigating to any book/chapter with image indicators.

### Component Architecture

The book menu uses a Convex-aware pattern:

```
BookMenu (entry point)
├── BookMenuWithConvex (when Convex enabled)
│   └── Uses queries: getBooksWithImages, getChaptersWithImages, getChapterImageStatus
└── BookMenuBase (when Convex disabled, or receives data from WithConvex)
    └── Renders the actual UI
```

### Component Structure

```
BookMenuBase
├── Backdrop (click to close)
└── Panel
    ├── Header (title + close/back button)
    └── Content
        ├── Books View
        │   ├── Old Testament (collapsible)
        │   │   └── Book buttons (39) with image dots
        │   └── New Testament (collapsible)
        │       └── Book buttons (27) with image dots
        ├── Chapters View
        │   └── Chapter grid (numbered buttons with image dots)
        └── Verses View
            └── Verse grid (numbered links with image dots)
```

### Image Indicators

When Convex is enabled, the menu shows accent-colored dots for:
- **Books**: Books that have at least one image (`getBooksWithImages`)
- **Chapters**: Chapters that have at least one image (`getChaptersWithImages`)
- **Verses**: Verses that have images (`getChapterImageStatus`)

### State

```typescript
const [expandedTestament, setExpandedTestament] = useState<"old" | "new">("old");
const [selectedBook, setSelectedBook] = useState<BibleBook | null>(null);
const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
const [view, setView] = useState<"books" | "chapters" | "verses">("books");
```

### User Flow

1. User clicks BookOpen icon → `toggleMenu()` → menu slides in.
2. User sees Old/New Testament sections (one expanded).
3. User clicks a book → view changes to chapter grid.
4. User clicks a chapter number → view changes to verse grid.
5. User clicks a verse number → navigates to `/{book}/{chapter}/{verse}`.
6. Menu closes automatically on navigation.

Note: The menu does **not** auto-navigate to verse 1 when selecting a chapter. Users must explicitly select a verse.

### Styling

- Panel width: `w-80 max-w-[85vw]`
- Slide animation: `transform transition-transform duration-300`
- Backdrop: `bg-black/50` with fade animation

---

## Verse Strip

### File: `src/components/verse-strip.tsx`

Horizontal scrollable strip for quick verse navigation within a chapter.

### Component Architecture

Similar to BookMenu, uses Convex-aware pattern:

```
VerseStrip (entry point)
├── VerseStripWithConvex (queries getChapterImageStatus)
└── VerseStripBase (renders UI)
```

### Features

- Shows all verses in the current chapter as numbered buttons
- Current verse highlighted with accent background
- Image indicator dots:
  - Accent dot: verse has an image
  - Muted dot: verse has no image
- Horizontal scroll with hidden scrollbar
- 44x44px minimum touch targets

---

## Arrow Navigation

### Hero Image Control Dock

File: `src/components/hero-image.tsx`

The hero image includes a Control Dock at the bottom with:

```
Control Dock
├── Left: Verse Navigation
│   ├── "Prev verse" link (disabled at Genesis 1:1)
│   └── "Next verse" link (disabled at Revelation 22:21)
├── Center: Image Navigation
│   ├── Newer image button
│   ├── Image count label (e.g., "3 / 5 · Latest")
│   └── Older image button
└── Right: Generate Button
    └── "Generate" with credit cost and ETA
```

The Control Dock only appears when there are navigation options or images to display.

### Scripture Reader Arrows

File: `src/components/scripture-reader.tsx`

Text-based links below the verse text with "Previous" / "Next" labels.

```typescript
interface ScriptureReaderProps {
  prevUrl?: string | null;
  nextUrl?: string | null;
  verseNumber: number;
  totalVerses: number;
  // ...
}

// Also shows: "5 of 31" counter
```

---

## Header

### File: `src/components/header.tsx`

Contains navigation triggers and user controls.

### Component Structure

```text
Header
├── Left: Brand ("Visibible")
├── Center: Controls (grouped with dividers)
│   ├── CreditsBadge (session credits / Get Credits / Admin)
│   │   [divider]
│   ├── Settings Group
│   │   ├── TranslationSelector (variant="compact")
│   │   ├── ImageModelSelector (variant="compact")
│   │   └── ChatModelSelector (variant="compact")
│   │   [divider]
│   └── Navigation Group
│       ├── Chat toggle (MessageCircle icon)
│       └── Menu toggle (BookOpen icon)
```

### Example Implementation

```typescript
export function Header() {
  const { toggleMenu, toggleChat } = useNavigation();

  return (
    <header className="...">
      <h1 className="text-lg font-semibold tracking-tight">Visibible</h1>
      <nav className="flex items-center">
        <CreditsBadge />
        <Divider />
        <div className="flex items-center">
          <TranslationSelector variant="compact" />
          <ImageModelSelector variant="compact" />
          <ChatModelSelector variant="compact" />
        </div>
        <Divider />
        <div className="flex items-center">
          <button onClick={toggleChat} aria-label="Toggle chat">
            <MessageCircle />
          </button>
          <button onClick={toggleMenu} aria-label="Open book navigation">
            <BookOpen />
          </button>
        </div>
      </nav>
    </header>
  );
}
```

---

## Chat Sidebar

### File: `src/components/chat-sidebar.tsx`

Slide-out panel with tabbed interface for Chat and Feedback.

### Responsive Behavior

- **Desktop (md+)**: Fixed 384px (`w-96`) width on right side
- **Mobile**: Full width overlay with backdrop

### Component Structure

```
ChatSidebar
├── Backdrop (mobile only, click to close)
└── Aside panel
    ├── Header
    │   ├── Title (dynamic: "Chat" or "Feedback")
    │   ├── Close button
    │   └── Tab bar
    │       ├── Chat tab (MessageSquare icon)
    │       └── Feedback tab (MessageCircleHeart icon)
    └── Content (switches based on active tab)
        ├── Chat component (variant="sidebar")
        └── Feedback component
```

### Tab State

The sidebar uses `sidebarTab` from NavigationContext (not local state) so that:
- `openChat()` opens to the Chat tab
- `openFeedback()` opens to the Feedback tab
- Tab state is shared across components

---

## URL Redirects

### Root Redirect

File: `src/app/page.tsx`

```typescript
export default function Home() {
  redirect("/genesis/1/1");
}
```

### Development Convenience Redirect

File: `src/app/verse/[number]/page.tsx`

A simple redirect for `/verse/N` URLs to Genesis 1 (development convenience, not a production legacy route handler).

```typescript
export default async function OldVersePage({ params }) {
  const { number } = await params;
  const verseNumber = parseInt(number, 10);

  if (!isNaN(verseNumber) && verseNumber >= 1 && verseNumber <= 31) {
    redirect(`/genesis/1/${verseNumber}`);
  }

  redirect("/genesis/1/1");
}
```

Note: This only handles Genesis 1 verses (1-31). It's a development shortcut, not a comprehensive legacy route system.

---

## Files Reference

| File | Purpose |
|------|---------|
| `src/lib/navigation.ts` | Pure navigation helper functions |
| `src/context/navigation-context.tsx` | Menu, sidebar, and tab state context |
| `src/components/header.tsx` | Header with menu trigger |
| `src/components/book-menu.tsx` | Slide-out book/chapter picker with image indicators |
| `src/components/verse-strip.tsx` | Horizontal verse navigator with image indicators |
| `src/components/hero-image.tsx` | Control Dock with verse/image navigation |
| `src/components/scripture-reader.tsx` | Text-based arrow navigation |
| `src/components/chat.tsx` | Chat component (uses chat context) |
| `src/components/chat-sidebar.tsx` | Sidebar panel with tabs (Chat/Feedback) |
| `src/components/chat-context-setter.tsx` | Sets chat context on verse pages |
| `src/components/feedback.tsx` | Feedback form component |
| `src/components/feedback-prompt.tsx` | Feedback popout CTA |
| `src/app/page.tsx` | Root redirect |
| `src/app/verse/[number]/page.tsx` | Development convenience redirect |
| `src/app/[book]/[chapter]/[verse]/page.tsx` | Main verse page |
| `convex/verseImages.ts` | Queries for image indicators |
| `convex/feedback.ts` | Feedback submission mutation |

---

## Accessibility

- Menu trigger has `aria-label="Open book navigation"`
- Chat trigger has `aria-label="Toggle chat"`
- Arrow buttons have `aria-label="Previous verse"` / `"Next verse"`
- Menu panel animates but respects `prefers-reduced-motion` via CSS
- All interactive elements meet 44x44px touch target minimum
- Current verse in VerseStrip has `aria-current="page"`

---

## Related Docs

- Feedback feature: `llm/implementation/FEEDBACK_IMPLEMENTATION.md`
- Image persistence & history browsing: `llm/implementation/IMAGE_PERSISTENCE_IMPLEMENTATION.md`
- Image generation flow: `llm/implementation/IMAGE_GENERATION_IMPLEMENTATION.md`
