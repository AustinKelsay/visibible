import { BIBLE_BOOKS, isValidLocation } from "@/data/bible-structure";
import { getVerseByReference, type Translation, type VerseData } from "./bible-api";
import { getChapter, getVerse } from "./scripture";
import { formatReference, getNextVerse, getPreviousVerse, type VerseLocation } from "./navigation";

/**
 * A reference in the app's own form, such as "Romans 16:26": a full book name, a chapter and one verse. Returns null
 * for any other form; a known book with a chapter or verse the app does not count is `{ location: null }`.
 */
function parseOwnReference(reference: string): { location: VerseLocation | null } | null {
  const match = /^(.+) (\d{1,3}):(\d{1,3})$/.exec(reference.trim().replace(/\s+/g, " "));
  if (!match) return null;
  const name = match[1].toLowerCase();
  const book = BIBLE_BOOKS.find((candidate) => candidate.name.toLowerCase() === name);
  if (!book) return null;
  const chapter = Number(match[2]);
  const verse = Number(match[3]);
  return { location: isValidLocation(book, chapter, verse) ? { book, chapter, verse } : null };
}

/** Any other form ("Rom 16:25", "1 Jn 4:8") is identified by the provider, which knows the abbreviations. */
async function identifyByProvider(reference: string, translation: Translation): Promise<VerseLocation | null> {
  const resolved = await getVerseByReference(reference, translation);
  if (resolved?.length !== 1) return null;
  const identified = resolved[0];
  const book = BIBLE_BOOKS.find((candidate) => candidate.id === identified.bookId);
  if (!book || !isValidLocation(book, identified.chapter, identified.verse)) return null;
  return { book, chapter: identified.chapter, verse: identified.verse };
}

/**
 * The verse an image or video request names, with its neighbours. The app's own reference form is read against the
 * app's verse list, so it needs no lookup and covers verses the provider numbers differently. The selected
 * translation's chapter is the text authority either way.
 */
export async function resolveGenerationPassage(reference: string, translation: Translation) {
  const own = parseOwnReference(reference);
  const location = own ? own.location : await identifyByProvider(reference, translation);
  if (!location) return null;
  const { book } = location;
  const chapter = await getChapter(book.slug, location.chapter, translation);
  const current = chapter?.verses.find((verse) => verse.verse === location.verse);
  if (!current) return null;

  const neighbor = async (target: VerseLocation | null) => {
    if (!target) return null;
    const verse = target.book.id === book.id && target.chapter === location.chapter
      ? chapter?.verses.find((item) => item.verse === target.verse)
      : await getVerse(target.book.slug, target.chapter, target.verse, translation);
    return verse ? { number: verse.verse, text: promptText(verse), reference: formatReference(target) } : null;
  };
  const [prevVerse, nextVerse] = await Promise.all([
    neighbor(getPreviousVerse(location)), neighbor(getNextVerse(location)),
  ]);
  return {
    reference: formatReference(location),
    verseText: promptText(current),
    prevVerse,
    nextVerse,
  };
}

function promptText(verse: VerseData) {
  // Scripture is trusted data. Preserve its words; only normalize whitespace and bound prompt length.
  return verse.text.replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, 1200);
}
