"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { Minus, Plus, X } from "lucide-react";
import outline from "@/data/bible-map-outline.json";
import today from "@/data/today-map.json";
import { MAP_BOUNDS, project } from "@/lib/bible-map-projection";
import { contextPlaces, divisionOf, chaptersAround, chapterUrl, nearbyPlaces, type PlaceChapter } from "@/lib/place-chapters";
import type { SettingPlace, VerseSetting } from "@/lib/verse-setting";
import { remember, remembered } from "./place-map-memory";

/** The map's box in map units: x, y (top-left), width and height. */
export interface MapFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The smallest stretch of latitude the map shows (in degrees): a few towns apart, or a whole land for a region. */
const MIN_SPAN = 3.5;
const MIN_REGION_SPAN = 9;

/**
 * The part of the world that frames a setting: every proposed site with room around it, at least a few towns
 * across (a whole land when the setting is only regions), and never past the edges of the map outline. `minSpan`
 * overrides how close it may come, for the zoom steps.
 */
export function frameSetting(setting: VerseSetting, minSpan?: number): MapFrame {
  const sites = setting.places.flatMap((place) => place.sites);
  const lons = sites.map((site) => site.lon);
  const lats = sites.map((site) => site.lat);
  const regionsOnly = setting.places.every((place) => place.region);
  const least = regionsOnly ? MIN_REGION_SPAN : minSpan ?? MIN_SPAN;
  const centre = { lon: (Math.min(...lons) + Math.max(...lons)) / 2, lat: (Math.min(...lats) + Math.max(...lats)) / 2 };
  // Never wider than the outline: a setting spanning the Bible world (Tarshish to Ophir) shows all of it.
  const latSpan = Math.min(MAP_BOUNDS.north - MAP_BOUNDS.south, Math.max(least, (Math.max(...lats) - Math.min(...lats)) * 1.5));
  const lonSpan = Math.min(MAP_BOUNDS.east - MAP_BOUNDS.west, Math.max(least, (Math.max(...lons) - Math.min(...lons)) * 1.5));
  const west = clamp(centre.lon - lonSpan / 2, MAP_BOUNDS.west, MAP_BOUNDS.east - lonSpan);
  const north = clamp(centre.lat + latSpan / 2, MAP_BOUNDS.south + latSpan, MAP_BOUNDS.north);
  const [x, y] = project(west, north);
  const [right, bottom] = project(west + lonSpan, north - latSpan);
  return { x, y, width: right - x, height: bottom - y };
}

/** The map's zoom steps, closest first; the land is how the map opens. */
export type ZoomStep = "here" | "land" | "world";
export const ZOOM_STEPS: ZoomStep[] = ["here", "land", "world"];
const STEP_NAMES: Record<ZoomStep, [string, string]> = { here: ["Here", "Here"], land: ["The land", "Land"], world: ["The Bible world", "World"] };

/** The closest the Here step comes: half a degree of latitude, about 55 km. */
const HERE_SPAN = 0.5;
/** Below this map width, in pixels, the zoom steps take their short names and drop − and +. */
const COMPACT_WIDTH = 720;
/** The locator's size, and the least map width it shows on. */
const LOCATOR = { width: 144, height: 88 };
const LOCATOR_ROOM = 600;
/** The Bible world: Greece and Libya to Persia, Ethiopia's edge to the Black Sea. */
const BIBLE_WORLD = { west: 8, east: 56, south: 14, north: 44 };

/**
 * Each zoom step's frame, and whether it shows anything the land does not in this box: Here closes in on the sites,
 * the land is the opening frame, and the Bible world is that region joined with the land, so the setting stays in it.
 * Frames are compared as the box fits them, so a frame narrower only where the box's other side limits it counts as the same.
 */
export function zoomFrames(setting: VerseSetting, box: MapBox): { frames: Record<ZoomStep, MapFrame>; usable: Record<ZoomStep, boolean> } {
  const land = frameSetting(setting);
  const here = frameSetting(setting, HERE_SPAN);
  const [wx, wy] = project(BIBLE_WORLD.west, BIBLE_WORLD.north);
  const [wr, wb] = project(BIBLE_WORLD.east, BIBLE_WORLD.south);
  const x = Math.min(wx, land.x);
  const y = Math.min(wy, land.y);
  const world = { x, y, width: Math.max(wr, land.x + land.width) - x, height: Math.max(wb, land.y + land.height) - y };
  const landView = fitView(land, box);
  const near = (a: number, b: number) => Math.abs(a - b) < landView.width * 0.02;
  const same = (frame: MapFrame) => {
    const view = fitView(frame, box);
    return Math.abs(view.unit - landView.unit) < landView.unit * 0.02 && near(view.x, landView.x) && near(view.y, landView.y);
  };
  return { frames: { here, land, world }, usable: { here: !same(here), land: true, world: !same(world) } };
}

export { resetPlaceMap } from "./place-map-memory";

/** "Pi-hahiroth, Migdol and Baal-zephon", or in a sentence "the Red Sea". */
function listNames(places: SettingPlace[], prose = false): string {
  return andList(places.map((place) => (prose ? place.proseName : place.name)));
}

/** "A", "A and B", "A, B and C". */
const andList = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

/** The map's one line about its setting, in words a reader can trust. */
export function settingNote(setting: VerseSetting): string {
  const names = listNames(setting.places, true);
  const inRegion = setting.places.every((place) => place.region);
  const lead = setting.fromVerse !== null
    ? `Set ${inRegion ? "in" : "at"} ${names}, named in verse ${setting.fromVerse}.`
    : `${names.charAt(0).toUpperCase()}${names.slice(1)}.`;
  const debated = setting.places.filter((place) => place.debated);
  if (debated.length === 0) return lead;
  const plural = debated.length > 1;
  const which = debated.length === setting.places.length
    ? (plural ? "Their sites are" : "Its site is")
    : `The ${plural ? "sites" : "site"} of ${listNames(debated, true)} ${plural ? "are" : "is"}`;
  return `${lead} ${which} debated; rings show the proposed sites, larger where more sources favour them.`;
}

const SEA = "#0f1a22";
const LAND = "#2a2118";
const COAST = "#7d6848";
const RIVER = "#46606e";

/** The map as it is read: the Bible's places on an ancient-toned land (then), or on today's borders and cities. */
export type MapView = "then" | "today";
const VIEWS: MapView[] = ["then", "today"];
const VIEW_NAMES: Record<MapView, string> = { then: "Then", today: "Today" };
/** Today's map is cooler and plainer, so the verse's gold rings stand out from modern borders and cities. */
const PALETTE: Record<MapView, { sea: string; land: string; coast: string; river: string }> = {
  then: { sea: SEA, land: LAND, coast: COAST, river: RIVER },
  today: { sea: "#0d1620", land: "#23282c", coast: "#5a6770", river: "#3f6679" },
};
const BORDER = "#b4c0c8";

type TodayCountry = [name: string, x: number, y: number, rank: number];
type TodayCity = [name: string, x: number, y: number, rank: number, capital: number];
const todayCountries = today.countries as TodayCountry[];
const todayCities = today.cities as TodayCity[];
const GOLD = "#e8c37a";
const INK = "#f3e6c8";
// Behind each name, so it reads over coast, river and ring alike.
const HALO = "#17110b";

/** A place, and which of its sites (0 for a settled place). */
interface MarkerEntry {
  place: SettingPlace;
  index: number;
}

/**
 * One spot on the map: a ring when a debated place is proposed there, otherwise a pin. Places that share the spot
 * (Jerusalem and Zion, or two places both proposed at one town) share its marker, its name and its card.
 */
interface Marker {
  key: string;
  /** Where it is, in map units. */
  x: number;
  y: number;
  /** The ring's radius in screen pixels, growing with how widely sources favour the site; 0 for a pin. */
  radius: number;
  /** A site here is as widely favoured as any proposed for its place. */
  favoured: boolean;
  /** A settled place is here, so it has a pin's dot. */
  pinned: boolean;
  entries: MarkerEntry[];
  /** The names the map writes beside it. */
  names: string[];
}

/** The markers of a setting, largest ring first, so a smaller ring and every pin are drawn over (and reachable above) it. */
export function settingMarkers(setting: VerseSetting): Marker[] {
  const onlyOneDebated = setting.places.length === 1 && setting.places[0].debated;
  const markers = new Map<string, Marker>();
  for (const place of setting.places) {
    if (place.region && !place.debated) continue;
    place.sites.forEach((site, index) => {
      // About a kilometre: closer than that is one spot at any zoom the map shows.
      const key = `${site.lon.toFixed(2)},${site.lat.toFixed(2)}`;
      const [x, y] = project(site.lon, site.lat);
      const marker = markers.get(key) ?? { key, x, y, radius: 0, favoured: false, pinned: false, entries: [], names: [] };
      const top = place.sites[0].score;
      if (place.debated) {
        marker.radius = Math.max(marker.radius, 7 + 15 * Math.sqrt(site.score / top));
        marker.favoured ||= site.score === top;
      } else {
        marker.pinned = true;
      }
      marker.entries.push({ place, index });
      // A lone debated place names its sites; otherwise each place is named once, at its most favoured site.
      const name = !place.debated ? place.name : onlyOneDebated ? site.name : index === 0 ? place.name : null;
      if (name && !marker.names.includes(name)) marker.names.push(name);
      markers.set(key, marker);
    });
  }
  return [...markers.values()].sort((a, b) => b.radius - a.radius);
}

/** A rectangle in screen pixels. */
interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const inside = (box: Box, band: Box) => box.left >= band.left && box.right <= band.right && box.top >= band.top && box.bottom <= band.bottom;
const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), Math.max(low, high));

/** About how wide a name is in the serif face (no layout pass to measure it). */
const nameWidth = (text: string, size: number, spacing = 0, capitals = false) => text.length * (size * (capitals ? 0.72 : 0.5) + spacing);
/** About how wide a city's name is in the sans face, with its outline: wider than the serif reckoning. */
const sansNameWidth = (text: string, size: number) => text.length * size * 0.6 + 3;

/** A name placed on the map, in screen pixels: its anchor point, alignment and size. */
export interface PlacedName {
  key: string;
  text: string;
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  size: number;
}

/**
 * Where each marker's name goes, in screen pixels: beside its marker on the right, else the left, above, below or at a corner,
 * never over another name, a region's name or another marker's centre, and inside the map's free band. A name with no
 * room is left out; its marker's card still names it.
 */
export function placeNames(
  markers: { key: string; left: number; top: number; radius: number; names: string[] }[],
  regions: Box[],
  band: Box,
  size: number,
  {
    spots = 8,
    widthOf = nameWidth,
  }: {
    /** How many of the spots to try: all eight, or only the four beside, above and below (no corners). */
    spots?: number;
    /** How wide a name is reckoned, for a face other than the serif. */
    widthOf?: (text: string, size: number) => number;
  } = {},
): PlacedName[] {
  const taken: Box[] = [...regions];
  const centres = markers.map((marker) => ({ key: marker.key, box: { left: marker.left - 6, top: marker.top - 6, right: marker.left + 6, bottom: marker.top + 6 } }));
  const placed: PlacedName[] = [];
  // The most favoured and settled first, then by size: they matter most when there is room for only some.
  for (const marker of markers) {
    if (marker.names.length === 0) continue;
    // All the names there, or where they will not fit, the first alone.
    const texts = marker.names.length > 1 ? [marker.names.join(" · "), marker.names[0]] : marker.names;
    const ascent = size * 0.75;
    const descent = size * 0.25;
    const reach = Math.max(marker.radius, 5) + 5;
    const candidates: Omit<PlacedName, "key" | "text" | "size">[] = [
      { x: marker.left + reach, y: marker.top + size * 0.3, anchor: "start" },
      { x: marker.left - reach, y: marker.top + size * 0.3, anchor: "end" },
      { x: marker.left, y: marker.top - reach - descent, anchor: "middle" },
      { x: marker.left, y: marker.top + reach + ascent, anchor: "middle" },
      // Then the corners, for a crowded spot.
      { x: marker.left + reach * 0.7, y: marker.top - reach * 0.7, anchor: "start" },
      { x: marker.left + reach * 0.7, y: marker.top + reach * 0.7 + ascent, anchor: "start" },
      { x: marker.left - reach * 0.7, y: marker.top - reach * 0.7, anchor: "end" },
      { x: marker.left - reach * 0.7, y: marker.top + reach * 0.7 + ascent, anchor: "end" },
    ];
    const others = centres.filter((centre) => centre.key !== marker.key).map((centre) => centre.box);
    const fit = texts.flatMap((text) => candidates.slice(0, spots).map((candidate) => ({ text, candidate }))).find(({ text, candidate }) => {
      const width = widthOf(text, size);
      const left = candidate.anchor === "start" ? candidate.x : candidate.anchor === "end" ? candidate.x - width : candidate.x - width / 2;
      const box = { left, top: candidate.y - ascent, right: left + width, bottom: candidate.y + descent };
      if (!inside(box, band) || taken.some((other) => overlaps(box, other)) || others.some((other) => overlaps(box, other))) return false;
      taken.push(box);
      return true;
    });
    if (fit) placed.push({ key: marker.key, text: fit.text, size, ...fit.candidate });
  }
  return placed;
}

/** The box a placed name covers, in screen pixels, as `placeNames` reckons it. */
export function nameBox(name: PlacedName): Box {
  const width = nameWidth(name.text, name.size);
  const left = name.anchor === "start" ? name.x : name.anchor === "end" ? name.x - width : name.x - width / 2;
  return { left, top: name.y - name.size * 0.75, right: left + width, bottom: name.y + name.size * 0.25 };
}

/**
 * Where the locator goes, in screen pixels: the map's bottom-right corner, just above the note, on a map wide enough
 * for it. It gives way (null) where it would cover any of `avoid`, the places the verse names.
 */
export function locatorSpot(box: MapBox, avoid: Box[]): Box | null {
  if (box.width < LOCATOR_ROOM) return null;
  const spot = { left: box.width - 24 - LOCATOR.width, top: box.height - box.bottom - LOCATOR.height, right: box.width - 24, bottom: box.height - box.bottom };
  // No room between the controls and the note (a short window): it would cover the close button.
  if (spot.top - 6 < (box.clear ?? box.top)) return null;
  const margin = { left: spot.left - 6, top: spot.top - 6, right: spot.right + 6, bottom: spot.bottom + 6 };
  return avoid.some((other) => overlaps(margin, other)) ? null : spot;
}

/** The least height of map kept clear for the verse's places between the controls and the note: a full ring (44 px) and a little. */
const MIN_BAND = 56;

/**
 * How far the map's free band stays from the box's top and bottom, in screen pixels: below the lowest control and
 * above the note. A map too short for that (a phone's strip beside Ask) reaches up under the controls, which sit at
 * its sides, so its places are never framed under the note.
 */
export function freeBand({ height, controlsBottom, footerTop }: { height: number; controlsBottom: number; footerTop: number | null }) {
  const bottom = footerTop === null ? 0 : height - footerTop + 8;
  const wanted = controlsBottom > 0 ? controlsBottom + 8 : 0;
  return { top: Math.max(0, Math.min(wanted, height - bottom - MIN_BAND)), bottom, clear: wanted };
}

/** The map's free band: below the controls, above the note, in screen pixels. */
interface MapBox {
  width: number;
  height: number;
  top: number;
  bottom: number;
  /** Where the controls end, when a short map's `top` reaches above it: faint names, the card and the locator stay below it. */
  clear?: number;
  /** Whether the zoom steps and Then · Today are put away, on a map too short for them and its places. */
  squeezed?: boolean;
  /** The height under the note that a card never covers: the page-turn dock on a computer. */
  dock?: number;
  /** How tall the note may grow before it scrolls. */
  noteCap?: number;
}

/**
 * The part of the map the box shows (a viewBox in map units) and the map units per screen pixel: the frame fits in the
 * band between the controls and the note, so no place the verse names sits under them.
 */
export function fitView(frame: MapFrame, box: MapBox) {
  const bandTop = box.top;
  const bandHeight = Math.max(box.height - box.top - box.bottom, 40);
  const unit = Math.max(frame.width / box.width, frame.height / bandHeight);
  return {
    unit,
    x: frame.x + frame.width / 2 - (box.width * unit) / 2,
    y: frame.y + frame.height / 2 - (bandTop + bandHeight / 2) * unit,
    width: box.width * unit,
    height: box.height * unit,
  };
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

/** What a reader did on the map, for analytics. */
export type MapExploration =
  | { action: "zoom"; step: ZoomStep }
  | { action: "chapter"; direction: "before" | "after" | "current" | "list" }
  | { action: "view"; view: MapView }
  | { action: "all_chapters" };

/** The verse being read: its book's slug, chapter and verse. */
export interface MapHere {
  slug: string;
  chapter: number;
  verse: number;
}

/**
 * The map in the picture's place: the Bible world drawn from Natural Earth, with the verse's setting on it. A settled
 * place is a pin and its name; a debated place is a ring at each proposed site, sized by its score; a settled region
 * is a wide label. Well-known places around it are named faintly. Sizes are in screen pixels whatever the zoom, which
 * moves in three named steps.
 */
export default function PlaceMapView({ setting, reference, here, onClose, onExplore, picture, takeFocus }: {
  setting: VerseSetting;
  reference: string;
  here: MapHere;
  onClose: () => void;
  onExplore?: (exploration: MapExploration) => void;
  /** The way back to the picture (the painting window), when the verse has one. */
  picture?: ReactNode;
  /** Whether the map should take focus as it opens: it was opened from the keyboard. */
  takeFocus?: () => boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const leftControls = useRef<HTMLDivElement>(null);
  const footer = useRef<HTMLDivElement>(null);
  const map = useRef<SVGSVGElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<MapBox | null>(null);
  // Before the first paint, so the map never shows a frame laid out for another size.
  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    const measure = () => {
      // Below the lower of the two control groups: the steps and Then · Today on the left (wrapped to two rows where the
      // map is too narrow for one), the close button on the right.
      // A put-away group is invisible, not removed, so it is still measured here and comes back when there is room.
      const bottomOf = (node: HTMLElement | null) => (node && node.offsetHeight > 0 ? node.offsetTop + node.offsetHeight : 0);
      const right = bottomOf(controls.current);
      const left = bottomOf(leftControls.current);
      const both = Math.max(left, right);
      const dock = footer.current ? node.clientHeight - footer.current.offsetTop - footer.current.offsetHeight : 0;
      // The note scrolls past three tenths of the map, or sooner where the controls and the setting need the room.
      const noteCap = Math.max(34, Math.min(Math.round(node.clientHeight * 0.3), node.clientHeight - dock - 8 - MIN_BAND - (both > 0 ? both + 8 : 0)));
      // Where the note's top will be once that cap applies (its text, inside its border, or the picture beside it), so a
      // resize never puts the steps away for a note about to shrink.
      const note = footer.current?.querySelector("p") ?? null;
      const settled = footer.current
        ? note
          ? Math.max(...Array.from(footer.current.children, (child) => (child === note ? 0 : (child as HTMLElement).offsetHeight)), Math.min(note.scrollHeight + 2, noteCap))
          : footer.current.offsetHeight
        : 0;
      const footerTop = footer.current ? node.clientHeight - dock - settled : null;
      // Too short for the steps and the places (a short window): the steps go, as beside Ask on a phone.
      const squeezed = left > 0 && freeBand({ height: node.clientHeight, controlsBottom: both, footerTop }).top < both + 8;
      // Focus there would fall to the page as they go: the map keeps it, and Tab walks on from there.
      if (squeezed && leftControls.current?.contains(document.activeElement)) map.current?.focus();
      const { top, bottom, clear } = freeBand({ height: node.clientHeight, controlsBottom: squeezed ? right : both, footerTop });
      setMeasured(node.clientWidth > 0 && node.clientHeight > 0 ? { width: node.clientWidth, height: node.clientHeight, top, bottom, clear, squeezed, dock, noteCap } : null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    if (footer.current) observer.observe(footer.current);
    if (leftControls.current) observer.observe(leftControls.current);
    if (controls.current) observer.observe(controls.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (takeFocus?.()) map.current?.focus();
  }, [takeFocus]);

  // The marker under the pointer or keyboard focus, which previews its card, and the one opened by a click, tap or
  // Enter, whose card stays and can be used.
  const [preview, setPreview] = useState<string | null>(null);
  const [opened, setOpened] = useState<string | null>(() => remembered.opened);
  // Kept for the next page once this render commits, so a render React discards changes nothing.
  useEffect(() => {
    remember({ opened });
  }, [opened]);
  const focused = useRef<string | null>(null);
  // The marker with keyboard focus, drawn lit: with a card open, focus moving to another marker does not swap the card.
  const [keyFocus, setKeyFocus] = useState<string | null>(null);
  const focusCard = useRef(false);
  const [chosenStep, setChosenStep] = useState<ZoomStep>(() => remembered.step);
  const [mapView, setMapView] = useState<MapView>(() => remembered.view);
  const showView = (next: MapView) => {
    if (next === mapView) return;
    remember({ view: next });
    setMapView(next);
    onExplore?.({ action: "view", view: next });
  };
  const colours = PALETTE[mapView];

  const markers = settingMarkers(setting);
  // A card opened at a site this verse's setting does not have closes as the page turns, or as the map opens on one.
  const openedHere = opened !== null && markers.some((marker) => marker.key === opened);
  const [seenSetting, setSeenSetting] = useState<VerseSetting | null>(null);
  if (seenSetting !== setting) {
    setSeenSetting(setting);
    if (opened !== null && !openedHere) setOpened(null);
  }

  // Before the box is measured (and in tests), a nominal box.
  const size = measured ?? { width: 800, height: 600, top: 0, bottom: 0 };
  const { frames, usable } = zoomFrames(setting, size);
  // A step this setting cannot show (Here for a setting of only regions) falls back to the land.
  const step = usable[chosenStep] ? chosenStep : "land";
  const zoomTo = (next: ZoomStep) => {
    if (!usable[next] || next === chosenStep) return;
    // Choosing the land while it stands in for an unusable Here keeps the land for later pages, without moving the map.
    remember({ step: next });
    setChosenStep(next);
    if (next !== step) onExplore?.({ action: "zoom", step: next });
  };
  // A narrow map (a phone, or a computer's window beside the words page) has the short names and no − and +, so the
  // steps stay clear of the close button on the same row.
  const compact = size.width < COMPACT_WIDTH;
  const stepIndex = ZOOM_STEPS.indexOf(step);
  const closer = ZOOM_STEPS.slice(0, stepIndex).reverse().find((candidate) => usable[candidate]) ?? null;
  const wider = ZOOM_STEPS.slice(stepIndex + 1).find((candidate) => usable[candidate]) ?? null;

  const view = fitView(frames[step], size);
  const px = (pixels: number) => pixels * view.unit;
  /** Where a map point sits in the box, in screen pixels. */
  const toScreen = (x: number, y: number) => ({ left: (x - view.x) / view.unit, top: (y - view.y) / view.unit });

  const band = { left: 4, top: Math.max(4, size.top - 8), right: size.width - 4, bottom: size.height - Math.max(4, size.bottom - 8) };
  // Context (the faint ancient places, today's countries and cities) never reaches under the controls or the header,
  // even where a short map lets the setting.
  const contextBand = { ...band, top: Math.max(band.top, (size.clear ?? size.top) - 8) };
  const rings = markers.map((marker) => {
    const at = toScreen(marker.x, marker.y);
    const reach = Math.max(marker.radius, 8);
    return { left: at.left - reach, top: at.top - reach, right: at.left + reach, bottom: at.top + reach };
  });
  // A region's name goes at its point, or up to three lines above or below it, then to either side, clear of every
  // marker's ring and the other regions, inside the band.
  const regionBoxes: Box[] = [];
  const regions = setting.places.filter((place) => place.region && !place.debated).map((place) => {
    const at = toScreen(...project(place.sites[0].lon, place.sites[0].lat));
    const width = nameWidth(place.name, 17, 5, true);
    // Kept inside the box, so a region at the frame's edge is still read whole.
    const start = clamp(at.left, width / 2 + 6, size.width - width / 2 - 6);
    const boxAt = (left: number, top: number) => ({ left: left - width / 2, top: top - 14, right: left + width / 2, bottom: top + 4 });
    const clear = (box: Box) => inside(box, band) && !regionBoxes.some((other) => overlaps(box, other)) && !rings.some((ring) => overlaps(box, ring));
    // Straight above or below before any step aside, so a region's name stays over its land.
    const spots = [0, -0.6, 0.6].flatMap((dx) => [0, -22, 22, -44, 44, -66, 66].map((dy) => ({ left: clamp(start + dx * width, width / 2 + 6, size.width - width / 2 - 6), top: at.top + dy })));
    const spot = spots.find((candidate) => clear(boxAt(candidate.left, candidate.top))) ?? { left: start, top: clamp(at.top, band.top + 14, band.bottom - 4) };
    regionBoxes.push(boxAt(spot.left, spot.top));
    return { place, ...spot };
  });
  const locatorBox = step === "world" ? null : locatorSpot(size, [...rings, ...regionBoxes]);
  const onlyOneDebated = setting.places.length === 1 && setting.places[0].debated;
  const names = placeNames(
    [...markers]
      .sort((a, b) => Number(b.favoured || b.pinned) - Number(a.favoured || a.pinned) || b.radius - a.radius)
      .map((marker) => ({ key: marker.key, ...toScreen(marker.x, marker.y), radius: marker.radius, names: marker.names })),
    locatorBox ? [...regionBoxes, locatorBox] : regionBoxes,
    band,
    onlyOneDebated ? 13 : 15,
  );
  // Well-known places around the setting, faint and small, the most named first and only where a name fits clear of
  // everything the setting draws.
  const settingNames = new Set(setting.places.map((place) => place.name));
  const centres = markers.map((marker) => toScreen(marker.x, marker.y));
  const nearbyDots = mapView === "today" ? [] : contextPlaces()
    .filter((place) => !settingNames.has(place.name))
    .map((place) => ({ place, at: toScreen(...project(place.lon, place.lat)) }))
    .filter(({ at }) => at.left > contextBand.left + 8 && at.left < contextBand.right - 8 && at.top > contextBand.top + 8 && at.top < contextBand.bottom - 8)
    .filter(({ at }) => centres.every((centre) => Math.hypot(centre.left - at.left, centre.top - at.top) > 16))
    .filter(({ at }) => !locatorBox || !overlaps({ left: at.left - 4, top: at.top - 4, right: at.left + 4, bottom: at.top + 4 }, locatorBox))
    .slice(0, 40);
  const faint = placeNames(
    nearbyDots.map(({ place, at }) => ({ key: place.id, ...at, radius: 0, names: [place.name] })),
    [...regionBoxes, ...rings, ...names.map(nameBox), ...(locatorBox ? [locatorBox] : [])],
    contextBand,
    12,
  ).slice(0, 10);

  // Today's map: country names where Natural Earth puts them, then the most important cities that fit, each clear of
  // everything the setting draws.
  const lettering = [...regionBoxes, ...names.map(nameBox), ...(locatorBox ? [locatorBox] : [])];
  const taken = [...lettering, ...rings];
  const countryLabels: { name: string; left: number; top: number }[] = [];
  const cityDots: { key: string; left: number; top: number }[] = [];
  let cityNames: PlacedName[] = [];
  if (mapView === "today") {
    for (const [name, x, y] of todayCountries) {
      if (countryLabels.length >= 12) break;
      const at = toScreen(x, y);
      const width = nameWidth(name, 11, 3, true);
      const spot = { left: at.left - width / 2, top: at.top - 9, right: at.left + width / 2, bottom: at.top + 3 };
      if (!inside(spot, contextBand) || taken.some((other) => overlaps(spot, other))) continue;
      taken.push(spot);
      lettering.push(spot);
      countryLabels.push({ name, left: at.left, top: at.top });
    }
    const reaches = markers.map((marker) => ({ ...toScreen(marker.x, marker.y), reach: Math.max(marker.radius, 14) + 4 }));
    const candidates = todayCities
      .map(([name, x, y], index) => ({ key: `city-${index}`, name, at: toScreen(x, y) }))
      .filter(({ at }) => at.left > contextBand.left + 8 && at.left < contextBand.right - 8 && at.top > contextBand.top + 8 && at.top < contextBand.bottom - 8)
      // Never in a marker's ring or a pin's tap target, where it would read as a proposed site, nor on any lettering.
      .filter(({ at }) => reaches.every((marker) => Math.hypot(marker.left - at.left, marker.top - at.top) > marker.reach))
      .filter(({ at }) => !lettering.some((other) => overlaps({ left: at.left - 3, top: at.top - 3, right: at.left + 3, bottom: at.top + 3 }, other)))
      // The most important first, and none crowding one already kept, so a small town's dot never costs a capital its name.
      .reduce<{ key: string; name: string; at: { left: number; top: number } }[]>((kept, city) => {
        if (kept.length < 24 && kept.every((other) => Math.hypot(other.at.left - city.at.left, other.at.top - city.at.top) >= (compact ? 44 : 28))) kept.push(city);
        return kept;
      }, []);
    // A city's name sits beside, above or below its dot, never at a corner, where it could be read as another dot's.
    cityNames = placeNames(candidates.map(({ key, name, at }) => ({ key, ...at, radius: 0, names: [name] })), taken, contextBand, 12, { spots: 4, widthOf: sansNameWidth }).slice(0, compact ? 8 : 14);
    for (const placed of cityNames) cityDots.push({ key: placed.key, ...candidates.find((city) => city.key === placed.key)!.at });
  }

  const label = `Map of ${listNames(setting.places)}, where ${reference} happened`;
  // Today's names are drawn for the eye only; a screen reader hears them here.
  const todayId = useId();
  const todayNames = [
    countryLabels.length ? andList(countryLabels.map((country) => country.name)) : "",
    cityNames.length ? `the cities ${andList(cityNames.map((city) => city.text))}` : "",
  ].filter(Boolean);
  const todayDescription = mapView === "today" && todayNames.length ? `Today's map names ${todayNames.join(", and ")}.` : null;
  // An opened card holds; a preview shows only while none is open.
  const shownKey = openedHere ? opened : preview;
  const lit = markers.find((marker) => marker.key === shownKey) ?? null;
  const usableCard = lit !== null && lit.key === opened;
  // The card is the focus indicator, so a pointer passing over keeps the focused marker's card on leaving. A marker a
  // page turn removed may never have sent blur (Firefox), so only one of this setting's counts.
  const leave = () => setPreview(!openedHere && focused.current && markers.some((other) => other.key === focused.current) ? focused.current : null);
  // An opened card holds while the pointer crosses other markers on its way to the card's links.
  const hover = (key: string) => {
    if (!openedHere) setPreview(key);
  };
  const focusCardContents = () => (cardRef.current?.querySelector<HTMLElement>("a") ?? cardRef.current?.querySelector<HTMLElement>("button"))?.focus();
  const open = (key: string, fromKeyboard = false) => {
    // Already open (the reader went back to its marker with Shift+Tab): nothing re-renders, so focus the card now.
    if (fromKeyboard && key === opened && openedHere) {
      focusCardContents();
      return;
    }
    focusCard.current = fromKeyboard;
    setPreview(null);
    setOpened(key);
  };
  // Opened from the keyboard, the card takes focus, so its links come next.
  useEffect(() => {
    if (!usableCard || !focusCard.current) return;
    focusCard.current = false;
    focusCardContents();
  });
  const closeCard = (toMarker: boolean) => {
    const key = opened;
    setOpened(null);
    setPreview(null);
    if (toMarker && key) map.current?.querySelector<SVGGElement>(`[data-marker-key="${key}"]`)?.focus();
    else map.current?.focus();
  };

  return (
    <div ref={box} className="absolute inset-0 overflow-hidden" style={{ background: colours.sea }}>
      <svg
        ref={map}
        role="group"
        aria-label={label}
        aria-describedby={todayDescription ? todayId : undefined}
        tabIndex={-1}
        viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full outline-none"
        data-step={step}
        data-view={mapView}
        // A tap on the open map (not on a marker) puts the card away.
        onClick={(event) => {
          if ((event.target as Element).closest("[data-marker]")) return;
          setPreview(null);
          setOpened(null);
        }}
      >
        <path aria-hidden="true" d={outline.land} fill={colours.land} fillRule="evenodd" stroke={colours.coast} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path aria-hidden="true" d={outline.lakes} fill={colours.sea} stroke={colours.coast} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
        <path aria-hidden="true" d={outline.rivers} fill="none" stroke={colours.river} strokeWidth={1.2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {mapView === "today" ? (
          // Today's borders (disputed and indefinite lines dashed), countries and cities: quiet, under the setting.
          <g aria-hidden="true" pointerEvents="none" data-today>
            <path d={today.borders} fill="none" stroke={BORDER} strokeOpacity={0.5} strokeWidth={1} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <path d={today.disputed} fill="none" stroke={BORDER} strokeOpacity={0.45} strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            {countryLabels.map(({ name, left, top }) => (
              <text
                key={name}
                data-today-country={name}
                x={view.x + left * view.unit}
                y={view.y + top * view.unit}
                textAnchor="middle"
                fontSize={px(11)}
                letterSpacing={px(3)}
                fill="#ffffff"
                fillOpacity={0.5}
                className="font-sans uppercase"
              >
                {name}
              </text>
            ))}
            {cityDots.map(({ key, left, top }) => (
              <rect key={key} x={view.x + left * view.unit - px(2.5)} y={view.y + top * view.unit - px(2.5)} width={px(5)} height={px(5)} fill="#e6edf2" fillOpacity={0.8} />
            ))}
            {cityNames.map((name) => (
              <text
                key={name.key}
                data-today-city={name.text}
                x={view.x + name.x * view.unit}
                y={view.y + name.y * view.unit}
                textAnchor={name.anchor}
                fontSize={px(name.size)}
                fill="#e6edf2"
                fillOpacity={0.8}
                stroke={colours.land}
                strokeOpacity={0.8}
                strokeWidth={px(2.5)}
                paintOrder="stroke"
                className="font-sans"
              >
                {name.text}
              </text>
            ))}
          </g>
        ) : null}
        {/* Well-known places around the setting: context, not part of it, so quiet and not interactive. */}
        <g aria-hidden="true" pointerEvents="none" data-nearby>
          {faint.map((name) => {
            const dot = nearbyDots.find(({ place }) => place.id === name.key)!.at;
            return (
              <g key={name.key}>
                <circle cx={view.x + dot.left * view.unit} cy={view.y + dot.top * view.unit} r={px(2.5)} fill={INK} fillOpacity={0.5} />
                <text
                  x={view.x + name.x * view.unit}
                  y={view.y + name.y * view.unit}
                  textAnchor={name.anchor}
                  fontSize={px(name.size)}
                  fill={INK}
                  fillOpacity={0.6}
                  stroke={HALO}
                  strokeOpacity={0.7}
                  strokeWidth={px(2.5)}
                  paintOrder="stroke"
                  className="font-serif"
                >
                  {name.text}
                </text>
              </g>
            );
          })}
        </g>
        {markers.map((marker) => {
          const on = marker.key === shownKey || marker.key === keyFocus;
          const debatedNames = marker.entries.filter((entry) => entry.place.debated).map((entry) => entry.place.name);
          const pinNames = marker.entries.filter((entry) => !entry.place.debated).map((entry) => entry.place.name);
          return (
            <g
              key={marker.key}
              data-marker
              data-marker-key={marker.key}
              data-rings={debatedNames.length ? debatedNames.join(" · ") : undefined}
              data-pin={debatedNames.length ? undefined : pinNames.join(" · ")}
              tabIndex={0}
              role="button"
              aria-label={marker.entries.map(({ place, index }) => markerLabel(place, index)).join("; ")}
              aria-expanded={marker.key === opened && openedHere}
              onPointerEnter={() => hover(marker.key)}
              onPointerLeave={leave}
              onFocus={() => {
                focused.current = marker.key;
                setKeyFocus(marker.key);
                if (!openedHere) setPreview(marker.key);
              }}
              onBlur={() => {
                focused.current = null;
                setKeyFocus(null);
                setPreview(null);
              }}
              onClick={() => open(marker.key)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                open(marker.key, true);
              }}
              className="cursor-pointer outline-none"
            >
              {marker.radius > 0 ? (
                <circle
                  cx={marker.x}
                  cy={marker.y}
                  r={px(marker.radius)}
                  fill={GOLD}
                  fillOpacity={on ? 0.45 : marker.favoured ? 0.26 : 0.12}
                  stroke={on ? INK : GOLD}
                  strokeOpacity={on || marker.favoured ? 1 : 0.6}
                  strokeWidth={px(on ? 2 : 1.2)}
                />
              ) : (
                // A wider target than the dot, for a finger.
                <circle cx={marker.x} cy={marker.y} r={px(14)} fill="transparent" />
              )}
              {marker.pinned ? <circle cx={marker.x} cy={marker.y} r={px(on ? 6.5 : 5)} fill={INK} stroke={SEA} strokeWidth={px(1.5)} /> : null}
            </g>
          );
        })}
        {/* Names over every marker, each with a dark edge, so no ring crosses one. A name answers the pointer as its marker. */}
        <g aria-hidden="true" className="cursor-pointer font-serif" fill={INK} stroke={HALO} strokeOpacity={0.85} strokeLinejoin="round" paintOrder="stroke">
          {names.map((name) => (
            <text
              key={name.key}
              data-marker
              x={view.x + name.x * view.unit}
              y={view.y + name.y * view.unit}
              textAnchor={name.anchor}
              fontSize={px(name.size)}
              strokeWidth={px(3)}
              onPointerEnter={() => hover(name.key)}
              onPointerLeave={leave}
              onClick={() => open(name.key)}
            >
              {name.text}
            </text>
          ))}
        </g>
        {regions.map(({ place, left, top }) => (
          <text
            key={place.id}
            data-region={place.name}
            role="img"
            aria-label={place.name}
            pointerEvents="none"
            x={view.x + left * view.unit}
            y={view.y + top * view.unit}
            textAnchor="middle"
            fontSize={px(17)}
            letterSpacing={px(5)}
            fill={INK}
            fillOpacity={0.7}
            stroke={HALO}
            strokeOpacity={0.6}
            strokeWidth={px(3)}
            paintOrder="stroke"
            className="font-serif uppercase"
          >
            {place.name}
          </text>
        ))}
      </svg>

      {/*
        The zoom steps, named, and Then · Today, under the Visibible name. On a computer they share a row with the close
        button, and Then · Today wraps under the steps where that row is too narrow; on a phone the close button sits
        level with the name instead, so the steps and Then · Today keep one row. A phone with Ask open leaves the map a
        thin strip, so they go.
      */}
      <div
        ref={leftControls}
        inert={size.squeezed || undefined}
        className={`absolute left-3 top-[4.75rem] flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2 md:left-6 md:top-[5.5rem] md:max-w-[calc(100%-6rem)] max-md:[main:has([data-ask-page])_&]:hidden ${size.squeezed ? "invisible" : ""}`}
      >
      <div role="group" aria-label="Zoom" className="flex items-center gap-2">
        <div className="liquid-glass flex h-9 items-center overflow-hidden rounded-full p-0.5">
          {ZOOM_STEPS.map((candidate) => (
            <button
              key={candidate}
              type="button"
              aria-pressed={candidate === step}
              disabled={!usable[candidate]}
              onClick={() => zoomTo(candidate)}
              className="h-8 rounded-full px-2.5 text-[11px] text-white/75 transition-colors hover:text-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white disabled:opacity-35 disabled:hover:text-white/75 aria-pressed:bg-[#f3e6c8] aria-pressed:text-[#1b1a18] md:px-3 md:text-xs"
            >
              {STEP_NAMES[candidate][compact ? 1 : 0]}
            </button>
          ))}
        </div>
        <div className={`liquid-glass h-9 items-center overflow-hidden rounded-full ${compact ? "hidden" : "flex"}`}>
          <button
            type="button"
            aria-label="Zoom out"
            disabled={!wider}
            onClick={() => wider && zoomTo(wider)}
            className="grid h-9 w-9 place-items-center text-white/90 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white disabled:opacity-35"
          >
            <Minus size={15} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            disabled={!closer}
            onClick={() => closer && zoomTo(closer)}
            className="grid h-9 w-9 place-items-center border-l border-white/15 text-white/90 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white disabled:opacity-35"
          >
            <Plus size={15} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div role="group" aria-label="Map" className="liquid-glass flex h-9 items-center overflow-hidden rounded-full p-0.5">
        {VIEWS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={candidate === mapView}
            onClick={() => showView(candidate)}
            className="h-8 rounded-full px-2.5 text-[11px] text-white/75 transition-colors hover:text-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white aria-pressed:bg-[#f3e6c8] aria-pressed:text-[#1b1a18] md:px-3 md:text-xs"
          >
            {VIEW_NAMES[candidate]}
          </button>
        ))}
      </div>
      </div>

      <div ref={controls} className="absolute right-3 top-6 flex items-center gap-2 md:right-6 md:top-[5.5rem]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the map"
          className="liquid-glass grid size-9 place-items-center rounded-full text-white/90 focus-visible:outline-2 focus-visible:outline-white"
        >
          <X size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      {/* Above the dock on a computer, which floats over the bottom of the picture area. */}
      <div ref={footer} className="absolute inset-x-3 bottom-3 flex items-end gap-3 md:inset-x-6 md:bottom-28">
        {picture}
        {/* A long note (many places, beside the picture) scrolls rather than take the controls' room. */}
        <p
          style={{ maxHeight: size.noteCap ?? Math.round(size.height * 0.3) }}
          className="min-w-0 flex-1 overflow-y-auto rounded-xl border border-white/10 bg-black/75 px-3 py-2 text-[11px] leading-snug text-white/85 backdrop-blur-md md:max-w-xl md:text-xs"
        >
          {/* A phone with Ask open leaves the map a thin strip: the note keeps only its credit there. */}
          <span className="max-md:[main:has([data-ask-page])_&]:hidden">{settingNote(setting)} </span>
          <a href="https://www.openbible.info/geo/" target="_blank" rel="noreferrer" className="whitespace-nowrap text-white/55 underline decoration-white/25 underline-offset-2 hover:text-white/80">
            Places: OpenBible.info, CC BY 4.0
          </a>
          {/*
            Both views are drawn from Natural Earth, so the note reads the same on each and switching never changes its
            height. It is public domain, so a phone's strip beside Ask keeps only the credit OpenBible's licence asks for.
          */}
          <span className="text-white/55 max-md:[main:has([data-ask-page])_&]:hidden">
            {" · "}
            <span className="whitespace-nowrap">Map: Natural Earth</span>
          </span>
        </p>
      </div>
      {todayDescription ? (
        <p id={todayId} className="sr-only">
          {todayDescription}
        </p>
      ) : null}
      {/* Where the view sits in the Bible world, on a computer. */}
      {locatorBox ? <Locator at={locatorBox} world={frames.world} view={view} colours={colours} /> : null}

      {lit ? (
        <MarkerCard
          key={lit.key}
          cardRef={cardRef}
          entries={lit.entries}
          at={toScreen(lit.x, lit.y)}
          // Clear of the ring's edge (or the pin), whichever side the card goes.
          gap={Math.max(lit.radius, 6) + 10}
          box={size}
          opened={usableCard}
          here={here}
          reference={reference}
          onClose={() => closeCard(false)}
          onEscape={() => closeCard(true)}
          onExplore={onExplore}
        />
      ) : null}
    </div>
  );
}

/** A small map of the Bible world with the part the view shows marked on it. */
function Locator({ at, world, view, colours }: { at: Box; world: MapFrame; view: { x: number; y: number; width: number; height: number }; colours: (typeof PALETTE)[MapView] }) {
  // The view's rectangle, kept inside the small map and never too small to see.
  const least = world.width / 40;
  const left = clamp(view.x, world.x, world.x + world.width - least);
  const top = clamp(view.y, world.y, world.y + world.height - least);
  const width = Math.max(least, Math.min(view.x + view.width, world.x + world.width) - left);
  const height = Math.max(least, Math.min(view.y + view.height, world.y + world.height) - top);
  return (
    <svg
      aria-hidden="true"
      data-locator
      viewBox={`${world.x} ${world.y} ${world.width} ${world.height}`}
      // The whole frame, so the view's rectangle is always in sight (Rome, at Acts 28, is at its far edge).
      preserveAspectRatio="xMidYMid meet"
      className="absolute hidden overflow-hidden rounded-lg border-2 border-white/60 shadow-[0_10px_30px_rgba(0,0,0,0.6)] md:block"
      style={{ background: colours.sea, left: at.left, top: at.top, width: at.right - at.left, height: at.bottom - at.top }}
    >
      <path d={outline.land} fill={colours.land} fillRule="evenodd" stroke={colours.coast} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
      <path d={outline.lakes} fill={colours.sea} />
      <rect x={left} y={top} width={width} height={height} fill={GOLD} fillOpacity={0.25} stroke={GOLD} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** What a marker is, said once for a screen reader and shown in its card. */
function markerLabel(place: SettingPlace, index: number): string {
  const site = place.sites[index];
  if (!place.debated) return site.name === place.name ? place.name : `${place.name}, at ${site.name}`;
  return `${place.name}: proposed at ${site.name}, ${rank(place, index)}`;
}

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

/**
 * The card by the marker under the pointer or focus, or opened by a click, tap or Enter: each place there, where it
 * is proposed and how it ranks, then a place's chapters in the Bible around this verse and the places nearby. Only an
 * opened card can be used (its links, its full list of chapters, its close button); a previewed one is a glance.
 */
function MarkerCard({ cardRef, entries, at, gap, box, opened, here, reference, onClose, onEscape, onExplore }: {
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
  const [drawn, setDrawn] = useState(0);
  const id = entries.map(({ place: each, index }) => `${each.id}:${index}`).join(" ");
  useLayoutEffect(() => setDrawn(cardRef.current?.scrollHeight ?? 0), [cardRef, id, box.width, box.height, place.id, all, opened]);
  // As tall as its side of the marker allows; a longer card scrolls.
  // Below the controls even where a short map's places reach up beside them.
  const { left, top, maxHeight } = cardPosition(at, gap, { ...box, top: box.clear ?? box.top }, drawn || 24 + entries.length * (shared ? 22 : 56) + 110);
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
      // Escape in the card puts it away and goes back to its marker; it does not close the map.
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
        event.preventDefault();
        onEscape();
      }}
      className={`absolute z-10 overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-black/80 px-3 py-2 text-white/85 shadow-[0_10px_30px_rgba(0,0,0,0.5)] backdrop-blur-md ${opened ? "" : "pointer-events-none"}`}
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
        {nearby.length > 0 ? (
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
