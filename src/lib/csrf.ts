/**
 * CSRF protection using double-submit cookie pattern.
 * Stateless approach - no server-side token storage required.
 */

import { randomBytes, timingSafeEqual } from "crypto";

export const CSRF_COOKIE_NAME = "visibible_csrf";
export const CSRF_HEADER_NAME = "x-csrf-token";

/**
 * Generate a cryptographically secure CSRF token.
 */
export function generateCsrfToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Cookie options for CSRF token.
 * httpOnly: false - must be readable by JavaScript to send in header.
 * sameSite: strict - additional CSRF protection.
 */
export function getCsrfCookieOptions(token: string) {
  return {
    name: CSRF_COOKIE_NAME,
    value: token,
    httpOnly: false, // Must be readable by JS to include in header
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: 60 * 60, // 1 hour
  };
}

/**
 * Validate CSRF token using timing-safe comparison.
 * Both cookie and header must be present and match.
 *
 * @param request - The incoming request (to read header)
 * @param cookieToken - CSRF token from cookie
 * @returns true if tokens match, false otherwise
 */
export function validateCsrfToken(
  request: Request,
  cookieToken: string | undefined
): boolean {
  const headerToken = request.headers.get(CSRF_HEADER_NAME);

  // Both must be present
  if (!cookieToken || !headerToken) {
    return false;
  }

  // Lengths must match (prevents timing oracle)
  if (cookieToken.length !== headerToken.length) {
    return false;
  }

  // Timing-safe comparison
  const a = Buffer.from(cookieToken, "utf-8");
  const b = Buffer.from(headerToken, "utf-8");

  return timingSafeEqual(a, b);
}
