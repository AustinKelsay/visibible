import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
import { validateSessionWithIp } from "@/lib/session";
import { resolveGenerationPassage } from "@/lib/generation-passage";
import { resetVideoQuoteCache } from "@/lib/video-provider";
import { GET, POST } from "../../generate-video/route";

const convex = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn() }));
vi.mock("@/lib/convex-client", () => ({
  getConvexClient: () => convex,
  getConvexServerSecret: () => "server-secret",
}));
vi.mock("@/lib/session", () => ({
  validateSessionWithIp: vi.fn(),
  withSessionRefreshCookie: (response: Response) => response,
  getClientIp: () => "127.0.0.1",
  hashIp: async () => "ip-hash",
}));
vi.mock("@/lib/generation-passage", () => ({ resolveGenerationPassage: vi.fn() }));

const ORIGIN = "http://localhost:3000";
const CSRF = "c".repeat(64);
const REQUEST_ID = "6f1c2f1e-8a2b-4c3d-9e4f-0a1b2c3d4e5f";
const fetchMock = vi.fn<typeof fetch>();
const calls = (name: string) => [...convex.query.mock.calls, ...convex.mutation.mock.calls]
  .filter(([ref]) => getFunctionName(ref) === name).map(([, args]) => args);
const catalog = {
  data: [{
    id: "minimax/hailuo-3-max", supported_resolutions: ["768p", "480p"], supported_aspect_ratios: ["16:9"],
    supported_durations: [5, 10], pricing_skus: { duration_seconds_480p: "0.05", duration_seconds_768p: "0.08" },
  }],
};
const job = (overrides = {}) => ({
  id: "job1", requestId: REQUEST_ID, verseId: "john-3-16", reference: "John 3:16", status: "queued",
  duration: 5, resolution: "768p", createdAt: 1, estimatedCredits: 50, ...overrides,
});
const body = (overrides: Record<string, unknown> = {}) => ({
  requestId: REQUEST_ID, reference: "john 3:16", translation: "web", duration: 5, resolution: "768p", maxCredits: 50, ...overrides,
});
const post = (payload: unknown, headers: Record<string, string> = {}) => POST(new NextRequest(`${ORIGIN}/api/generate-video`, {
  method: "POST", body: typeof payload === "string" ? payload : JSON.stringify(payload),
  headers: { origin: ORIGIN, "content-type": "application/json", "x-csrf-token": CSRF, cookie: `visibible_csrf=${CSRF}`, ...headers },
}));

beforeEach(() => {
  vi.stubEnv("ENABLE_VIDEO_GENERATION", "true");
  vi.stubEnv("OPENROUTER_API_KEY", "sk-test");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async () => Response.json(catalog));
  resetVideoQuoteCache();
  vi.mocked(validateSessionWithIp).mockResolvedValue({ valid: true, sid: "sid-1", currentIpHash: "ip-hash" });
  vi.mocked(resolveGenerationPassage).mockResolvedValue({
    reference: "John 3:16", verseText: "For God so loved the world...",
    prevVerse: { number: 15, text: "that whoever believes...", reference: "John 3:15" },
    nextVerse: { number: 17, text: "For God didn't send his Son...", reference: "John 3:17" },
  });
  convex.query.mockResolvedValue(null);
  convex.mutation.mockImplementation(async (ref) => getFunctionName(ref) === "rateLimit:checkRateLimit" ? { allowed: true } : job());
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  fetchMock.mockReset();
});

describe("GET /api/generate-video", () => {
  it("reports disabled without calling the provider", async () => {
    vi.stubEnv("ENABLE_VIDEO_GENERATION", "false");
    expect(await (await GET()).json()).toEqual({ enabled: false, model: "minimax/hailuo-3-max", modelName: "Hailuo 3 Max", quotes: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns live quotes when enabled", async () => {
    const config = await (await GET()).json();
    expect(config.enabled).toBe(true);
    expect(config.quotes).toContainEqual({ duration: 10, resolution: "768p", providerCostUsd: 0.8, credits: 100 });
  });

  it("fails closed when pricing is unavailable", async () => {
    fetchMock.mockResolvedValue(Response.json({ data: [] }));
    const config = await (await GET()).json();
    expect(config).toMatchObject({ enabled: false, quotes: [], error: expect.any(String) });
  });
});

describe("POST /api/generate-video", () => {
  it("rejects missing origin and CSRF before session access", async () => {
    expect((await post(body(), { origin: "" })).status).toBe(403);
    expect((await post(body(), { "x-csrf-token": "d".repeat(64) })).status).toBe(403);
    expect(validateSessionWithIp).not.toHaveBeenCalled();
  });

  it("is disabled unless the server flag is set", async () => {
    vi.stubEnv("ENABLE_VIDEO_GENERATION", "");
    expect((await post(body())).status).toBe(403);
    expect(validateSessionWithIp).not.toHaveBeenCalled();
  });

  it("requires a valid session", async () => {
    vi.mocked(validateSessionWithIp).mockResolvedValue({ valid: false });
    expect((await post(body())).status).toBe(401);
    expect(convex.mutation).not.toHaveBeenCalled();
  });

  it("applies the durable rate limit", async () => {
    convex.mutation.mockResolvedValue({ allowed: false, retryAfter: 30 });
    const response = await post(body());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(calls("rateLimit:checkRateLimit")[0]).toMatchObject({ endpoint: "generate-video", identifier: "ip-hash:sid-1" });
  });

  it.each([
    ["non-UUID request id", body({ requestId: "abc" })],
    ["unsupported duration", body({ duration: 6 })],
    ["unsupported resolution", body({ resolution: "720p" })],
    ["unknown translation", body({ translation: "niv" })],
    ["client prompt", body({ prompt: "anything" })],
    ["image input", body({ imageUrl: "https://example.com/a.png" })],
    ["invalid JSON", "{"],
  ])("rejects %s", async (_name, payload) => {
    expect((await post(payload)).status).toBe(400);
    expect(calls("verseVideos:enqueue")).toHaveLength(0);
  });

  it("rejects oversized bodies", async () => {
    expect((await post(body({ reference: "x".repeat(5000) }))).status).toBe(413);
  });

  it("enqueues a canonical, server-built job and returns 202", async () => {
    const response = await post(body());
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual(job());
    const [args] = calls("verseVideos:enqueue") as Array<Record<string, unknown>>;
    expect(args).toMatchObject({
      serverSecret: "server-secret", sid: "sid-1", requestId: REQUEST_ID, verseId: "john-3-16", reference: "John 3:16",
      translation: "web", duration: 5, resolution: "768p", estimatedCostUsd: 0.4, estimatedCredits: 50,
    });
    expect(args.prompt).toContain("For God so loved the world");
    expect(args.prompt).toContain("John 3:17");
    expect(args.inputFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(resolveGenerationPassage).toHaveBeenCalledWith("john 3:16", "web");
  });

  it("returns an existing job before any passage lookup or requote", async () => {
    convex.query.mockResolvedValue(job({ status: "completed", videoUrl: "https://convex/x" }));
    const response = await post(body({ maxCredits: 1 }));
    expect(response.status).toBe(200);
    expect(resolveGenerationPassage).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(calls("verseVideos:enqueue")).toHaveLength(0);
  });

  it("keeps the fingerprint stable across maxCredits and reference spacing/case", async () => {
    await post(body());
    await post(body({ maxCredits: 999, reference: "  John   3:16 " }));
    const [first, second] = calls("verseVideos:findRequest") as Array<{ inputFingerprint: string }>;
    expect(first.inputFingerprint).toBe(second.inputFingerprint);
    await post(body({ resolution: "480p" }));
    expect((calls("verseVideos:findRequest")[2] as { inputFingerprint: string }).inputFingerprint).not.toBe(first.inputFingerprint);
  });

  it("maps a request ID conflict to 409", async () => {
    convex.query.mockRejectedValue(new ConvexError({ code: "REQUEST_CONFLICT", message: "x" }));
    expect((await post(body())).status).toBe(409);
  });

  it("returns 409 with the new quote when the live price exceeds maxCredits", async () => {
    const response = await post(body({ maxCredits: 49 }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "QUOTE_CHANGED", quote: { credits: 50 } });
    expect(calls("verseVideos:enqueue")).toHaveLength(0);
  });

  it("fails closed when the catalog is unavailable", async () => {
    fetchMock.mockResolvedValue(new Response("down", { status: 503 }));
    expect((await post(body())).status).toBe(503);
    expect(calls("verseVideos:enqueue")).toHaveLength(0);
  });

  it("rejects unresolvable references", async () => {
    vi.mocked(resolveGenerationPassage).mockResolvedValue(null);
    expect((await post(body())).status).toBe(400);
  });

  it.each([["INSUFFICIENT_CREDITS", 402], ["VIDEO_ACTIVE", 409], ["UNAUTHORIZED", 401]])("maps enqueue %s to %i", async (code, status) => {
    convex.mutation.mockImplementation(async (ref) => {
      if (getFunctionName(ref) === "rateLimit:checkRateLimit") return { allowed: true };
      throw new ConvexError({ code, message: "x" });
    });
    expect((await post(body())).status).toBe(status);
  });

  it("hides unexpected backend errors", async () => {
    convex.mutation.mockImplementation(async (ref) => {
      if (getFunctionName(ref) === "rateLimit:checkRateLimit") return { allowed: true };
      throw new Error("internal secret detail");
    });
    const response = await post(body());
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
  });
});
