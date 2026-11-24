/**
 * Builds the map experiment's two data files from public sources (see README.md beside this script):
 *
 * - src/data/bible-places.json: every Bible place OpenBible.info locates (CC BY 4.0), its proposed modern sites and
 *   the verses that name it.
 * - src/data/bible-map-outline.json: Natural Earth's land, lakes and rivers (public domain), clipped to the Bible world,
 *   simplified and projected to SVG path data.
 *
 *   npm run places:build -- --openbible <Bible-Geocoding-Data checkout> --natural-earth <folder of ne_10m_*.geojson>
 */
import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { MAP_BOUNDS, project } from "../../src/lib/bible-map-projection";

const { values } = parseArgs({ options: { openbible: { type: "string" }, "natural-earth": { type: "string" } } });
if (!values.openbible || !values["natural-earth"]) {
  console.error("Usage: npm run places:build -- --openbible <dir> --natural-earth <dir>");
  process.exit(1);
}

/** Sites below this share of the top site's score are left out, and at most this many are kept. */
const MIN_SHARE = 0.1;
const MAX_SITES = 6;

async function* jsonLines(path: string): AsyncGenerator<Record<string, unknown>> {
  for await (const line of createInterface({ input: createReadStream(path), crlfDelay: Infinity })) {
    if (line.trim()) yield JSON.parse(line);
  }
}

// ---- Places ----

interface Association { modern_id: string; name: string; score: number }

const modern = new Map<string, [number, number]>();
for await (const location of jsonLines(join(values.openbible, "data", "modern.jsonl"))) {
  const lonlat = typeof location.lonlat === "string" ? location.lonlat.split(",").map(Number) : null;
  if (lonlat && lonlat.length === 2 && lonlat.every(Number.isFinite)) modern.set(String(location.id), [lonlat[0], lonlat[1]]);
}

const round = (value: number) => Math.round(value * 1000) / 1000;
const places: Record<string, { name: string; the?: true; region: boolean; sites: [number, number, number, string][] }> = {};
const verses: Record<string, Record<string, string[]>> = {};

for await (const place of jsonLines(join(values.openbible, "data", "ancient.jsonl"))) {
  const id = String(place.id);
  const extra = JSON.parse(String(place.extra)) as { associations?: Association[] };
  const associations = (extra.associations ?? []).filter((a) => a.score > 0 && modern.has(a.modern_id));
  const top = Math.max(0, ...associations.map((a) => a.score));
  const sites = associations
    .filter((a) => a.score >= top * MIN_SHARE)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SITES)
    .map((a): [number, number, number, string] => {
      const [lon, lat] = modern.get(a.modern_id)!;
      return [round(lon), round(lat), a.score, a.name];
    });
  const placeVerses = (place.verses ?? []) as { usx: string }[];
  if (sites.length === 0 || placeVerses.length === 0) continue;
  places[id] = {
    // "Migdol 1" and "Bethany 2" tell apart places of the same name; the reader sees the name alone.
    name: String(place.friendly_id).replace(/ \d+$/, ""),
    // Prose says "the Red Sea"; the map's label says "Red Sea".
    ...(place.preceding_article === "the" ? { the: true as const } : {}),
    region: Array.isArray(place.types) && place.types.includes("region"),
    sites,
  };
  for (const { usx } of placeVerses) {
    const match = /^([1-3A-Z]{3}) (\d+):(\d+)$/.exec(usx);
    if (!match) continue;
    const chapter = `${match[1]} ${match[2]}`;
    const named = ((verses[chapter] ??= {})[match[3]] ??= []);
    if (!named.includes(id)) named.push(id);
  }
}

// ---- Outline ----

type Point = [number, number];
type Geometry = { type: string; coordinates: unknown };
const { west, south, east, north } = MAP_BOUNDS;
const inside = ([lon, lat]: Point) => lon >= west && lon <= east && lat >= south && lat <= north;

/** Sutherland–Hodgman: a ring clipped to the outline's bounds. */
function clipRing(ring: Point[]): Point[] {
  const edges: [(p: Point) => boolean, (a: Point, b: Point) => Point][] = [
    [(p) => p[0] >= west, (a, b) => [west, a[1] + ((b[1] - a[1]) * (west - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= east, (a, b) => [east, a[1] + ((b[1] - a[1]) * (east - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= south, (a, b) => [a[0] + ((b[0] - a[0]) * (south - a[1])) / (b[1] - a[1]), south]],
    [(p) => p[1] <= north, (a, b) => [a[0] + ((b[0] - a[0]) * (north - a[1])) / (b[1] - a[1]), north]],
  ];
  let output = ring;
  for (const [keep, cross] of edges) {
    const input = output;
    output = [];
    for (let i = 0; i < input.length; i++) {
      const current = input[i];
      const previous = input[(i + input.length - 1) % input.length];
      if (keep(current)) {
        if (!keep(previous)) output.push(cross(previous, current));
        output.push(current);
      } else if (keep(previous)) {
        output.push(cross(previous, current));
      }
    }
    if (output.length === 0) break;
  }
  return output;
}

/** Douglas–Peucker, in degrees. */
function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    const [ax, ay] = points[first];
    const [bx, by] = points[last];
    const length = Math.hypot(bx - ax, by - ay);
    let farthest = -1;
    let distance = tolerance;
    for (let i = first + 1; i < last; i++) {
      const [px, py] = points[i];
      const d = length === 0 ? Math.hypot(px - ax, py - ay) : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / length;
      if (d > distance) {
        distance = d;
        farthest = i;
      }
    }
    if (farthest > 0) {
      keep[farthest] = 1;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const area = (ring: Point[]) =>
  Math.abs(ring.reduce((sum, [x, y], i) => {
    const [nx, ny] = ring[(i + 1) % ring.length];
    return sum + x * ny - nx * y;
  }, 0)) / 2;

/** Relative SVG path data in whole map units, which keeps the file small. */
function pathData(points: Point[], closed: boolean): string {
  let d = "";
  let last: Point | null = null;
  for (const [lon, lat] of points) {
    const [x, y] = project(lon, lat).map(Math.round) as Point;
    if (!last) d += `M${x} ${y}`;
    else if (x !== last[0] || y !== last[1]) d += `l${x - last[0]} ${y - last[1]}`;
    else continue;
    last = [x, y];
  }
  return closed ? `${d}z` : d;
}

function polygons(geometry: Geometry): Point[][][] {
  if (geometry.type === "Polygon") return [geometry.coordinates as Point[][]];
  if (geometry.type === "MultiPolygon") return geometry.coordinates as Point[][][];
  return [];
}

function lines(geometry: Geometry): Point[][] {
  if (geometry.type === "LineString") return [geometry.coordinates as Point[]];
  if (geometry.type === "MultiLineString") return geometry.coordinates as Point[][];
  return [];
}

async function features(name: string) {
  const collection = JSON.parse(await readFile(join(values["natural-earth"]!, `${name}.geojson`), "utf8")) as {
    features: { properties: Record<string, unknown>; geometry: Geometry | null }[];
  };
  return collection.features.filter((feature) => feature.geometry);
}

/** Closed shapes (land, lakes) clipped, simplified and stripped of specks too small to see. */
async function areas(name: string, tolerance: number, minArea: number): Promise<string> {
  let d = "";
  for (const feature of await features(name)) {
    for (const polygon of polygons(feature.geometry!)) {
      for (const ring of polygon) {
        const clipped = clipRing(ring.slice(0, -1));
        if (clipped.length < 3 || area(clipped) < minArea) continue;
        const simple = simplify([...clipped, clipped[0]], tolerance).slice(0, -1);
        if (simple.length >= 3) d += pathData(simple, true);
      }
    }
  }
  return d;
}

// The great rivers of the Bible world (scalerank 6 and above in Natural Earth's ranking), without modern canals.
let rivers = "";
for (const feature of await features("ne_10m_rivers_lake_centerlines")) {
  const name = String(feature.properties.name ?? "");
  if (Number(feature.properties.scalerank) > 6 || /canal/i.test(name)) continue;
  for (const line of lines(feature.geometry!)) {
    let run: Point[] = [];
    for (const point of [...line, null]) {
      if (point && inside(point)) run.push(point);
      else {
        if (run.length >= 2) rivers += pathData(simplify(run, 0.02), false);
        run = [];
      }
    }
  }
}

const outline = {
  source: "Natural Earth 1:10m land, lakes and rivers (public domain), clipped to the Bible world and simplified",
  bounds: MAP_BOUNDS,
  land: await areas("ne_10m_land", 0.015, 0.0012),
  lakes: await areas("ne_10m_lakes", 0.01, 0.004),
  rivers,
};

const placesFile = {
  source: "OpenBible.info Bible Geocoding Data (https://www.openbible.info/geo/), CC BY 4.0",
  places,
  verses,
};

await writeFile("src/data/bible-places.json", `${JSON.stringify(placesFile)}\n`);
await writeFile("src/data/bible-map-outline.json", `${JSON.stringify(outline)}\n`);
console.log(
  `places ${Object.keys(places).length}, chapters ${Object.keys(verses).length}; outline land ${outline.land.length} B, ` +
    `lakes ${outline.lakes.length} B, rivers ${outline.rivers.length} B`,
);
