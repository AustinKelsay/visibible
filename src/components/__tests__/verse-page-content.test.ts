/* @vitest-environment jsdom */

import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useVerseView } from "@/context/verse-view-context";
import { VersePageContent } from "@/components/verse-page-content";

vi.mock("@/context/verse-view-context", () => ({
  useVerseView: vi.fn(),
}));

vi.mock("next/dynamic", () => ({
  default: () => ({ verseId }: { verseId: string }) => createElement(
    "div",
    { "data-video-verse-id": verseId },
    "VideoMode"
  ),
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

  it.each(["reader", "gallery", "video"] as const)("links each tab to its panel when %s is selected", (effectiveView) => {
    useVerseViewMock.mockReturnValue({ isSettled: true, effectiveView, setEffectiveView: vi.fn() });
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(createElement(VersePageContent, baseProps));
    const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tablist"][aria-label="Verse mode"] [role="tab"]');
    const panels = [...container.querySelectorAll<HTMLDivElement>('[role="tabpanel"]')];

    expect(tabs).toHaveLength(3);
    expect(panels).toHaveLength(3);
    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(panels.filter((panel) => !panel.hidden)).toHaveLength(1);
    expect([...tabs].filter((tab) => tab.tabIndex === 0)).toHaveLength(1);
    for (const tab of tabs) {
      const panel = panels.find((candidate) => candidate.id === tab.getAttribute("aria-controls"));
      expect(panel).toBeDefined();
      expect(panel!.getAttribute("aria-labelledby")).toBe(tab.id);
      expect(panel!.hidden).toBe(tab.getAttribute("aria-selected") !== "true");
      expect(tab.type).toBe("button");
      if (panel!.hidden) expect(panel!.childElementCount).toBe(0);
      else expect(panel!.tabIndex).toBe(0);
    }
  });

  it("keeps tab and panel IDs unique across mounted verse pages", () => {
    useVerseViewMock.mockReturnValue({ isSettled: true, effectiveView: "reader", setEffectiveView: vi.fn() });
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(createElement(Fragment, null,
      createElement(VersePageContent, baseProps), createElement(VersePageContent, baseProps)));
    const ids = [...container.querySelectorAll("[id]")].map((element) => element.id);
    expect(ids).toHaveLength(12);
    expect(new Set(ids).size).toBe(ids.length);
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
    expect(markup).not.toContain("VideoMode");
  });

  it("mounts Video mode with the canonical verse ID instead of the reading or gallery views", () => {
    useVerseViewMock.mockReturnValue({
      isSettled: true,
      effectiveView: "video",
    } as never);

    const markup = renderToStaticMarkup(createElement(VersePageContent, baseProps));

    expect(markup).toContain("VideoMode");
    expect(markup).toContain('data-video-verse-id="genesis-1-1"');
    expect(markup).not.toContain("HeroImage");
    expect(markup).not.toContain("ScriptureReader");
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
