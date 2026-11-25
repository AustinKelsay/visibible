import { describe, expect, it } from "vitest";
import today from "@/data/today-map.json";
import { MAP_BOUNDS, project } from "@/lib/bible-map-projection";

describe("today's map data", () => {
  const [west, north] = project(MAP_BOUNDS.west, MAP_BOUNDS.north);
  const [east, south] = project(MAP_BOUNDS.east, MAP_BOUNDS.south);
  const inBounds = ([, x, y]: (string | number)[]) => Number(x) >= west - 1 && Number(x) <= east + 1 && Number(y) >= north - 1 && Number(y) <= south + 1;

  it("has borders and disputed lines as path data", () => {
    expect(today.borders).toMatch(/^M-?\d/);
    expect(today.disputed).toMatch(/^M-?\d/);
  });

  it("keeps cities and country names inside the outline, the most important first", () => {
    expect(today.cities.every(inBounds)).toBe(true);
    expect(today.countries.every(inBounds)).toBe(true);
    const ranks = today.cities.map((city) => Number(city[3]));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    const names = today.cities.map((city) => city[0]);
    expect(names).toEqual(expect.arrayContaining(["Jerusalem", "Amman", "Damascus", "Cairo", "Baghdad", "Ramallah"]));
  });

  it("places Jerusalem where the map projects it", () => {
    const jerusalem = today.cities.find((city) => city[0] === "Jerusalem")!;
    const [x, y] = project(35.21, 31.77);
    expect(Math.abs(Number(jerusalem[1]) - x)).toBeLessThan(10);
    expect(Math.abs(Number(jerusalem[2]) - y)).toBeLessThan(10);
  });
});
