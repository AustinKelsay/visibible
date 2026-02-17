import { NextResponse } from "next/server";
import { api } from "../../../../convex/_generated/api";
import { getConvexClient, getConvexServerSecret } from "@/lib/convex-client";
import {
  generateSessionId,
  createSessionToken,
  getSessionCookieOptions,
  hashIp,
  getClientIp,
  validateSessionWithIp,
} from "@/lib/session";
import { validateOrigin, invalidOriginResponse } from "@/lib/origin";
import { generateCsrfToken, getCsrfCookieOptions } from "@/lib/csrf";

interface SessionResponse {
  sid: string | null;
  tier: "paid" | "admin";
  credits: number;
}

/**
 * Ensure CSRF cookie exists (and refreshes) for routes that require it.
 */
function setCsrfCookie(response: NextResponse): void {
  const csrfToken = generateCsrfToken();
  const csrfCookieOptions = getCsrfCookieOptions(csrfToken);
  response.cookies.set(csrfCookieOptions.name, csrfCookieOptions.value, {
    httpOnly: csrfCookieOptions.httpOnly,
    secure: csrfCookieOptions.secure,
    sameSite: csrfCookieOptions.sameSite,
    path: csrfCookieOptions.path,
    maxAge: csrfCookieOptions.maxAge,
  });
}

/**
 * GET /api/session
 * Returns the current session state.
 * If a valid session exists, updates lastSeenAt and returns session info.
 * If no session, returns null sid with paid tier and 0 credits.
 *
 * SECURITY: Validates idle/absolute session timeouts and IP binding.
 * Refreshes token on activity without exceeding the absolute timeout cap.
 */
export async function GET(request: Request): Promise<NextResponse<SessionResponse>> {
  const convex = getConvexClient();
  if (!convex) {
    return NextResponse.json({
      sid: null,
      tier: "paid",
      credits: 0,
    });
  }

  // Validate session with IP binding check
  const validation = await validateSessionWithIp(request);

  if (!validation.valid || !validation.sid) {
    return NextResponse.json({
      sid: null,
      tier: "paid",
      credits: 0,
    });
  }

  const sid = validation.sid;
  let serverSecret: string | null = null;
  try {
    serverSecret = getConvexServerSecret();
  } catch {
    console.error("[Session API] CONVEX_SERVER_SECRET not configured");
  }

  // Fetch session from Convex
  const session = await convex.query(api.sessions.getSession, { sid });

  if (!session) {
    return NextResponse.json({
      sid: null,
      tier: "paid",
      credits: 0,
    });
  }

  // Update lastSeenAt in background (don't await)
  if (serverSecret) {
    convex
      .mutation(api.sessions.updateLastSeen, { sid, serverSecret })
      .catch(() => {
        // Ignore errors from background update
      });
  }

  // Build response
  const response = NextResponse.json({
    sid: session.sid,
    tier: session.tier as "paid" | "admin",
    credits: session.credits,
  });

  // Keep CSRF token fresh for admin-login and other state-changing endpoints.
  setCsrfCookie(response);

  // SECURITY: Refresh session token on activity (idle timeout renewal capped by absolute timeout)
  if (validation.refreshedToken) {
    const cookieOptions = getSessionCookieOptions(validation.refreshedToken);
    response.cookies.set(cookieOptions.name, cookieOptions.value, {
      httpOnly: cookieOptions.httpOnly,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      path: cookieOptions.path,
      maxAge: cookieOptions.maxAge,
    });
  }

  return response;
}

/**
 * POST /api/session
 * Creates a new anonymous session.
 * Sets a signed cookie and stores the session in Convex.
 */
export async function POST(request: Request): Promise<NextResponse<SessionResponse>> {
  // SECURITY: Validate request origin
  if (!validateOrigin(request)) {
    return invalidOriginResponse() as NextResponse<SessionResponse>;
  }

  const convex = getConvexClient();
  if (!convex) {
    return NextResponse.json(
      { sid: null, tier: "paid" as const, credits: 0 },
      { status: 503 }
    );
  }

  let serverSecret: string;
  try {
    serverSecret = getConvexServerSecret();
  } catch {
    console.error("[Session API] CONVEX_SERVER_SECRET not configured");
    return NextResponse.json(
      { sid: null, tier: "paid" as const, credits: 0 },
      { status: 503 }
    );
  }

  // SECURITY: Rate limit session creation by IP to prevent abuse
  const clientIp = getClientIp(request);
  const ipHash = await hashIp(clientIp);

  const rateLimitResult = await convex.mutation(api.rateLimit.checkRateLimit, {
    identifier: ipHash,
    endpoint: "session",
    serverSecret,
  });

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      {
        sid: null,
        tier: "paid" as const,
        credits: 0,
        error: "Too many session creation requests",
      } as SessionResponse & { error: string },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimitResult.retryAfter || 60),
        },
      }
    );
  }

  // Check if session already exists and is valid
  const existingValidation = await validateSessionWithIp(request);
  if (existingValidation.valid && existingValidation.sid) {
    const existingSession = await convex.query(api.sessions.getSession, {
      sid: existingValidation.sid,
    });
    if (existingSession) {
      // Return existing session but refresh token with IP if needed
      const response = NextResponse.json({
        sid: existingSession.sid,
        tier: existingSession.tier as "paid" | "admin",
        credits: existingSession.credits,
      });

      // Existing sessions also need a CSRF cookie for admin-login.
      setCsrfCookie(response);

      return response;
    }
  }

  // Generate new session
  const sid = generateSessionId();

  // Create session in Convex
  const session = await convex.mutation(api.sessions.createSession, {
    sid,
    ipHash,
    serverSecret,
  });

  // SECURITY: Create signed token with IP binding
  const token = await createSessionToken(sid, ipHash);

  // Build response with Set-Cookie header
  const response = NextResponse.json({
    sid: session.sid,
    tier: session.tier as "paid" | "admin",
    credits: session.credits,
  });

  // Set cookie on the response object to ensure Set-Cookie header is attached
  const cookieOptions = getSessionCookieOptions(token);
  response.cookies.set(cookieOptions.name, cookieOptions.value, {
    httpOnly: cookieOptions.httpOnly,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite,
    path: cookieOptions.path,
    maxAge: cookieOptions.maxAge,
  });

  // SECURITY: Issue CSRF token for admin login protection.
  setCsrfCookie(response);

  return response;
}
