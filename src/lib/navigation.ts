import { BibleBook, BIBLE_BOOKS, BOOK_BY_SLUG } from "@/data/bible-structure";

export interface VerseLocation {
  book: BibleBook;
  chapter: number;
  verse: number;
}

/**
 * Get the next verse location, crossing chapter and book boundaries
 */
export function getNextVerse(current: VerseLocation): VerseLocation | null {
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

  // End of Bible (Revelation 22:21)
  return null;
}

/**
 * Get the previous verse location, crossing chapter and book boundaries
 */
export function getPreviousVerse(current: VerseLocation): VerseLocation | null {
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

/**
 * Convert a verse location to a URL path
 */
export function verseToUrl(location: VerseLocation): string {
  return `/${location.book.slug}/${location.chapter}/${location.verse}`;
}

/**
 * Parse URL parameters into a verse location
 */
export function parseVerseUrl(
  bookSlug: string,
  chapter: string,
  verse: string
): VerseLocation | null {
  const normalizedBookSlug = bookSlug.toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(BOOK_BY_SLUG, normalizedBookSlug)) {
    return null;
  }
  const book = BOOK_BY_SLUG[normalizedBookSlug];
  if (!book) return null;

  const chapterNum = parseInt(chapter, 10);
  const verseNum = parseInt(verse, 10);

  if (isNaN(chapterNum) || isNaN(verseNum)) return null;
  if (chapterNum < 1 || chapterNum > book.chapters.length) return null;
  if (verseNum < 1 || verseNum > book.chapters[chapterNum - 1]) return null;

  return { book, chapter: chapterNum, verse: verseNum };
}

/**
 * Resolve a book input to a canonical slug.
 * Accepts either the route slug ("1-samuel") or the display name ("1 Samuel").
 */
export function resolveBookSlug(bookInput: string): string | null {
  const normalized = bookInput.trim().toLowerCase();
  if (!normalized) return null;

  const bySlug = Object.prototype.hasOwnProperty.call(BOOK_BY_SLUG, normalized)
    ? BOOK_BY_SLUG[normalized]
    : undefined;
  if (bySlug) return bySlug.slug;

  const byName = BIBLE_BOOKS.find((book) => book.name.toLowerCase() === normalized);
  return byName?.slug ?? null;
}

/**
 * Parse a verse location from either a slug-style or display-name book input.
 */
export function parseVerseLocation(
  bookInput: string,
  chapter: string | number,
  verse: string | number
): VerseLocation | null {
  const bookSlug = resolveBookSlug(bookInput);
  if (!bookSlug) return null;
  return parseVerseUrl(bookSlug, String(chapter), String(verse));
}

/**
 * Get navigation URLs for a verse location
 */
export function getNavigationUrls(location: VerseLocation): {
  prevUrl: string | null;
  nextUrl: string | null;
} {
  const prev = getPreviousVerse(location);
  const next = getNextVerse(location);

  return {
    prevUrl: prev ? verseToUrl(prev) : null,
    nextUrl: next ? verseToUrl(next) : null,
  };
}

/**
 * Format a verse reference for display
 */
export function formatReference(location: VerseLocation): string {
  return `${location.book.name} ${location.chapter}:${location.verse}`;
}

/**
 * Get the next N verse locations starting from (but not including) the current verse.
 * Stops early if the end of the Bible is reached.
 */
export function getNextNVerses(
  current: VerseLocation,
  count: number
): VerseLocation[] {
  const verses: VerseLocation[] = [];
  let cursor: VerseLocation | null = current;
  for (let i = 0; i < count; i++) {
    if (!cursor) break;
    cursor = getNextVerse(cursor);
    if (!cursor) break;
    verses.push(cursor);
  }
  return verses;
}

/**
 * Get all remaining verses in the current chapter (after the current verse).
 */
export function getRemainingChapterVerses(
  current: VerseLocation
): VerseLocation[] {
  const { book, chapter, verse } = current;
  const versesInChapter = book.chapters[chapter - 1];
  const verses: VerseLocation[] = [];
  for (let v = verse + 1; v <= versesInChapter; v++) {
    verses.push({ book, chapter, verse: v });
  }
  return verses;
}

/**
 * Get all verses across a range of chapters in a book.
 * If startVerse is provided, starts from that verse in the startChapter (exclusive).
 */
export function getVersesInChapterRange(
  bookSlug: string,
  startChapter: number,
  endChapter: number,
  startVerse?: number
): VerseLocation[] {
  const normalizedBookSlug = bookSlug.toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(BOOK_BY_SLUG, normalizedBookSlug)) {
    return [];
  }
  const book = BOOK_BY_SLUG[normalizedBookSlug];
  if (!book) return [];

  const verses: VerseLocation[] = [];
  for (let ch = startChapter; ch <= Math.min(endChapter, book.chapters.length); ch++) {
    const versesInChapter = book.chapters[ch - 1];
    const firstVerse = ch === startChapter && startVerse != null ? startVerse + 1 : 1;
    for (let v = firstVerse; v <= versesInChapter; v++) {
      verses.push({ book, chapter: ch, verse: v });
    }
  }
  return verses;
}

/**
 * Get every verse in a book.
 */
export function getAllVersesInBook(bookSlug: string): VerseLocation[] {
  const normalizedBookSlug = bookSlug.toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(BOOK_BY_SLUG, normalizedBookSlug)) {
    return [];
  }
  const book = BOOK_BY_SLUG[normalizedBookSlug];
  if (!book) return [];

  const verses: VerseLocation[] = [];
  for (let ch = 1; ch <= book.chapters.length; ch++) {
    const versesInChapter = book.chapters[ch - 1];
    for (let v = 1; v <= versesInChapter; v++) {
      verses.push({ book, chapter: ch, verse: v });
    }
  }
  return verses;
}

/**
 * Build a verse ID string from a location (e.g., "genesis-1-1").
 */
export function verseLocationToId(location: VerseLocation): string {
  return `${location.book.slug}-${location.chapter}-${location.verse}`;
}
