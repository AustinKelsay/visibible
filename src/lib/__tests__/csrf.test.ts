/**
 * Unit tests for CSRF protection functions.
 * Tests token generation, validation, and cookie options.
 */

import { describe, it, expect } from "vitest";
import {
  generateCsrfToken,
  validateCsrfToken,
  getCsrfCookieOptions,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
} from "../csrf";

// Helper to create a mock Request with headers
function createMockRequest(headers: Record<string, string> = {}): Request {
  return {
    headers: new Headers(headers),
  } as Request;
}

describe("generateCsrfToken", () => {
  it("should generate a hex string of expected length", () => {
    const token = generateCsrfToken();
    // 32 bytes = 64 hex characters
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]+$/);
  });

  it("should generate unique tokens on each call", () => {
    const token1 = generateCsrfToken();
    const token2 = generateCsrfToken();
    expect(token1).not.toBe(token2);
  });

  it("should generate cryptographically distinct tokens", () => {
    // Generate many tokens and verify no duplicates
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      tokens.add(generateCsrfToken());
    }
    expect(tokens.size).toBe(100);
  });
});

describe("validateCsrfToken", () => {
  it("should return true for matching tokens", () => {
    const token = "a".repeat(64);
    const request = createMockRequest({ [CSRF_HEADER_NAME]: token });
    expect(validateCsrfToken(request, token)).toBe(true);
  });

  it("should return false for mismatched tokens", () => {
    const cookieToken = "a".repeat(64);
    const headerToken = "b".repeat(64);
    const request = createMockRequest({ [CSRF_HEADER_NAME]: headerToken });
    expect(validateCsrfToken(request, cookieToken)).toBe(false);
  });

  it("should return false when cookie token is missing", () => {
    const request = createMockRequest({ [CSRF_HEADER_NAME]: "a".repeat(64) });
    expect(validateCsrfToken(request, undefined)).toBe(false);
  });

  it("should return false when header token is missing", () => {
    const request = createMockRequest({});
    expect(validateCsrfToken(request, "a".repeat(64))).toBe(false);
  });

  it("should return false for length mismatch (short-circuit before timing-safe compare)", () => {
    const shortToken = "abc";
    const longToken = "a".repeat(64);
    const request = createMockRequest({ [CSRF_HEADER_NAME]: shortToken });
    expect(validateCsrfToken(request, longToken)).toBe(false);
  });

  it("should return false when both tokens are empty", () => {
    const request = createMockRequest({ [CSRF_HEADER_NAME]: "" });
    expect(validateCsrfToken(request, "")).toBe(false);
  });

  it("should be case-sensitive", () => {
    const token = "a".repeat(64);
    const upperToken = "A".repeat(64);
    const request = createMockRequest({ [CSRF_HEADER_NAME]: upperToken });
    expect(validateCsrfToken(request, token)).toBe(false);
  });
});

describe("getCsrfCookieOptions", () => {
  it("should set httpOnly to false (JS must read it)", () => {
    const options = getCsrfCookieOptions("test-token");
    expect(options.httpOnly).toBe(false);
  });

  it("should set sameSite to strict", () => {
    const options = getCsrfCookieOptions("test-token");
    expect(options.sameSite).toBe("strict");
  });

  it("should set secure based on NODE_ENV", () => {
    const options = getCsrfCookieOptions("test-token");
    // In test environment, NODE_ENV is typically 'test' which !== 'production'
    expect(typeof options.secure).toBe("boolean");
    // The logic: secure = process.env.NODE_ENV === "production"
    expect(options.secure).toBe(process.env.NODE_ENV === "production");
  });

  it("should set correct cookie name", () => {
    const options = getCsrfCookieOptions("test-token");
    expect(options.name).toBe(CSRF_COOKIE_NAME);
  });

  it("should include the provided token value", () => {
    const token = "my-csrf-token";
    const options = getCsrfCookieOptions(token);
    expect(options.value).toBe(token);
  });

  it("should set path to root", () => {
    const options = getCsrfCookieOptions("test");
    expect(options.path).toBe("/");
  });

  it("should set maxAge to 1 hour", () => {
    const options = getCsrfCookieOptions("test");
    expect(options.maxAge).toBe(60 * 60);
  });
});
