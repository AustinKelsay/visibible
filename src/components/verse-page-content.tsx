"use client";

import { useVerseView } from "@/context/verse-view-context";
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
  const { effectiveView, isSettled } = useVerseView();

  if (!isSettled) {
    return (
      <main className="flex-1 flex flex-col" aria-busy="true" aria-live="polite">
        <div className="relative h-[40vh] min-h-[260px] overflow-hidden bg-[var(--surface-muted)]">
          <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-[var(--surface-muted)] via-[var(--surface)] to-[var(--surface-muted)]" />
          <div className="absolute left-4 md:left-6 right-4 md:right-6 top-4 h-12 rounded-[var(--radius-lg)] bg-[var(--background)]/60" />
        </div>
        <div className="flex-1 py-4 md:py-8">
          <div className="max-w-2xl mx-auto w-full px-4 space-y-4 animate-pulse">
            <div className="h-4 w-24 rounded-full bg-[var(--surface-muted)]" />
            <div className="h-8 w-3/4 rounded-full bg-[var(--surface-muted)]" />
            <div className="space-y-3 pt-4">
              <div className="h-4 w-full rounded-full bg-[var(--surface-muted)]" />
              <div className="h-4 w-[92%] rounded-full bg-[var(--surface-muted)]" />
              <div className="h-4 w-[88%] rounded-full bg-[var(--surface-muted)]" />
              <div className="h-4 w-[66%] rounded-full bg-[var(--surface-muted)]" />
            </div>
            <div className="flex gap-3 pt-4">
              <div className="h-9 w-28 rounded-full bg-[var(--surface-muted)]" />
              <div className="h-9 w-24 rounded-full bg-[var(--surface-muted)]" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (effectiveView === "gallery") {
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
    <main className="flex-1 flex flex-col">
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

      <div className="flex-1 py-4 sm:py-8">
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
