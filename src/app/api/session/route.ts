import { NextResponse } from "next/server";
import { api } from "../../../../convex/_generated/api";
import { getConvexClient } from "@/lib/convex-client";
import {
  generateSessionId,
  createSessionToken,
  getSessionCookieOptions,
  hashIp,
  getClientIp,
  validateSessionWithIp,
  getSessionDataFromCookies,
} from "@/lib/session";
import { validateOrigin, invalidOriginResponse } from "@/lib/origin";
import { generateCsrfToken, getCsrfCookieOptions } from "@/lib/csrf";

interface SessionResponse {
  sid: string | null;
  tier: "paid" | "admin";
  credits: number;
}

/**
 * GET /api/session
 * Returns the current session state.
 * If a valid session exists, updates lastSeenAt and returns session info.
 * If no session, returns null sid with paid tier and 0 credits.
 *
 * SECURITY: Validates IP binding and refreshes token if legacy or IP changed.
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
  convex.mutation(api.sessions.updateLastSeen, { sid }).catch(() => {
    // Ignore errors from background update
  });

  // Build response
  const response = NextResponse.json({
    sid: session.sid,
    tier: session.tier as "paid" | "admin",
    credits: session.credits,
  });

  // SECURITY: Refresh token to add IP binding for legacy tokens
  if (validation.needsRefresh && validation.currentIpHash) {
    const newToken = await createSessionToken(sid, validation.currentIpHash);
    const cookieOptions = getSessionCookieOptions(newToken);
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

  // SECURITY: Rate limit session creation by IP to prevent abuse
  const clientIp = getClientIp(request);
  const ipHash = await hashIp(clientIp);

  const rateLimitResult = await convex.mutation(api.rateLimit.checkRateLimit, {
    identifier: ipHash,
    endpoint: "session",
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
  const existingData = await getSessionDataFromCookies();
  if (existingData) {
    const existingSession = await convex.query(api.sessions.getSession, {
      sid: existingData.sid,
    });
    if (existingSession) {
      // Return existing session but refresh token with IP if needed
      const response = NextResponse.json({
        sid: existingSession.sid,
        tier: existingSession.tier as "paid" | "admin",
        credits: existingSession.credits,
      });

      // Refresh token with IP binding if legacy token
      if (!existingData.ipHash) {
        const newToken = await createSessionToken(existingData.sid, ipHash);
        const cookieOptions = getSessionCookieOptions(newToken);
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
  }

  // Generate new session
  const sid = generateSessionId();

  // Create session in Convex
  const session = await convex.mutation(api.sessions.createSession, {
    sid,
    ipHash,
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

  // SECURITY: Issue CSRF token for admin login protection
  const csrfToken = generateCsrfToken();
  const csrfCookieOptions = getCsrfCookieOptions(csrfToken);
  response.cookies.set(csrfCookieOptions.name, csrfCookieOptions.value, {
    httpOnly: csrfCookieOptions.httpOnly,
    secure: csrfCookieOptions.secure,
    sameSite: csrfCookieOptions.sameSite,
    path: csrfCookieOptions.path,
    maxAge: csrfCookieOptions.maxAge,
  });

  return response;
}
