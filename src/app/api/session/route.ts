import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { api } from "../../../../convex/_generated/api";
import { getConvexClient } from "@/lib/convex-client";
import {
  getSessionFromCookies,
  generateSessionId,
  createSessionToken,
  getSessionCookieOptions,
  hashIp,
} from "@/lib/session";

interface SessionResponse {
  sid: string | null;
  tier: "free" | "paid" | "admin";
  credits: number;
}

/**
 * GET /api/session
 * Returns the current session state.
 * If a valid session exists, updates lastSeenAt and returns session info.
 * If no session, returns null sid with free tier and 0 credits.
 */
export async function GET(): Promise<NextResponse<SessionResponse>> {
  const convex = getConvexClient();
  if (!convex) {
    return NextResponse.json({
      sid: null,
      tier: "free",
      credits: 0,
    });
  }

  const sid = await getSessionFromCookies();

  if (!sid) {
    return NextResponse.json({
      sid: null,
      tier: "free",
      credits: 0,
    });
  }

  // Fetch session from Convex
  const session = await convex.query(api.sessions.getSession, { sid });

  if (!session) {
    return NextResponse.json({
      sid: null,
      tier: "free",
      credits: 0,
    });
  }

  // Update lastSeenAt in background (don't await)
  convex.mutation(api.sessions.updateLastSeen, { sid }).catch(() => {
    // Ignore errors from background update
  });

  return NextResponse.json({
    sid: session.sid,
    tier: session.tier as "free" | "paid" | "admin",
    credits: session.credits,
  });
}

/**
 * POST /api/session
 * Creates a new anonymous session.
 * Sets a signed cookie and stores the session in Convex.
 */
export async function POST(): Promise<NextResponse<SessionResponse>> {
  const convex = getConvexClient();
  if (!convex) {
    return NextResponse.json(
      { sid: null, tier: "free" as const, credits: 0 },
      { status: 503 }
    );
  }

  // Check if session already exists
  const existingSid = await getSessionFromCookies();
  if (existingSid) {
    const existingSession = await convex.query(api.sessions.getSession, {
      sid: existingSid,
    });
    if (existingSession) {
      return NextResponse.json({
        sid: existingSession.sid,
        tier: existingSession.tier as "free" | "paid" | "admin",
        credits: existingSession.credits,
      });
    }
  }

  // Generate new session
  const sid = generateSessionId();

  // Get IP hash for privacy-preserving tracking
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0] ||
    headersList.get("x-real-ip") ||
    "unknown";
  const ipHash = await hashIp(ip);

  // Create session in Convex
  const session = await convex.mutation(api.sessions.createSession, {
    sid,
    ipHash,
  });

  // Create signed token
  const token = await createSessionToken(sid);

  // Build response with Set-Cookie header
  const response = NextResponse.json({
    sid: session.sid,
    tier: session.tier as "free" | "paid" | "admin",
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

  return response;
}
