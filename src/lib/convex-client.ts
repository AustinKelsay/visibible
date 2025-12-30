import { ConvexHttpClient } from "convex/browser";

let client: ConvexHttpClient | null = null;

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
