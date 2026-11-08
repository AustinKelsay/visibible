import { describe, expect, it } from "vitest";
import { BIBLE_BOOKS } from "@/data/bible-structure";
import { BOOK_ABBREVIATIONS, bookAbbreviation } from "@/data/book-abbreviations";

describe("book abbreviations", () => {
  it("has a short name for every Bible book, no longer than seven characters", () => {
    for (const book of BIBLE_BOOKS) {
      const short = BOOK_ABBREVIATIONS[book.id];
      expect(short, book.name).toBeTruthy();
      expect(short.length, book.name).toBeLessThanOrEqual(7);
    }
    expect(Object.keys(BOOK_ABBREVIATIONS)).toHaveLength(BIBLE_BOOKS.length);
  });

  it("falls back to the full name for unknown ids", () => {
    expect(bookAbbreviation("GEN", "Genesis")).toBe("Gen");
    expect(bookAbbreviation("XYZ", "Unknown Book")).toBe("Unknown Book");
  });
});
