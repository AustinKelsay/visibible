"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { AlertCircle, BookOpen, Check, ChevronDown, Clock, Layers, Loader2, Paintbrush, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { LayerPanel, useLayer } from "@/components/spread/layers";
import { ChapterPaint, useChapterJob, type TileJobStatus } from "@/components/spread/chapter-paint";
import { useSession } from "@/context/session-context";
import { usePictureStyles } from "@/context/work-scope-context";
import { BIBLE_BOOKS, BOOK_BY_SLUG, type BibleBook } from "@/data/bible-structure";
import { trackContentsOpened, trackVerseNavigation } from "@/lib/analytics";
import { previewSource } from "@/lib/picture-source";

/** Where the reader is: the verse the spread shows. */
export interface ContentsPlace {
  bookSlug: string;
  chapter: number;
  verse: number;
}

/**
 * The passage name in the dock, or the phone dock's Contents button: opens Contents, and focus returns here when it
 * closes.
 */
export function ContentsButton({ reference, variant }: { reference: string; variant: "dock" | "phone" }) {
  const { isOpen, toggle } = useLayer("contents");
  const shared = {
    type: "button" as const,
    "aria-haspopup": "dialog" as const,
    "aria-expanded": isOpen,
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => toggle(event.currentTarget),
  };
  const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
  if (variant === "phone") {
    return (
      <button {...shared} aria-label="Contents" className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-white/85 hover:bg-white/10 ${focusRing}`}>
        <BookOpen size={20} strokeWidth={1.5} />
      </button>
    );
  }
  return (
    <button
      {...shared}
      aria-label={`${reference}, Contents`}
      className={`inline-flex h-11 items-center gap-2 rounded-full px-3 text-sm font-medium text-white/90 transition-colors duration-[var(--motion-fast)] hover:bg-white/10 hover:text-white ${focusRing}`}
    >
      <BookOpen size={16} strokeWidth={1.5} aria-hidden="true" />
      {reference}
      <ChevronDown size={14} strokeWidth={1.5} aria-hidden="true" className="text-white/60" />
    </button>
  );
}

/**
 * Contents: the chapter as a wall of pictures, one tile per verse, with book and chapter pickers at the top. Choosing a
 * chapter shows its wall here; choosing a tile opens that verse. It is the spread's "contents" layer.
 */
export function ContentsLayer(place: ContentsPlace) {
  return (
    <LayerPanel
      id="contents"
      label="Contents"
      className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0b] text-white outline-none md:inset-6 md:overflow-hidden md:rounded-[28px] md:border md:border-white/10 md:bg-[#0c0c0d]/95 md:shadow-[0_40px_120px_rgba(0,0,0,0.6)] md:backdrop-blur-2xl"
    >
      <ContentsBody {...place} />
    </LayerPanel>
  );
}

function ContentsBody(place: ContentsPlace) {
  const { close } = useLayer("contents");
  const { tier, credits } = useSession();
  const [shown, setShown] = useState({ bookSlug: place.bookSlug, chapter: place.chapter });
  const [choosingBook, setChoosingBook] = useState(false);
  const book = BOOK_BY_SLUG[shown.bookSlug];
  const currentBook = BOOK_BY_SLUG[place.bookSlug];
  const opened = useRef(false);

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    trackContentsOpened({ book: currentBook.name, chapter: place.chapter, verse: place.verse, tier, hasCredits: credits > 0 });
  }, [currentBook.name, place.chapter, place.verse, tier, credits]);

  const onChoose = (targetUrl: string) => {
    trackVerseNavigation({
      book: currentBook.name,
      chapter: place.chapter,
      verse: place.verse,
      direction: "jump",
      source: "contents",
      targetUrl,
      tier,
      hasCredits: credits > 0,
    });
    close();
  };

  // The arrow keys move the caret or do nothing here; they never turn the page under Contents.
  const keepArrowKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") event.stopPropagation();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={keepArrowKeys}>
      <div className="flex items-center gap-3 px-5 pt-[max(1.25rem,var(--safe-area-inset-top))] md:px-10 md:pt-8">
        <button
          type="button"
          aria-expanded={choosingBook}
          aria-label={`${book.name}, choose a book`}
          onClick={() => setChoosingBook((open) => !open)}
          className="-ml-2 inline-flex min-w-0 items-center gap-2 rounded-xl px-2 py-1 font-serif text-4xl leading-tight text-white hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-white md:text-5xl"
        >
          <span className="truncate">{book.name}</span>
          <ChevronDown size={22} strokeWidth={1.5} aria-hidden="true" className={`shrink-0 text-white/60 transition-transform ${choosingBook ? "rotate-180" : ""}`} />
        </button>
        <span className="flex-1" />
        <button
          type="button"
          aria-label="Close contents"
          onClick={close}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/85 hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
        >
          <X size={20} strokeWidth={1.5} />
        </button>
      </div>

      {choosingBook ? (
        <BookPicker
          currentSlug={shown.bookSlug}
          onChoose={(bookSlug) => {
            setShown({ bookSlug, chapter: 1 });
            setChoosingBook(false);
          }}
        />
      ) : (
        <>
          <ChapterPicker book={book} chapter={shown.chapter} onChoose={(chapter) => setShown({ bookSlug: shown.bookSlug, chapter })} />
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-[max(2rem,var(--safe-area-inset-bottom))] md:px-10 md:pt-6">
            <ChapterWall
              book={book}
              chapter={shown.chapter}
              currentVerse={shown.bookSlug === place.bookSlug && shown.chapter === place.chapter ? place.verse : null}
              onChoose={onChoose}
            />
          </div>
        </>
      )}
    </div>
  );
}

function BookPicker({ currentSlug, onChoose }: { currentSlug: string; onChoose: (slug: string) => void }) {
  const [query, setQuery] = useState("");
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => field.current?.focus(), []);
  const needle = query.trim().toLowerCase();
  const matches = needle ? BIBLE_BOOKS.filter((book) => book.name.toLowerCase().includes(needle)) : BIBLE_BOOKS;
  const groups: Array<{ title: string | null; books: BibleBook[] }> = needle
    ? [{ title: null, books: matches }]
    : [
      { title: "Old Testament", books: BIBLE_BOOKS.filter((book) => book.testament === "old") },
      { title: "New Testament", books: BIBLE_BOOKS.filter((book) => book.testament === "new") },
    ];

  return (
    <div className="flex min-h-0 flex-1 flex-col px-5 pt-4 md:px-10 md:pt-6">
      <input
        ref={field}
        type="text"
        enterKeyHint="go"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && matches[0]) onChoose(matches[0].slug);
        }}
        placeholder="Find a book…"
        aria-label="Find a book"
        autoComplete="off"
        className="h-12 w-full max-w-md rounded-full border border-white/10 bg-white/[0.06] px-5 text-base text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
      />
      <div role="group" aria-label="Books" className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(2rem,var(--safe-area-inset-bottom))]">
        {matches.length === 0 ? <p className="py-6 text-white/55">No book matches “{query.trim()}”.</p> : null}
        {groups.map((group) => (
          <section key={group.title ?? "matches"} className="mb-6">
            {group.title ? <h2 className="mb-2 text-[11px] font-medium uppercase tracking-[0.22em] text-white/50">{group.title}</h2> : null}
            <ul className="grid grid-cols-2 gap-x-4 sm:grid-cols-3 lg:grid-cols-5">
              {group.books.map((book) => (
                <li key={book.slug}>
                  <button
                    type="button"
                    aria-current={book.slug === currentSlug ? "true" : undefined}
                    onClick={() => onChoose(book.slug)}
                    className={`w-full truncate rounded-lg px-2 py-2 text-left font-serif text-lg hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white ${book.slug === currentSlug ? "text-white" : "text-white/75"}`}
                  >
                    {book.name}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function ChapterPicker({ book, chapter, onChoose }: { book: BibleBook; chapter: number; onChoose: (chapter: number) => void }) {
  const pressed = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    pressed.current?.scrollIntoView?.({ block: "nearest", inline: "center" });
  }, [book.slug, chapter]);

  return (
    <div className="mt-3 flex items-center gap-4 pl-5 md:mt-5 md:pl-10">
      <span aria-hidden="true" className="shrink-0 text-[11px] font-medium uppercase tracking-[0.22em] text-white/55">Chapter</span>
      <div role="group" aria-label="Chapter" className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 py-1 pr-5 [mask-image:linear-gradient(to_right,transparent,#000_12px,#000_calc(100%-24px),transparent)] [scrollbar-width:none] md:pr-10">
        {book.chapters.map((_, index) => {
          const number = index + 1;
          const isShown = number === chapter;
          return (
            <button
              key={number}
              ref={isShown ? pressed : undefined}
              type="button"
              aria-label={`Chapter ${number}`}
              aria-pressed={isShown}
              onClick={() => onChoose(number)}
              className={`inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-full px-2 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${isShown ? "bg-white font-semibold text-black" : "bg-white/[0.07] text-white/80 hover:bg-white/15"}`}
            >
              {number}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type Tile = {
  verseId: string;
  picture: { id: string; imageUrl: string; thumbnailUrl: string | null; artStyle: string } | null;
  pictureCount: number;
  morePictures: boolean;
};

interface ChapterWallProps {
  book: BibleBook;
  chapter: number;
  /** The verse the spread shows, when it is in this chapter. */
  currentVerse: number | null;
  onChoose: (targetUrl: string) => void;
}

function ChapterWall(props: ChapterWallProps) {
  const isConvexEnabled = useConvexEnabled();
  return isConvexEnabled ? <SavedWall {...props} /> : <Wall {...props} tiles={undefined} />;
}

function SavedWall(props: ChapterWallProps) {
  const { chosen, order } = usePictureStyles();
  const verseCount = props.book.chapters[props.chapter - 1] ?? 0;
  const verseIds = useMemo(
    () => Array.from({ length: verseCount }, (_, index) => `${props.book.slug}-${props.chapter}-${index + 1}`),
    [props.book.slug, props.chapter, verseCount],
  );
  // One bounded read for the whole chapter, by the spread's picture rule (the verse marks read the same).
  const tiles = useQuery(api.verseImages.getChapterContents, { verseIds, styles: order });
  const jobStatus = useChapterJob(verseIds);
  // Unpainted means no picture in the chosen style, even when a tile falls back to another style's picture.
  const unpainted = useMemo(
    () => (tiles ? tiles.flatMap((tile, index) => (tile.picture?.artStyle === chosen ? [] : [index + 1])) : undefined),
    [tiles, chosen],
  );
  return (
    <>
      <ChapterPaint book={props.book} chapter={props.chapter} unpaintedVerses={unpainted} />
      <Wall {...props} tiles={tiles} jobStatus={jobStatus} />
    </>
  );
}

function Wall({ book, chapter, currentVerse, onChoose, tiles, jobStatus }: ChapterWallProps & {
  tiles: Tile[] | undefined;
  jobStatus?: ReadonlyMap<string, TileJobStatus>;
}) {
  const verseCount = book.chapters[chapter - 1] ?? 0;
  return (
    <ol className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:gap-4 lg:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: verseCount }, (_, index) => {
        const verse = index + 1;
        const href = `/${book.slug}/${chapter}/${verse}`;
        return (
          <li key={href}>
            <VerseTile
              verse={verse}
              href={href}
              tile={tiles?.[index]}
              loading={tiles === undefined}
              isCurrent={verse === currentVerse}
              job={jobStatus?.get(`${book.slug}-${chapter}-${verse}`)}
              onChoose={onChoose}
            />
          </li>
        );
      })}
    </ol>
  );
}

const JOB_LABELS: Record<TileJobStatus, string> = {
  queued: "queued",
  generating: "painting",
  completed: "just painted",
  failed: "painting failed",
};

function VerseTile({ verse, href, tile, loading, isCurrent, job, onChoose }: {
  verse: number;
  href: string;
  tile: Tile | undefined;
  loading: boolean;
  isCurrent: boolean;
  /** Where the verse stands in the reader's chapter painting job, when the job holds it. */
  job?: TileJobStatus;
  onChoose: (targetUrl: string) => void;
}) {
  const source = tile?.picture ? previewSource(tile.picture) : null;
  const unpainted = !loading && !source;
  const count = tile && tile.pictureCount > 1 ? (tile.morePictures ? `${tile.pictureCount}+` : `${tile.pictureCount}`) : null;
  const label = job
    ? `Verse ${verse}, ${JOB_LABELS[job]}`
    : unpainted
      ? `Verse ${verse}, not painted yet`
      : count
        ? `Verse ${verse}, ${tile?.morePictures ? `more than ${tile.pictureCount}` : count} pictures`
        : `Verse ${verse}`;
  const waiting = unpainted && (job === "queued" || job === "generating" || job === "failed");

  return (
    <Link
      href={href}
      prefetch={false}
      aria-label={label}
      aria-current={isCurrent ? "page" : undefined}
      data-autofocus={isCurrent ? "" : undefined}
      onClick={() => onChoose(href)}
      className={`group relative block aspect-video overflow-hidden rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
        unpainted ? "border border-dashed border-white/15 bg-white/[0.025]" : "bg-white/[0.05]"
      } ${isCurrent ? "ring-2 ring-white ring-offset-2 ring-offset-[#0a0a0b]" : ""}`}
    >
      {source ? (
        // Tiles load the small copy (#444); there is no resizing service.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={source} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none" />
      ) : null}
      {job === "generating" ? (
        // A soft breathing light while the verse is being painted.
        <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-white/[0.10] via-white/[0.03] to-transparent motion-safe:animate-pulse" />
      ) : null}
      {waiting ? <TileJobMark status={job} /> : unpainted ? (
        <Paintbrush aria-hidden="true" size={18} strokeWidth={1.5} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/25" />
      ) : null}
      {job === "completed" ? (
        <span aria-hidden="true" className="absolute top-2 left-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-black shadow">
          <Check size={12} strokeWidth={2.5} />
        </span>
      ) : null}
      {source ? <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent" /> : null}
      <span aria-hidden="true" className={`absolute bottom-2 left-2.5 text-sm font-semibold tabular-nums ${source ? "text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]" : "text-white/45"}`}>
        {verse}
      </span>
      {count ? (
        <span aria-hidden="true" className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium tabular-nums text-white backdrop-blur-sm">
          <Layers size={11} strokeWidth={2} />
          {count}
        </span>
      ) : null}
    </Link>
  );
}

function TileJobMark({ status }: { status: TileJobStatus }) {
  const [Icon, text, tone] = status === "generating"
    ? [Loader2, "Painting", "text-white/85"]
    : status === "failed"
      ? [AlertCircle, "Failed", "text-red-200/90"]
      : [Clock, "Queued", "text-white/50"];
  return (
    <span aria-hidden="true" className={`absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-[11px] font-medium tracking-wide ${tone}`}>
      <Icon size={18} strokeWidth={1.5} className={status === "generating" ? "motion-safe:animate-spin" : undefined} />
      {text}
    </span>
  );
}
