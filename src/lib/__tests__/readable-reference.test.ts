import { describe, expect, it } from "vitest";
import { readableReference } from "@/lib/readable-reference";

describe("readableReference", () => {
  it("names a chapter or verse of Psalms as one psalm", () => {
    expect(readableReference("Psalms 23:1")).toBe("Psalm 23:1");
    expect(readableReference("Psalms 119")).toBe("Psalm 119");
  });

  it("keeps the book's own name and every other book as they are", () => {
    expect(readableReference("Psalms")).toBe("Psalms");
    expect(readableReference("John 1:5")).toBe("John 1:5");
    expect(readableReference("Song of Solomon 2:1")).toBe("Song of Solomon 2:1");
    expect(readableReference("1 John 4:8")).toBe("1 John 4:8");
  });
});
