# Navigation Implementation Guide

This document describes how Visibible handles navigation across the entire Bible.

---

## Architecture Overview

Navigation consists of five parts:

1. **Navigation Helpers** (`navigation.ts`) — Pure functions for prev/next logic.
2. **Navigation Context** (`navigation-context.tsx`) — React context for menu and chat sidebar state.
3. **Book Menu** (`book-menu.tsx`) — Slide-out panel for book/chapter selection.
4. **Arrow Navigation** — Embedded in `hero-image.tsx` and `scripture-reader.tsx`.
5. **Chat Sidebar State** — Manages chat panel visibility and verse context for AI.

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

#### Chat Sidebar State

| Property | Type | Description |
|----------|------|-------------|
| `isChatOpen` | `boolean` | Current chat panel state |
| `openChat` | `() => void` | Open chat panel |
| `closeChat` | `() => void` | Close chat panel |
| `toggleChat` | `() => void` | Toggle chat panel |
| `chatContext` | `PageContext \| null` | Verse data for AI context |
| `setChatContext` | `(ctx: PageContext \| null) => void` | Update chat context |

Escape key closes the chat sidebar automatically.

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

Slide-out panel for navigating to any book/chapter.

### Component Structure

```
BookMenu
├── Backdrop (click to close)
└── Panel
    ├── Header (title + close/back button)
    └── Content
        ├── Books View
        │   ├── Old Testament (collapsible)
        │   │   └── Book buttons (39)
        │   └── New Testament (collapsible)
        │       └── Book buttons (27)
        ├── Chapters View
        │   └── Chapter grid (numbered buttons)
        └── Verses View
            └── Verse grid (numbered buttons)
```

### State

```typescript
const [expandedTestament, setExpandedTestament] = useState<"old" | "new">("old");
const [selectedBook, setSelectedBook] = useState<BibleBook | null>(null);
const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
const [view, setView] = useState<"books" | "chapters" | "verses">("books");
```

### User Flow

1. User clicks book icon → `toggleMenu()` → menu slides in.
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

## Arrow Navigation

### Hero Image Arrows

File: `src/components/hero-image.tsx`

Floating circular buttons overlaid on the image.

```typescript
interface HeroImageProps {
  prevUrl?: string | null;
  nextUrl?: string | null;
  // ...
}

// Render
{prevUrl && (
  <Link href={prevUrl} className="absolute left-3 top-1/2 ...">
    <ChevronLeft />
  </Link>
)}
{nextUrl && (
  <Link href={nextUrl} className="absolute right-3 top-1/2 ...">
    <ChevronRight />
  </Link>
)}
```

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

```
Header
├── Left: Brand ("Visibible")
├── Center: Controls (responsive)
│   ├── CreditsBadge (session credits / Get Credits / Admin)
│   ├── TranslationSelector (Bible translation dropdown)
│   ├── ImageModelSelector (AI image model dropdown)
│   └── ChatModelSelector (AI chat model dropdown, variant="compact")
└── Right: Buttons
    ├── Chat toggle (MessageCircle icon)
    └── Menu toggle (Menu icon)
```

### Example Implementation

```typescript
export function Header() {
  const { toggleMenu, toggleChat } = useNavigation();

  return (
    <header className="flex items-center justify-between ...">
      <h1 className="text-lg font-semibold">Visibible</h1>
      <div className="flex items-center gap-2">
        <CreditsBadge />
        <TranslationSelector />
        <ImageModelSelector />
        <ChatModelSelector variant="compact" />
        <button onClick={toggleChat} aria-label="Toggle chat">
          <MessageCircle />
        </button>
        <button onClick={toggleMenu} aria-label="Open navigation menu">
          <Menu />
        </button>
      </div>
    </header>
  );
}
```

Note: The header adapts responsively; some controls may be hidden or collapsed on smaller screens.

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
| `src/context/navigation-context.tsx` | Menu and chat sidebar state context |
| `src/components/header.tsx` | Header with menu trigger |
| `src/components/book-menu.tsx` | Slide-out book/chapter picker |
| `src/components/hero-image.tsx` | Floating arrow navigation |
| `src/components/scripture-reader.tsx` | Text-based arrow navigation |
| `src/components/chat.tsx` | Chat component (uses chat context) |
| `src/components/chat-sidebar.tsx` | Chat sidebar panel |
| `src/app/page.tsx` | Root redirect |
| `src/app/verse/[number]/page.tsx` | Development convenience redirect |
| `src/app/[book]/[chapter]/[verse]/page.tsx` | Main verse page |

---

## Accessibility

- Menu trigger has `aria-label="Open navigation menu"`
- Arrow buttons have `aria-label="Previous verse"` / `"Next verse"`
- Menu panel animates but respects `prefers-reduced-motion` via CSS
- All interactive elements meet 44x44px touch target minimum

---

## Related Docs

- Image persistence & history browsing: `llm/implementation/IMAGE_PERSISTENCE_IMPLEMENTATION.md`
- Image generation flow: `llm/implementation/IMAGE_GENERATION_IMPLEMENTATION.md`
