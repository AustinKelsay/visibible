/**
 * Builds src/data/today-map.json, the map's Today view (see README.md beside this script): Natural Earth's land
 * borders, country names and cities (public domain), clipped to the Bible world, simplified and projected.
 *
 *   npm run places:today -- --natural-earth <folder of Natural Earth .geojson files>
 *
 * Borders and names are Natural Earth's own (its de facto view); disputed and indefinite lines are kept apart so the
 * map can draw them dashed.
 */
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { MAP_BOUNDS, project } from "../../src/lib/bible-map-projection";
import { inside, insideRuns, lines, readFeatures, type Point } from "./geo";

const { values } = parseArgs({ options: { "natural-earth": { type: "string" } } });
const folder = values["natural-earth"];
if (!folder) {
  console.error("Usage: npm run places:today -- --natural-earth <dir>");
  process.exit(1);
}

/**
 * Cities kept: Natural Earth's scalerank up to this (lower is more important), and every capital; in the land of the
 * Bible itself, where the map's Here step closes in, smaller towns too (Ramallah, Bethlehem, Jericho).
 */
const MAX_CITY_RANK = 8;
const MAX_LAND_RANK = 10;
const LAND = { west: 33.5, east: 37, south: 29, north: 34 };
const inLand = ([lon, lat]: Point) => lon >= LAND.west && lon <= LAND.east && lat >= LAND.south && lat <= LAND.north;
const at = (lon: number, lat: number) => project(lon, lat).map(Math.round) as [number, number];

let borders = "";
let disputed = "";
for (const feature of await readFeatures(folder, "ne_10m_admin_0_boundary_lines_land")) {
  const kind = String(feature.properties.FEATURECLA ?? "");
  const settled = kind.startsWith("International boundary");
  for (const line of lines(feature.geometry!)) {
    const d = insideRuns(line, 0.01);
    if (settled) borders += d;
    else disputed += d;
  }
}

// [name, x, y, label rank]: where Natural Earth puts each country's name.
const countries: [string, number, number, number][] = [];
for (const feature of await readFeatures(folder, "ne_50m_admin_0_countries")) {
  const lon = Number(feature.properties.LABEL_X);
  const lat = Number(feature.properties.LABEL_Y);
  if (!inside([lon, lat])) continue;
  countries.push([String(feature.properties.NAME), ...at(lon, lat), Number(feature.properties.LABELRANK)]);
}
countries.sort((a, b) => a[3] - b[3]);

// [name, x, y, rank, capital (1) or not (0)], most important first.
const cities: [string, number, number, number, number][] = [];
for (const feature of await readFeatures(folder, "ne_10m_populated_places_simple")) {
  const [lon, lat] = (feature.geometry!.coordinates as Point);
  const rank = Number(feature.properties.scalerank);
  const capital = Number(feature.properties.adm0cap) === 1;
  if (!inside([lon, lat]) || (rank > (inLand([lon, lat]) ? MAX_LAND_RANK : MAX_CITY_RANK) && !capital)) continue;
  cities.push([String(feature.properties.name), ...at(lon, lat), rank, capital ? 1 : 0]);
}
cities.sort((a, b) => a[3] - b[3] || b[4] - a[4]);

const today = {
  source: "Natural Earth 1:10m land borders and populated places, 1:50m country names (public domain), clipped to the Bible world",
  bounds: MAP_BOUNDS,
  borders,
  disputed,
  countries,
  cities,
};
await writeFile("src/data/today-map.json", `${JSON.stringify(today)}\n`);
console.log(`today: borders ${borders.length} B, disputed ${disputed.length} B, ${countries.length} countries, ${cities.length} cities`);
