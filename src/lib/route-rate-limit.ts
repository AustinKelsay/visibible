/**
 * IP-scoped rate limits for routes that do work before (or without) a session.
 * Fails open when Convex is unavailable so the route keeps its own error path.
 */
import { api } from "../../convex/_generated/api";
import { getConvexClient, getConvexServerSecret } from "./convex-client";
import type { RateLimitEndpoint } from "../../convex/rateLimit";

export type RouteRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfter: number };

export async function checkIpRateLimit(
  request: Request,
  endpoint: RateLimitEndpoint
): Promise<RouteRateLimitResult> {
  const convex = getConvexClient();
  if (!convex) return { allowed: true };
  let serverSecret: string;
  try {
    serverSecret = getConvexServerSecret();
  } catch {
    return { allowed: true };
  }
  try {
    // Imported lazily so routes can be imported in tests before session secrets are set.
    const { getClientIp, hashIp } = await import("./session");
    const clientIp = getClientIp(request);
    // No address at all (no trusted proxy): fall back to coarse client hints so unrelated
    // readers do not share one global budget. Forwarded headers stay unused here.
    const identifier = clientIp === "unknown"
      ? `unknown:${await hashIp(`${request.headers.get("user-agent") ?? ""}\n${request.headers.get("accept-language") ?? ""}`)}`
      : await hashIp(clientIp);
    const result = await convex.mutation(api.rateLimit.checkRateLimit, {
      identifier,
      endpoint,
      serverSecret,
    });
    return result.allowed
      ? { allowed: true }
      : { allowed: false, retryAfter: result.retryAfter ?? 60 };
  } catch {
    return { allowed: true };
  }
}

export function rateLimitedResponse(retryAfter: number): Response {
  return Response.json(
    { error: "Rate limit exceeded", message: "Too many requests. Please wait.", retryAfter },
    { status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" } }
  );
}
