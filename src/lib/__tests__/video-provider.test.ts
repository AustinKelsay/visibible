import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  downloadVideo, fetchVideoQuotes, MAX_VIDEO_BYTES, parseVideoJob, pollVideo, quotesFromCatalog,
  resetVideoQuoteCache, submitVideo, VideoRequestError,
} from "../video-provider";

const KEY = "sk-test-key-not-real";
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", KEY);
  vi.stubGlobal("fetch", fetchMock);
  resetVideoQuoteCache();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const mp4 = (size = 32) => {
  const bytes = new Uint8Array(size);
  bytes.set([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]);
  return bytes;
};
const catalog = (overrides: Record<string, unknown> = {}) => ({
  data: [{
    id: "minimax/hailuo-3-max", supported_resolutions: ["768p", "480p"], supported_aspect_ratios: ["16:9"],
    supported_durations: [5, 6, 10], pricing_skus: { duration_seconds: "0.08", duration_seconds_480p: "0.05", duration_seconds_768p: "0.08" },
    ...overrides,
  }],
});
const authOf = (call: number) => new Headers(fetchMock.mock.calls[call][1]?.headers).get("authorization");

async function rejection(promise: Promise<unknown>): Promise<VideoRequestError> {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(VideoRequestError);
  return error as VideoRequestError;
}

describe("parseVideoJob", () => {
  it.each([
    ["pending", "queued"], ["in_progress", "processing"], ["completed", "completed"],
    ["failed", "failed"], ["cancelled", "failed"], ["expired", "failed"],
  ])("maps %s to %s", (status, expected) => {
    expect(parseVideoJob({ id: "gen-vid-1", status }).status).toBe(expected);
  });

  it("reads actual cost from usage", () => {
    expect(parseVideoJob({ id: "gen-vid-1", status: "completed", usage: { cost: 0.48 } }).costUsd).toBe(0.48);
    expect(parseVideoJob({ id: "gen-vid-1", status: "completed", usage: { cost: -1 } }).costUsd).toBeUndefined();
  });

  it("rejects unrecognized states, bad ids, and mismatched ids", () => {
    expect(() => parseVideoJob({ id: "gen-vid-1", status: "mystery" })).toThrow(VideoRequestError);
    expect(() => parseVideoJob({ id: "../etc", status: "completed" })).toThrow(VideoRequestError);
    expect(() => parseVideoJob({ id: "gen-vid-2", status: "completed" }, "gen-vid-1")).toThrow(VideoRequestError);
  });
});

describe("submitVideo", () => {
  const input = { prompt: "A dove returns", duration: 5 as const, resolution: "768p" as const };

  it("posts the canonical text-to-video payload with no image or audio fields", async () => {
    fetchMock.mockResolvedValue(Response.json({ id: "gen-vid-1", status: "pending" }, { status: 202 }));
    await expect(submitVideo(input)).resolves.toEqual({ id: "gen-vid-1", status: "queued" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/videos");
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "minimax/hailuo-3-max", prompt: "A dove returns", duration: 5, resolution: "768p", aspect_ratio: "16:9",
    });
    expect(authOf(0)).toBe(`Bearer ${KEY}`);
    expect(init?.redirect).toBe("error");
  });

  it.each([
    ["network failure", () => Promise.reject(new TypeError("fetch failed")), true],
    ["5xx", () => Promise.resolve(new Response("oops", { status: 503 })), true],
    ["unreadable 2xx", () => Promise.resolve(new Response("not json", { status: 202 })), true],
    ["2xx without id", () => Promise.resolve(Response.json({ status: "pending" })), true],
    ["4xx rejection", () => Promise.resolve(new Response("bad", { status: 400 })), false],
    ["429", () => Promise.resolve(new Response("busy", { status: 429 })), false],
  ])("marks %s ambiguity correctly and never repeats the submit", async (_name, respond, ambiguous) => {
    fetchMock.mockImplementation(respond as () => Promise<Response>);
    const error = await rejection(submitVideo(input));
    expect(error.ambiguous).toBe(ambiguous);
    expect(error.message).not.toContain(KEY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects unsupported settings before calling the provider", async () => {
    await rejection(submitVideo({ ...input, duration: 6 as never }));
    await rejection(submitVideo({ ...input, resolution: "1080p" as never }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails without an API key", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    expect((await rejection(submitVideo(input))).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the submission deadline active while a response body stalls", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async (_url, init) => new Response(new ReadableStream({
      start(controller) {
        init?.signal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")));
      },
    }), { status: 202, headers: { "content-type": "application/json" } }));
    const result = rejection(submitVideo(input));
    await vi.advanceTimersByTimeAsync(45_001);
    expect((await result).ambiguous).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("pollVideo", () => {
  it("validates the id before fetching and returns cost", async () => {
    await rejection(pollVideo("a/b"));
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue(Response.json({ id: "gen-vid-1", status: "completed", usage: { cost: 0.4 } }));
    await expect(pollVideo("gen-vid-1")).resolves.toEqual({ id: "gen-vid-1", status: "completed", costUsd: 0.4 });
    expect(fetchMock.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/videos/gen-vid-1");
  });
});

describe("downloadVideo", () => {
  it("returns a direct 200 MP4", async () => {
    fetchMock.mockResolvedValue(new Response(mp4(), { headers: { "content-type": "video/mp4" } }));
    const blob = await downloadVideo("gen-vid-1");
    expect(blob.type).toBe("video/mp4");
    expect(blob.size).toBe(32);
    expect(fetchMock.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/videos/gen-vid-1/content?index=0");
    expect(fetchMock.mock.calls[0][1]?.redirect).toBe("manual");
  });

  it("follows an allowlisted redirect without forwarding the API key", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://storage.googleapis.com/openrouter-generated-media-us/v1/x.mp4?X-Goog-Signature=abc" } }))
      .mockResolvedValueOnce(new Response(mp4(), { headers: { "content-type": "video/mp4" } }));
    await downloadVideo("gen-vid-1");
    expect(String(fetchMock.mock.calls[1][0])).toContain("storage.googleapis.com");
    expect(authOf(1)).toBeNull();
    expect(fetchMock.mock.calls[1][1]?.redirect).toBe("error");
  });

  it.each([
    "http://storage.googleapis.com/x.mp4",
    "https://attacker.example/x.mp4",
    "https://storage.googleapis.com.attacker.example/x.mp4",
    "https://user:pass@storage.googleapis.com/x.mp4",
    "https://storage.googleapis.com:8443/x.mp4",
    "https://169.254.169.254/latest/meta-data",
    "/internal/path",
  ])("refuses redirect to %s", async (location) => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location } }));
    await rejection(downloadVideo("gen-vid-1"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects wrong content types, non-MP4 bytes, and oversized media", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>", { headers: { "content-type": "text/html" } }));
    await rejection(downloadVideo("gen-vid-1"));
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array(32), { headers: { "content-type": "video/mp4" } }));
    await rejection(downloadVideo("gen-vid-1"));
    fetchMock.mockResolvedValueOnce(new Response(mp4(), { headers: { "content-type": "video/mp4", "content-length": String(MAX_VIDEO_BYTES + 1) } }));
    await rejection(downloadVideo("gen-vid-1"));
    const chunk = new Uint8Array(16 * 1024 * 1024);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ > 8) controller.close();
        else controller.enqueue(sent === 1 ? mp4(chunk.length) : chunk);
      },
    });
    fetchMock.mockResolvedValueOnce(new Response(stream, { headers: { "content-type": "video/mp4" } }));
    expect((await rejection(downloadVideo("gen-vid-1"))).message).toMatch(/too large/);
  });

  it("validates the id before fetching", async () => {
    await rejection(downloadVideo("https://evil.example"));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("video quotes", () => {
  it("prices every duration and resolution from the live catalog entry", () => {
    expect(quotesFromCatalog(catalog())).toEqual([
      { duration: 5, resolution: "480p", providerCostUsd: 0.25, credits: 32 },
      { duration: 10, resolution: "480p", providerCostUsd: 0.5, credits: 63 },
      { duration: 5, resolution: "768p", providerCostUsd: 0.4, credits: 50 },
      { duration: 10, resolution: "768p", providerCostUsd: 0.8, credits: 100 },
    ]);
  });

  it.each([
    ["missing model", { data: [] }],
    ["missing resolution price", catalog({ pricing_skus: { duration_seconds_768p: "0.08" } })],
    ["non-numeric price", catalog({ pricing_skus: { duration_seconds_480p: "free", duration_seconds_768p: "0.08" } })],
    ["zero price", catalog({ pricing_skus: { duration_seconds_480p: "0", duration_seconds_768p: "0.08" } })],
    ["absurd price", catalog({ pricing_skus: { duration_seconds_480p: "50", duration_seconds_768p: "0.08" } })],
    ["unsupported duration", catalog({ supported_durations: [5] })],
    ["unsupported resolution", catalog({ supported_resolutions: ["768p"] })],
    ["unsupported aspect ratio", catalog({ supported_aspect_ratios: ["9:16"] })],
  ])("fails closed on %s", (_name, data) => {
    expect(quotesFromCatalog(data)).toBeNull();
  });

  it("caches successes only and sends no API key to the public catalog", async () => {
    fetchMock.mockResolvedValueOnce(new Response("down", { status: 500 }));
    await rejection(fetchVideoQuotes());
    fetchMock.mockResolvedValueOnce(Response.json(catalog()));
    await fetchVideoQuotes();
    await fetchVideoQuotes();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("https://openrouter.ai/api/v1/videos/models");
    expect(authOf(1)).toBeNull();
  });
});
