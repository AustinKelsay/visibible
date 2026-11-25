import { describe, expect, it } from "vitest";
import { contextPlaces, divisionOf, momentsAround, momentUrl, nearbyPlaces, placeMoments } from "@/lib/place-moments";

const BETHEL = "a64f355";
const JERUSALEM = "a15257a";

describe("a place's moments", () => {
  it("lists each chapter that names the place once, in Bible order, with its first verse and count", () => {
    const moments = placeMoments(BETHEL);
    expect(moments).toHaveLength(35);
    expect(moments.reduce((sum, moment) => sum + moment.verses, 0)).toBe(69);
    const refs = moments.map((moment) => `${moment.book} ${moment.chapter}:${moment.verse}`);
    expect(refs.slice(0, 5)).toEqual(["Genesis 12:8", "Genesis 13:3", "Genesis 28:19", "Genesis 31:13", "Genesis 35:1"]);
    expect(moments[4].verses).toBe(8);
    expect(refs.at(-1)).toBe("Amos 7:10");
  });

  it("finds the moments either side of the chapter being read", () => {
    const around = momentsAround(BETHEL, "genesis", 28);
    expect(around.current).toMatchObject({ chapter: 28, verse: 19 });
    expect(around.before).toMatchObject({ book: "Genesis", chapter: 13, verse: 3 });
    expect(around.after).toMatchObject({ book: "Genesis", chapter: 31, verse: 13 });
    const first = momentsAround(BETHEL, "genesis", 12);
    expect(first.before).toBeNull();
    // A chapter that does not name the place still has neighbours.
    const between = momentsAround(BETHEL, "exodus", 3);
    expect(between.current).toBeNull();
    expect(between.before).toMatchObject({ chapter: 35 });
    expect(between.after).toMatchObject({ book: "Joshua" });
  });

  it("links a moment to its verse", () => {
    expect(momentUrl(placeMoments(BETHEL)[2])).toBe("/genesis/28/19");
  });

  it("has none for an unknown place", () => {
    expect(placeMoments("nowhere")).toEqual([]);
  });

  it("groups books into the parts of the Bible", () => {
    expect(["GEN", "DEU", "JOS", "EST", "JOB", "SNG", "ISA", "MAL", "MAT", "ACT", "ROM", "REV"].map(divisionOf)).toEqual([
      "Law", "Law", "History", "History", "Poetry", "Poetry", "Prophets", "Prophets",
      "Gospels and Acts", "Gospels and Acts", "Letters and Revelation", "Letters and Revelation",
    ]);
  });
});

describe("nearby places", () => {
  it("names the nearest well-known places with whole kilometres, skipping the place itself and its own spot", () => {
    const nearby = nearbyPlaces(35.241, 31.923, ["Bethel"]);
    expect(nearby[0]).toEqual({ name: "Ai", km: 2 });
    expect(nearby.length).toBeLessThanOrEqual(3);
    expect(nearby.map((place) => place.name)).not.toContain("Bethel");
    expect(nearby.every((place) => place.km >= 1 && place.km <= 15)).toBe(true);
  });

  it("leaves out a place at one of the marker's own sites, another name for the same spot", () => {
    // From Al Bira, Bethel's other proposed site: Luz is at Beitin, Bethel's favoured one.
    expect(nearbyPlaces(35.216, 31.904, ["Bethel"]).map((place) => place.name)).toContain("Luz");
    expect(nearbyPlaces(35.216, 31.904, ["Bethel"], [{ lon: 35.241, lat: 31.923 }]).map((place) => place.name)).not.toContain("Luz");
  });

  it("is empty far from any place", () => {
    expect(nearbyPlaces(60, 10, [])).toEqual([]);
  });
});

describe("context places", () => {
  it("keeps one well-known, clearly sited entry per name, most named first", () => {
    const places = contextPlaces();
    expect(places[0]).toMatchObject({ id: JERUSALEM, name: "Jerusalem" });
    const names = places.map((place) => place.name);
    expect(new Set(names).size).toBe(names.length);
    expect(places.every((place) => place.verses >= 5)).toBe(true);
    expect(names).toContain("Bethel");
    expect(names).not.toContain("Egypt");
    expect(names).not.toContain("Jordan");
  });
});
