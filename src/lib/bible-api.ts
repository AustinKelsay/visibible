import { BOOK_BY_SLUG, BibleBook } from "@/data/bible-structure";

// Supported translations
export type Translation = 'web' | 'kjv';

export const TRANSLATIONS = {
  web: { code: 'WEB', name: 'World English Bible', year: 2000 },
  kjv: { code: 'KJV', name: 'King James Version', year: 1611 },
} as const;

export const DEFAULT_TRANSLATION: Translation = 'web';

export interface VerseData {
  bookId: string;
  bookName: string;
  chapter: number;
  verse: number;
  text: string;
}

export interface ChapterData {
  bookId: string;
  bookName: string;
  chapter: number;
  verses: VerseData[];
  translationId: string;
  translationName: string;
}

interface BibleApiVerse {
  book_id: string;
  book_name: string;
  chapter: number;
  verse: number;
  text: string;
}

interface BibleApiResponse {
  reference: string;
  verses: BibleApiVerse[];
  text: string;
  translation_id: string;
  translation_name: string;
  translation_note: string;
}

// Cache for chapter data to reduce API calls
const chapterCache = new Map<string, ChapterData>();

/**
 * Fetch a single verse from the Bible API
 * Uses chapter caching to reduce API calls
 */
export async function getVerse(
  bookSlug: string,
  chapter: number,
  verse: number,
  translation: Translation = DEFAULT_TRANSLATION
): Promise<VerseData | null> {
  const book = BOOK_BY_SLUG[bookSlug.toLowerCase()];
  if (!book) return null;

  // Try to get from chapter cache first (cache key includes translation)
  const cacheKey = `${book.id}-${chapter}-${translation}`;
  let chapterData: ChapterData | null = chapterCache.get(cacheKey) || null;

  if (!chapterData) {
    // Fetch entire chapter and cache it
    chapterData = await fetchChapter(book, chapter, translation);
    if (chapterData) {
      chapterCache.set(cacheKey, chapterData);
    }
  }

  if (!chapterData) return null;

  const verseData = chapterData.verses.find((v) => v.verse === verse);
  return verseData || null;
}

/**
 * Fetch an entire chapter from the Bible API
 */
export async function getChapter(
  bookSlug: string,
  chapter: number,
  translation: Translation = DEFAULT_TRANSLATION
): Promise<ChapterData | null> {
  const book = BOOK_BY_SLUG[bookSlug.toLowerCase()];
  if (!book) return null;

  const cacheKey = `${book.id}-${chapter}-${translation}`;
  const cached = chapterCache.get(cacheKey);
  if (cached) return cached;

  const chapterData = await fetchChapter(book, chapter, translation);
  if (chapterData) {
    chapterCache.set(cacheKey, chapterData);
  }

  return chapterData;
}

/**
 * Internal function to fetch a chapter from the API
 */
async function fetchChapter(
  book: BibleBook,
  chapter: number,
  translation: Translation = DEFAULT_TRANSLATION
): Promise<ChapterData | null> {
  try {
    // Use the data endpoint for full chapter
    const url = `https://bible-api.com/data/${translation}/${book.id}/${chapter}`;

    const response = await fetch(url, {
      next: {
        revalidate: 86400 * 30, // 30 days - Bible text is immutable
        tags: [`bible-${book.id}-${chapter}-${translation}`],
      },
    });

    if (!response.ok) {
      console.error(`Bible API error: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as {
      verses: BibleApiVerse[];
      translation_id: string;
      translation_name: string;
    };

    return {
      bookId: book.id,
      bookName: book.name,
      chapter,
      verses: data.verses.map((v) => ({
        bookId: v.book_id,
        bookName: v.book_name,
        chapter: v.chapter,
        verse: v.verse,
        text: v.text.trim(),
      })),
      translationId: data.translation_id,
      translationName: data.translation_name,
    };
  } catch (error) {
    console.error("Failed to fetch chapter:", error);
    return null;
  }
}

/**
 * Fetch a verse using the user-input endpoint (alternative method)
 * Useful for direct verse lookups like "John 3:16"
 */
export async function getVerseByReference(
  reference: string,
  translation: Translation = DEFAULT_TRANSLATION
): Promise<VerseData[] | null> {
  try {
    const url = `https://bible-api.com/${encodeURIComponent(reference)}?translation=${translation}`;

    const response = await fetch(url, {
      next: {
        revalidate: 86400 * 30,
      },
    });

    if (!response.ok) {
      console.error(`Bible API error: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as BibleApiResponse;

    return data.verses.map((v) => ({
      bookId: v.book_id,
      bookName: v.book_name,
      chapter: v.chapter,
      verse: v.verse,
      text: v.text.trim(),
    }));
  } catch (error) {
    console.error("Failed to fetch verse:", error);
    return null;
  }
}
