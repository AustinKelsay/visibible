/**
 * Image cost events no longer carry the scene planner's fields or a separate image price (ADR 0012). During the
 * deploy that drops them, a server still on the previous release may send them, so both shapes must be accepted.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { modules } from "./modules";

const event = {
  sid: "s", requestId: "r", generationId: "g", modelId: "google/gemini-nano-banana-2.1", verseId: "genesis-1-3", translationId: "web",
  styleProfileId: "classical", reference: "Genesis 1:3", aspectRatio: "16:9", resolution: "1K", usedFallbackEstimate: false,
  estimatedCreditsCost: 6, estimatedCostUsd: 0.06, reservationCreditsCost: 12, reservationCostUsd: 0.12, actualCreditsCost: 5, actualCostUsd: 0.05,
};

const SECRET = "test-server-secret-with-at-least-32-chars";
afterEach(() => vi.unstubAllEnvs());

describe("image cost event shape", () => {
  it("leaves the retired fields out when the server action forwards an event without them", async () => {
    vi.stubEnv("CONVEX_SERVER_SECRET", SECRET);
    const t = convexTest(schema, modules);
    await t.action(api.costs.enqueueImageCostEventOutbox, { ...event, serverSecret: SECRET });
    const [row] = await t.run((ctx) => ctx.db.query("costEventOutbox").collect());
    for (const field of ["scenePlannerUsed", "scenePlanFromCache", "imageCreditsCost", "imageCostUsd", "scenePlannerCredits", "scenePlannerCostUsd"]) {
      expect(row.payload).not.toHaveProperty(field);
    }
    expect(row.payload).toMatchObject({ actualCreditsCost: 5, requestId: "r" });
  });

  it("accepts an event without planner fields, and one from the previous release with them", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.costs.enqueueImageCostEventOutboxInternal, { payload: event });
    await t.mutation(internal.costs.enqueueImageCostEventOutboxInternal, {
      payload: { ...event, scenePlannerUsed: false, scenePlanFromCache: false, imageCreditsCost: 5, imageCostUsd: 0.05, scenePlannerCredits: 0, scenePlannerCostUsd: 0 },
    });
    const rows = await t.run((ctx) => ctx.db.query("costEventOutbox").collect());
    expect(rows).toHaveLength(2);
    expect(rows[0].payload).not.toHaveProperty("scenePlannerUsed");
  });
});
