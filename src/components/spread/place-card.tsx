"use client";

import { useLayoutEffect, useState, type RefObject } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { MapExploration } from "@/lib/analytics";
import { clamp } from "@/lib/clamp";
import { chaptersAround, chapterUrl, divisionOf, nearbyPlaces, type PlaceChapter } from "@/lib/place-chapters";
import type { SettingPlace } from "@/lib/verse-setting";
import { remember, remembered } from "./place-map-memory";

/**
 * A marker's card on the verse map (#556): each place at the marker, where it is proposed and how it ranks, and a
 * place's chapters in the Bible around this verse. The map view places it beside its marker with `cardPosition`.
 */

/** The verse being read: its book's slug, chapter and verse. */
export interface MapHere {
  slug: string;
  chapter: number;
  verse: number;
}

/** A place, and which of its sites (0 for a settled place). */
export interface MarkerEntry {
  place: SettingPlace;
  index: number;
}

/** "Pi-hahiroth, Migdol and Baal-zephon", or in a sentence "the Red Sea". */
export function listNames(places: SettingPlace[], prose = false): string {
  return andList(places.map((place) => (prose ? place.proseName : place.name)));
}

/** "A", "A and B", "A, B and C". */
export const andList = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

/** How a proposed site stands among the others, by how widely sources favour it; `short` leaves out "proposed sites". */
export function rank(place: SettingPlace, index: number, short = false): string {
  const count = place.sites.length;
  const top = place.sites[0].score;
  const score = place.sites[index].score;
  if (score === top) {
    const tied = place.sites.filter((site) => site.score === top).length;
    return `${tied > 1 ? "tied as the most favoured" : "the most favoured"} of ${count}${short ? "" : " proposed sites"}`;
  }
  return score >= top * 0.5 ? `also widely favoured (${index + 1} of ${count})` : `less favoured (${index + 1} of ${count})`;
}

const CARD_WIDTH = 264;

/**
 * Where a marker's card goes, in screen pixels, and how tall it may grow before it scrolls: beside the marker (right,
 * else left), or where the box is too narrow for that (a phone), above or below it, whichever has room, and no taller
 * than that side, so it never covers the marker it describes. It stays below the box's `top` (the zoom steps and
 * close button) and above its `bottom` (the note, its credit and the way back to the picture), unless that would leave
 * a card too short to read: then it may reach over the footer, down to the box's edge or, on a computer, the dock.
 */
export function cardPosition(at: { left: number; top: number }, gap: number, box: { width: number; height: number; top?: number; bottom?: number; dock?: number }, height: number) {
  const edge = 12;
  const ceiling = Math.max(edge, box.top ?? 0);
  const place = (floor: number) => {
    const tallest = floor - ceiling;
    const fitsRight = at.left + gap + CARD_WIDTH <= box.width - edge;
    const fitsLeft = at.left - gap - CARD_WIDTH >= edge;
    if (fitsRight || fitsLeft) {
      const shown = Math.min(height, tallest);
      return { left: fitsRight ? at.left + gap : at.left - gap - CARD_WIDTH, top: clamp(at.top - 28, ceiling, floor - shown), maxHeight: tallest };
    }
    const left = clamp(at.left - CARD_WIDTH / 2, edge, box.width - CARD_WIDTH - edge);
    const roomBelow = floor - (at.top + gap);
    const roomAbove = at.top - gap - ceiling;
    const below = height <= roomBelow || (height > roomAbove && roomBelow >= roomAbove);
    // The room on that side, so it scrolls rather than cover the marker; only a map too short for two lines (under the
    // controls, a phone's strip beside Ask) lets it reach over.
    const maxHeight = Math.max(Math.min(below ? roomBelow : roomAbove, tallest), Math.min(48, tallest));
    const shown = Math.min(height, maxHeight);
    return { left, top: clamp(below ? at.top + gap : at.top - gap - shown, ceiling, floor - shown), maxHeight };
  };
  const clear = place(box.height - Math.max(edge, box.bottom ?? 0));
  // About six lines: the place, its site and a chapter or two.
  return clear.maxHeight >= Math.min(height, READABLE_CARD) ? clear : place(box.height - Math.max(edge, box.dock ?? 0));
}

/** The least height a card keeps above the footer before it may reach over it. */
const READABLE_CARD = 140;

/**
 * The card by the marker under the pointer or focus, or opened by a click, tap or Enter: each place there, where it
 * is proposed and how it ranks, then a place's chapters in the Bible around this verse and the places nearby. Only an
 * opened card can be used (its links, its full list of chapters, its close button); a previewed one is a glance.
 */
export function MarkerCard({ cardRef, entries, at, gap, box, opened, here, reference, onClose, onEscape, onExplore }: {
  cardRef: RefObject<HTMLDivElement | null>;
  entries: MarkerEntry[];
  at: { left: number; top: number };
  gap: number;
  box: { width: number; height: number; top?: number; bottom?: number; clear?: number; dock?: number };
  opened: boolean;
  here: MapHere;
  reference: string;
  onClose: () => void;
  onEscape: () => void;
  onExplore?: (exploration: MapExploration) => void;
}) {
  const site = (entry: MarkerEntry) => entry.place.sites[entry.index].name;
  // Places sharing one site name it once, a line each, so a card for four places still fits a phone's map.
  const shared = entries.length > 1 && entries.every((entry) => site(entry) === site(entries[0]));
  // Whose chapters the card shows, where places share the marker: the reader's last choice while it is here, so
  // following a chapter keeps to the place they chose.
  const [chosen, setChosen] = useState(() => remembered.place);
  const [all, setAll] = useState(false);
  const place = entries.find((entry) => entry.place.id === chosen)?.place ?? entries[0].place;
  // A place proposed at two sites a marker joins (Anathoth at Ras el Kharruba and Anata) is one choice.
  const choices = entries.filter((entry, row) => entries.findIndex((other) => other.place.id === entry.place.id) === row);
  // Placed by its whole height, measured before it paints (its content's, not the height a scroll limit clips it to,
  // so the placement can tell a card cut short); a guess until then (and where nothing is laid out).
  const id = entries.map(({ place: each, index }) => `${each.id}:${index}`).join(" ");
  // Compact for this marker at this map size once its full first view proves too tall for its side of the marker (a
  // short phone map): a line for each place, so the chapter rows show without a scroll. Being compact only takes lines
  // away, so it never flips back; another marker or a resized map measures the full view afresh.
  const fit = `${id} ${box.width}x${box.height}`;
  const [compactFor, setCompactFor] = useState<string | null>(null);
  const compact = compactFor === fit;
  // A height counts only for what was measured, so a card just switched to another marker is not judged by the last.
  const measuring = `${fit} ${place.id} ${all} ${opened} ${compact}`;
  const [drawn, setDrawn] = useState({ of: "", height: 0 });
  useLayoutEffect(() => setDrawn({ of: measuring, height: cardRef.current?.scrollHeight ?? 0 }), [cardRef, measuring]);
  const measured = drawn.of === measuring ? drawn.height : 0;
  // As tall as its side of the marker allows; a longer card scrolls.
  // Below the controls even where a short map's places reach up beside them.
  const { left, top, maxHeight } = cardPosition(at, gap, { ...box, top: box.clear ?? box.top }, measured || 24 + entries.length * (shared ? 22 : 56) + 110);
  useLayoutEffect(() => {
    if (!compact && !all && measured > maxHeight) setCompactFor(fit);
  }, [compact, all, measured, maxHeight, fit]);
  const spot = entries[0].place.sites[entries[0].index];
  const nearby = nearbyPlaces(spot.lon, spot.lat, entries.map((entry) => entry.place.name), entries.flatMap((entry) => entry.place.sites));
  return (
    <div
      ref={cardRef}
      aria-hidden={opened ? undefined : true}
      inert={!opened}
      role={opened ? "group" : undefined}
      aria-label={opened ? `${listNames(entries.map((entry) => entry.place))}: the card` : undefined}
      data-marker-card
      data-opened={opened ? "" : undefined}
      data-compact={compact ? "" : undefined}
      // Escape in the card puts it away and goes back to its marker; it does not close the map.
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
        event.preventDefault();
        onEscape();
      }}
      // A phone with Ask open leaves the map a thin strip, so the card steps aside with the steps and comes back as Ask
      // closes.
      className={`absolute z-10 overflow-y-auto overscroll-contain max-md:[main:has([data-ask-page])_&]:hidden rounded-xl border border-white/10 bg-black/80 px-3 py-2 text-white/85 shadow-[0_10px_30px_rgba(0,0,0,0.5)] backdrop-blur-md ${opened ? "" : "pointer-events-none"}`}
      style={{ left, top, width: CARD_WIDTH, maxHeight }}
    >
      {opened ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the card"
          className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full text-white/60 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
        >
          <X size={14} strokeWidth={1.75} aria-hidden="true" />
        </button>
      ) : null}
      {shared ? (
        <>
          {/* A described site ("south of the Lisan") reads as its own heading. */}
          <p className="pr-6 text-xs leading-snug text-white/70">{/^[a-z]/.test(site(entries[0])) ? site(entries[0]).replace(/^./, (c) => c.toUpperCase()) : `At ${site(entries[0])}`}</p>
          {/* One line for each place there; compact, one line for them all. */}
          {compact ? (
            <p className="mt-1 font-serif text-[15px] leading-snug text-white">{entries.map(({ place: each }) => each.name).join(" · ")}</p>
          ) : entries.map(({ place: each, index }) => (
            <p key={`${each.id}:${index}`} className="mt-1 text-[11px] leading-snug text-white/55">
              <span className="font-serif text-[15px] text-white">{each.name}</span>{" "}
              {each.debated ? rank(each, index, true) : "settled"}
            </p>
          ))}
        </>
      ) : compact ? (
        entries.map(({ place: each, index }, row) => (
          <p key={`${each.id}:${index}`} className={`leading-snug ${row > 0 ? "mt-1" : "pr-6"}`}>
            <span className="font-serif text-base text-white">{each.name}</span>{" "}
            <span className="text-[11px] text-white/55">
              {each.debated ? `proposed at ${each.sites[index].name}` : each.sites[index].name === each.name ? "settled" : `at ${each.sites[index].name}`}
            </span>
          </p>
        ))
      ) : (
        entries.map(({ place: each, index }, row) => (
          <div key={`${each.id}:${index}`} className={row > 0 ? "mt-2 border-t border-white/10 pt-2" : "pr-6"}>
            <p className="font-serif text-base leading-tight text-white">{each.name}</p>
            {each.debated ? (
              <>
                <p className="mt-1 text-xs leading-snug">Proposed at {each.sites[index].name}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-white/55">{rank(each, index).replace(/^./, (c) => c.toUpperCase())}</p>
              </>
            ) : (
              <p className="mt-0.5 text-xs leading-snug">{each.sites[index].name === each.name ? "Its site is settled" : `At ${each.sites[index].name}`}</p>
            )}
          </div>
        ))
      )}
      <div data-chapters className="mt-2 border-t border-white/10 pt-2">
        {choices.length > 1 ? (
          // Where places share the marker, which one's chapters to show.
          <div className="mb-1.5 flex flex-wrap gap-1">
            {choices.map((entry) => (
              <button
                key={`${entry.place.id}:${entry.index}`}
                type="button"
                aria-pressed={entry.place.id === place.id}
                onClick={() => {
                  remember({ place: entry.place.id });
                  setChosen(entry.place.id);
                  setAll(false);
                }}
                className="rounded-full border border-white/15 px-2 py-0.5 font-serif text-[13px] text-white/75 aria-pressed:border-[#f3e6c8] aria-pressed:bg-[#f3e6c8] aria-pressed:text-[#1b1a18] focus-visible:outline-2 focus-visible:outline-white"
              >
                {entry.place.name}
              </button>
            ))}
          </div>
        ) : null}
        <PlaceChapters key={place.id} place={place} here={here} reference={reference} all={all} onAll={() => {
          if (!all) onExplore?.({ action: "all_chapters" });
          setAll(!all);
        }} onChapter={(direction) => {
          // The next page keeps to this place, where it shares a marker there.
          remember({ place: place.id });
          setChosen(place.id);
          onExplore?.({ action: "chapter", direction });
        }} />
        {nearby.length > 0 && !compact ? (
          <p data-nearby-places className="mt-1.5 text-[11px] leading-snug text-white/55">
            Nearby · {nearby.map((other) => `${other.name} ${other.km} km`).join(" · ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** "Genesis 28:19". */
const chapterReference = (named: PlaceChapter) => `${named.book} ${named.chapter}:${named.verse}`;

const CHAPTER_LINK =
  "font-serif text-[15px] italic text-white underline decoration-white/30 underline-offset-[3px] hover:decoration-white/70 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white";

/**
 * A place's chapters around this verse: the one before (‹), this verse, the one after (›), each a link, and the way to
 * every chapter that names the place, grouped by part of the Bible.
 */
function PlaceChapters({ place, here, reference, all, onAll, onChapter }: {
  place: SettingPlace;
  here: MapHere;
  reference: string;
  all: boolean;
  onAll: () => void;
  onChapter: (direction: "before" | "after" | "current" | "list") => void;
}) {
  const { chapters, current, before, after } = chaptersAround(place.id, here.slug, here.chapter);
  const verses = chapters.reduce((sum, named) => sum + named.verses, 0);
  return (
    <>
      <p className="text-[10px] uppercase tracking-[0.16em] text-white/55">
        {place.name} · {verses} {verses === 1 ? "verse" : "verses"} in {chapters.length} {chapters.length === 1 ? "chapter" : "chapters"}
      </p>
      <ol className="mt-1">
        {before ? <NeighbourRow glyph="‹" side="Before" named={before} onFollow={() => onChapter("before")} /> : null}
        <li aria-current="true" className="flex items-baseline gap-2 py-0.5">
          <span aria-hidden="true" className="w-3 text-[9px] text-[#e8c37a]">●</span>
          <span className="font-serif text-[15px] italic text-[#e8c37a]">
            {reference} <span className="font-sans text-[11px] not-italic text-white/55">· this verse{current && current.verses > 1 ? ` · ${current.verses} in the chapter` : ""}</span>
          </span>
        </li>
        {current && current.verse !== here.verse ? (
          // A setting carried from an earlier verse: the way to the verse in this chapter that names the place.
          <li className="flex items-baseline gap-2 pb-0.5 pl-5 text-[11px] text-white/55">
            <span>
              named in{" "}
              <Link href={chapterUrl(current)} aria-label={`Named in ${chapterReference(current)}`} onClick={() => onChapter("current")} className="text-white/80 underline decoration-white/30 underline-offset-2 hover:text-white focus-visible:outline-2 focus-visible:outline-white">
                {chapterReference(current)}
              </Link>
            </span>
          </li>
        ) : null}
        {after ? <NeighbourRow glyph="›" side="After" named={after} onFollow={() => onChapter("after")} /> : null}
      </ol>
      {chapters.length === 0 || (chapters.length === 1 && current) ? <p className="mt-0.5 text-[11px] text-white/55">Named in no other chapter of the Bible.</p> : null}
      {/* Even where the rows above show them all, the list sets them in their parts of the Bible. */}
      {chapters.length > 1 ? (
        <button
          type="button"
          aria-expanded={all}
          onClick={onAll}
          className="mt-1 text-left text-[12px] text-[#f3e6c8] underline decoration-[#f3e6c8]/35 underline-offset-[3px] hover:decoration-[#f3e6c8]/80 focus-visible:outline-2 focus-visible:outline-white"
        >
          {all ? "Fewer chapters" : `All ${chapters.length} chapters naming ${place.name}`}
        </button>
      ) : null}
      {all ? <ChapterList chapters={chapters} here={here} onChapter={() => onChapter("list")} /> : null}
    </>
  );
}

/** The chapter before or after this one at a place: a link to it, with how many of its verses name the place. */
function NeighbourRow({ glyph, side, named, onFollow }: { glyph: string; side: "Before" | "After"; named: PlaceChapter; onFollow: () => void }) {
  return (
    <li className="flex items-baseline gap-2 py-0.5">
      <span aria-hidden="true" className="w-3 text-white/45">{glyph}</span>
      <span>
        <Link href={chapterUrl(named)} aria-label={`${side}: ${chapterReference(named)}`} onClick={onFollow} className={CHAPTER_LINK}>{chapterReference(named)}</Link>
        {named.verses > 1 ? <span className="text-[11px] text-white/45"> · {named.verses} verses</span> : null}
      </span>
    </li>
  );
}

/** Every chapter that names a place, a book to a line, grouped by part of the Bible; this chapter is marked. */
function ChapterList({ chapters, here, onChapter }: { chapters: PlaceChapter[]; here: MapHere; onChapter: () => void }) {
  const parts: { division: string; books: { book: string; chapters: PlaceChapter[] }[] }[] = [];
  for (const named of chapters) {
    const division = divisionOf(named.bookId);
    if (parts.at(-1)?.division !== division) parts.push({ division, books: [] });
    const books = parts.at(-1)!.books;
    if (books.at(-1)?.book !== named.book) books.push({ book: named.book, chapters: [] });
    books.at(-1)!.chapters.push(named);
  }
  return (
    <div data-all-chapters className="mt-1.5 space-y-1.5">
      {parts.map(({ division, books }) => (
        <div key={division}>
          <p className="text-[9.5px] uppercase tracking-[0.16em] text-white/45">{division}</p>
          {books.map(({ book, chapters: inBook }) => (
            <p key={book} className="text-[12px] leading-relaxed">
              <span className="mr-1.5 font-serif text-[13.5px] text-white">{book}</span>
              {inBook.map((named) => {
                const isHere = named.slug === here.slug && named.chapter === here.chapter;
                return (
                  <Link
                    key={named.chapter}
                    href={chapterUrl(named)}
                    prefetch={false}
                    aria-label={chapterReference(named)}
                    aria-current={isHere ? "true" : undefined}
                    onClick={onChapter}
                    className={`mr-1.5 inline-block underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-white ${isHere ? "font-semibold text-[#e8c37a] decoration-[#e8c37a]/50" : "text-white/80 decoration-white/25 hover:text-white"}`}
                  >
                    {named.chapter}
                  </Link>
                );
              })}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}
