import { describe, expect, it } from "vitest";
import {
  buildVerseQueue,
  estimateBulkCost,
  scopeLabel,
  getMaxScopeCount,
  getBookVerseCount,
} from "@/lib/bulk-generation";
import { parseVerseUrl } from "@/lib/navigation";

function loc(slug: string, ch: number, v: number) {
  const parsed = parseVerseUrl(slug, String(ch), String(v));
  if (!parsed) throw new Error(`Invalid location: ${slug} ${ch}:${v}`);
  return parsed;
}

describe("buildVerseQueue", () => {
  it("builds a verse queue for 'verses' scope", () => {
    const queue = buildVerseQueue({ type: "verses", count: 3 }, loc("genesis", 1, 1));
    expect(queue).toHaveLength(3);
    expect(queue[0].reference).toBe("Genesis 1:2");
    expect(queue[1].reference).toBe("Genesis 1:3");
    expect(queue[2].reference).toBe("Genesis 1:4");
    expect(queue[0].order).toBe(0);
    expect(queue[2].order).toBe(2);
  });

  it("builds a verse queue for 'chapters' scope", () => {
    // From Genesis 1:28 with 1 chapter → rest of ch1 (29,30,31)
    const queue = buildVerseQueue({ type: "chapters", count: 1 }, loc("genesis", 1, 28));
    expect(queue).toHaveLength(3);
    expect(queue[0].reference).toBe("Genesis 1:29");
    expect(queue[2].reference).toBe("Genesis 1:31");
  });

  it("builds a verse queue for 'chapters' scope spanning multiple chapters", () => {
    // From Genesis 1:30 with 2 chapters → rest of ch1 + all of ch2
    const queue = buildVerseQueue({ type: "chapters", count: 2 }, loc("genesis", 1, 30));
    // ch1 has 31 verses, starting after v30 = 1 verse. ch2 has 25 = 26 total
    expect(queue).toHaveLength(1 + 25);
    expect(queue[0].reference).toBe("Genesis 1:31");
    expect(queue[1].reference).toBe("Genesis 2:1");
  });

  it("skips the completed chapter when starting from its last verse", () => {
    const queue = buildVerseQueue({ type: "chapters", count: 1 }, loc("genesis", 1, 31));
    expect(queue[0].reference).toBe("Genesis 2:1");
    expect(queue).toHaveLength(25);
  });

  it("builds a verse queue for 'book' scope", () => {
    const queue = buildVerseQueue({ type: "book", count: 1 }, loc("obadiah", 1, 1));
    expect(queue).toHaveLength(21); // Obadiah has 21 verses
    expect(queue[0].verseId).toBe("obadiah-1-1");
  });

  it("assigns sequential order values", () => {
    const queue = buildVerseQueue({ type: "verses", count: 5 }, loc("john", 3, 14));
    for (let i = 0; i < queue.length; i++) {
      expect(queue[i].order).toBe(i);
    }
  });
});

describe("estimateBulkCost", () => {
  it("computes total credits and USD", () => {
    const result = estimateBulkCost(10, 13);
    expect(result.totalCredits).toBe(130);
    expect(result.totalUsd).toBe(1.3);
    expect(result.verseCount).toBe(10);
    expect(result.perVerseCost).toBe(13);
  });

  it("rounds credits up", () => {
    const result = estimateBulkCost(3, 7.1);
    expect(result.totalCredits).toBe(22);
  });
});

describe("scopeLabel", () => {
  it("generates verse labels", () => {
    expect(scopeLabel({ type: "verses", count: 1 }, loc("genesis", 1, 1))).toBe("Next 1 verse");
    expect(scopeLabel({ type: "verses", count: 10 }, loc("genesis", 1, 1))).toBe("Next 10 verses");
  });

  it("generates chapter labels", () => {
    expect(scopeLabel({ type: "chapters", count: 1 }, loc("genesis", 1, 1))).toBe("Next 1 chapter");
    expect(scopeLabel({ type: "chapters", count: 3 }, loc("genesis", 1, 1))).toBe("Next 3 chapters");
  });

  it("generates book labels", () => {
    expect(scopeLabel({ type: "book", count: 1 }, loc("genesis", 1, 1))).toBe("All of Genesis");
  });
});

describe("getMaxScopeCount", () => {
  it("returns 100 for verses", () => {
    expect(getMaxScopeCount("verses", loc("genesis", 1, 1))).toBe(100);
  });

  it("returns remaining chapters for chapters scope", () => {
    // Genesis has 50 chapters. From ch3: 50 - 3 + 1 = 48
    expect(getMaxScopeCount("chapters", loc("genesis", 3, 1))).toBe(48);
  });

  it("does not count the current chapter when already at its last verse", () => {
    expect(getMaxScopeCount("chapters", loc("genesis", 1, 31))).toBe(49);
  });

  it("returns 1 for book scope", () => {
    expect(getMaxScopeCount("book", loc("genesis", 1, 1))).toBe(1);
  });
});

describe("getBookVerseCount", () => {
  it("counts all verses in a book", () => {
    // Obadiah: 1 chapter, 21 verses
    expect(getBookVerseCount("obadiah")).toBe(21);
  });

  it("returns 0 for invalid book", () => {
    expect(getBookVerseCount("notabook")).toBe(0);
  });
});
