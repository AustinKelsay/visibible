import { ConvexHttpClient } from "convex/browser";

let client: ConvexHttpClient | null = null;

/**
 * Get the server secret for Convex action authentication.
 * This secret is used to validate that calls to Convex actions
 * come from our API routes, not from malicious clients.
 */
export function getConvexServerSecret(): string {
  const secret = process.env.CONVEX_SERVER_SECRET;
  if (!secret) {
    throw new Error("CONVEX_SERVER_SECRET environment variable is required");
  }
  return secret;
}

/**
 * Get a singleton ConvexHttpClient for use in API routes.
 * Returns null if CONVEX_URL is not configured.
 */
export function getConvexClient(): ConvexHttpClient | null {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!convexUrl) {
    return null;
  }

  if (!client) {
    client = new ConvexHttpClient(convexUrl);
  }

  return client;
}
