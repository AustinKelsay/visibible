/**
 * Unit tests for session credit mutations, focusing on validation logic.
 */

import { describe, it, expect } from "vitest";
import { validatePositiveAmount } from "../../convex/sessions";

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



