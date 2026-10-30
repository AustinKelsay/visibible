/**
 * The Bible's engine requests are pinned byte for byte (see tests/fixtures/bible-engine-golden.ts): moving
 * work-specific wording out of the engine must not change a single request the Bible's images are made from.
 */
import { describe, it, expect } from "vitest";
import golden from "../../../tests/fixtures/bible-engine-golden.json";
import { captureBibleEngineRequests } from "../../../tests/fixtures/bible-engine-golden";

describe("the Bible's engine requests", () => {
  it("match the captured baseline exactly: rendering, look, plan, review and scene check", async () => {
    const captured = await captureBibleEngineRequests();
    expect(Object.keys(captured).sort()).toEqual(Object.keys(golden).sort());
    for (const [key, value] of Object.entries(golden as Record<string, string>)) expect(captured[key], key).toBe(value);
  });
});
