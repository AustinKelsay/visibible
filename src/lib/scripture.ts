/**
 * Scripture text as the server reads it. Every translation comes from the Bible API. For the default translation the
 * imported World English Bible (`works/bible-web/work.json`, deployed with the server) stands in for a chapter the
 * service is slow to answer, fails to answer, does not have, or answers with verses that differ from the app's own
 * verse list. Server only: it reads a file.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { BOOK_BY_SLUG, isValidLocation, type BibleBook } from "@/data/bible-structure";
import {
  DEFAULT_TRANSLATION,
  TRANSLATIONS,
  getChapter as fetchChapter,
  type ChapterData,
  type Translation,
  type VerseData,
} from "./bible-api";

/** The translation the imported text is an edition of. */
export const IMPORTED_TRANSLATION: Translation = "web";
/** The service usually answers in a fraction of a second. Past this, a reader is shown the imported text instead. */
export const SLOW_AFTER_MS = 2000;

type ImportedBook = { key: string; divisions: { units: { number: number; text: string }[] }[] };

let importedBooks: Promise<Map<string, ImportedBook>> | undefined;

/** Per-instance cache: the file is deployed with the server and only changes with it. A failed read is not cached. */
function loadImportedBooks(): Promise<Map<string, ImportedBook>> {
  importedBooks ??= readFile(path.join(process.cwd(), "works", "bible-web", "work.json"), "utf8")
    .then((json) => {
      const books = (JSON.parse(json) as { divisions: ImportedBook[] }).divisions;
      return new Map(books.map((book) => [book.key, book]));
    })
    .catch((error) => {
      importedBooks = undefined;
      throw error;
    });
  return importedBooks;
}

/** Chapters already reported, so a chapter the service never has is logged once per instance, not on every view. */
const reported = new Set<string>();

export function clearImportedScripture() {
  importedBooks = undefined;
  reported.clear();
}

function findBook(bookSlug: string): BibleBook | undefined {
  const slug = bookSlug.toLowerCase();
  return Object.hasOwn(BOOK_BY_SLUG, slug) ? BOOK_BY_SLUG[slug] : undefined;
}

/** True when the chapter holds exactly the verses the app's navigation counts, in order. */
function matchesVerseList(book: BibleBook, chapter: number, verses: readonly { verse: number }[]): boolean {
  return verses.length === book.chapters[chapter - 1] && verses.every((item, index) => item.verse === index + 1);
}

/** A chapter of the imported World English Bible, or null when the location or the file's chapter is not usable. */
export async function getImportedChapter(bookSlug: string, chapter: number): Promise<ChapterData | null> {
  const book = findBook(bookSlug);
  if (!book || !Number.isSafeInteger(chapter) || chapter < 1 || chapter > book.chapters.length) return null;
  const units = (await loadImportedBooks()).get(book.slug)?.divisions[chapter - 1]?.units;
  if (!units) return null;
  const verses: VerseData[] = units.map((unit) => ({
    bookId: book.id, bookName: book.name, chapter, verse: unit.number, text: unit.text.trim(),
  }));
  if (!matchesVerseList(book, chapter, verses) || verses.some((verse) => !verse.text)) return null;
  return {
    bookId: book.id,
    bookName: book.name,
    chapter,
    verses,
    translationId: IMPORTED_TRANSLATION,
    translationName: TRANSLATIONS[IMPORTED_TRANSLATION].name,
  };
}

type Answer = { chapter: ChapterData | null } | { error: unknown };

/**
 * A chapter in the requested translation. Other translations behave exactly as the Bible API client does. For the
 * default translation the service's chapter is used when it arrives in time and matches the app's verse list;
 * otherwise the imported chapter is. If the imported text cannot be read, the service's own answer stands.
 */
export async function getChapter(
  bookSlug: string,
  chapter: number,
  translation: Translation = DEFAULT_TRANSLATION
): Promise<ChapterData | null> {
  if (translation !== IMPORTED_TRANSLATION) return fetchChapter(bookSlug, chapter, translation);
  const book = findBook(bookSlug);
  if (!book || !Number.isSafeInteger(chapter) || chapter < 1 || chapter > book.chapters.length) return null;

  // The lookup is not cancelled when the reader stops waiting, so a late answer can still fill the fetch cache.
  const answer: Promise<Answer> = fetchChapter(bookSlug, chapter, translation)
    .then((data) => ({ chapter: data }), (error: unknown) => ({ error }));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<"slow">((resolve) => { timer = setTimeout(() => resolve("slow"), SLOW_AFTER_MS); });
  const first = await Promise.race([answer, slow]);
  clearTimeout(timer);

  if (first !== "slow" && "chapter" in first && first.chapter && matchesVerseList(book, chapter, first.chapter.verses)) {
    return first.chapter;
  }
  const reason = first === "slow" ? "slow" : "error" in first ? "failed" : first.chapter ? "different verses" : "missing";
  const imported = await getImportedChapter(bookSlug, chapter).catch(() => null);
  if (imported) {
    const report = `Scripture service ${reason} for ${book.id} ${chapter}; serving the imported World English Bible`;
    if (!reported.has(report)) {
      reported.add(report);
      console.warn(report);
    }
    return imported;
  }
  const settled = first === "slow" ? await answer : first;
  if ("error" in settled) throw settled.error;
  return settled.chapter;
}

/** One verse of a chapter read through `getChapter`. */
export async function getVerse(
  bookSlug: string,
  chapter: number,
  verse: number,
  translation: Translation = DEFAULT_TRANSLATION
): Promise<VerseData | null> {
  const book = findBook(bookSlug);
  if (!book || !isValidLocation(book, chapter, verse)) return null;
  const data = await getChapter(bookSlug, chapter, translation);
  return data?.verses.find((item) => item.verse === verse) ?? null;
}
