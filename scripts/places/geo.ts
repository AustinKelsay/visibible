/**
 * Geometry shared by the map's build scripts: clipping to the outline's bounds, simplifying, and writing projected SVG
 * path data, from Natural Earth GeoJSON.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { MAP_BOUNDS, project } from "../../src/lib/bible-map-projection";

export type Point = [number, number];
export type Geometry = { type: string; coordinates: unknown };
const { west, south, east, north } = MAP_BOUNDS;
export const inside = ([lon, lat]: Point) => lon >= west && lon <= east && lat >= south && lat <= north;

/** Sutherland–Hodgman: a ring clipped to the outline's bounds. */
export function clipRing(ring: Point[]): Point[] {
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
export function simplify(points: Point[], tolerance: number): Point[] {
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

export const area = (ring: Point[]) =>
  Math.abs(ring.reduce((sum, [x, y], i) => {
    const [nx, ny] = ring[(i + 1) % ring.length];
    return sum + x * ny - nx * y;
  }, 0)) / 2;

/** Relative SVG path data in whole map units, which keeps the file small. */
export function pathData(points: Point[], closed: boolean): string {
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

export function polygons(geometry: Geometry): Point[][][] {
  if (geometry.type === "Polygon") return [geometry.coordinates as Point[][]];
  if (geometry.type === "MultiPolygon") return geometry.coordinates as Point[][][];
  return [];
}

export function lines(geometry: Geometry): Point[][] {
  if (geometry.type === "LineString") return [geometry.coordinates as Point[]];
  if (geometry.type === "MultiLineString") return geometry.coordinates as Point[][];
  return [];
}

/** A Natural Earth layer's features that have a geometry, from a folder of `<name>.geojson` files. */
export async function readFeatures(folder: string, name: string) {
  const collection = JSON.parse(await readFile(join(folder, `${name}.geojson`), "utf8")) as {
    features: { properties: Record<string, unknown>; geometry: Geometry | null }[];
  };
  return collection.features.filter((feature) => feature.geometry);
}

/** A line's runs inside the outline's bounds, simplified, as path data. */
export function insideRuns(line: Point[], tolerance: number): string {
  let d = "";
  let run: Point[] = [];
  for (const point of [...line, null]) {
    if (point && inside(point)) run.push(point);
    else {
      if (run.length >= 2) d += pathData(simplify(run, tolerance), false);
      run = [];
    }
  }
  return d;
}

/** Liang–Barsky: the part of segment a→b inside the outline's bounds, as fractions along it, or null. */
function clipSegment([ax, ay]: Point, [bx, by]: Point): [number, number] | null {
  let enter = 0;
  let leave = 1;
  const dx = bx - ax;
  const dy = by - ay;
  for (const [p, q] of [[-dx, ax - west], [dx, east - ax], [-dy, ay - south], [dy, north - ay]]) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) enter = Math.max(enter, t);
    else leave = Math.min(leave, t);
    if (enter > leave) return null;
  }
  return [enter, leave];
}

/** A line cut to the outline's bounds: its runs inside them, ending where it crosses the edge rather than short of it. */
export function clipLine(line: Point[]): Point[][] {
  const runs: Point[][] = [];
  let run: Point[] = [];
  const along = ([ax, ay]: Point, [bx, by]: Point, t: number): Point => [ax + (bx - ax) * t, ay + (by - ay) * t];
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]];
    const kept = clipSegment(a, b);
    if (!kept) continue;
    const [start, end] = [along(a, b, kept[0]), along(a, b, kept[1])];
    if (kept[0] > 0 || run.length === 0) {
      if (run.length >= 2) runs.push(run);
      run = [start];
    }
    run.push(end);
    if (kept[1] < 1) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length >= 2) runs.push(run);
  return runs.filter((points) => points.length >= 2);
}
