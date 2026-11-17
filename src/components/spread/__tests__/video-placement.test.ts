import { describe, expect, it } from "vitest";
import { videoPlacement } from "@/components/spread/spread-picture";

// A Hailuo clip is the picture's centre a little narrower at the same height, at 768p whatever the picture's size.
const frame = { width: 375, height: 375 };
const clip = { width: 1344, height: 768 };

describe("videoPlacement", () => {
  it("draws a 1K picture's clip at the picture's scale, centred like it", () => {
    const placement = videoPlacement({ frame, pictureSize: { width: 1376, height: 768 }, videoSize: clip, cover: true, wordsPageCovers: false })!;
    expect(placement.height).toBeCloseTo(375);
    expect(placement.width).toBeCloseTo(656.25);
    expect(placement.left).toBeCloseTo((375 - 656.25) / 2);
  });

  it("gives a 2K picture's 768p clip the picture's full height, not its pixel scale", () => {
    const placement = videoPlacement({ frame, pictureSize: { width: 2752, height: 1536 }, videoSize: clip, cover: true, wordsPageCovers: false })!;
    expect(placement.height).toBeCloseTo(375);
    expect(placement.width).toBeCloseTo(656.25);
  });

  it("waits until the frame and both sizes are known", () => {
    expect(videoPlacement({ frame: null, pictureSize: { width: 1376, height: 768 }, videoSize: clip, cover: true, wordsPageCovers: false })).toBeNull();
  });
});
