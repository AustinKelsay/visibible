# Navigation Implementation Guide

This document describes how Visibible handles navigation across the entire Bible.

---

## Architecture Overview

Navigation consists of four parts:

1. **Navigation Helpers** (`navigation.ts`) — Pure functions for prev/next logic.
2. **Navigation Context** (`navigation-context.tsx`) — React context for menu state.
3. **Book Menu** (`book-menu.tsx`) — Slide-out panel for book/chapter selection.
4. **Arrow Navigation** — Embedded in `hero-image.tsx` and `scripture-reader.tsx`.

---

## Navigation Helpers

### File: `src/lib/navigation.ts`

Pure functions that calculate navigation without side effects.

### Data Types

```typescript
interface VerseLocation {
  book: BibleBookChapters;   // From bible-structure.ts, includes versesPerChapter array
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
import { BibleBookChapters, BIBLE_BOOKS, BOOK_BY_SLUG } from "@/data/bible-structure";

function getNextVerse(current: VerseLocation): VerseLocation | null {
  const { book, chapter, verse } = current;
  const versesInChapter = book.versesPerChapter[chapter - 1];

  // Same chapter, next verse
  if (verse < versesInChapter) {
    return { book, chapter, verse: verse + 1 };
  }

  // Next chapter in same book
  if (chapter < book.versesPerChapter.length) {
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
    const prevChapterVerses = book.versesPerChapter[chapter - 2];
    return { book, chapter: chapter - 1, verse: prevChapterVerses };
  }

  // Previous book
  const bookIndex = BIBLE_BOOKS.findIndex((b) => b.id === book.id);
  if (bookIndex > 0) {
    const prevBook = BIBLE_BOOKS[bookIndex - 1];
    const lastChapter = prevBook.versesPerChapter.length;
    const lastVerse = prevBook.versesPerChapter[lastChapter - 1];
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
  if (chapterNum < 1 || chapterNum > book.versesPerChapter.length) return null;
  if (verseNum < 1 || verseNum > book.versesPerChapter[chapterNum - 1]) return null;

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
const { isMenuOpen, openMenu, closeMenu, toggleMenu } = useNavigation();
```

| Property | Type | Description |
|----------|------|-------------|
| `isMenuOpen` | `boolean` | Current menu state |
| `openMenu` | `() => void` | Open the menu |
| `closeMenu` | `() => void` | Close the menu |
| `toggleMenu` | `() => void` | Toggle menu state |

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
        └── Chapters View
            └── Chapter grid (numbered buttons)
```

### State

```typescript
const [expandedTestament, setExpandedTestament] = useState<"old" | "new">("old");
const [selectedBook, setSelectedBook] = useState<BibleBook | null>(null);
const [view, setView] = useState<"books" | "chapters">("books");
```

### User Flow

1. User clicks book icon → `toggleMenu()` → menu slides in.
2. User sees Old/New Testament sections (one expanded).
3. User clicks a book → view changes to chapter grid.
4. User clicks a chapter number → navigates to `/{book}/{chapter}/1`.
5. Menu closes automatically on navigation.

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

Contains the menu trigger button.

```typescript
export function Header() {
  const { toggleMenu } = useNavigation();

  return (
    <header>
      <h1>Visibible</h1>
      <button onClick={toggleMenu} aria-label="Open navigation menu">
        <Menu />
      </button>
    </header>
  );
}
```

---

## URL Redirects

### Root Redirect

File: `src/app/page.tsx`

```typescript
export default function Home() {
  redirect("/genesis/1/1");
}
```

### Legacy Route Redirect

File: `src/app/verse/[number]/page.tsx`

Redirects old `/verse/N` URLs to new format.

```typescript
export default async function OldVersePage({ params }) {
  const verseNumber = parseInt(params.number, 10);

  if (verseNumber >= 1 && verseNumber <= 31) {
    redirect(`/genesis/1/${verseNumber}`);
  }

  redirect("/genesis/1/1");
}
```

---

## Files Reference

| File | Purpose |
|------|---------|
| `src/lib/navigation.ts` | Pure navigation helper functions |
| `src/context/navigation-context.tsx` | Menu state context |
| `src/components/header.tsx` | Header with menu trigger |
| `src/components/book-menu.tsx` | Slide-out book/chapter picker |
| `src/components/hero-image.tsx` | Floating arrow navigation |
| `src/components/scripture-reader.tsx` | Text-based arrow navigation |
| `src/app/page.tsx` | Root redirect |
| `src/app/verse/[number]/page.tsx` | Legacy route redirect |
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
