import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("chapter gallery source wiring", () => {
  it("gates gallery rendering behind the persisted preference and chapter-level Convex query", () => {
    const filePath = path.resolve(process.cwd(), "src/components/chapter-gallery.tsx");
    const source = readFileSync(filePath, "utf8");

    expect(source).toContain("const { chapterGalleryEnabled } = usePreferences();");
    expect(source).toContain("api.verseImages.getChapterGallery");
    expect(source).toContain("if (!chapterGalleryEnabled) {");
    expect(source).toContain("Latest saved image or placeholder for every verse in the chapter.");
    expect(source).toContain("href={item.href}");
  });

  it("exposes chapter gallery controls in persisted preferences and header settings", () => {
    const preferencesSource = readFileSync(
      path.resolve(process.cwd(), "src/context/preferences-context.tsx"),
      "utf8"
    );
    const headerSource = readFileSync(
      path.resolve(process.cwd(), "src/components/header-settings-popover.tsx"),
      "utf8"
    );

    expect(preferencesSource).toContain("chapterGalleryEnabled");
    expect(preferencesSource).toContain("preference: \"chapterGallery\"");
    expect(headerSource).toContain("Chapter Gallery");
    expect(headerSource).toContain("setChapterGalleryEnabled");
  });
});
