import { NextResponse } from "next/server";
import { api } from "../../../../convex/_generated/api";
import { getConvexClient } from "@/lib/convex-client";
import { getSessionFromCookies } from "@/lib/session";
import { RATE_LIMITS } from "../../../../convex/rateLimit";
import { DEFAULT_DAILY_SPEND_LIMIT_USD } from "../../../../convex/sessions";

interface EndpointStatus {
  remaining: number;
  limit: number;
  resetAt: number;
  windowMs: number;
}

interface RateLimitStatusResponse {
  endpoints: {
    chat: EndpointStatus;
    "generate-image": EndpointStatus;
  };
  dailySpend: {
    spent: number;
    limit: number;
    remaining: number;
    resetsAt: number;
  } | null;
}

/**
 * GET /api/rate-limit-status
 * Returns current rate limit status for all rate-limited endpoints.
 * Helps clients avoid wasted requests by checking limits before expensive operations.
 */
export async function GET(): Promise<NextResponse<RateLimitStatusResponse>> {
  const convex = getConvexClient();
  const sid = await getSessionFromCookies();

  const now = Date.now();

  // Default response when no session or Convex
  const defaultEndpoint = (endpoint: keyof typeof RATE_LIMITS): EndpointStatus => ({
    remaining: RATE_LIMITS[endpoint].maxRequests,
    limit: RATE_LIMITS[endpoint].maxRequests,
    resetAt: now + RATE_LIMITS[endpoint].windowMs,
    windowMs: RATE_LIMITS[endpoint].windowMs,
  });

  if (!convex || !sid) {
    return NextResponse.json({
      endpoints: {
        chat: defaultEndpoint("chat"),
        "generate-image": defaultEndpoint("generate-image"),
      },
      dailySpend: null,
    });
  }

  // Fetch rate limit status for each endpoint in parallel
  const [chatStatus, imageStatus, session] = await Promise.all([
    convex.query(api.rateLimit.getRateLimitStatus, {
      identifier: sid,
      endpoint: "chat",
    }),
    convex.query(api.rateLimit.getRateLimitStatus, {
      identifier: sid,
      endpoint: "generate-image",
    }),
    convex.query(api.sessions.getSession, { sid }),
  ]);

  // Calculate daily spend info
  let dailySpend: RateLimitStatusResponse["dailySpend"] = null;
  if (session && session.tier !== "admin") {
    // Get UTC midnight for reset time calculation
    const todayMidnight = new Date();
    todayMidnight.setUTCHours(0, 0, 0, 0);
    const tomorrowMidnight = new Date(todayMidnight);
    tomorrowMidnight.setUTCDate(tomorrowMidnight.getUTCDate() + 1);

    const spent = session.dailySpendUsd;
    const limit = session.dailySpendLimitUsd;

    dailySpend = {
      spent,
      limit,
      remaining: Math.max(0, limit - spent),
      resetsAt: tomorrowMidnight.getTime(),
    };
  }

  return NextResponse.json({
    endpoints: {
      chat: {
        remaining: chatStatus.remaining,
        limit: RATE_LIMITS.chat.maxRequests,
        resetAt: chatStatus.resetAt,
        windowMs: RATE_LIMITS.chat.windowMs,
      },
      "generate-image": {
        remaining: imageStatus.remaining,
        limit: RATE_LIMITS["generate-image"].maxRequests,
        resetAt: imageStatus.resetAt,
        windowMs: RATE_LIMITS["generate-image"].windowMs,
      },
    },
    dailySpend,
  });
}
