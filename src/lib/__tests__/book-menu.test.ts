import { describe, expect, it } from "vitest";
import { getExpandedTestamentForPathname } from "@/lib/book-menu";

describe("getExpandedTestamentForPathname", () => {
  it("returns old for Old Testament routes", () => {
    expect(getExpandedTestamentForPathname("/genesis/1/1")).toBe("old");
  });

  it("returns new for New Testament routes", () => {
    expect(getExpandedTestamentForPathname("/john/3/16")).toBe("new");
  });

  it("falls back to old for non-verse routes", () => {
    expect(getExpandedTestamentForPathname("/about")).toBe("old");
    expect(getExpandedTestamentForPathname("/")).toBe("old");
  });
});
