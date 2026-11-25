import { describe, expect, it } from "vitest";
import { verseSetting } from "@/lib/verse-setting";

const names = (setting: ReturnType<typeof verseSetting>) => setting?.places.map((place) => place.name).sort();

describe("verseSetting", () => {
  it("is the places a verse names", () => {
    const setting = verseSetting("EXO", 14, 2);
    expect(names(setting)).toEqual(["Baal-zephon", "Migdol", "Pi-hahiroth"]);
    expect(setting?.fromVerse).toBeNull();
  });

  it("carries the places of the nearest earlier verse that names one", () => {
    // Exodus 14:21 names no place; 14:20 names Egypt (the Egyptians' camp).
    const setting = verseSetting("EXO", 14, 21);
    expect(names(setting)).toEqual(["Egypt"]);
    expect(setting?.fromVerse).toBe(20);
    // Exodus 15:24 names none; 15:23 names Marah.
    expect(verseSetting("EXO", 15, 24)).toMatchObject({ fromVerse: 23, places: [expect.objectContaining({ name: "Marah" })] });
  });

  it("keeps a region a verse names itself, marked as a region", () => {
    const setting = verseSetting("EXO", 14, 20);
    expect(setting?.places).toEqual([expect.objectContaining({ name: "Egypt", region: true })]);
  });

  it("carries a region rather than skipping back to an earlier specific place", () => {
    // Abram has gone down into Egypt (12:10–11); 12:12 names nothing, and 12:8 named Bethel.
    const setting = verseSetting("GEN", 12, 12);
    expect(names(setting)).toEqual(["Egypt"]);
    expect(setting?.fromVerse).toBe(11);
  });

  it("is none for a verse and chapter that name no place", () => {
    expect(verseSetting("PSA", 23, 1)).toBeNull();
    expect(verseSetting("MRK", 4, 1)).toBeNull();
  });

  it("is none for the first verses of a chapter before any place is named", () => {
    // John 1 first names a place (Jerusalem) in verse 19.
    expect(verseSetting("JHN", 1, 5)).toBeNull();
  });

  it("gives a settled place one site and a debated place its proposed sites, most favoured first", () => {
    const jerusalem = verseSetting("JHN", 1, 19)?.places.find((found) => found.name === "Jerusalem");
    expect(jerusalem).toMatchObject({ debated: false, region: false });
    expect(jerusalem?.sites).toHaveLength(1);
    expect(jerusalem?.sites[0].lat).toBeCloseTo(31.78, 1);

    const redSea = verseSetting("EXO", 13, 18)?.places.find((found) => found.name === "Red Sea");
    expect(redSea?.debated).toBe(true);
    expect(redSea?.sites.slice(0, 2).map((site) => site.name)).toEqual(["Gulf of Suez", "Bitter Lakes"]);
  });

  it("names Bethany beyond the Jordan where John baptized", () => {
    expect(names(verseSetting("JHN", 1, 28))).toEqual(["Bethany", "Jordan"]);
  });
});
