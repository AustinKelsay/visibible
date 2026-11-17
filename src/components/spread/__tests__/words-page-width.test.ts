import { describe, expect, it } from "vitest";
import { WORDS_PAGE_WIDTH_CSS, wordsPageWidthPx } from "@/components/spread/words-page-width";

describe("the words page's width", () => {
  it("is one value for the layout's CSS variable and for the code", () => {
    expect(WORDS_PAGE_WIDTH_CSS).toBe("min(40vw, 600px)");
    expect(wordsPageWidthPx(1000)).toBe(400);
    expect(wordsPageWidthPx(2560)).toBe(600);
  });
});
