const ENV_SECRET_KEY = "CONVEX_SERVER_SECRET";
const textEncoder = new TextEncoder();

/**
 * Runtime-safe timing-resistant compare for Convex query/mutation runtimes.
 * Convex query/mutation code cannot import Node built-ins like `node:crypto`.
 */
export function timingSafeCompare(
  providedValue: string | null | undefined,
  expectedValue: string | null | undefined
): boolean {
  if (typeof providedValue !== "string" || typeof expectedValue !== "string") {
    return false;
  }

  const provided = textEncoder.encode(providedValue);
  const expected = textEncoder.encode(expectedValue);

  const maxLength = Math.max(provided.length, expected.length);
  let diff = provided.length ^ expected.length;
  for (let i = 0; i < maxLength; i += 1) {
    const a = i < provided.length ? provided[i]! : 0;
    const b = i < expected.length ? expected[i]! : 0;
    diff |= a ^ b;
  }

  return diff === 0;
}

/**
 * Validates the server secret against CONVEX_SERVER_SECRET.
 * Ensures only authenticated API routes can call sensitive mutations.
 *
 * Performs a timing-resistant secret comparison without Node APIs.
 */
export function isValidServerSecret(
  serverSecret: string | null | undefined
): boolean {
  const expectedSecret = process.env[ENV_SECRET_KEY];
  if (!expectedSecret) {
    return false;
  }

  return timingSafeCompare(serverSecret, expectedSecret);
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
