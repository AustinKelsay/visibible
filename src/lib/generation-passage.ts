import { BIBLE_BOOKS, isValidLocation } from "@/data/bible-structure";
import { genesis1Theme } from "@/data/genesis-1";
import { getChapter, getVerse, getVerseByReference, type Translation, type VerseData } from "./bible-api";
import { formatReference, getNextVerse, getPreviousVerse, type VerseLocation } from "./navigation";

/** Resolve aliases through the provider, then use the selected canonical chapter as text authority. */
export async function resolveGenerationPassage(reference: string, translation: Translation) {
  const resolved = await getVerseByReference(reference, translation);
  if (resolved?.length !== 1) return null;
  const identified = resolved[0];
  const book = BIBLE_BOOKS.find((candidate) => candidate.id === identified.bookId);
  if (!book || !isValidLocation(book, identified.chapter, identified.verse)) return null;
  const location: VerseLocation = { book, chapter: identified.chapter, verse: identified.verse };
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
    chapterTheme: book.id === "GEN" && location.chapter === 1 ? genesis1Theme : null,
  };
}

function promptText(verse: VerseData) {
  // Scripture is trusted data. Preserve its words; only normalize whitespace and bound prompt length.
  return verse.text.replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, 1200);
}
