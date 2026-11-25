/* @vitest-environment node */
import { convexTest } from "convex-test";
import { expect, it, vi } from "vitest";
import schema from "../../../../../convex/schema";
import { api } from "../../../../../convex/_generated/api";
import { modules } from "../../../../../tests/convex/modules";
import { GET } from "../../rate-limit-status/route";

const fixture = vi.hoisted(() => ({
  client: { query: vi.fn() },
  serverSecret: "test-only",
  sid: "owner",
  ipHash: "ip",
}));
vi.mock("@/lib/convex-client", () => ({
  getConvexClient: () => fixture.client,
  getConvexServerSecret: () => fixture.serverSecret,
}));
vi.mock("@/lib/session", () => ({
  validateSessionWithIp: async () => ({ valid: true, sid: fixture.sid, currentIpHash: fixture.ipHash }),
  withSessionRefreshCookie: (response: Response) => response,
}));
vi.mock("@/lib/route-rate-limit", () => ({ checkIpRateLimit: async () => ({ allowed: true }) }));

it("reports the same remaining owner image allowance that admission applies", async () => {
  const { serverSecret, sid, ipHash } = fixture;
  vi.stubEnv("CONVEX_SERVER_SECRET", serverSecret);
  try {
    const t = convexTest(schema, modules);
    fixture.client.query.mockImplementation(t.query);
    await t.run(async (ctx) => {
      await ctx.db.insert("sessions", {
        sid, tier: "admin", credits: 100, lastSeenAt: Date.now(), createdAt: Date.now(),
        adminUntil: Date.now() + 60_000,
      });
    });
    const admission = await t.mutation(api.rateLimit.checkRateLimit, {
      sid, identifier: ipHash + ":" + sid, endpoint: "generate-image", serverSecret,
    });
    const response = await GET(new Request("http://fixture.example/api/rate-limit-status"));
    const image = (await response.json()).endpoints["generate-image"];
    expect({ admission: admission.remaining, reported: image.remaining, limit: image.limit })
      .toEqual({ admission: 39, reported: 39, limit: 40 });
  } finally {
    vi.unstubAllEnvs();
  }
});
