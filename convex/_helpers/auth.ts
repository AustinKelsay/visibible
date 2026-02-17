import { timingSafeEqual } from "node:crypto";

const ENV_SECRET_KEY = "CONVEX_SERVER_SECRET";

/**
 * Validates the server secret against CONVEX_SERVER_SECRET.
 * Ensures only authenticated API routes can call sensitive mutations.
 *
 * Performs a timing-safe secret comparison.
 * Length mismatches are rejected before calling `timingSafeEqual` to avoid exceptions.
 */
export function isValidServerSecret(
  serverSecret: string | null | undefined
): boolean {
  const expectedSecret = process.env[ENV_SECRET_KEY];
  if (!expectedSecret || typeof serverSecret !== "string") {
    return false;
  }

  const provided = Buffer.from(serverSecret, "utf8");
  const expected = Buffer.from(expectedSecret, "utf8");
  if (provided.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(provided, expected);
}

/**
 * Validates the server secret against CONVEX_SERVER_SECRET.
 *
 * @param serverSecret - Secret value from the API route request
 * @throws Error if secret is missing or does not match
 */
export function validateServerSecret(serverSecret: string): void {
  if (!isValidServerSecret(serverSecret)) {
    throw new Error("Unauthorized: Invalid server secret");
  }
}
