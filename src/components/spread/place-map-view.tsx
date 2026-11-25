"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
  const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);
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

/**
 * The map in the picture's place: the Bible world drawn from Natural Earth, with the verse's setting on it. A settled
 * place is a pin and its name; a debated place is a ring at each proposed site, sized by its score; a settled region
 * is a wide label. Sizes are in screen pixels whatever the zoom.
 */
export default function PlaceMapView({ setting, reference, onClose, picture }: {
  setting: VerseSetting;
  reference: string;
  onClose: () => void;
  /** The way back to the picture (the painting window), when the verse has one. */
  picture?: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const measure = () => setSize({ width: node.clientWidth, height: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // The marker under the pointer or keyboard focus, which shows its card.
  const [active, setActive] = useState<{ place: SettingPlace; index: number } | null>(null);

  const frame = frameSetting(setting);
  // Map units per screen pixel: the frame fits inside the box (the outline fills the rest).
  const unit = size && size.width > 0 && size.height > 0 ? Math.max(frame.width / size.width, frame.height / size.height) : frame.width / 800;
  const px = (pixels: number) => pixels * unit;
  /** Where a map point sits in the box, in screen pixels (the frame is centred in it). */
  const toScreen = (x: number, y: number) => ({
    left: (x - frame.x) / unit + ((size?.width ?? 0) - frame.width / unit) / 2,
    top: (y - frame.y) / unit + ((size?.height ?? 0) - frame.height / unit) / 2,
  });
  /** Pointer, keyboard and tap all show a marker's card. */
  const markerProps = (place: SettingPlace, index: number) => ({
    tabIndex: 0,
    role: "button" as const,
    "aria-label": markerLabel(place, index),
    onPointerEnter: () => setActive({ place, index }),
    onPointerLeave: () => setActive(null),
    onFocus: () => setActive({ place, index }),
    onBlur: () => setActive(null),
    onClick: () => setActive({ place, index }),
    className: "cursor-pointer outline-none",
  });
  const onlyOneDebated = setting.places.length === 1 && setting.places[0].debated;
  // A ring's radius in screen pixels grows with how widely sources favour its site.
  const rings = setting.places
    .filter((place) => place.debated)
    .flatMap((place) => place.sites.map((site, index) => ({ place, index, radius: 7 + 15 * Math.sqrt(site.score / place.sites[0].score) })))
    .sort((a, b) => b.radius - a.radius);
  const label = `Map of ${listNames(setting.places)}, where ${reference} happened`;

  return (
    <div ref={box} className="absolute inset-0 overflow-hidden" style={{ background: SEA }}>
      <svg
        role="group"
        aria-label={label}
        viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full"
        // A tap on the open map (not on a marker) puts a tapped marker's card away.
        onClick={(event) => {
          if (!(event.target as Element).closest("[data-rings], [data-pin]")) setActive(null);
        }}
      >
        <path aria-hidden="true" d={outline.land} fill={LAND} fillRule="evenodd" stroke={COAST} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path aria-hidden="true" d={outline.lakes} fill={SEA} stroke={COAST} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
        <path aria-hidden="true" d={outline.rivers} fill="none" stroke={RIVER} strokeWidth={1.2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {/* Every proposed site of the debated places, largest first, so a smaller ring is never hidden under another. */}
        {rings.map(({ place, index, radius }) => {
          const site = place.sites[index];
          const [x, y] = project(site.lon, site.lat);
          const lit = active?.place.id === place.id && active.index === index;
          return (
            <g key={`${place.id}:${site.name}`} data-rings={place.name} {...markerProps(place, index)}>
              <circle
                cx={x}
                cy={y}
                r={px(radius)}
                fill={GOLD}
                fillOpacity={lit ? 0.45 : index === 0 ? 0.26 : 0.12}
                stroke={lit ? INK : GOLD}
                strokeOpacity={lit || index === 0 ? 1 : 0.6}
                strokeWidth={px(lit ? 2 : 1.2)}
              />
              {onlyOneDebated || index === 0 ? (
                <text aria-hidden="true" x={x + px(radius + 5)} y={y + px(4.5)} fontSize={px(onlyOneDebated ? 13 : 15)} fill={INK} className="font-serif">
                  {onlyOneDebated ? site.name : place.name}
                </text>
              ) : null}
            </g>
          );
        })}
        {setting.places.filter((place) => !place.debated).map((place) => {
          const [x, y] = project(place.sites[0].lon, place.sites[0].lat);
          if (place.region) {
            return (
              <text key={place.id} data-region={place.name} role="img" aria-label={place.name} x={x} y={y} textAnchor="middle" fontSize={px(17)} letterSpacing={px(5)} fill={INK} fillOpacity={0.7} className="font-serif uppercase">
                {place.name}
              </text>
            );
          }
          return (
            <g key={place.id} data-pin={place.name} {...markerProps(place, 0)}>
              {/* A wider target than the dot, for a finger. */}
              <circle cx={x} cy={y} r={px(14)} fill="transparent" />
              <circle cx={x} cy={y} r={px(active?.place.id === place.id ? 6.5 : 5)} fill={INK} stroke={SEA} strokeWidth={px(1.5)} />
              <text aria-hidden="true" x={x + px(10)} y={y + px(5)} fontSize={px(15)} fill={INK} className="font-serif">{place.name}</text>
            </g>
          );
        })}
      </svg>

      {active && size ? (
        <MarkerCard
          place={active.place}
          index={active.index}
          at={toScreen(...project(active.place.sites[active.index].lon, active.place.sites[active.index].lat))}
          // Clear of the ring's edge (or the pin), whichever side the card goes.
          gap={(rings.find((ring) => ring.place.id === active.place.id && ring.index === active.index)?.radius ?? 6) + 10}
          box={size}
        />
      ) : null}

      <div className="absolute right-3 top-12 flex items-center gap-2 md:right-6 md:top-16">
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
      <div className="absolute inset-x-3 bottom-3 flex items-end gap-3 md:inset-x-6 md:bottom-28">
        {picture}
        <p className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/75 px-3 py-2 text-[11px] leading-snug text-white/85 backdrop-blur-md md:max-w-xl md:text-xs">
          {settingNote(setting)}{" "}
          <a href="https://www.openbible.info/geo/" target="_blank" rel="noreferrer" className="text-white/55 underline decoration-white/25 underline-offset-2 hover:text-white/80">
            Places: OpenBible.info, CC BY 4.0
          </a>
        </p>
      </div>
    </div>
  );
}

/** What a marker is, said once for a screen reader and shown in its card. */
function markerLabel(place: SettingPlace, index: number): string {
  const site = place.sites[index];
  if (!place.debated) return site.name === place.name ? place.name : `${place.name}, at ${site.name}`;
  return `${place.name}: proposed at ${site.name}, ${rank(place, index)}`;
}

/** How a proposed site stands among the others, by how widely sources favour it. */
function rank(place: SettingPlace, index: number): string {
  const count = place.sites.length;
  if (index === 0) return `the most favoured of ${count} proposed sites`;
  return place.sites[index].score >= place.sites[0].score * 0.5 ? `also widely favoured (${index + 1} of ${count})` : `less favoured (${index + 1} of ${count})`;
}

/** The small card beside the marker under the pointer or focus: the place, where it is proposed, and how it ranks. */
function MarkerCard({ place, index, at, gap, box }: {
  place: SettingPlace;
  index: number;
  at: { left: number; top: number };
  gap: number;
  box: { width: number; height: number };
}) {
  const site = place.sites[index];
  // Beside the marker, flipped to its left near the right edge and kept inside the box.
  const width = 224;
  const left = at.left + gap + width > box.width - 12 ? Math.max(12, at.left - gap - width) : at.left + gap;
  const top = Math.min(Math.max(12, at.top - 28), box.height - 96);
  return (
    <div
      aria-hidden="true"
      data-marker-card
      className="pointer-events-none absolute rounded-xl border border-white/10 bg-black/80 px-3 py-2 text-white/85 shadow-[0_10px_30px_rgba(0,0,0,0.5)] backdrop-blur-md"
      style={{ left, top, width }}
    >
      <p className="font-serif text-base leading-tight text-white">{place.name}</p>
      {place.debated ? (
        <>
          <p className="mt-1 text-xs leading-snug">Proposed at {site.name}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-white/55">{rank(place, index).replace(/^./, (c) => c.toUpperCase())}</p>
        </>
      ) : (
        <p className="mt-1 text-xs leading-snug">{site.name === place.name ? (place.region ? "A region" : "Its site is settled") : `At ${site.name}`}</p>
      )}
    </div>
  );
}
