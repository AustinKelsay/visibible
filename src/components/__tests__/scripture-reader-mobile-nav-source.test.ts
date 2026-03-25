import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("MobileVerseNav sticky bottom bar", () => {
  it("renders a fixed bottom bar with verse navigation and analytics", () => {
    const filePath = path.resolve(process.cwd(), "src/components/mobile-verse-nav.tsx");
    const source = readFileSync(filePath, "utf8");

    expect(source).toContain("fixed bottom-0");
    expect(source).toContain("sm:hidden");
    expect(source).toContain('source: "mobile_nav"');
    expect(source).toContain('aria-label="Verse navigation"');
    expect(source).toContain("env(safe-area-inset-bottom)");
    expect(source).toContain("isFullscreen");
    expect(source).toContain("translate-y-full");
  });
});
