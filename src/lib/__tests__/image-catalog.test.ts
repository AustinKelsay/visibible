import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import snapshot from "../../../tests/fixtures/image-catalog.json";
import { catalogImageQuote, normalizeImageBilling, imageCapabilities } from "../image-catalog";

beforeEach(() => vi.resetModules());
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const id = "google/gemini-2.5-flash-image";
const raw = snapshot.data.find(model => model.id === id)!;
const respond = (data: unknown) => ({ ok: true, json: async () => data });

describe("verified image billing and discovery", () => {
  it("prices the live default from output tokens without needing an input-image price", () => {
    const pricing = { ...raw.pricing, image: undefined };
    const billing = normalizeImageBilling(id, pricing, 123)!;
    expect(billing).toMatchObject({ unit: "token", observedAt: 123, imageOutputUsd: "0.00003" });
    expect(catalogImageQuote(id, billing, "1K")).toEqual({ providerUsd: 0.0415, credits: 6 });
    expect(catalogImageQuote(id, billing, "2K")).toBeNull();
    expect(normalizeImageBilling(id, { ...pricing, image: "999999" }, 123)).toEqual(billing);
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
    const proId = "google/gemini-3-pro-image";
    const pro = normalizeImageBilling(proId, snapshot.data.find(m => m.id === proId)!.pricing, 1);
    expect(catalogImageQuote(proId, pro, "1K")).toEqual(catalogImageQuote(proId, pro, "2K"));
    expect(catalogImageQuote(proId, pro, "4K")).toEqual({ providerUsd: 0.254, credits: 32 });
    const flashId = "google/gemini-3.1-flash-image";
    const flash = normalizeImageBilling(flashId, snapshot.data.find(m => m.id === flashId)!.pricing, 1);
    expect(catalogImageQuote(flashId, flash, "2K")).toEqual({ providerUsd: 0.1043, credits: 14 });
    expect(imageCapabilities(flashId)?.resolutions).toEqual(["1K", "2K", "4K"]);
  });
  it("retains known defaults, disables unverified models, and never reintroduces a missing default", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(respond(snapshot)).mockResolvedValueOnce(respond({ data: [] }));
    vi.stubGlobal("fetch", fetcher);
    const { fetchImageModels } = await import("../image-models");
    const first = await fetchImageModels("test-key");
    expect(first.models.find(m => m.id === id)).toMatchObject({ creditsCost: 6, availability: "available" });
    expect(first.models.find(m => m.id === "openai/gpt-5-image")).toMatchObject({ creditsCost: null, availability: "unavailable" });
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
