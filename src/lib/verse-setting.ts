import placesData from "@/data/bible-places.json";

/** A modern location proposed for an ancient place, with how widely sources favour it (OpenBible.info's score). */
export interface PlaceSite {
  lon: number;
  lat: number;
  score: number;
  name: string;
}

/** A real-world place a verse happens at, with its proposed sites, the most favoured first. */
export interface SettingPlace {
  id: string;
  /** The name as the map labels it ("Red Sea"). */
  name: string;
  /** The name in a sentence ("the Red Sea"). */
  proseName: string;
  /** A land or country such as Egypt, shown as a wide label rather than a point. */
  region: boolean;
  /** More than one site is proposed, so the map shows rings rather than a pin. */
  debated: boolean;
  sites: PlaceSite[];
}

/** Where a verse happens, as the map shows it. */
export interface VerseSetting {
  places: SettingPlace[];
  /** The earlier verse of the chapter that named these places, or null when the verse names them itself. */
  fromVerse: number | null;
}

interface PlacesFile {
  places: Record<string, { name: string; the?: boolean; region: boolean; sites: [number, number, number, string][] }>;
  verses: Record<string, Record<string, string[]>>;
}

const data = placesData as unknown as PlacesFile;

function place(id: string): SettingPlace | null {
  const entry = data.places[id];
  if (!entry) return null;
  const sites = entry.sites.map(([lon, lat, score, name]) => ({ lon, lat, score, name }));
  const proseName = entry.the ? `the ${entry.name}` : entry.name;
  return { id, name: entry.name, proseName, region: entry.region, debated: sites.length > 1, sites };
}

function namedIn(chapter: Record<string, string[]>, verse: number): SettingPlace[] {
  return (chapter[String(verse)] ?? []).map(place).filter((found): found is SettingPlace => found !== null);
}

/**
 * The setting of a Bible verse (`bookId` is the book's USX code, "EXO"): the places it names; otherwise those of the
 * nearest earlier verse of its chapter that names a place; otherwise none. A carried region can be loose (Exodus 14:20
 * names Egypt for the Egyptians' camp, so 14:21 is set in Egypt), but skipping regions is worse: Genesis 12:12 would be
 * set at Bethel instead of in Egypt, where Abram had just gone.
 */
export function verseSetting(bookId: string, chapter: number, verse: number): VerseSetting | null {
  const named = data.verses[`${bookId} ${chapter}`];
  if (!named) return null;
  for (let from = verse; from >= 1; from--) {
    const places = namedIn(named, from);
    if (places.length > 0) return { places, fromVerse: from === verse ? null : from };
  }
  return null;
}
