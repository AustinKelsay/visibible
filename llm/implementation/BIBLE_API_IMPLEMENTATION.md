# Bible API Implementation Guide

This document describes how Visibible integrates with bible-api.com to fetch scripture text.

---

## Architecture Overview

The Bible API integration consists of three layers:

1. **Static Structure Data** (`bible-structure.ts`) — All 66 books with chapter/verse counts.
2. **API Client** (`bible-api.ts`) — Fetches and caches verse data from bible-api.com.
3. **Dynamic Route** (`[book]/[chapter]/[verse]/page.tsx`) — Server component that validates URLs and renders verses.

---

## Static Structure Data

### File: `src/data/bible-structure.ts`

Contains metadata for all 66 books of the Bible. This enables navigation logic without API calls.

### Data Types

```typescript
interface BibleBook {
  id: string;           // API book ID: "GEN", "MAT", etc.
  name: string;         // Display name: "Genesis", "Matthew"
  slug: string;         // URL-safe: "genesis", "matthew", "1-samuel"
  testament: "old" | "new";
  chapters: number[];   // Verse counts per chapter (1-indexed conceptually)
}
```

### Exported Constants

| Export | Type | Purpose |
|--------|------|---------|
| `BIBLE_BOOKS` | `BibleBook[]` | Ordered array of all 66 books |
| `BOOK_BY_SLUG` | `Record<string, BibleBook>` | Lookup by URL slug |
| `BOOK_BY_ID` | `Record<string, BibleBook>` | Lookup by API ID |

### Helper Functions

```typescript
// Get total verses in a book
getTotalVerses(book: BibleBook): number

// Check if a location is valid
isValidLocation(book: BibleBook, chapter: number, verse: number): boolean
```

### Book Slug Format

Most books use lowercase names: `genesis`, `exodus`, `matthew`.

Numbered books use hyphenated format:
- `1-samuel`, `2-samuel`
- `1-kings`, `2-kings`
- `1-corinthians`, `2-corinthians`
- `song-of-solomon`

---

## API Client

### File: `src/lib/bible-api.ts`

Handles all communication with bible-api.com.

### Translation Support

- Supported translations are declared in `TRANSLATIONS` with metadata (code, name, language, year).
- The default translation is `DEFAULT_TRANSLATION` (`web`).
- API URLs include the translation ID:
  - Chapter: `https://bible-api.com/data/{translation}/{bookId}/{chapter}`
  - Reference: `https://bible-api.com/{reference}?translation={translation}`
- Translation is validated against own keys of `TRANSLATIONS` before use.
  - Server cookie: `visibible-translation` via `getTranslationFromCookies`.
  - Client hydration: `visibible-preferences` via `PreferencesProvider`.

### Data Types

```typescript
interface VerseData {
  bookId: string;
  bookName: string;
  chapter: number;
  verse: number;
  text: string;
}

interface ChapterData {
  bookId: string;
  bookName: string;
  chapter: number;
  verses: VerseData[];
  translationId: string;
  translationName: string;
}
```

### Primary Functions

#### `getVerse(bookSlug, chapter, verse, translation?)`

Fetches a single verse. Uses chapter caching internally.

```typescript
// Using default translation (web)
const verse = await getVerse("genesis", 1, 1);
// Returns: { bookId: "GEN", bookName: "Genesis", chapter: 1, verse: 1, text: "In the beginning..." }

// Using specific translation
const verseKJV = await getVerse("genesis", 1, 1, "kjv");
```

The `translation` parameter defaults to `DEFAULT_TRANSLATION` (`web`) if not provided.

#### `getChapter(bookSlug, chapter, translation?)`

Fetches all verses in a chapter.

```typescript
// Using default translation (web)
const chapter = await getChapter("john", 3);
// Returns: { verses: [...], translationId: "web", ... }

// Using specific translation
const chapterKJV = await getChapter("john", 3, "kjv");
// Returns: { verses: [...], translationId: "kjv", ... }
```

#### `getVerseByReference(reference)`

Fetches by natural language reference. Useful for search.

```typescript
const verses = await getVerseByReference("John 3:16");
```

### Caching Strategy

1. **In-memory chapter cache**: `Map<string, ChapterData>` keyed by `{book}-{chapter}-{translation}`.
2. **Next.js fetch cache**: 30-day revalidation via `{ next: { revalidate: 86400 * 30 } }`.
3. **Chapter-level fetching**: Always fetch full chapters, not individual verses. Reduces API calls.

### API Endpoints

The client uses two bible-api.com endpoints:

```typescript
// Full chapter (preferred) - translation is dynamic (default: web)
`https://bible-api.com/data/${translation}/${bookId}/${chapter}`

// Reference lookup (for search)
`https://bible-api.com/${encodeURIComponent(reference)}?translation=${translation}`
```

### Response Format (from API)

```json
{
  "verses": [
    {
      "book_id": "GEN",
      "book_name": "Genesis",
      "chapter": 1,
      "verse": 1,
      "text": "In the beginning God created the heavens and the earth.\n"
    }
  ],
  "translation_id": "kjv",
  "translation_name": "King James Version"
}
```

---

## Dynamic Route

### File: `src/app/[book]/[chapter]/[verse]/page.tsx`

Server component that renders individual verses.

### URL Structure

```
/genesis/1/1      → Genesis 1:1
/john/3/16        → John 3:16
/1-samuel/17/50   → 1 Samuel 17:50
```

### Validation Flow

```typescript
export default async function VersePage({ params }) {
  const { book, chapter, verse } = await params;

  // 1. Parse and validate URL
  const location = parseVerseUrl(book, chapter, verse);
  if (!location) redirect("/genesis/1/1");

  // 2. Validate book exists
  const bookData = BOOK_BY_SLUG[book.toLowerCase()];
  if (!bookData) redirect("/genesis/1/1");

  // 3. Fetch verse from API
  const verseData = await getVerse(book, location.chapter, location.verse);
  if (!verseData) redirect("/genesis/1/1");

  // 4. Calculate navigation URLs
  const { prevUrl, nextUrl } = getNavigationUrls(location);

  // 5. Render page
  return ( /* ... */ );
}
```

### Props Passed to Components

| Component | Props |
|-----------|-------|
| `HeroImage` | `verseText`, `caption`, `prevUrl`, `nextUrl` |
| `ScriptureReader` | `book`, `chapter`, `verse`, `verseNumber`, `totalVerses`, `prevUrl`, `nextUrl` |
| `ScriptureDetails` | `book`, `chapter`, `verseRange`, `verseText`, `chapterVerseCount`, `testament`, `reference`, `imageAttribution` |
| `Chat` | `context` (book, chapter, verseRange, heroCaption, verses) |

---

## Rate Limiting

bible-api.com enforces **15 requests per 30 seconds** per IP.

### Mitigation Strategies

1. **Aggressive caching**: 30-day cache for immutable scripture text.
2. **Chapter-level fetching**: One API call serves ~25 verses on average.
3. **Static navigation data**: No API calls needed for prev/next logic.

---

## Files Reference

| File | Purpose |
|------|---------|
| `src/data/bible-structure.ts` | Static book/chapter/verse metadata |
| `src/lib/bible-api.ts` | API client with caching |
| `src/lib/navigation.ts` | Navigation helpers (prev/next verse) |
| `src/app/[book]/[chapter]/[verse]/page.tsx` | Dynamic verse route |

---

## Adding a New Translation

Translation support is fully implemented with 16 translations. To add a new translation:

1. Add the translation ID to the `Translation` type union in `bible-api.ts`.
2. Add an entry to the `TRANSLATIONS` record with `{ code, name, language, year? }`.
3. Add the translation ID to the appropriate group in `TRANSLATION_GROUPS` (English or Other).
4. Test by selecting the translation in the UI or passing it as a cookie.

Cache keys automatically include the translation ID, so no additional cache changes are needed.

### Currently Supported Translations

See `TRANSLATIONS` in `src/lib/bible-api.ts` for the complete list. Currently includes:

**English (10):** web (default), webbe, kjv, asv, bbe, darby, dra, ylt, oeb-cw, oeb-us

**Other Languages (6):** clementine (Latin), almeida (Portuguese), cherokee, cuv (Chinese), bkr (Czech), rccv (Romanian)
