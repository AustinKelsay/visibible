/** The feedback route (#180): image reports forward only the image id, unknown images are 404, general feedback is unchanged. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";

const calls: Array<Record<string, unknown>> = [];
let mutationError: Error | null = null;
vi.mock("@/lib/convex-client", () => ({
  getConvexClient: vi.fn(() => ({
    mutation: vi.fn(async (_ref: unknown, args: Record<string, unknown>) => {
      if ("endpoint" in args) return { allowed: true, retryAfter: 0 };
      calls.push(args);
      if (mutationError) throw mutationError;
      return { success: true, kind: args.kind, ...(args.kind === "image" ? { artStyle: "watercolor", attentionId: "att-1", reopened: false } : {}) };
    }),
  })),
  getConvexServerSecret: vi.fn(() => "test-server-secret"),
}));
vi.mock("@/lib/origin", () => ({ validateOrigin: vi.fn(() => true), invalidOriginResponse: vi.fn(() => new Response("Invalid origin", { status: 403 })) }));
vi.mock("@/lib/session", () => ({
  validateSessionWithIp: vi.fn(async () => ({ valid: true, sid: "sid-1" })), withSessionRefreshCookie: vi.fn((r: Response) => r), getClientIp: vi.fn(() => "127.0.0.1"), hashIp: vi.fn(async () => "h"),
}));

const post = (body: unknown) => new Request("http://localhost:3000/api/feedback", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000" }, body: JSON.stringify(body) });

describe("POST /api/feedback", () => {
  beforeEach(() => { calls.length = 0; mutationError = null; });
  afterEach(() => { vi.resetModules(); });

  it("forwards an image report with only the image id and returns the resolved style", async () => {
    const { POST } = await import("../../feedback/route");
    const response = await POST(post({ kind: "image", message: "wrong hat", imageContext: { imageId: "img-1", model: "spoofed", creditsCost: 99 }, verseContext: { book: "Genesis", chapter: 1 } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, kind: "image", artStyle: "watercolor" });
    expect(calls[0]).toMatchObject({ kind: "image", message: "wrong hat", imageContext: { imageId: "img-1" }, verseContext: { book: "Genesis", chapter: 1 }, sid: "sid-1" });
    expect(Object.keys(calls[0].imageContext as object)).toEqual(["imageId"]);
  });

  it("refuses an image report without an image, maps an unknown image to 404, and keeps general feedback as before", async () => {
    const { POST } = await import("../../feedback/route");
    const missing = await POST(post({ kind: "image", message: "wrong hat" }));
    expect(missing.status).toBe(400);
    expect(calls).toHaveLength(0);
    mutationError = new ConvexError({ code: "UNKNOWN_IMAGE", message: "Unknown image" });
    const gone = await POST(post({ kind: "image", message: "wrong hat", imageContext: { imageId: "img-gone" } }));
    expect(gone.status).toBe(404);
    expect(await gone.json()).toMatchObject({ error: "Unknown image" });
    mutationError = null;
    const general = await POST(post({ message: "love it", imageContext: { imageId: "img-1", model: "lite" } }));
    expect(general.status).toBe(200);
    expect(await general.json()).toEqual({ success: true, kind: "general" });
    expect(calls[1]).toMatchObject({ kind: "general", imageContext: { imageId: "img-1", model: "lite" } });
  });
});
