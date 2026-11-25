import { describe, expect, it } from "vitest";
import { MAP_BOUNDS } from "../../src/lib/bible-map-projection";
import { clipLine, type Point } from "./geo";

const { south, east } = MAP_BOUNDS;

describe("clipLine", () => {
  it("runs a line crossing the map's edge up to the edge", () => {
    // From inside, south across the edge and out.
    const runs = clipLine([[40, south + 2], [41, south - 2]]);
    expect(runs).toEqual([[[40, south + 2], [40.5, south]]]);
  });

  it("splits a line that leaves and comes back into two runs, each cut at the edge", () => {
    const line: Point[] = [[east - 2, 10], [east + 2, 12], [east - 2, 14]];
    const runs = clipLine(line);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toEqual([[east - 2, 10], [east, 11]]);
    expect(runs[1]).toEqual([[east, 13], [east - 2, 14]]);
  });

  it("keeps a line wholly inside as one run, and drops one wholly outside", () => {
    expect(clipLine([[30, 30], [31, 31], [32, 30]])).toEqual([[[30, 30], [31, 31], [32, 30]]]);
    expect(clipLine([[east + 1, 10], [east + 2, 11]])).toEqual([]);
  });

  it("keeps the inside part of a segment whose two ends are both outside", () => {
    // Across the south-east corner: in through the southern edge, out through the eastern one.
    const runs = clipLine([[east - 2, south - 1], [east + 1, south + 2]]);
    expect(runs).toHaveLength(1);
    const [[enterLon, enterLat], [leaveLon, leaveLat]] = runs[0];
    expect([enterLon, enterLat, leaveLon, leaveLat].map((value) => Math.round(value * 1e9) / 1e9)).toEqual([east - 1, south, east, south + 1]);
  });
});
