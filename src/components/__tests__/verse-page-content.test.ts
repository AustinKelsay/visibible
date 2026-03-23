import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useVerseView } from "@/context/verse-view-context";
import { VersePageContent } from "@/components/verse-page-content";

vi.mock("@/context/verse-view-context", () => ({
  useVerseView: vi.fn(),
}));

vi.mock("@/components/hero-image", () => ({
  HeroImage: () => createElement("div", null, "HeroImage"),
}));

vi.mock("@/components/scripture-reader", () => ({
  ScriptureReader: () => createElement("div", null, "ScriptureReader"),
}));

vi.mock("@/components/scripture-details", () => ({
  ScriptureDetails: () => createElement("div", null, "ScriptureDetails"),
}));

vi.mock("@/components/verse-strip-bar", () => ({
  VerseStripBar: () => createElement("div", null, "VerseStripBar"),
}));

vi.mock("@/components/chapter-gallery", () => ({
  ChapterGallery: () => createElement("div", null, "ChapterGallery"),
}));

const useVerseViewMock = vi.mocked(useVerseView);

const baseProps = {
  bookSlug: "genesis",
  bookName: "Genesis",
  chapter: 1,
  verseNumber: 1,
  verseText: "In the beginning",
  totalVerses: 31,
  prevUrl: undefined,
  nextUrl: "/genesis/1/2",
  prevVerse: undefined,
  nextVerse: { number: 2, text: "The earth was formless", reference: "Genesis 1:2" },
  currentReference: "Genesis 1:1",
  chapterTheme: undefined,
  testament: "old" as const,
  verses: [
    { verse: 1, text: "In the beginning" },
    { verse: 2, text: "The earth was formless" },
  ],
};

describe("VersePageContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("switches to the full gallery view when the chapter gallery preference is enabled", () => {
    useVerseViewMock.mockReturnValue({
      isSettled: true,
      effectiveView: "gallery",
    } as never);

    const markup = renderToStaticMarkup(createElement(VersePageContent, baseProps));

    expect(markup).toContain("ChapterGallery");
    expect(markup).not.toContain("HeroImage");
    expect(markup).not.toContain("ScriptureReader");
    expect(markup).not.toContain("VerseStripBar");
    expect(markup).not.toContain("ScriptureDetails");
  });

  it("renders the reading view when the chapter gallery preference is disabled", () => {
    useVerseViewMock.mockReturnValue({
      isSettled: true,
      effectiveView: "reader",
    } as never);

    const markup = renderToStaticMarkup(createElement(VersePageContent, baseProps));

    expect(markup).toContain("HeroImage");
    expect(markup).toContain("VerseStripBar");
    expect(markup).toContain("ScriptureReader");
    expect(markup).toContain("ScriptureDetails");
    expect(markup).not.toContain("ChapterGallery");
  });

  it("waits for the verse view to settle before rendering either view", () => {
    useVerseViewMock.mockReturnValue({
      isSettled: false,
      effectiveView: "gallery",
    } as never);

    const markup = renderToStaticMarkup(createElement(VersePageContent, baseProps));

    expect(markup).not.toContain("HeroImage");
    expect(markup).not.toContain("ChapterGallery");
    expect(markup).toContain("aria-busy=\"true\"");
  });
});
