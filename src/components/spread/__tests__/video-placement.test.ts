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

  it("keeps hard edges where the clip covers the frame, and fades them where the picture shows past it", () => {
    const picture = { width: 1376, height: 768 };
    // A phone's square frame and a 1440x900 window: the clip overflows both sides, nothing to blend.
    expect(videoPlacement({ frame, pictureSize: picture, videoSize: clip, cover: true, wordsPageCovers: false })!.maskImage).toBeUndefined();
    expect(videoPlacement({ frame: { width: 1440, height: 900 }, pictureSize: picture, videoSize: clip, cover: true, wordsPageCovers: false })!.maskImage).toBeUndefined();
    // A very wide window (2560x1080): the clip is narrower than the frame, so its sides fade into the picture.
    const wide = videoPlacement({ frame: { width: 2560, height: 1080 }, pictureSize: picture, videoSize: clip, cover: true, wordsPageCovers: false })!;
    expect(wide.left as number).toBeGreaterThan(0);
    expect(wide.maskImage).toMatch(/^linear-gradient\(to right, transparent, #000 \d+px/);
    // The whole-picture view shows the picture whole, a little wider than its clip: faded too.
    expect(videoPlacement({ frame: { width: 1440, height: 900 }, pictureSize: picture, videoSize: clip, cover: false, wordsPageCovers: false })!.maskImage).toBeDefined();
  });

  it("waits until the frame and both sizes are known", () => {
    expect(videoPlacement({ frame: null, pictureSize: { width: 1376, height: 768 }, videoSize: clip, cover: true, wordsPageCovers: false })).toBeNull();
  });
});
