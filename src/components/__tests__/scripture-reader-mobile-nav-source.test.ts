import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("ScriptureReader mobile navigation prominence", () => {
  it("renders the mobile verse navigation as a stronger card-style control", () => {
    const filePath = path.resolve(process.cwd(), "src/components/scripture-reader.tsx");
    const source = readFileSync(filePath, "utf8");

    expect(source).toContain("const mobileNavButtonClassName =");
    expect(source).toContain("min-h-[56px]");
    expect(source).toContain("Verse Navigation");
    expect(source).toContain("shadow-[0_20px_44px_rgba(15,23,42,0.10)]");
    expect(source).toContain("source: \"mobile_nav\"");
    expect(source).toContain("aria-label=\"Previous verse\"");
    expect(source).toContain("aria-label=\"Next verse\"");
  });
});
