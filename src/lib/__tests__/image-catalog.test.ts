import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import snapshot from "../../../tests/fixtures/image-catalog.json";
import { catalogImageQuote, normalizeImageBilling, imageCapabilities } from "../image-catalog";
import { DEFAULT_IMAGE_MODEL } from "../image-models";

beforeEach(() => vi.resetModules());
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const id = "google/gemini-2.5-flash-image";
const raw = snapshot.data.find(model => model.id === id)!;
const respond = (data: unknown) => ({ ok: true, json: async () => data });

describe("verified image billing and discovery", () => {
  it("quotes the default from its catalog rates at its only verified resolution", () => {
    const billing = normalizeImageBilling(DEFAULT_IMAGE_MODEL, snapshot.data.find(m => m.id === DEFAULT_IMAGE_MODEL)!.pricing, 1);
    expect(catalogImageQuote(DEFAULT_IMAGE_MODEL, billing, "1K")).toEqual({ providerUsd: 0.03535, credits: 5 });
    expect(imageCapabilities(DEFAULT_IMAGE_MODEL)?.resolutions).toEqual(["1K"]);
  });
  it("prices Gemini 2.5 Flash Image from output tokens without needing an input-image price", () => {
    const pricing = { ...raw.pricing, image: undefined };
    const billing = normalizeImageBilling(id, pricing, 123)!;
    expect(billing).toMatchObject({ unit: "token", observedAt: 123, imageOutputUsd: "0.00003" });
    expect(catalogImageQuote(id, billing, "1K")).toEqual({ providerUsd: 0.0415, credits: 6 });
    expect(catalogImageQuote(id, billing, "2K")).toBeNull();
    // An input-image price is carried for the generic engine's references but never enters this quote.
    const withInputPrice = normalizeImageBilling(id, { ...pricing, image: "999999" }, 123)!;
    expect(withInputPrice).toEqual({ ...billing, imageInputUsd: "999999" });
    expect(catalogImageQuote(id, withInputPrice, "1K")).toEqual(catalogImageQuote(id, billing, "1K"));
  });
  it.each(["NaN", "Infinity", "-1", "0.03junk", "", "1e31"])("rejects malformed output rate %s without converting input-image pricing", rate => {
    expect(normalizeImageBilling(id, { ...raw.pricing, image_output: rate }, 1)).toBeUndefined();
  });
  it("does not interpret a flat image price as a verified token rate for unknown models", () => {
    expect(normalizeImageBilling("unknown/image", { prompt: "0", completion: "0", image: "0.04", image_output: "0.04" }, 1)).toBeUndefined();
    expect(normalizeImageBilling(id, { prompt: "0", completion: "0", image: "0.04" }, 1)).toBeUndefined();
    expect(normalizeImageBilling(id, { prompt: "0", completion: "0", image_output: "0" }, 1)).toBeDefined();
  });
  it("uses each model's documented resolution token counts and rounds the combined sum once", () => {
    const flashId = "google/gemini-3.1-flash-image";
    const flash = normalizeImageBilling(flashId, snapshot.data.find(m => m.id === flashId)!.pricing, 1);
    expect(catalogImageQuote(flashId, flash, "2K")).toEqual({ providerUsd: 0.1043, credits: 14 });
    expect(catalogImageQuote(flashId, flash, "4K")).toEqual({ providerUsd: 0.1547, credits: 20 });
    expect(imageCapabilities(flashId)?.resolutions).toEqual(["1K", "2K", "4K"]);
  });
  it("offers only verified models and never reintroduces a missing default", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(respond(snapshot)).mockResolvedValueOnce(respond({ data: [] }));
    vi.stubGlobal("fetch", fetcher);
    const { fetchImageModels } = await import("../image-models");
    const first = await fetchImageModels("test-key");
    expect(first.models.find(m => m.id === id)).toMatchObject({ creditsCost: 6, availability: "available" });
    expect(first.models.map(m => m.id)).toEqual([id, "google/gemini-3.1-flash-image", DEFAULT_IMAGE_MODEL]);
    expect((await fetchImageModels("test-key")).models).toEqual([]);
  });
  it("labels a bounded stale snapshot and disables quotes after it expires", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValueOnce(respond(snapshot)).mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal("fetch", fetcher);
    const { fetchImageModels } = await import("../image-models");
    await fetchImageModels("test-key");
    const stale = await fetchImageModels("test-key");
    expect(stale.models.find(m => m.id === id)?.availability).toBe("stale");
    vi.setSystemTime(Date.now() + 6 * 3600000 + 1);
    expect((await fetchImageModels("test-key")).models.every(m => m.availability === "unavailable")).toBe(true);
  });
});
