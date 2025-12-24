"use client";

interface Verse {
  number: number;
  text: string;
}

interface ScriptureReaderProps {
  book: string;
  chapter: number;
  verses: Verse[];
}

const defaultVerses: Verse[] = [
  { number: 1, text: "In the beginning God created the heaven and the earth." },
  { number: 2, text: "And the earth was without form, and void; and darkness was upon the face of the deep. And the Spirit of God moved upon the face of the waters." },
  { number: 3, text: "And God said, Let there be light: and there was light." },
  { number: 4, text: "And God saw the light, that it was good: and God divided the light from the darkness." },
  { number: 5, text: "And God called the light Day, and the darkness he called Night. And the evening and the morning were the first day." },
  { number: 6, text: "And God said, Let there be a firmament in the midst of the waters, and let it divide the waters from the waters." },
  { number: 7, text: "And God made the firmament, and divided the waters which were under the firmament from the waters which were above the firmament: and it was so." },
  { number: 8, text: "And God called the firmament Heaven. And the evening and the morning were the second day." },
  { number: 9, text: "And God said, Let the waters under the heaven be gathered together unto one place, and let the dry land appear: and it was so." },
  { number: 10, text: "And God called the dry land Earth; and the gathering together of the waters called he Seas: and God saw that it was good." },
];

export function ScriptureReader({
  book = "Genesis",
  chapter = 1,
  verses = defaultVerses,
}: Partial<ScriptureReaderProps>) {
  return (
    <article className="px-4 md:px-6 py-6 max-w-2xl mx-auto">
      {/* Chapter Header */}
      <header className="mb-8 text-center">
        <p className="text-[var(--muted)] text-sm uppercase tracking-widest mb-2">
          {book}
        </p>
        <h1 className="text-4xl md:text-5xl font-light tracking-tight">
          Chapter {chapter}
        </h1>
      </header>

      {/* Scripture Text */}
      <div className="space-y-4 leading-relaxed text-lg md:text-xl">
        {verses.map((verse) => (
          <p key={verse.number} className="text-pretty">
            <span className="text-[var(--accent)] font-semibold text-sm align-super mr-1">
              {verse.number}
            </span>
            <span className="text-[var(--foreground)]">{verse.text}</span>
          </p>
        ))}
      </div>

      {/* Chapter Navigation */}
      <nav className="flex justify-between items-center mt-12 pt-6 border-t border-[var(--divider)]">
        <button
          className="flex items-center gap-2 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)] min-h-[44px] px-3 -ml-3"
          aria-label="Previous chapter"
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
        </button>

        <span className="text-[var(--muted)] text-sm">
          {chapter} of 50
        </span>

        <button
          className="flex items-center gap-2 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)] min-h-[44px] px-3 -mr-3"
          aria-label="Next chapter"
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
        </button>
      </nav>
    </article>
  );
}
