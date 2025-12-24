"use client";

import Link from "next/link";

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
}

export function ScriptureReader({
  book = "Genesis",
  chapter = 1,
  verse,
  verseNumber,
  totalVerses,
}: ScriptureReaderProps) {
  const hasPrevious = verseNumber > 1;
  const hasNext = verseNumber < totalVerses;

  return (
    <article className="px-4 md:px-6 py-6 max-w-2xl mx-auto">
      {/* Verse Header */}
      <header className="mb-8 text-center">
        <p className="text-[var(--muted)] text-sm uppercase tracking-widest mb-2">
          {book} {chapter}
        </p>
        <h1 className="text-4xl md:text-5xl font-light tracking-tight">
          Verse {verseNumber}
        </h1>
      </header>

      {/* Scripture Text */}
      <div className="leading-relaxed text-lg md:text-xl">
        <p className="text-pretty text-center">
          <span className="text-[var(--foreground)]">{verse.text}</span>
        </p>
      </div>

      {/* Verse Navigation */}
      <nav className="flex justify-between items-center mt-12 pt-6 border-t border-[var(--divider)]">
        {hasPrevious ? (
          <Link
            href={`/verse/${verseNumber - 1}`}
            className="flex items-center gap-2 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)] min-h-[44px] px-3 -ml-3"
            aria-label="Previous verse"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
            <span className="text-sm">Previous</span>
          </Link>
        ) : (
          <div className="min-h-[44px] px-3 -ml-3" />
        )}

        <span className="text-[var(--muted)] text-sm">
          {verseNumber} of {totalVerses}
        </span>

        {hasNext ? (
          <Link
            href={`/verse/${verseNumber + 1}`}
            className="flex items-center gap-2 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)] min-h-[44px] px-3 -mr-3"
            aria-label="Next verse"
          >
            <span className="text-sm">Next</span>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </Link>
        ) : (
          <div className="min-h-[44px] px-3 -mr-3" />
        )}
      </nav>
    </article>
  );
}
