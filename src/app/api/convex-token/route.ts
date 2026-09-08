import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { api } from "../../../../convex/_generated/api";
import { getConvexClient, getConvexServerSecret } from "@/lib/convex-client";
import { validateSessionWithIp } from "@/lib/session";
import { validateOrigin } from "@/lib/origin";
import { CSRF_COOKIE_NAME, validateCsrfToken, getCsrfCookieOptions } from "@/lib/csrf";
import { issueGuestToken } from "@/lib/guest-token";

function reply(body: object, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export async function POST(request: Request) {
  if (!validateOrigin(request) ||
      !validateCsrfToken(request, (await cookies()).get(CSRF_COOKIE_NAME)?.value)) {
    return reply({ error: "Forbidden" }, 403);
  }
  const validation = await validateSessionWithIp(request);
  if (!validation.valid || !validation.sid || !validation.cookieExpiresAt) {
    return reply({ error: "Session expired" }, 401);
  }
  try {
    const convex = getConvexClient();
    if (!convex) return reply({ error: "Authentication unavailable" }, 503);
    const serverSecret = getConvexServerSecret();
    const limit = await convex.mutation(api.rateLimit.checkRateLimit, {
      identifier: validation.sid, endpoint: "guest-token", serverSecret,
    });
    if (!limit.allowed) return reply({ error: "Too many requests" }, 429,
      { "Retry-After": String(limit.retryAfter ?? 60) });
    const session = await convex.query(api.guestAuth.sessionForToken, {
      sid: validation.sid, serverSecret,
    });
    if (!session) return reply({ error: "Session unavailable" }, 401);
    // Deliberately do not set a refreshed session cookie: background token
    // renewal must not extend the underlying guest's idle lifetime.
    const response = NextResponse.json(await issueGuestToken(session.sid, validation.cookieExpiresAt), {
      headers: { "Cache-Control": "no-store" },
    });
    const csrf = (await cookies()).get(CSRF_COOKIE_NAME)!.value;
    response.cookies.set(getCsrfCookieOptions(csrf));
    return response;
  } catch {
    return reply({ error: "Authentication unavailable" }, 503);
  }
}
