import { describe, expect, it } from "vitest";
import { estimateBulkCost } from "@/lib/bulk-generation";

describe("estimateBulkCost", () => {
  it("computes total credits and USD", () => {
    const result = estimateBulkCost(10, 13);
    expect(result.totalCredits).toBe(130);
    expect(result.totalUsd).toBe(1.3);
    expect(result.verseCount).toBe(10);
    expect(result.perVerseCost).toBe(13);
  });

  it("rounds credits up", () => {
    const result = estimateBulkCost(3, 7.1);
    expect(result.totalCredits).toBe(22);
  });
});
