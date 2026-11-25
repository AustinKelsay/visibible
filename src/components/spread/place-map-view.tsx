"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import outline from "@/data/bible-map-outline.json";
import { MAP_BOUNDS, project } from "@/lib/bible-map-projection";
import type { SettingPlace, VerseSetting } from "@/lib/verse-setting";

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
 * across (a whole land when the setting is only regions), and never past the edges of the map outline.
 */
export function frameSetting(setting: VerseSetting): MapFrame {
  const sites = setting.places.flatMap((place) => place.sites);
  const lons = sites.map((site) => site.lon);
  const lats = sites.map((site) => site.lat);
  const minSpan = setting.places.every((place) => place.region) ? MIN_REGION_SPAN : MIN_SPAN;
  const centre = { lon: (Math.min(...lons) + Math.max(...lons)) / 2, lat: (Math.min(...lats) + Math.max(...lats)) / 2 };
  // Never wider than the outline: a setting spanning the Bible world (Tarshish to Ophir) shows all of it.
  const latSpan = Math.min(MAP_BOUNDS.north - MAP_BOUNDS.south, Math.max(minSpan, (Math.max(...lats) - Math.min(...lats)) * 1.5));
  const lonSpan = Math.min(MAP_BOUNDS.east - MAP_BOUNDS.west, Math.max(minSpan, (Math.max(...lons) - Math.min(...lons)) * 1.5));
  const west = clamp(centre.lon - lonSpan / 2, MAP_BOUNDS.west, MAP_BOUNDS.east - lonSpan);
  const north = clamp(centre.lat + latSpan / 2, MAP_BOUNDS.south + latSpan, MAP_BOUNDS.north);
  const [x, y] = project(west, north);
  const [right, bottom] = project(west + lonSpan, north - latSpan);
  return { x, y, width: right - x, height: bottom - y };
}

/** "Pi-hahiroth, Migdol and Baal-zephon", or in a sentence "the Red Sea". */
function listNames(places: SettingPlace[], prose = false): string {
  const names = places.map((place) => (prose ? place.proseName : place.name));
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

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
    const fit = texts.flatMap((text) => candidates.map((candidate) => ({ text, candidate }))).find(({ text, candidate }) => {
      const width = nameWidth(text, size);
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

/** The map's free band: below the tag and close button, above the note, in screen pixels. */
interface MapBox {
  width: number;
  height: number;
  top: number;
  bottom: number;
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

const CARD_WIDTH = 224;

/**
 * Where a marker's card goes, in screen pixels: beside the marker (right, else left), or where the box is too narrow
 * for that (a phone), above or below it, whichever has room, so it never covers the marker it describes.
 */
export function cardPosition(at: { left: number; top: number }, gap: number, box: { width: number; height: number }, height: number) {
  const edge = 12;
  const fitsRight = at.left + gap + CARD_WIDTH <= box.width - edge;
  const fitsLeft = at.left - gap - CARD_WIDTH >= edge;
  if (fitsRight || fitsLeft) {
    return { left: fitsRight ? at.left + gap : at.left - gap - CARD_WIDTH, top: clamp(at.top - 28, edge, box.height - height - edge) };
  }
  const left = clamp(at.left - CARD_WIDTH / 2, edge, box.width - CARD_WIDTH - edge);
  const roomBelow = box.height - edge - (at.top + gap);
  const roomAbove = at.top - gap - edge;
  const below = height <= roomBelow || (height > roomAbove && roomBelow >= roomAbove);
  return { left, top: clamp(below ? at.top + gap : at.top - gap - height, edge, box.height - height - edge) };
}

/**
 * The map in the picture's place: the Bible world drawn from Natural Earth, with the verse's setting on it. A settled
 * place is a pin and its name; a debated place is a ring at each proposed site, sized by its score; a settled region
 * is a wide label. Sizes are in screen pixels whatever the zoom.
 */
export default function PlaceMapView({ setting, reference, onClose, picture, takeFocus }: {
  setting: VerseSetting;
  reference: string;
  onClose: () => void;
  /** The way back to the picture (the painting window), when the verse has one. */
  picture?: ReactNode;
  /** Whether the map should take focus as it opens: it was opened from the keyboard. */
  takeFocus?: () => boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const footer = useRef<HTMLDivElement>(null);
  const map = useRef<SVGSVGElement>(null);
  const [measured, setMeasured] = useState<MapBox | null>(null);
  // Before the first paint, so the map never shows a frame laid out for another size.
  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    const measure = () => {
      const top = controls.current ? controls.current.offsetTop + controls.current.offsetHeight + 8 : 0;
      const bottom = footer.current ? node.clientHeight - footer.current.offsetTop + 8 : 0;
      setMeasured(node.clientWidth > 0 && node.clientHeight > 0 ? { width: node.clientWidth, height: node.clientHeight, top, bottom } : null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    if (footer.current) observer.observe(footer.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (takeFocus?.()) map.current?.focus();
  }, [takeFocus]);

  // The marker under the pointer or keyboard focus, or tapped, which shows its card.
  const [active, setActive] = useState<string | null>(null);
  const focused = useRef<string | null>(null);

  // Before the box is measured (and in tests), a nominal box.
  const size = measured ?? { width: 800, height: 600, top: 0, bottom: 0 };
  const frame = frameSetting(setting);
  const view = fitView(frame, size);
  const px = (pixels: number) => pixels * view.unit;
  /** Where a map point sits in the box, in screen pixels. */
  const toScreen = (x: number, y: number) => ({ left: (x - view.x) / view.unit, top: (y - view.y) / view.unit });

  const markers = settingMarkers(setting);
  const band = { left: 4, top: Math.max(4, size.top - 8), right: size.width - 4, bottom: size.height - Math.max(4, size.bottom - 8) };
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
  const onlyOneDebated = setting.places.length === 1 && setting.places[0].debated;
  const names = placeNames(
    [...markers]
      .sort((a, b) => Number(b.favoured || b.pinned) - Number(a.favoured || a.pinned) || b.radius - a.radius)
      .map((marker) => ({ key: marker.key, ...toScreen(marker.x, marker.y), radius: marker.radius, names: marker.names })),
    regionBoxes,
    band,
    onlyOneDebated ? 13 : 15,
  );
  const label = `Map of ${listNames(setting.places)}, where ${reference} happened`;
  const lit = markers.find((marker) => marker.key === active) ?? null;
  // The card is the focus indicator, so a pointer passing over keeps the focused marker's card on leaving. A marker a
  // page turn removed may never have sent blur (Firefox), so only one of this setting's counts.
  const leave = () => setActive(focused.current && markers.some((other) => other.key === focused.current) ? focused.current : null);

  return (
    <div ref={box} className="absolute inset-0 overflow-hidden" style={{ background: SEA }}>
      <svg
        ref={map}
        role="group"
        aria-label={label}
        tabIndex={-1}
        viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full outline-none"
        // A tap on the open map (not on a marker) puts a tapped marker's card away.
        onClick={(event) => {
          if (!(event.target as Element).closest("[data-marker]")) setActive(null);
        }}
      >
        <path aria-hidden="true" d={outline.land} fill={LAND} fillRule="evenodd" stroke={COAST} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path aria-hidden="true" d={outline.lakes} fill={SEA} stroke={COAST} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
        <path aria-hidden="true" d={outline.rivers} fill="none" stroke={RIVER} strokeWidth={1.2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {markers.map((marker) => {
          const on = marker.key === active;
          const show = () => setActive(marker.key);
          const debatedNames = marker.entries.filter((entry) => entry.place.debated).map((entry) => entry.place.name);
          const pinNames = marker.entries.filter((entry) => !entry.place.debated).map((entry) => entry.place.name);
          return (
            <g
              key={marker.key}
              data-marker
              data-rings={debatedNames.length ? debatedNames.join(" · ") : undefined}
              data-pin={debatedNames.length ? undefined : pinNames.join(" · ")}
              tabIndex={0}
              role="button"
              aria-label={marker.entries.map(({ place, index }) => markerLabel(place, index)).join("; ")}
              onPointerEnter={show}
              onPointerLeave={leave}
              onFocus={() => setActive((focused.current = marker.key))}
              onBlur={() => setActive((focused.current = null))}
              onClick={show}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                show();
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
              onPointerEnter={() => setActive(name.key)}
              onPointerLeave={leave}
              onClick={() => setActive(name.key)}
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

      <div ref={controls} className="absolute right-3 top-12 flex items-center gap-2 md:right-6 md:top-16">
        <span className="liquid-glass flex h-9 items-center rounded-full px-3.5 text-[10px] font-medium uppercase tracking-[0.22em] text-white/70">
          Experimental
        </span>
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
        <p className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/75 px-3 py-2 text-[11px] leading-snug text-white/85 backdrop-blur-md md:max-w-xl md:text-xs">
          {/* A phone with Ask open leaves the map a thin strip: the note keeps only its credit there. */}
          <span className="max-md:[main:has([data-ask-page])_&]:hidden">{settingNote(setting)} </span>
          <a href="https://www.openbible.info/geo/" target="_blank" rel="noreferrer" className="whitespace-nowrap text-white/55 underline decoration-white/25 underline-offset-2 hover:text-white/80">
            Places: OpenBible.info, CC BY 4.0
          </a>
        </p>
      </div>

      {lit ? (
        <MarkerCard
          entries={lit.entries}
          at={toScreen(lit.x, lit.y)}
          // Clear of the ring's edge (or the pin), whichever side the card goes.
          gap={Math.max(lit.radius, 6) + 10}
          box={size}
        />
      ) : null}
    </div>
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

/** The small card by the marker under the pointer or focus: each place there, where it is proposed, and how it ranks. */
function MarkerCard({ entries, at, gap, box }: {
  entries: MarkerEntry[];
  at: { left: number; top: number };
  gap: number;
  box: { width: number; height: number };
}) {
  const card = useRef<HTMLDivElement>(null);
  const site = (entry: MarkerEntry) => entry.place.sites[entry.index].name;
  // Places sharing one site name it once, a line each, so a card for four places still fits a phone's map.
  const shared = entries.length > 1 && entries.every((entry) => site(entry) === site(entries[0]));
  // Placed by its drawn height, measured before it paints; a guess until then (and where nothing is laid out).
  const [drawn, setDrawn] = useState(0);
  const id = entries.map(({ place, index }) => `${place.id}:${index}`).join(" ");
  useLayoutEffect(() => setDrawn(card.current?.offsetHeight ?? 0), [id, box.width]);
  const height = Math.min(drawn || 24 + entries.length * (shared ? 22 : 56), box.height - 24);
  const { left, top } = cardPosition(at, gap, box, height);
  return (
    <div
      ref={card}
      aria-hidden="true"
      data-marker-card
      className="pointer-events-none absolute z-10 overflow-hidden rounded-xl border border-white/10 bg-black/80 px-3 py-2 text-white/85 shadow-[0_10px_30px_rgba(0,0,0,0.5)] backdrop-blur-md"
      style={{ left, top, width: CARD_WIDTH, maxHeight: box.height - 24 }}
    >
      {shared ? (
        <>
          {/* A described site ("south of the Lisan") reads as its own heading. */}
          <p className="text-xs leading-snug text-white/70">{/^[a-z]/.test(site(entries[0])) ? site(entries[0]).replace(/^./, (c) => c.toUpperCase()) : `At ${site(entries[0])}`}</p>
          {/* One line for each place there. */}
          {entries.map(({ place, index }) => (
            <p key={`${place.id}:${index}`} className="mt-1 text-[11px] leading-snug text-white/55">
              <span className="font-serif text-[15px] text-white">{place.name}</span>{" "}
              {place.debated ? rank(place, index, true) : "settled"}
            </p>
          ))}
        </>
      ) : (
        entries.map(({ place, index }, row) => (
          <div key={`${place.id}:${index}`} className={row > 0 ? "mt-2 border-t border-white/10 pt-2" : ""}>
            <p className="font-serif text-base leading-tight text-white">{place.name}</p>
            {place.debated ? (
              <>
                <p className="mt-1 text-xs leading-snug">Proposed at {place.sites[index].name}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-white/55">{rank(place, index).replace(/^./, (c) => c.toUpperCase())}</p>
              </>
            ) : (
              <p className="mt-0.5 text-xs leading-snug">{place.sites[index].name === place.name ? "Its site is settled" : `At ${place.sites[index].name}`}</p>
            )}
          </div>
        ))
      )}
    </div>
  );
}
