"use client";

import { Fragment, useLayoutEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { bookAbbreviation } from "@/data/book-abbreviations";
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
const CARD_EDGE = 12;

/** The card's rendered width: up to CARD_WIDTH, narrowed when the map column is too narrow for side gutters. */
export function cardWidth(boxWidth: number): number {
  return Math.min(CARD_WIDTH, Math.max(0, boxWidth - CARD_EDGE * 2));
}

/**
 * Where a marker's card goes, in screen pixels, and how tall it may grow before it scrolls: beside the marker (right,
 * else left), or where the box is too narrow for that (a phone), above or below it, whichever has room, and no taller
 * than that side, so it never covers the marker it describes. It stays below the box's `top` (the zoom steps and
 * close button) and above its `bottom` (the note, its credit and the way back to the picture), unless that would leave
 * a card too short to read: then it may reach over the footer, down to the box's edge or, on a computer, the dock.
 */
export function cardPosition(at: { left: number; top: number }, gap: number, box: { width: number; height: number; top?: number; bottom?: number; dock?: number }, height: number) {
  const edge = CARD_EDGE;
  const width = cardWidth(box.width);
  const ceiling = Math.max(edge, box.top ?? 0);
  const place = (floor: number) => {
    const tallest = floor - ceiling;
    const fitsRight = at.left + gap + width <= box.width - edge;
    const fitsLeft = at.left - gap - width >= edge;
    if (fitsRight || fitsLeft) {
      const shown = Math.min(height, tallest);
      return { left: fitsRight ? at.left + gap : at.left - gap - width, top: clamp(at.top - 28, ceiling, floor - shown), maxHeight: tallest };
    }
    const left = clamp(at.left - width / 2, edge, box.width - width - edge);
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
  // Set while rendering, so the full view never paints where it does not fit.
  if (!compact && !all && measured > maxHeight) setCompactFor(fit);
  // A compact card's row of chips scrolls sideways to the chosen place's chip and the site after it (the chip first,
  // where the two are wider than the row).
  const chips = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const row = chips.current;
    const pressed = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!compact || !row || !pressed) return;
    const where = pressed.nextElementSibling instanceof HTMLElement ? pressed.nextElementSibling : pressed;
    const left = pressed.offsetLeft - row.offsetLeft;
    const right = where.offsetLeft - row.offsetLeft + where.offsetWidth;
    // A little space either side where the two leave room for it.
    const room = Math.max(0, Math.min(4, (row.clientWidth - (right - left)) / 2));
    if (right - left > row.clientWidth || left < row.scrollLeft) row.scrollLeft = Math.max(0, left - room);
    else if (right > row.scrollLeft + row.clientWidth) row.scrollLeft = right - row.clientWidth + room;
  }, [compact, place.id]);
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
      // A stacked phone with Ask open leaves the map a thin strip, so the card steps aside with the steps and comes back
      // as Ask closes; a sideways small phone keeps the map's full height beside Ask.
      className={`absolute z-10 overflow-y-auto overscroll-contain max-md:[main:has([data-ask-page])_&]:hidden phone-land:[main:has([data-ask-page])_&]:block rounded-xl border border-white/10 bg-black/80 px-3 py-2 text-white/85 shadow-[0_10px_30px_rgba(0,0,0,0.5)] backdrop-blur-md ${opened ? "" : "pointer-events-none"}`}
      style={{ left, top, width: cardWidth(box.width), maxHeight }}
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
      {compact ? (
        // Compact, the place chips name the places where there are several; otherwise one line names the place.
        choices.length > 1 ? null : (
          <p className="pr-7 leading-snug">
            <span className="font-serif text-base text-white">{entries[0].place.name}</span> <span className="text-[11px] text-white/55">{whereShort(entries[0])}</span>
          </p>
        )
      ) : shared ? (
        <>
          {/* A described site ("south of the Lisan") reads as its own heading. */}
          <p className="pr-6 text-xs leading-snug text-white/70">{capitalised(atSite(site(entries[0])))}</p>
          {/* One line for each place there. */}
          {entries.map(({ place: each, index }) => (
            <p key={`${each.id}:${index}`} className="mt-1 text-[11px] leading-snug text-white/55">
              <span className="font-serif text-[15px] text-white">{each.name}</span>{" "}
              {each.debated ? rank(each, index, true) : "settled"}
            </p>
          ))}
        </>
      ) : (
        entries.map(({ place: each, index }, row) => (
          <div key={`${each.id}:${index}`} className={row > 0 ? "mt-2 border-t border-white/10 pt-2" : "pr-6"}>
            <p className="font-serif text-base leading-tight text-white">{each.name}</p>
            {each.debated ? (
              <>
                <p className="mt-1 text-xs leading-snug">Proposed {atSite(each.sites[index].name)}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-white/55">{capitalised(rank(each, index))}</p>
              </>
            ) : (
              <p className="mt-0.5 text-xs leading-snug">{each.sites[index].name === each.name ? "Its site is settled" : capitalised(atSite(each.sites[index].name))}</p>
            )}
          </div>
        ))
      )}
      <div data-chapters className={compact && choices.length > 1 ? "" : compact ? "mt-1.5 border-t border-white/10 pt-1.5" : "mt-2 border-t border-white/10 pt-2"}>
        {choices.length > 1 ? (
          // Where places share the marker, which one's chapters to show.
          // Compact, the chips keep to one row that scrolls sideways, so many places never push the chapters down.
          <div ref={chips} data-place-chips data-scrolls-sideways={compact ? "" : undefined} className={`flex items-center gap-1 ${compact ? "mb-1 mr-7 overflow-x-auto whitespace-nowrap [scrollbar-width:none]" : "mb-1.5 flex-wrap"}`}>
            {choices.map((entry) => (
              <Fragment key={`${entry.place.id}:${entry.index}`}>
                <button
                  type="button"
                  aria-pressed={entry.place.id === place.id}
                  onClick={() => {
                    remember({ place: entry.place.id });
                    setChosen(entry.place.id);
                    setAll(false);
                  }}
                  className="shrink-0 rounded-full border border-white/15 px-2 py-0.5 font-serif text-[13px] text-white/75 aria-pressed:border-[#f3e6c8] aria-pressed:bg-[#f3e6c8] aria-pressed:text-[#1b1a18] focus-visible:outline-2 focus-visible:outline-white"
                >
                  {entry.place.name}
                </button>
                {/* The chosen place's site, after its chip (places at one marker can stand at different sites), so it
                    scrolls into view with the chip however many places share the row. */}
                {compact && entry.place.id === place.id ? <span className="shrink-0 text-[11px] text-white/55">{whereShort(entry)}</span> : null}
              </Fragment>
            ))}
          </div>
        ) : null}
        <PlaceChapters key={place.id} place={place} here={here} reference={reference} compact={compact} all={all} onAll={() => {
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

/** Where a place is, in a few words for the compact card: "at Beitin", "proposed at Beitin", "settled". */
function whereShort({ place, index }: MarkerEntry): string {
  const site = place.sites[index].name;
  if (place.debated) return `proposed ${atSite(site)}`;
  return site === place.name ? "settled" : atSite(site);
}

/**
 * A site's name as a place to be: "at Beitin". Some sites are described rather than named ("between Aleppo and
 * Carchemish", "mouth of Wadi Mujib"), and take their own words: "between Aleppo and Carchemish", "at the mouth of
 * Wadi Mujib", "in the hills of Ephraim".
 */
export function atSite(site: string): string {
  if (!/^[a-z]/.test(site)) return `at ${site}`;
  const words = DESCRIBED_SITES.find(([start]) => start.test(site))?.[1] ?? "at the ";
  return `${words}${site}`;
}

/** The words before a described site, by how it opens (any other takes "at the"). */
const DESCRIBED_SITES: [RegExp, string][] = [
  [/^(between|near|(east|north|south|west) of) /, ""],
  [/^(hills|southern|upper) /, "in the "],
  [/^southwestern /, "in "],
  [/^(plain|road|western cliff) /, "on the "],
];

const capitalised = (text: string) => text.replace(/^./, (c) => c.toUpperCase());

/** "Genesis 28:19". */
const chapterReference = (named: PlaceChapter) => `${named.book} ${named.chapter}:${named.verse}`;

const CHAPTER_LINK =
  "font-serif text-[15px] italic text-white underline decoration-white/30 underline-offset-[3px] hover:decoration-white/70 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white";

/**
 * A place's chapters around this verse: the one before (‹), this verse, the one after (›), each a link, and the way to
 * every chapter that names the place, grouped by part of the Bible. Compact, the chapters before and after share one
 * row, without the count above them or this verse's row.
 */
function PlaceChapters({ place, here, reference, compact, all, onAll, onChapter }: {
  place: SettingPlace;
  here: MapHere;
  reference: string;
  compact: boolean;
  all: boolean;
  onAll: () => void;
  onChapter: (direction: "before" | "after" | "current" | "list") => void;
}) {
  const { chapters, current, before, after } = chaptersAround(place.id, here.slug, here.chapter);
  const verses = chapters.reduce((sum, named) => sum + named.verses, 0);
  // A setting carried from an earlier verse: the way to the verse in this chapter that names the place.
  const namedIn = current && current.verse !== here.verse ? (
    <span>
      named in{" "}
      <Link href={chapterUrl(current)} aria-label={`Named in ${chapterReference(current)}`} onClick={() => onChapter("current")} className="text-white/80 underline decoration-white/30 underline-offset-2 hover:text-white focus-visible:outline-2 focus-visible:outline-white">
        {chapterReference(current)}
      </Link>
    </span>
  ) : null;
  // Compact, two long references would not share the row ("Song of Solomon 5:8", "1 Kings 15:13 · 2 Chronicles
  // 15:16"): they are then shown short, without the book in this verse's book ("5:8") and with its short name in
  // another ("1 Kgs 15:13"). About 28 characters fit beside the arrows in the card's width.
  const crowded = compact && (before ? chapterReference(before).length : 0) + (after ? chapterReference(after).length : 0) > 28;
  const shown = (named: PlaceChapter) =>
    !crowded ? undefined : named.slug === here.slug ? `${named.chapter}:${named.verse}` : `${bookAbbreviation(named.bookId, named.book)} ${named.chapter}:${named.verse}`;
  return (
    <>
      {/* One list in both views, so a link keeps keyboard focus as the card turns compact. */}
      {compact ? null : (
        <p className="text-[10px] uppercase tracking-[0.16em] text-white/55">
          {place.name} · {verses} {verses === 1 ? "verse" : "verses"} in {chapters.length} {chapters.length === 1 ? "chapter" : "chapters"}
        </p>
      )}
      <ol className={compact ? "flex flex-wrap items-baseline gap-x-3" : "mt-1"}>
        {/* Compact, "named in" moves under the row: keyed, so only it moves and the order you tab in is the order shown. */}
        {(compact ? ["before", "current", "after", "named"] : ["before", "current", "named", "after"]).map((row) => {
          if (row === "before") return before ? <NeighbourRow key={row} glyph="‹" side="Before" named={before} compact={compact} shown={shown(before)} onFollow={() => onChapter("before")} /> : null;
          if (row === "after") return after ? <NeighbourRow key={row} glyph="›" side="After" named={after} compact={compact} shown={shown(after)} onFollow={() => onChapter("after")} /> : null;
          if (row === "named") return namedIn ? <li key={row} className={compact ? "basis-full text-[11px] text-white/55" : "flex items-baseline gap-2 pb-0.5 pl-5 text-[11px] text-white/55"}>{namedIn}</li> : null;
          return (
            <li key={row} aria-current="true" className={compact ? "hidden" : "flex items-baseline gap-2 py-0.5"}>
              <span aria-hidden="true" className="w-3 text-[9px] text-[#e8c37a]">●</span>
              <span className="font-serif text-[15px] italic text-[#e8c37a]">
                {reference} <span className="font-sans text-[11px] not-italic text-white/55">· this verse{current && current.verses > 1 ? ` · ${current.verses} in the chapter` : ""}</span>
              </span>
            </li>
          );
        })}
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

/**
 * The chapter before or after this one at a place: a link to it, with how many of its verses name the place. Compact,
 * the two share a row, the one after at its right end with › after it, and the counts are left out. `shown` is a
 * shorter reference to show ("5:8", "1 Kgs 15:13"); the link's name keeps it and the whole one.
 */
function NeighbourRow({ glyph, side, named, compact, shown, onFollow }: { glyph: string; side: "Before" | "After"; named: PlaceChapter; compact: boolean; shown?: string; onFollow: () => void }) {
  const after = side === "After";
  // The name holds what shows ("1 Kgs 15:13"), so voice control finds it, and the whole reference.
  const whole = chapterReference(named);
  const label = shown && !whole.includes(shown) ? `${side}: ${shown} (${whole})` : `${side}: ${whole}`;
  return (
    <li className={`flex items-baseline py-0.5 ${compact ? `gap-1.5 ${after ? "ml-auto flex-row-reverse" : ""}` : "gap-2"}`}>
      <span aria-hidden="true" className={`text-white/45 ${compact ? "" : "w-3"}`}>{glyph}</span>
      <span>
        <Link href={chapterUrl(named)} aria-label={label} onClick={onFollow} className={CHAPTER_LINK}>{shown ?? chapterReference(named)}</Link>
        {named.verses > 1 && !compact ? <span className="text-[11px] text-white/45"> · {named.verses} verses</span> : null}
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
