/**
 * Holmes's and Alice's engine requests, pinned byte for byte (ADR 0011's free tier). A diff here names the works a
 * prompt change reaches; review it as that change and regenerate deliberately with WRITE_ENGINE_GOLDEN=1.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { captureWorkEngineRequests, GOLDEN_WORKS } from "../../../tests/fixtures/work-engine-golden";

const goldenFile = (workId: string) => new URL(`../../../tests/fixtures/${workId}-engine-golden.json`, import.meta.url);

describe("each work's engine requests", () => {
  it.each(GOLDEN_WORKS)("match %s's captured baseline: look, plan, review, rendering in each style and the image check", async (workId) => {
    const captured = await captureWorkEngineRequests(workId);
    if (process.env.WRITE_ENGINE_GOLDEN === "1") writeFileSync(goldenFile(workId), `${JSON.stringify(captured, null, 1)}\n`);
    expect(existsSync(goldenFile(workId)), `${workId} has no golden file; run with WRITE_ENGINE_GOLDEN=1`).toBe(true);
    const golden = JSON.parse(readFileSync(goldenFile(workId), "utf8")) as Record<string, string>;
    expect(Object.keys(captured).sort()).toEqual(Object.keys(golden).sort());
    for (const [key, value] of Object.entries(golden)) expect(captured[key], `${workId} ${key}`).toBe(value);
  });
});
