import { BOOK_BY_SLUG, BibleBook, isValidLocation } from "@/data/bible-structure";

// Supported translations from bible-api.com
export type Translation =
  | 'web' | 'webbe' | 'kjv' | 'asv' | 'bbe' | 'darby' | 'dra' | 'ylt'
  | 'oeb-cw' | 'oeb-us' | 'clementine' | 'almeida' | 'cherokee' | 'cuv' | 'bkr' | 'rccv';

export const TRANSLATIONS: Record<Translation, { code: string; name: string; language: string; year?: number }> = {
  // English translations
  web: { code: 'WEB', name: 'World English Bible', language: 'English', year: 2000 },
  webbe: { code: 'WEBBE', name: 'World English Bible (British)', language: 'English', year: 2000 },
  kjv: { code: 'KJV', name: 'King James Version', language: 'English', year: 1611 },
  asv: { code: 'ASV', name: 'American Standard Version', language: 'English', year: 1901 },
  bbe: { code: 'BBE', name: 'Bible in Basic English', language: 'English', year: 1965 },
  darby: { code: 'DARBY', name: 'Darby Bible', language: 'English', year: 1890 },
  dra: { code: 'DRA', name: 'Douay-Rheims American', language: 'English', year: 1899 },
  ylt: { code: 'YLT', name: "Young's Literal Translation", language: 'English', year: 1898 },
  'oeb-cw': { code: 'OEB-CW', name: 'Open English Bible (Commonwealth)', language: 'English' },
  'oeb-us': { code: 'OEB-US', name: 'Open English Bible (US)', language: 'English' },
  // Latin
  clementine: { code: 'CLEM', name: 'Clementine Latin Vulgate', language: 'Latin', year: 1592 },
  // Portuguese
  almeida: { code: 'ALM', name: 'João Ferreira de Almeida', language: 'Portuguese', year: 1819 },
  // Cherokee
  cherokee: { code: 'CHR', name: 'Cherokee New Testament', language: 'Cherokee' },
  // Chinese
  cuv: { code: 'CUV', name: 'Chinese Union Version', language: 'Chinese', year: 1919 },
  // Czech
  bkr: { code: 'BKR', name: 'Bible Kralická', language: 'Czech', year: 1613 },
  // Romanian
  rccv: { code: 'RCCV', name: 'Romanian Corrected Cornilescu', language: 'Romanian' },
};

// Group translations by language for UI
export const TRANSLATION_GROUPS = {
  English: ['web', 'webbe', 'kjv', 'asv', 'bbe', 'darby', 'dra', 'ylt', 'oeb-cw', 'oeb-us'] as Translation[],
  Other: ['clementine', 'almeida', 'cherokee', 'cuv', 'bkr', 'rccv'] as Translation[],
};

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

export class BibleApiLookupError extends Error {
  kind: "not_found" | "upstream";
  retryable: boolean;
  statusCode?: number;

  constructor(
    message: string,
    options: {
      kind: "not_found" | "upstream";
      retryable: boolean;
      statusCode?: number;
    }
  ) {
    super(message);
    this.name = "BibleApiLookupError";
    this.kind = options.kind;
    this.retryable = options.retryable;
    this.statusCode = options.statusCode;
  }
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

// Next fetch owns completed-response caching. Only coalesce active lookups here:
// passing a timeout signal opts out of Next/React request memoization.
const pendingChapters = new Map<string, Promise<ChapterData | null>>();
const MAX_PENDING_CHAPTERS = 256;

export function clearBibleApiCache() {
  pendingChapters.clear();
}

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
  const book = Object.hasOwn(BOOK_BY_SLUG, bookSlug.toLowerCase()) ? BOOK_BY_SLUG[bookSlug.toLowerCase()] : undefined;
  if (!book || !isValidLocation(book, chapter, verse)) return null;

  const chapterData = await getChapter(bookSlug, chapter, translation);

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
  const book = Object.hasOwn(BOOK_BY_SLUG, bookSlug.toLowerCase()) ? BOOK_BY_SLUG[bookSlug.toLowerCase()] : undefined;
  if (!book || !Number.isSafeInteger(chapter) || chapter < 1 || chapter > book.chapters.length) return null;

  const cacheKey = `${book.id}-${chapter}-${translation}`;
  const pending = pendingChapters.get(cacheKey);
  if (pending) return pending;
  if (pendingChapters.size >= MAX_PENDING_CHAPTERS) {
    throw new BibleApiLookupError("Too many pending Scripture lookups", {
      kind: "upstream", retryable: true,
    });
  }

  const lookup = fetchChapter(book, chapter, translation);
  pendingChapters.set(cacheKey, lookup);
  try {
    return await lookup;
  } finally {
    if (pendingChapters.get(cacheKey) === lookup) pendingChapters.delete(cacheKey);
  }
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
      signal: AbortSignal.timeout(10000),
      next: {
        revalidate: 86400 * 30, // 30 days - Bible text is immutable
        tags: [`bible-${book.id}-${chapter}-${translation}`],
      },
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new BibleApiLookupError(`Bible API chapter lookup failed with status ${response.status}`, {
        kind: "upstream", retryable: true, statusCode: response.status,
      });
    }

    const data = (await response.json()) as {
      verses: Array<Omit<BibleApiVerse, "book_name"> & { book: string }>;
      translation: { identifier: string; name: string };
    };

    if (!Array.isArray(data.verses)) throw new Error("Invalid chapter response");
    if (data.verses.length === 0) return null;
    if (data.translation?.identifier !== translation || typeof data.translation.name !== "string" || data.verses.some((v) =>
      v.book_id !== book.id || v.chapter !== chapter || !Number.isSafeInteger(v.verse) ||
      v.verse < 1 || typeof v.text !== "string" || !v.text.trim())) {
      throw new Error("Mismatched chapter response");
    }
    return {
      bookId: book.id,
      bookName: book.name,
      chapter,
      verses: data.verses.map((v) => ({
        bookId: v.book_id,
        bookName: book.name,
        chapter: v.chapter,
        verse: v.verse,
        text: v.text.trim(),
      })),
      translationId: data.translation.identifier,
      translationName: data.translation.name,
    };
  } catch (error) {
    if (error instanceof BibleApiLookupError) throw error;
    throw new BibleApiLookupError("Unable to load Scripture chapter", { kind: "upstream", retryable: true });
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
      signal: AbortSignal.timeout(10000),
      next: {
        revalidate: 86400 * 30,
      },
    });

    if (!response.ok) {
      if (response.status === 400 || response.status === 404) return null;
      throw new BibleApiLookupError(
        `Bible API reference lookup failed with status ${response.status}`,
        {
          kind: "upstream",
          retryable: true,
          statusCode: response.status,
        }
      );
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
    if (error instanceof BibleApiLookupError) {
      throw error;
    }

    throw new BibleApiLookupError(
      error instanceof Error
        ? error.message
        : "Failed to fetch verse by reference",
      {
        kind: "upstream",
        retryable: true,
      }
    );
  }
}
