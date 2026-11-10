"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, List } from "lucide-react";
import { HeroImage } from "@/components/hero-image";
import type { WorkScope } from "@/context/work-scope-context";
import { getVerseNavigationDirection } from "@/lib/verse-keyboard-navigation";

export type ProseReaderProps = {
  scope: WorkScope;
  workTitle: string;
  chapterLabel: string;
  chapterNumber: number;
  /** "Passage 3 of 12" within the chapter. */
  position: { index: number; total: number };
  paragraphs: ReadonlyArray<{ id: string; number: number; text: string }>;
  prevUrl?: string;
  nextUrl?: string;
  /** Shown on the owner's preview of a book readers cannot open yet. */
  ownerPreview: boolean;
};

/**
 * One moment of a prose work: its image, then its paragraphs, with the same arrow-key and swipe paging as verses.
 * Render it inside a `WorkScopeProvider` for the same scope, with the header, so both draw from the work.
 */
export function ProseReader({ scope, workTitle, chapterLabel, chapterNumber, position, paragraphs, prevUrl, nextUrl, ownerPreview }: ProseReaderProps) {
  const router = useRouter();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const direction = getVerseNavigationDirection(event);
      const target = direction === "prev" ? prevUrl : direction === "next" ? nextUrl : undefined;
      if (!target) return;
      event.preventDefault();
      router.push(target);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [prevUrl, nextUrl, router]);

  const navLink = "min-h-[44px] inline-flex items-center gap-1 px-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)]";

  return (
    <main className="flex-1 flex flex-col">
      <div className="relative">
        <HeroImage
          alt={`Illustration of ${scope.passage.full}, ${workTitle}`}
          caption=""
          prevUrl={prevUrl}
          nextUrl={nextUrl}
          currentReference={scope.passage.full}
          book={workTitle}
          chapter={chapterNumber}
          verse={paragraphs[0]?.number ?? 1}
          testament="prose"
        />
      </div>

      <article className="px-4 md:px-6 py-6 sm:py-10 max-w-2xl w-full mx-auto">
        <header className="mb-6 sm:mb-8 text-center">
          {ownerPreview ? (
            <p className="mb-3 inline-flex rounded-full border border-[var(--divider)] px-3 py-1 text-xs text-[var(--muted)]">
              Owner preview: readers cannot open this book yet
            </p>
          ) : null}
          <p className="text-[var(--muted)] text-xs sm:text-sm uppercase tracking-widest mb-1 sm:mb-2">{workTitle}</p>
          <h1 className="text-xl sm:text-3xl font-light tracking-tight text-balance">{chapterLabel}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Passage {position.index + 1} of {position.total}
          </p>
        </header>

        <div className="space-y-5 text-lg md:text-xl leading-relaxed text-[var(--foreground)]">
          {paragraphs.map((paragraph) => (
            <p key={paragraph.id} className="text-pretty">{withItalics(paragraph.text)}</p>
          ))}
        </div>

        <nav aria-label="Passages" className="mt-10 pt-6 border-t border-[var(--divider)] flex items-center">
          <div className="flex-1 flex justify-start">
            {prevUrl ? (
              <Link href={prevUrl} className={navLink}>
                <ChevronLeft size={18} strokeWidth={1.5} />
                <span>Previous</span>
              </Link>
            ) : null}
          </div>
          <Link href={scope.contentsHref} className={navLink}>
            <List size={16} strokeWidth={1.5} />
            <span>Contents</span>
          </Link>
          <div className="flex-1 flex justify-end">
            {nextUrl ? (
              <Link href={nextUrl} className={navLink}>
                <span>Next</span>
                <ChevronRight size={18} strokeWidth={1.5} />
              </Link>
            ) : null}
          </div>
        </nav>
      </article>
    </main>
  );
}

/** Project Gutenberg marks italics as _word_; show them as italics rather than underscores. */
export function withItalics(text: string) {
  return text.split(/_([^_\n]+)_/).map((part, index) => (index % 2 ? <em key={index}>{part}</em> : part));
}
