/**
 * Origin validation for API routes.
 * Provides defense-in-depth beyond SameSite cookies.
 */

/**
 * Get allowed origins based on environment.
 * In production, only the app URL is allowed.
 * In development, localhost is also permitted.
 */
function getAllowedOrigins(): string[] {
  const origins: string[] = [];

  // Production app URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    origins.push(appUrl);
  }

  // Development origins
  if (process.env.NODE_ENV !== "production") {
    origins.push("http://localhost:3000");
    origins.push("http://127.0.0.1:3000");
  }

  return origins;
}

/**
 * Validate that a request comes from an allowed origin.
 *
 * Same-origin requests (no Origin header) are always allowed.
 * Cross-origin requests must have an origin in the allowlist.
 *
 * @param request - The incoming request
 * @returns true if origin is valid or same-origin, false otherwise
 */
export function validateOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");

  // Same-origin requests don't have an Origin header - allow them
  if (!origin) {
    return true;
  }

  // Check against allowlist
  const allowedOrigins = getAllowedOrigins();
  return allowedOrigins.includes(origin);
}

/**
 * Create a 403 response for invalid origin.
 */
export function invalidOriginResponse(): Response {
  return Response.json(
    { error: "Forbidden", message: "Invalid request origin" },
    { status: 403 }
  );
}
