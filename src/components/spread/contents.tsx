"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { AlertCircle, BookOpen, Check, ChevronDown, Clock, Layers, Loader2, Paintbrush, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { LayerPanel, useLayer } from "@/components/spread/layers";
import { artStyleLabel } from "@/lib/art-styles";
import { ChapterPaint, useChapterJob, type TileJobStatus } from "@/components/spread/chapter-paint";
import { PlayMark } from "@/components/spread/play-mark";
import { noteTurnAway, opensElsewhere } from "@/components/spread/page-turn";
import { useSession } from "@/context/session-context";
import { useMomentWord, usePictureStyles, useWorkScope, type WorkScope } from "@/context/work-scope-context";
import { BIBLE_BOOKS, BOOK_BY_SLUG, type BibleBook } from "@/data/bible-structure";
import { trackContentsOpened, trackVerseNavigation } from "@/lib/analytics";
import { previewSource } from "@/lib/picture-source";
import { bibleChapterPlaces, type ChapterPlace } from "@/components/spread/verse-marks";
import { readableReference } from "@/lib/readable-reference";

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
  const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
  if (variant === "phone") {
    return (
      <button {...shared} aria-label="Contents" className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-ink/85 hover:bg-ink/10 ${focusRing}`}>
        <BookOpen size={20} strokeWidth={1.5} />
      </button>
    );
  }
  return (
    <button
      {...shared}
      aria-label={`${readableReference(reference)}, Contents`}
      className={`inline-flex h-11 items-center gap-2 rounded-full px-3 text-sm font-medium text-ink/90 transition-colors duration-[var(--motion-fast)] hover:bg-ink/10 hover:text-ink ${focusRing}`}
    >
      <BookOpen size={16} strokeWidth={1.5} aria-hidden="true" />
      {readableReference(reference)}
      <ChevronDown size={14} strokeWidth={1.5} aria-hidden="true" className="text-ink/(--quiet-60)" />
    </button>
  );
}

/**
 * Contents: the chapter as a wall of pictures, one tile per verse, with book and chapter pickers at the top. Choosing a
 * chapter shows its wall here; choosing a tile opens that verse. It is the spread's "contents" layer. For a prose work
 * (a work scope) it shows the work's divisions and their moments instead; `place` then numbers the division and the
 * moment in it, from 1.
 */
export function ContentsLayer(place: ContentsPlace) {
  const scope = useWorkScope();
  return (
    <LayerPanel
      id="contents"
      label="Contents"
      className="fixed inset-0 z-50 flex flex-col bg-reader-page text-ink outline-none md:inset-6 md:overflow-hidden md:rounded-[28px] md:border md:border-ink/10 md:bg-reader-sheet/95 md:shadow-[0_40px_120px_rgba(0,0,0,0.6)] md:backdrop-blur-2xl"
    >
      {scope ? <WorkContentsBody scope={scope} division={place.chapter} moment={place.verse} /> : <ContentsBody {...place} />}
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

  const onChoose = (targetUrl: string, staysHere = false) => {
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
    // Leaving this spread counts as a turn, so Continuous play does not turn the page as well.
    if (!staysHere) noteTurnAway();
    close();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={keepArrowKeys}>
      <div className="flex items-center gap-3 px-5 pt-[max(1.25rem,var(--safe-area-inset-top))] md:px-10 md:pt-8">
        <button
          type="button"
          aria-expanded={choosingBook}
          aria-label={`${book.name}, choose a book`}
          onClick={() => setChoosingBook((open) => !open)}
          className="-ml-2 inline-flex min-w-0 items-center gap-2 rounded-xl px-2 py-1 font-serif text-4xl leading-tight text-ink hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-ink md:text-5xl"
        >
          <span className="truncate">{book.name}</span>
          <ChevronDown size={22} strokeWidth={1.5} aria-hidden="true" className={`shrink-0 text-ink/(--quiet-60) transition-transform ${choosingBook ? "rotate-180" : ""}`} />
        </button>
        <span className="flex-1" />
        <CloseContents onClose={close} />
      </div>

      {choosingBook ? (
        <BibleBookPicker
          currentSlug={shown.bookSlug}
          onChoose={(bookSlug) => {
            setShown({ bookSlug, chapter: 1 });
            setChoosingBook(false);
          }}
        />
      ) : (
        <>
          <BibleChapterPicker
            book={book}
            chosen={shown.chapter}
            onChoose={(chapter) => setShown({ bookSlug: shown.bookSlug, chapter })}
          />
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-[max(2rem,var(--safe-area-inset-bottom))] md:px-10 md:pt-6">
            <ChapterWall
              places={bibleChapterPlaces(book.slug, shown.chapter, book.chapters[shown.chapter - 1] ?? 0)}
              paintable={{ book, chapter: shown.chapter }}
              current={shown.bookSlug === place.bookSlug && shown.chapter === place.chapter ? place.verse : null}
              onChoose={onChoose}
            />
          </div>
        </>
      )}
    </div>
  );
}

// The arrow keys move the caret or do nothing here; they never turn the page under Contents.
function keepArrowKeys(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") event.stopPropagation();
}

function CloseContents({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      aria-label="Close contents"
      onClick={onClose}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink/10 text-ink/85 hover:bg-ink/15 hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
    >
      <X size={20} strokeWidth={1.5} />
    </button>
  );
}

/**
 * A prose work's Contents: its title, its divisions (by number, each named), and the chosen division's moments as a
 * wall of tiles. A prose work has no chapter painting job.
 */
function WorkContentsBody({ scope, division, moment }: { scope: WorkScope; division: number; moment: number }) {
  const { close } = useLayer("contents");
  const { tier, credits } = useSession();
  const [shown, setShown] = useState(division);
  const opened = useRef(false);
  const shownDivision = scope.divisions[shown - 1];
  const places = useMemo(
    () => (shownDivision?.moments ?? []).map((entry) => ({ verseId: entry.id, href: entry.href })),
    [shownDivision],
  );

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    trackContentsOpened({ book: scope.title, chapter: division, verse: moment, tier, hasCredits: credits > 0 });
  }, [scope.title, division, moment, tier, credits]);

  const onChoose = (targetUrl: string, staysHere = false) => {
    trackVerseNavigation({
      book: scope.title, chapter: division, verse: moment, direction: "jump", source: "contents", targetUrl, tier, hasCredits: credits > 0,
    });
    // Leaving this spread counts as a turn, so Continuous play does not turn the page as well.
    if (!staysHere) noteTurnAway();
    close();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={keepArrowKeys}>
      <div className="flex items-center gap-3 px-5 pt-[max(1.25rem,var(--safe-area-inset-top))] md:px-10 md:pt-8">
        <h2 className="min-w-0 truncate font-serif text-3xl leading-tight text-ink md:text-5xl">{scope.title}</h2>
        <span className="flex-1" />
        <CloseContents onClose={close} />
      </div>
      <ChapterPicker
        level={scope.level}
        count={scope.divisions.length}
        labels={scope.divisions.map((entry) => entry.label)}
        chosen={shown}
        onChoose={setShown}
      />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-[max(2rem,var(--safe-area-inset-bottom))] md:px-10 md:pt-6">
        <h3 className="mb-3 font-serif text-xl text-ink/85 md:mb-4 md:text-2xl">{shownDivision?.label}</h3>
        <ChapterWall places={places} current={shown === division ? moment : null} onChoose={onChoose} />
      </div>
    </div>
  );
}

const NO_PAINTED: ReadonlySet<never> = new Set();

/** A small dot (sized by `className`) on a chapter number or book name that has pictures, so the few painted places stand out. */
function PaintedDot({ onInk = false, className = "" }: { onInk?: boolean; className?: string }) {
  return <span aria-hidden="true" className={`block shrink-0 rounded-full ${onInk ? "bg-reader-painted-on-ink" : "bg-reader-painted"} ${className}`} />;
}

type BookPickerProps = { currentSlug: string; onChoose: (slug: string) => void };

/** The book list, with a dot on each book that has a picture in the reader's styles. */
function BibleBookPicker(props: BookPickerProps) {
  const isConvexEnabled = useConvexEnabled();
  return isConvexEnabled ? <PaintedBookPicker {...props} /> : <BookPicker {...props} painted={NO_PAINTED} />;
}

function PaintedBookPicker(props: BookPickerProps) {
  const { order } = usePictureStyles();
  const books = useQuery(api.verseImages.getPaintedBooks, { styles: order });
  const painted = useMemo(() => new Set<string>(books ?? []), [books]);
  return <BookPicker {...props} painted={painted} />;
}

function BookPicker({ currentSlug, onChoose, painted }: BookPickerProps & { painted: ReadonlySet<string> }) {
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
        className="h-12 w-full max-w-md rounded-full border border-ink/10 bg-ink/[0.06] px-5 text-base text-ink placeholder:text-ink/(--quiet-40) focus:border-ink/30 focus:outline-none"
      />
      <div role="group" aria-label="Books" className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(2rem,var(--safe-area-inset-bottom))]">
        {matches.length === 0 ? <p className="py-6 text-ink/(--quiet-55)">No book matches “{query.trim()}”.</p> : null}
        {groups.map((group) => (
          <section key={group.title ?? "matches"} className="mb-6">
            {group.title ? <h2 className="mb-2 text-[11px] font-medium uppercase tracking-[0.22em] text-ink/(--quiet-50)">{group.title}</h2> : null}
            <ul className="grid grid-cols-2 gap-x-4 sm:grid-cols-3 lg:grid-cols-5">
              {group.books.map((book) => (
                <li key={book.slug}>
                  <button
                    type="button"
                    aria-current={book.slug === currentSlug ? "true" : undefined}
                    aria-label={painted.has(book.slug) ? `${book.name}, has pictures` : undefined}
                    onClick={() => onChoose(book.slug)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left font-serif text-lg hover:bg-ink/10 focus-visible:outline-2 focus-visible:outline-ink ${book.slug === currentSlug ? "text-ink" : "text-ink/75"}`}
                  >
                    <span className="truncate">{book.name}</span>
                    {painted.has(book.slug) ? <PaintedDot className="h-1.5 w-1.5" /> : null}
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

type BibleChapterPickerProps = { book: BibleBook; chosen: number; onChoose: (chapter: number) => void };

/** A Bible book's chapter numbers, with a dot on each chapter that has a picture in the reader's styles. */
function BibleChapterPicker(props: BibleChapterPickerProps) {
  const isConvexEnabled = useConvexEnabled();
  return isConvexEnabled
    ? <PaintedChapterPicker {...props} />
    : <ChapterPicker level="Chapter" count={props.book.chapters.length} chosen={props.chosen} onChoose={props.onChoose} />;
}

function PaintedChapterPicker({ book, chosen, onChoose }: BibleChapterPickerProps) {
  const { order } = usePictureStyles();
  const chapters = useQuery(api.verseImages.getPaintedChapters, { book: book.slug, styles: order });
  const painted = useMemo(() => new Set<number>(chapters ?? []), [chapters]);
  return <ChapterPicker level="Chapter" count={book.chapters.length} chosen={chosen} onChoose={onChoose} painted={painted} />;
}

/**
 * The chapter numbers of a Bible book, or a prose work's divisions by number (each named by its label, which shows as
 * the button's title). A number in `painted` has pictures and carries a dot.
 */
function ChapterPicker({ level, count, labels, chosen, onChoose, painted = NO_PAINTED }: {
  /** The division's name in labels ("Chapter", "Story"). */
  level: string;
  count: number;
  labels?: readonly string[];
  chosen: number;
  onChoose: (chapter: number) => void;
  painted?: ReadonlySet<number>;
}) {
  const pressed = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Scroll only when the chosen number is hidden or under an edge fade (the scroll padding matches the fades), so a
    // chapter that already fits leaves the row at its start instead of half-hiding chapter 1.
    pressed.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [count, chosen]);

  return (
    <div className="mt-3 flex items-center gap-4 pl-5 md:mt-5 md:pl-10">
      <span aria-hidden="true" className="shrink-0 text-[11px] font-medium uppercase tracking-[0.22em] text-ink/(--quiet-55)">{level}</span>
      <div role="group" aria-label={level} className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto scroll-pr-6 scroll-pl-3 py-1 pr-6 pl-3 [mask-image:linear-gradient(to_right,transparent,#000_12px,#000_calc(100%-24px),transparent)] [scrollbar-width:none] md:pr-10">
        {Array.from({ length: count }, (_, index) => {
          const number = index + 1;
          const isShown = number === chosen;
          const label = labels?.[index];
          const hasPictures = painted.has(number);
          return (
            <button
              key={number}
              ref={isShown ? pressed : undefined}
              type="button"
              aria-label={`${level} ${number}${label ? `, ${label}` : ""}${hasPictures ? ", has pictures" : ""}`}
              title={label}
              aria-pressed={isShown}
              onClick={() => onChoose(number)}
              className={`relative inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-full px-2 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${isShown ? "bg-ink font-semibold text-paper" : "bg-ink/[0.07] text-ink/80 hover:bg-ink/15"}`}
            >
              {number}
              {hasPictures ? <PaintedDot onInk={isShown} className="absolute bottom-[5px] h-[5px] w-[5px] left-1/2 -translate-x-1/2" /> : null}
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
  hasVideo: boolean;
};

interface ChapterWallProps {
  /** The chapter's verses, or a prose division's moments, in order. */
  places: readonly ChapterPlace[];
  /** A Bible chapter, whose unpainted verses can be painted in one job. A prose division has none. */
  paintable?: { book: BibleBook; chapter: number };
  /** The place the spread shows (from 1), when it is in this chapter. */
  current: number | null;
  /** `staysHere`: the reader stays on this spread (the current verse, or a click that opens another tab). */
  onChoose: (targetUrl: string, staysHere?: boolean) => void;
}

function ChapterWall(props: ChapterWallProps) {
  const isConvexEnabled = useConvexEnabled();
  return isConvexEnabled ? <SavedWall {...props} /> : <Wall {...props} tiles={undefined} />;
}

function SavedWall(props: ChapterWallProps) {
  const { chosen, order } = usePictureStyles();
  const verseIds = useMemo(() => props.places.map((place) => place.verseId), [props.places]);
  // One bounded read for the whole chapter, by the spread's picture rule (the verse marks read the same).
  const tiles = useQuery(api.verseImages.getChapterContents, { verseIds, styles: order });
  const jobStatus = useChapterJob(verseIds);
  // To paint means no picture in the chosen style, even when a tile falls back to another style's picture; the
  // button then names the style rather than calling those verses unpainted.
  const toPaint = useMemo(
    () => (tiles ? tiles.flatMap((tile, index) => (tile.picture?.artStyle === chosen ? [] : [index + 1])) : undefined),
    [tiles, chosen],
  );
  const inOtherStyles = useMemo(() => (tiles ?? []).some((tile) => tile.picture && tile.picture.artStyle !== chosen), [tiles, chosen]);
  return (
    <>
      {props.paintable ? (
        <ChapterPaint book={props.paintable.book} chapter={props.paintable.chapter} unpaintedVerses={toPaint} someInOtherStyles={inOtherStyles} />
      ) : null}
      <Wall {...props} tiles={tiles} jobStatus={jobStatus} chosen={chosen} />
    </>
  );
}

function Wall({ places, current, onChoose, tiles, jobStatus, chosen }: ChapterWallProps & {
  tiles: Tile[] | undefined;
  jobStatus?: ReadonlyMap<string, TileJobStatus>;
  /** The chosen art style; a tile showing another style's picture says which. */
  chosen?: string;
}) {
  const noun = useMomentWord() === "verse" ? "Verse" : "Passage";
  return (
    <ol className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:gap-4 lg:grid-cols-5 xl:grid-cols-6">
      {places.map(({ verseId, href }, index) => {
        const verse = index + 1;
        return (
          <li key={href}>
            <VerseTile
              noun={noun}
              verse={verse}
              href={href}
              tile={tiles?.[index]}
              loading={tiles === undefined}
              isCurrent={verse === current}
              job={jobStatus?.get(verseId)}
              chosen={chosen}
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

function VerseTile({ noun, verse, href, tile, loading, isCurrent, job, chosen, onChoose }: {
  /** "Verse", or "Passage" for a prose moment. */
  noun: string;
  verse: number;
  href: string;
  tile: Tile | undefined;
  loading: boolean;
  isCurrent: boolean;
  /** Where the verse stands in the reader's chapter painting job, when the job holds it. */
  job?: TileJobStatus;
  chosen?: string;
  /** `staysHere`: the reader stays on this spread (the current verse, or a click that opens another tab). */
  onChoose: (targetUrl: string, staysHere?: boolean) => void;
}) {
  const source = tile?.picture ? previewSource(tile.picture) : null;
  const unpainted = !loading && !source;
  const count = tile && tile.pictureCount > 1 ? (tile.morePictures ? `${tile.pictureCount}+` : `${tile.pictureCount}`) : null;
  const pictures = job
    ? `${noun} ${verse}, ${JOB_LABELS[job]}`
    : unpainted
      ? `${noun} ${verse}, not painted yet`
      : count
        ? `${noun} ${verse}, ${tile?.morePictures ? `more than ${tile.pictureCount}` : count} pictures`
        : `${noun} ${verse}`;
  const otherStyle = source && chosen && tile?.picture && tile.picture.artStyle !== chosen ? `, ${artStyleLabel(tile.picture.artStyle)} picture` : "";
  // The play mark follows the tile's own picture (#480): an unpainted tile has none.
  const hasVideo = Boolean(source && tile?.hasVideo);
  const label = `${pictures}${otherStyle}${hasVideo ? ", has a video" : ""}`;
  const waiting = unpainted && (job === "queued" || job === "generating" || job === "failed");

  return (
    <Link
      href={href}
      prefetch={false}
      aria-label={label}
      aria-current={isCurrent ? "page" : undefined}
      data-autofocus={isCurrent ? "" : undefined}
      onClick={(event) => onChoose(href, isCurrent || opensElsewhere(event))}
      className={`group relative block aspect-video overflow-hidden rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
        unpainted ? "border border-dashed border-ink/15 bg-ink/[0.025]" : "bg-ink/[0.05]"
      } ${isCurrent ? "ring-2 ring-ink ring-offset-2 ring-offset-reader-page" : ""}`}
    >
      {source ? (
        // Tiles load the small copy (#444); there is no resizing service.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={source} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none" />
      ) : null}
      {job === "generating" ? (
        // A soft breathing light while the verse is being painted.
        <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-ink/[0.10] via-ink/[0.03] to-transparent motion-safe:animate-pulse" />
      ) : null}
      {waiting ? <TileJobMark status={job} /> : unpainted ? (
        <Paintbrush aria-hidden="true" size={18} strokeWidth={1.5} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-ink/(--quiet-25)" />
      ) : null}
      {job === "completed" ? (
        <span aria-hidden="true" className="absolute top-2 left-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-ink text-paper shadow">
          <Check size={12} strokeWidth={2.5} />
        </span>
      ) : null}
      {source ? <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent" /> : null}
      <span aria-hidden="true" className={`absolute bottom-2 left-2.5 text-sm font-semibold tabular-nums ${source ? "text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]" : "text-ink/(--quiet-45)"}`}>
        {verse}
      </span>
      {hasVideo ? (
        <span className="absolute top-2 left-2">
          <PlayMark />
        </span>
      ) : null}
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
    ? [Loader2, "Painting", "text-ink/85"]
    : status === "failed"
      ? [AlertCircle, "Failed", "text-reader-alert/90"]
      : [Clock, "Queued", "text-ink/(--quiet-50)"];
  return (
    <span aria-hidden="true" className={`absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-[11px] font-medium tracking-wide ${tone}`}>
      <Icon size={18} strokeWidth={1.5} className={status === "generating" ? "motion-safe:animate-spin" : undefined} />
      {text}
    </span>
  );
}
