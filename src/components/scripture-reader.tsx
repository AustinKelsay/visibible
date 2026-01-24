"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Verse {
  number: number;
  text: string;
}

interface ScriptureReaderProps {
  book: string;
  chapter: number;
  verse: Verse;
  verseNumber: number;
  totalVerses: number;
  prevUrl?: string | null;
  nextUrl?: string | null;
}

export function ScriptureReader({
  book = "Genesis",
  chapter = 1,
  verse,
  verseNumber,
  totalVerses,
  prevUrl,
  nextUrl,
}: ScriptureReaderProps) {

  return (
    <article className="px-4 md:px-6 py-6 max-w-2xl mx-auto">
      {/* Mobile Navigation - Top (above verse content for easy access) */}
      <nav className="flex sm:hidden items-center mb-6 pb-4 border-b border-[var(--divider)]">
        <div className="flex-1 flex justify-start">
          {prevUrl ? (
            <Link
              href={prevUrl}
              className="flex items-center gap-2 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)] min-h-[44px] px-3 -ml-3"
              aria-label="Previous verse"
            >
              <ChevronLeft size={20} strokeWidth={1.5} />
              <span className="text-sm">Previous</span>
            </Link>
          ) : null}
        </div>

        <span className="text-[var(--muted)] text-sm">
          {verseNumber} of {totalVerses}
        </span>

        <div className="flex-1 flex justify-end">
          {nextUrl ? (
            <Link
              href={nextUrl}
              className="flex items-center gap-2 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)] min-h-[44px] px-3 -mr-3"
              aria-label="Next verse"
            >
              <span className="text-sm">Next</span>
              <ChevronRight size={20} strokeWidth={1.5} />
            </Link>
          ) : null}
        </div>
      </nav>

      {/* Verse Header */}
      <header className="mb-8 text-center">
        <p className="text-[var(--muted)] text-sm uppercase tracking-widest mb-2">
          {book} {chapter}
        </p>
        <h1 className="text-4xl md:text-5xl font-light tracking-tight">
          Verse {verseNumber}
        </h1>
      </header>

      {/* Scripture Text - Desktop only (mobile shows overlaid text above) */}
      <div className="hidden sm:block leading-relaxed text-lg md:text-xl">
        <p className="text-pretty text-center">
          <span className="text-[var(--foreground)]">{verse.text}</span>
        </p>
      </div>

      {/* Verse Navigation - Desktop only (mobile has top nav) */}
      <nav className="hidden sm:flex items-center mt-12 pt-6 border-t border-[var(--divider)]">
        <div className="flex-1 flex justify-start">
          {prevUrl ? (
            <Link
              href={prevUrl}
              className="flex items-center gap-2 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)] min-h-[44px] px-3 -ml-3"
              aria-label="Previous verse"
            >
              <ChevronLeft size={20} strokeWidth={1.5} />
              <span className="text-sm">Previous</span>
            </Link>
          ) : null}
        </div>

        <span className="text-[var(--muted)] text-sm">
          {verseNumber} of {totalVerses}
        </span>

        <div className="flex-1 flex justify-end">
          {nextUrl ? (
            <Link
              href={nextUrl}
              className="flex items-center gap-2 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)] min-h-[44px] px-3 -mr-3"
              aria-label="Next verse"
            >
              <span className="text-sm">Next</span>
              <ChevronRight size={20} strokeWidth={1.5} />
            </Link>
          ) : null}
        </div>
      </nav>
    </article>
  );
}
