"use client";

import { usePreferences } from "@/context/preferences-context";
import { HeroImage } from "@/components/hero-image";
import { ScriptureReader } from "@/components/scripture-reader";
import { ScriptureDetails } from "@/components/scripture-details";
import { VerseStripBar } from "@/components/verse-strip-bar";
import { ChapterGallery } from "@/components/chapter-gallery";

interface VerseContext {
  number: number;
  text: string;
  reference?: string;
}

interface ChapterTheme {
  setting: string;
  palette: string;
  elements: string;
  style: string;
}

interface VersePageContentProps {
  bookSlug: string;
  bookName: string;
  chapter: number;
  verseNumber: number;
  verseText: string;
  totalVerses: number;
  prevUrl?: string;
  nextUrl?: string;
  prevVerse?: VerseContext;
  nextVerse?: VerseContext;
  currentReference: string;
  chapterTheme?: ChapterTheme;
  testament: "old" | "new";
  verses: Array<{
    verse: number;
    text: string;
  }>;
}

export function VersePageContent({
  bookSlug,
  bookName,
  chapter,
  verseNumber,
  verseText,
  totalVerses,
  prevUrl,
  nextUrl,
  prevVerse,
  nextVerse,
  currentReference,
  chapterTheme,
  testament,
  verses,
}: VersePageContentProps) {
  const { chapterGalleryEnabled } = usePreferences();

  if (chapterGalleryEnabled) {
    return (
      <main className="flex-1 flex flex-col">
        <ChapterGallery
          book={bookSlug}
          bookName={bookName}
          chapter={chapter}
          currentVerse={verseNumber}
          verses={verses}
          fullScreen
        />
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col pb-[72px] sm:pb-0">
      <div className="relative">
        <HeroImage
          verseText={verseText}
          caption={verseText}
          chapterTheme={chapterTheme}
          prevUrl={prevUrl}
          nextUrl={nextUrl}
          prevVerse={prevVerse}
          nextVerse={nextVerse}
          currentReference={currentReference}
          book={bookName}
          chapter={chapter}
          verse={verseNumber}
          testament={testament}
        />

        <div className="hidden sm:block absolute left-4 md:left-6 right-4 md:right-6 top-4 z-20 rounded-[var(--radius-lg)] liquid-glass">
          <VerseStripBar
            book={bookSlug}
            chapter={chapter}
            currentVerse={verseNumber}
            totalVerses={totalVerses}
          />
        </div>
      </div>

      <div className="flex-1 py-8">
        <ScriptureReader
          book={bookName}
          chapter={chapter}
          verse={{ number: verseNumber, text: verseText }}
          verseNumber={verseNumber}
          totalVerses={totalVerses}
          prevUrl={prevUrl}
          nextUrl={nextUrl}
        />
      </div>

      <div className="max-w-2xl mx-auto w-full mb-8">
        <ScriptureDetails
          book={bookName}
          chapter={chapter}
          verseRange={String(verseNumber)}
          verseText={verseText}
          chapterVerseCount={totalVerses}
          testament={testament}
          reference={currentReference}
        />
      </div>
    </main>
  );
}
