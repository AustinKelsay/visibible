"use client";

import { ScriptureDetails } from "@/components/scripture-details";
import type { AdvancedVerse } from "@/components/spread/advanced";
import { AdvancedItem } from "@/components/spread/advanced/item";
import { BIBLE_BOOKS } from "@/data/bible-structure";

/** The details and statistics for the verse and its picture, as the old details panel showed them. */
export function PassageDetailsItem({ bookName, chapter, verseNumber, verseText, totalVerses }: AdvancedVerse) {
  const testament = BIBLE_BOOKS.find((book) => book.name === bookName)?.testament ?? "old";
  return (
    <AdvancedItem title="Passage details">
      <div className="[&>section]:border-t-0">
        <ScriptureDetails
          book={bookName}
          chapter={chapter}
          verseRange={String(verseNumber)}
          verseText={verseText}
          chapterVerseCount={totalVerses}
          testament={testament}
          reference={`${bookName} ${chapter}:${verseNumber}`}
        />
      </div>
    </AdvancedItem>
  );
}
