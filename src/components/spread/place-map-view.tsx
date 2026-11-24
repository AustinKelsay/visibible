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

  const frame = frameSetting(setting);
  // Map units per screen pixel: the frame fits inside the box (the outline fills the rest).
  const unit = size && size.width > 0 && size.height > 0 ? Math.max(frame.width / size.width, frame.height / size.height) : frame.width / 800;
  const px = (pixels: number) => pixels * unit;
  const onlyOneDebated = setting.places.length === 1 && setting.places[0].debated;
  const label = `Map of ${listNames(setting.places)}, where ${reference} happened`;

  return (
    <div ref={box} className="absolute inset-0 overflow-hidden" style={{ background: SEA }}>
      <svg
        role="img"
        aria-label={label}
        viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full"
      >
        <path d={outline.land} fill={LAND} fillRule="evenodd" stroke={COAST} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path d={outline.lakes} fill={SEA} stroke={COAST} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
        <path d={outline.rivers} fill="none" stroke={RIVER} strokeWidth={1.2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {setting.places.map((place) => {
          const [x, y] = project(place.sites[0].lon, place.sites[0].lat);
          if (place.region && !place.debated) {
            return (
              <text key={place.id} data-region={place.name} x={x} y={y} textAnchor="middle" fontSize={px(17)} letterSpacing={px(5)} fill={INK} fillOpacity={0.7} className="font-serif uppercase">
                {place.name}
              </text>
            );
          }
          if (!place.debated) {
            return (
              <g key={place.id} data-pin={place.name}>
                <circle cx={x} cy={y} r={px(5)} fill={INK} stroke={SEA} strokeWidth={px(1.5)} />
                <text x={x + px(10)} y={y + px(5)} fontSize={px(15)} fill={INK} className="font-serif">{place.name}</text>
              </g>
            );
          }
          const top = place.sites[0].score;
          return (
            <g key={place.id} data-rings={place.name}>
              {place.sites.map((site, index) => {
                const [x, y] = project(site.lon, site.lat);
                const radius = px(7 + 15 * Math.sqrt(site.score / top));
                return (
                  <g key={site.name}>
                    <circle cx={x} cy={y} r={radius} fill={GOLD} fillOpacity={index === 0 ? 0.26 : 0.12} stroke={GOLD} strokeOpacity={index === 0 ? 1 : 0.6} strokeWidth={px(1.2)}>
                      <title>{`${place.name}: ${site.name}`}</title>
                    </circle>
                    {onlyOneDebated || index === 0 ? (
                      <text x={x + radius + px(5)} y={y + px(4.5)} fontSize={px(onlyOneDebated ? 13 : 15)} fill={INK} className="font-serif">
                        {onlyOneDebated ? site.name : place.name}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>

      <div className="absolute right-3 top-12 flex items-center gap-2 md:right-6 md:top-16">
        <span className="rounded-full border border-[#e8c37a]/35 bg-[#e8c37a]/15 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-[#e8c37a]">
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
