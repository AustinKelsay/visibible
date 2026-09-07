import { describe, expect, it } from "vitest";
import {
  getNextNVerses,
  getRemainingChapterVerses,
  getVersesInChapterRange,
  getAllVersesInBook,
  verseLocationToId,
  formatReference,
  parseVerseUrl,
  parseVerseLocation,
  resolveBookSlug,
} from "@/lib/navigation";
import { BOOK_BY_SLUG } from "@/data/bible-structure";

// Helper to create a VerseLocation
function loc(slug: string, ch: number, v: number) {
  const parsed = parseVerseUrl(slug, String(ch), String(v));
  if (!parsed) throw new Error(`Invalid location: ${slug} ${ch}:${v}`);
  return parsed;
}

describe("getNextNVerses", () => {
  it("returns the next N verses within a chapter", () => {
    const result = getNextNVerses(loc("genesis", 1, 1), 3);
    expect(result).toHaveLength(3);
    expect(formatReference(result[0])).toBe("Genesis 1:2");
    expect(formatReference(result[1])).toBe("Genesis 1:3");
    expect(formatReference(result[2])).toBe("Genesis 1:4");
  });

  it("crosses chapter boundaries", () => {
    // Genesis 1 has 31 verses. Start at v30, get 3 → v31, 2:1, 2:2
    const result = getNextNVerses(loc("genesis", 1, 30), 3);
    expect(result).toHaveLength(3);
    expect(formatReference(result[0])).toBe("Genesis 1:31");
    expect(formatReference(result[1])).toBe("Genesis 2:1");
    expect(formatReference(result[2])).toBe("Genesis 2:2");
  });

  it("crosses book boundaries", () => {
    // Malachi 4:6 is the last verse of OT. Next should be Matthew 1:1
    const malachi = BOOK_BY_SLUG["malachi"];
    const lastCh = malachi.chapters.length;
    const lastV = malachi.chapters[lastCh - 1];
    const result = getNextNVerses(loc("malachi", lastCh, lastV), 2);
    expect(result).toHaveLength(2);
    expect(formatReference(result[0])).toBe("Matthew 1:1");
    expect(formatReference(result[1])).toBe("Matthew 1:2");
  });

  it("stops at end of Bible", () => {
    // Revelation 22:21 is the very last verse
    const rev = BOOK_BY_SLUG["revelation"];
    const lastCh = rev.chapters.length;
    const lastV = rev.chapters[lastCh - 1];
    const result = getNextNVerses(loc("revelation", lastCh, lastV), 5);
    expect(result).toHaveLength(0);
  });

  it("returns fewer than N if near end", () => {
    const rev = BOOK_BY_SLUG["revelation"];
    const lastCh = rev.chapters.length;
    const lastV = rev.chapters[lastCh - 1];
    // 2 before the end
    const result = getNextNVerses(loc("revelation", lastCh, lastV - 2), 5);
    expect(result).toHaveLength(2);
  });
});

describe("getRemainingChapterVerses", () => {
  it("returns remaining verses in the chapter", () => {
    // Genesis 1 has 31 verses. From v28, remaining should be 29, 30, 31
    const result = getRemainingChapterVerses(loc("genesis", 1, 28));
    expect(result).toHaveLength(3);
    expect(formatReference(result[0])).toBe("Genesis 1:29");
    expect(formatReference(result[2])).toBe("Genesis 1:31");
  });

  it("returns empty if at last verse of chapter", () => {
    const result = getRemainingChapterVerses(loc("genesis", 1, 31));
    expect(result).toHaveLength(0);
  });
});

describe("getVersesInChapterRange", () => {
  it("returns all verses across multiple chapters", () => {
    // Genesis ch2 has 25 verses, ch3 has 24 verses = 49 total
    const result = getVersesInChapterRange("genesis", 2, 3);
    expect(result).toHaveLength(25 + 24);
    expect(formatReference(result[0])).toBe("Genesis 2:1");
    expect(formatReference(result[result.length - 1])).toBe("Genesis 3:24");
  });

  it("respects startVerse offset in first chapter", () => {
    // Start after verse 20 in ch1 (31 total), then all of ch2 (25)
    const result = getVersesInChapterRange("genesis", 1, 2, 20);
    expect(result).toHaveLength(11 + 25); // 21-31 + 1-25
    expect(formatReference(result[0])).toBe("Genesis 1:21");
  });

  it("clamps to book boundaries", () => {
    // Jude has only 1 chapter with 25 verses
    const result = getVersesInChapterRange("jude", 1, 5);
    expect(result).toHaveLength(25);
  });

  it("returns empty for invalid book", () => {
    const result = getVersesInChapterRange("notabook", 1, 2);
    expect(result).toHaveLength(0);
  });
});

describe("getAllVersesInBook", () => {
  it("returns all verses in a small book", () => {
    // Obadiah has 1 chapter with 21 verses
    const result = getAllVersesInBook("obadiah");
    expect(result).toHaveLength(21);
    expect(formatReference(result[0])).toBe("Obadiah 1:1");
    expect(formatReference(result[20])).toBe("Obadiah 1:21");
  });

  it("returns all verses in a multi-chapter book", () => {
    // Jude has 1 chapter (25 verses)
    const result = getAllVersesInBook("jude");
    expect(result).toHaveLength(25);
  });

  it("returns empty for invalid book", () => {
    expect(getAllVersesInBook("notabook")).toHaveLength(0);
  });
});

describe("verseLocationToId", () => {
  it("produces lowercase slug-based IDs", () => {
    expect(verseLocationToId(loc("genesis", 1, 1))).toBe("genesis-1-1");
    expect(verseLocationToId(loc("john", 3, 16))).toBe("john-3-16");
  });
});

describe("book input resolution", () => {
  it("resolves canonical slugs directly", () => {
    expect(resolveBookSlug("1-samuel")).toBe("1-samuel");
  });

  it("resolves display names to slugs", () => {
    expect(resolveBookSlug("1 Samuel")).toBe("1-samuel");
    expect(resolveBookSlug("Song of Solomon")).toBe("song-of-solomon");
  });

  it("parses verse locations from display names", () => {
    const location = parseVerseLocation("1 Samuel", 3, 1);
    expect(location).not.toBeNull();
    expect(formatReference(location!)).toBe("1 Samuel 3:1");
  });
});
