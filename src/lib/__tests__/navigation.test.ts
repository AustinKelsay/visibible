import { describe, expect, it } from "vitest";
import { getNextChapter, getPreviousChapter } from "@/lib/navigation";
import { BIBLE_BOOKS, BOOK_BY_SLUG } from "@/data/bible-structure";

describe("getNextChapter", () => {
  it("returns next chapter within the same book", () => {
    const genesis = BOOK_BY_SLUG["genesis"];
    const result = getNextChapter(genesis, 1);
    expect(result).toEqual({ book: genesis, chapter: 2 });
  });

  it("returns next chapter mid-book", () => {
    const genesis = BOOK_BY_SLUG["genesis"];
    const result = getNextChapter(genesis, 25);
    expect(result).toEqual({ book: genesis, chapter: 26 });
  });

  it("crosses book boundary to next book", () => {
    const genesis = BOOK_BY_SLUG["genesis"];
    const exodus = BOOK_BY_SLUG["exodus"];
    // Genesis has 50 chapters
    const result = getNextChapter(genesis, 50);
    expect(result).toEqual({ book: exodus, chapter: 1 });
  });

  it("returns null at end of Bible (Revelation last chapter)", () => {
    const revelation = BIBLE_BOOKS[BIBLE_BOOKS.length - 1];
    const result = getNextChapter(revelation, revelation.chapters.length);
    expect(result).toBeNull();
  });
});

describe("getPreviousChapter", () => {
  it("returns previous chapter within the same book", () => {
    const genesis = BOOK_BY_SLUG["genesis"];
    const result = getPreviousChapter(genesis, 10);
    expect(result).toEqual({ book: genesis, chapter: 9 });
  });

  it("crosses book boundary to previous book", () => {
    const exodus = BOOK_BY_SLUG["exodus"];
    const genesis = BOOK_BY_SLUG["genesis"];
    const result = getPreviousChapter(exodus, 1);
    // Genesis has 50 chapters
    expect(result).toEqual({ book: genesis, chapter: 50 });
  });

  it("returns null at beginning of Bible (Genesis 1)", () => {
    const genesis = BIBLE_BOOKS[0];
    const result = getPreviousChapter(genesis, 1);
    expect(result).toBeNull();
  });

  it("returns previous chapter mid-book", () => {
    const psalms = BOOK_BY_SLUG["psalms"];
    const result = getPreviousChapter(psalms, 75);
    expect(result).toEqual({ book: psalms, chapter: 74 });
  });
});
