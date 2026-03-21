import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { ChapterGallery } from "@/components/chapter-gallery";
import { usePreferences } from "@/context/preferences-context";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => createElement("a", { href, ...props }, children),
}));

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
}));

vi.mock("@/components/convex-client-provider", () => ({
  useConvexEnabled: vi.fn(),
}));

vi.mock("@/context/preferences-context", () => ({
  usePreferences: vi.fn(),
}));

vi.mock("@/context/navigation-context", () => ({
  useNavigation: vi.fn(() => ({
    isFullscreen: false,
    openFullscreen: vi.fn(),
    closeFullscreen: vi.fn(),
  })),
}));

const useQueryMock = vi.mocked(useQuery);
const useConvexEnabledMock = vi.mocked(useConvexEnabled);
const usePreferencesMock = vi.mocked(usePreferences);

const baseProps = {
  book: "genesis",
  bookName: "Genesis",
  chapter: 1,
  currentVerse: 1,
  verses: [
    { verse: 1, text: "In the beginning" },
    { verse: 2, text: "The earth was formless" },
  ],
};

describe("chapter gallery behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePreferencesMock.mockReturnValue({
      chapterGalleryEnabled: false,
    } as never);
    useConvexEnabledMock.mockReturnValue(false);
    useQueryMock.mockReturnValue(null as never);
  });

  it("skips rendering and chapter gallery queries when the preference is disabled", () => {
    const markup = renderToStaticMarkup(createElement(ChapterGallery, baseProps));

    expect(useQueryMock).toHaveBeenCalledWith(api.verseImages.getChapterGallery, "skip");
    expect(markup).toBe("");
  });

  it("skips Convex chapter gallery queries but still renders placeholders when Convex is unavailable", () => {
    usePreferencesMock.mockReturnValue({
      chapterGalleryEnabled: true,
    } as never);
    useConvexEnabledMock.mockReturnValue(false);

    const markup = renderToStaticMarkup(createElement(ChapterGallery, baseProps));

    expect(useQueryMock).toHaveBeenCalledWith(api.verseImages.getChapterGallery, "skip");
    expect(markup).toContain("All images gallery");
    expect(markup).toContain("No image yet");
    expect(markup).toContain("/genesis/1/1");
    expect(markup).toContain("/genesis/1/2");
  });

  it("renders verse mini-galleries, placeholders, and chapter links when enabled", () => {
    usePreferencesMock.mockReturnValue({
      chapterGalleryEnabled: true,
    } as never);
    useConvexEnabledMock.mockReturnValue(true);
    useQueryMock.mockReturnValue([
      {
        verse: 1,
        imageCount: 2,
        imageId: "image-1-latest",
        imageUrl: "https://example.com/1-latest.png",
        model: "openai/image",
        createdAt: 250,
        isLatest: true,
      },
      {
        verse: 1,
        imageCount: 2,
        imageId: "image-1-older",
        imageUrl: "https://example.com/1-older.png",
        model: "openai/image",
        createdAt: 200,
        isLatest: false,
      },
    ] as never);

    const markup = renderToStaticMarkup(createElement(ChapterGallery, baseProps));

    expect(useQueryMock).toHaveBeenCalledWith(api.verseImages.getChapterGallery, {
      book: "genesis",
      chapter: 1,
    });
    expect(markup).toContain("Chapter Gallery");
    expect(markup).toContain("Gallery layout");
    expect(markup).toContain("All images");
    expect(markup).toContain("By verse");
    expect(markup).toContain("All images gallery");
    expect(markup).toContain("1/2");
    expect(markup).toContain("/genesis/1/1");
    expect(markup).toContain("/genesis/1/2");
    expect(markup).toContain("Loading saved image for Genesis 1:1");
    expect(markup).toContain("No image yet");
    expect(markup).not.toContain("Verse 1 mini-gallery");
  });

  it("shows the grouped-by-verse filter option alongside the default gallery stream", () => {
    usePreferencesMock.mockReturnValue({
      chapterGalleryEnabled: true,
    } as never);
    useConvexEnabledMock.mockReturnValue(true);
    useQueryMock.mockReturnValue([
      {
        verse: 1,
        imageCount: 1,
        imageId: "image-1-latest",
        imageUrl: "https://example.com/1-latest.png",
        model: "openai/image",
        createdAt: 250,
        isLatest: true,
      },
    ] as never);

    const markup = renderToStaticMarkup(createElement(ChapterGallery, baseProps));

    expect(markup).toContain("By verse");
    expect(markup).toContain("1 saved image");
  });
});
