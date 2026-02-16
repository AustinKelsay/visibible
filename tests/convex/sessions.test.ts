/**
 * Unit tests for session credit mutations, focusing on validation logic.
 */

import { describe, it, expect } from "vitest";
import {
  summarizeGenerationSettlement,
  validatePositiveAmount,
} from "../../convex/sessions";

describe("validatePositiveAmount", () => {
  it("should throw an error for zero amount", () => {
    expect(() => validatePositiveAmount(0)).toThrow(
      "Amount must be a positive number, received: 0"
    );
  });

  it("should throw an error for negative amounts", () => {
    expect(() => validatePositiveAmount(-1)).toThrow(
      "Amount must be a positive number, received: -1"
    );
    expect(() => validatePositiveAmount(-100)).toThrow(
      "Amount must be a positive number, received: -100"
    );
    expect(() => validatePositiveAmount(-0.01)).toThrow(
      "Amount must be a positive number, received: -0.01"
    );
  });

  it("should throw an error for non-finite numbers", () => {
    expect(() => validatePositiveAmount(Infinity)).toThrow();
    expect(() => validatePositiveAmount(-Infinity)).toThrow();
    expect(() => validatePositiveAmount(NaN)).toThrow();
  });

  it("should not throw for positive amounts", () => {
    expect(() => validatePositiveAmount(1)).not.toThrow();
    expect(() => validatePositiveAmount(100)).not.toThrow();
    expect(() => validatePositiveAmount(0.01)).not.toThrow();
    expect(() => validatePositiveAmount(999.99)).not.toThrow();
  });
});

describe("summarizeGenerationSettlement", () => {
  it("classifies empty entries as none", () => {
    const result = summarizeGenerationSettlement([]);
    expect(result.state).toBe("none");
    expect(result.reservedAmount).toBe(0);
  });

  it("classifies reservation-only entries as reserved", () => {
    const result = summarizeGenerationSettlement([
      { reason: "reservation", delta: -12, costUsd: 0.12 },
    ]);
    expect(result.state).toBe("reserved");
    expect(result.hasReservation).toBe(true);
    expect(result.reservedAmount).toBe(12);
    expect(result.reservationCostUsd).toBe(0.12);
  });

  it("classifies refund-without-generation as released", () => {
    const result = summarizeGenerationSettlement([
      { reason: "reservation", delta: -8, costUsd: 0.08 },
      { reason: "refund", delta: 8 },
    ]);
    expect(result.state).toBe("released");
  });

  it("classifies generation as charged even when refund also exists", () => {
    const result = summarizeGenerationSettlement([
      { reason: "reservation", delta: -10, costUsd: 0.1 },
      { reason: "generation", delta: -10, costUsd: 0.1 },
      { reason: "refund", delta: 10 },
    ]);
    expect(result.state).toBe("charged");
    expect(result.hasGeneration).toBe(true);
    expect(result.hasRefund).toBe(true);
  });
});


