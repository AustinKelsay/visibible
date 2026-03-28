import { BibleBook, BIBLE_BOOKS, BOOK_BY_SLUG } from "@/data/bible-structure";

export interface VerseLocation {
  book: BibleBook;
  chapter: number;
  verse: number;
}

export interface ChapterLocation {
  book: BibleBook;
  chapter: number;
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
 * Get the next chapter location, crossing book boundaries
 */
export function getNextChapter(book: BibleBook, chapter: number): ChapterLocation | null {
  // Next chapter in same book
  if (chapter < book.chapters.length) {
    return { book, chapter: chapter + 1 };
  }

  // First chapter of next book
  const bookIndex = BIBLE_BOOKS.findIndex((b) => b.id === book.id);
  if (bookIndex < BIBLE_BOOKS.length - 1) {
    const nextBook = BIBLE_BOOKS[bookIndex + 1];
    return { book: nextBook, chapter: 1 };
  }

  // End of Bible
  return null;
}

/**
 * Get the previous chapter location, crossing book boundaries
 */
export function getPreviousChapter(book: BibleBook, chapter: number): ChapterLocation | null {
  // Previous chapter in same book
  if (chapter > 1) {
    return { book, chapter: chapter - 1 };
  }

  // Last chapter of previous book
  const bookIndex = BIBLE_BOOKS.findIndex((b) => b.id === book.id);
  if (bookIndex > 0) {
    const prevBook = BIBLE_BOOKS[bookIndex - 1];
    return { book: prevBook, chapter: prevBook.chapters.length };
  }

  // Beginning of Bible
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
  const book = BOOK_BY_SLUG[bookSlug.toLowerCase()];
  if (!book) return null;

  const chapterNum = parseInt(chapter, 10);
  const verseNum = parseInt(verse, 10);

  if (isNaN(chapterNum) || isNaN(verseNum)) return null;
  if (chapterNum < 1 || chapterNum > book.chapters.length) return null;
  if (verseNum < 1 || verseNum > book.chapters[chapterNum - 1]) return null;

  return { book, chapter: chapterNum, verse: verseNum };
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
