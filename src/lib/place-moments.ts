import placesData from "@/data/bible-places.json";
import { BIBLE_BOOKS } from "@/data/bible-structure";

/**
 * A place's other moments in the Bible, and what lies around it, from the same places data as the map (#556). Only the
 * map's lazily loaded view uses this, so the data reaches a reader's browser only once they open the map.
 */

/** A chapter that names a place: the first verse there that names it, and how many do. */
export interface Moment {
  bookId: string;
  book: string;
  slug: string;
  chapter: number;
  verse: number;
  verses: number;
}

/** A well-known place, drawn faintly around a setting. */
export interface ContextPlace {
  id: string;
  name: string;
  lon: number;
  lat: number;
  verses: number;
}

interface PlacesFile {
  places: Record<string, { name: string; the?: boolean; region: boolean; sites: [number, number, number, string][] }>;
  verses: Record<string, Record<string, string[]>>;
}

const data = placesData as unknown as PlacesFile;
const bookOrder = new Map(BIBLE_BOOKS.map((book, index) => [book.id, index]));

let index: Map<string, Moment[]> | null = null;
/** Every place's moments in Bible order, built on first use. */
function momentsIndex(): Map<string, Moment[]> {
  if (index) return index;
  index = new Map();
  const chapters = Object.keys(data.verses).sort((a, b) => {
    const [bookA, chapterA] = a.split(" ");
    const [bookB, chapterB] = b.split(" ");
    return (bookOrder.get(bookA) ?? 0) - (bookOrder.get(bookB) ?? 0) || Number(chapterA) - Number(chapterB);
  });
  for (const key of chapters) {
    const [bookId, chapter] = key.split(" ");
    const book = BIBLE_BOOKS[bookOrder.get(bookId) ?? -1];
    if (!book) continue;
    const found = new Map<string, Moment>();
    for (const [verse, ids] of Object.entries(data.verses[key]).sort(([a], [b]) => Number(a) - Number(b))) {
      for (const id of new Set(ids)) {
        const moment = found.get(id);
        if (moment) moment.verses += 1;
        else found.set(id, { bookId, book: book.name, slug: book.slug, chapter: Number(chapter), verse: Number(verse), verses: 1 });
      }
    }
    for (const [id, moment] of found) index.set(id, [...(index.get(id) ?? []), moment]);
  }
  return index;
}

/** The chapters that name a place, in Bible order. */
export function placeMoments(placeId: string): Moment[] {
  return momentsIndex().get(placeId) ?? [];
}

const bookBySlug = new Map(BIBLE_BOOKS.map((book, at) => [book.slug, at]));
/** Where a chapter falls in the Bible, for comparing places in it. */
const position = (slug: string, chapter: number) => (bookBySlug.get(slug) ?? 0) * 1000 + chapter;

/**
 * A place's moments around the chapter being read (`slug` is its book's): the one being read, if it names the place,
 * and the nearest before and after it.
 */
export function momentsAround(placeId: string, slug: string, chapter: number) {
  const moments = placeMoments(placeId);
  const here = position(slug, chapter);
  const at = moments.findIndex((moment) => position(moment.slug, moment.chapter) === here);
  const before = moments.filter((moment) => position(moment.slug, moment.chapter) < here).at(-1) ?? null;
  const after = moments.find((moment) => position(moment.slug, moment.chapter) > here) ?? null;
  return { moments, current: at >= 0 ? moments[at] : null, before, after };
}

/** Where a moment is read. */
export function momentUrl(moment: Moment): string {
  return `/${moment.slug}/${moment.chapter}/${moment.verse}`;
}

const DIVISIONS: [string, string][] = [
  ["GEN", "Law"],
  ["JOS", "History"],
  ["JOB", "Poetry"],
  ["ISA", "Prophets"],
  ["MAT", "Gospels and Acts"],
  ["ROM", "Letters and Revelation"],
];

/** The part of the Bible a book belongs to. */
export function divisionOf(bookId: string): string {
  const at = bookOrder.get(bookId) ?? 0;
  return DIVISIONS.filter(([first]) => (bookOrder.get(first) ?? 0) <= at).at(-1)?.[1] ?? DIVISIONS[0][1];
}

let context: ContextPlace[] | null = null;
/**
 * Named places with a clearly favoured site (one site, or a top score at least twice the next) and at least five
 * verses, one entry per name (the most named), most named first. Regions are left out, being lands, and so are names
 * said with "the" (the Jordan, the Salt Sea, the Valley of Hinnom): rivers, seas and valleys are not points either.
 */
export function contextPlaces(): ContextPlace[] {
  if (context) return context;
  const best = new Map<string, ContextPlace>();
  for (const [id, place] of Object.entries(data.places)) {
    if (place.region || place.the || place.sites.length === 0) continue;
    const [top, next] = place.sites;
    if (next && top[2] < next[2] * 2) continue;
    const verses = placeMoments(id).reduce((sum, moment) => sum + moment.verses, 0);
    if (verses < 5) continue;
    const kept = best.get(place.name);
    if (!kept || verses > kept.verses) best.set(place.name, { id, name: place.name, lon: top[0], lat: top[1], verses });
  }
  context = [...best.values()].sort((a, b) => b.verses - a.verses);
  return context;
}

/** About how far apart two points are, in kilometres. */
function distance(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const across = (lon2 - lon1) * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180) * 111.32;
  return Math.hypot(across, (lat2 - lat1) * 110.57);
}

/**
 * The three nearest well-known places within 15 km of a point, with whole kilometres. `skip` names places not to list
 * (the marker's own), and `sites` are their proposed sites: a place at one of them is the same spot under another name
 * (Luz at Bethel), as is anything closer than a kilometre, so neither is listed.
 */
export function nearbyPlaces(lon: number, lat: number, skip: string[], sites: { lon: number; lat: number }[] = []): { name: string; km: number }[] {
  return contextPlaces()
    .filter((place) => !skip.includes(place.name) && sites.every((site) => distance(site.lon, site.lat, place.lon, place.lat) >= 1))
    .map((place) => ({ name: place.name, km: distance(lon, lat, place.lon, place.lat) }))
    .filter((place) => place.km >= 1 && place.km <= 15)
    .sort((a, b) => a.km - b.km)
    .slice(0, 3)
    .map((place) => ({ name: place.name, km: Math.round(place.km) }));
}
