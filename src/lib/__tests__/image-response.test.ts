import { describe, expect, it } from "vitest";
import { extractImageUrlFromPart, findResponseImageUrl } from "../image-response";

const DATA = "data:image/png;base64,iVBORw0KGgo=";
const REMOTE = "https://cdn.example/image.png";

describe("findResponseImageUrl", () => {
  it("takes returned bytes over a remote URL in the same part", () => {
    expect(extractImageUrlFromPart({ url: REMOTE, b64_json: "iVBORw0KGgo=" })).toBe(DATA);
    expect(extractImageUrlFromPart({ image_url: { url: REMOTE }, inline_data: { data: "iVBORw0KGgo=", mime_type: "image/png" } })).toBe(DATA);
  });

  it("takes returned bytes in content over a remote URL in images", () => {
    expect(findResponseImageUrl({ images: [{ image_url: { url: REMOTE } }], content: [{ type: "image_url", image_url: { url: DATA } }] })).toBe(DATA);
  });

  it("still names a remote-only image, which the save then refuses", () => {
    expect(findResponseImageUrl({ images: [{ image_url: { url: REMOTE } }] })).toBe(REMOTE);
  });

  it("keeps the first returned image when several are inline", () => {
    const second = "data:image/png;base64,AAAA";
    expect(findResponseImageUrl({ images: [{ image_url: { url: DATA } }, { image_url: { url: second } }] })).toBe(DATA);
    expect(findResponseImageUrl({ content: "no image" })).toBeNull();
  });
});
