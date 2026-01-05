import { NextResponse } from "next/server";
import { getSessionFromCookies, getClientIp, hashIp } from "@/lib/session";
import { getConvexClient } from "@/lib/convex-client";
import { validateOrigin, invalidOriginResponse } from "@/lib/origin";
import { validateCsrfToken, CSRF_COOKIE_NAME } from "@/lib/csrf";
import { api } from "../../../../convex/_generated/api";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

/**
 * Get the admin password secret key from environment variables.
 * Returns undefined when admin access is not configured.
 */
function getAdminPasswordSecret(): string | undefined {
  return process.env.ADMIN_PASSWORD_SECRET;
}

/**
 * POST /api/admin-login
 * Validates admin password and upgrades session to admin tier.
 * Includes brute force protection with IP-based lockout.
 */
export async function POST(request: Request): Promise<NextResponse> {
  // SECURITY: Validate request origin
  if (!validateOrigin(request)) {
    return invalidOriginResponse() as NextResponse;
  }

  // SECURITY: Validate CSRF token
  const cookieStore = await cookies();
  const csrfCookie = cookieStore.get(CSRF_COOKIE_NAME)?.value;
  if (!validateCsrfToken(request, csrfCookie)) {
    return NextResponse.json(
      { error: "Invalid request", message: "CSRF validation failed" },
      { status: 403 }
    );
  }

  const convex = getConvexClient();
  if (!convex) {
    return NextResponse.json(
      { error: "Service unavailable" },
      { status: 503 }
    );
  }

  const sid = await getSessionFromCookies();
  if (!sid) {
    return NextResponse.json(
      { error: "Session required" },
      { status: 401 }
    );
  }

  // SECURITY: Get IP hash for brute force protection
  const clientIp = getClientIp(request);
  const ipHash = await hashIp(clientIp);

  // SECURITY: Check if IP is locked out due to too many failed attempts
  const loginAllowedResult = await convex.query(api.rateLimit.checkAdminLoginAllowed, {
    ipHash,
  });

  if (!loginAllowedResult.allowed) {
    const retryAfter = loginAllowedResult.lockedUntil
      ? Math.ceil((loginAllowedResult.lockedUntil - Date.now()) / 1000)
      : 3600;
    return NextResponse.json(
      {
        error: "Too many failed attempts",
        message: "Account temporarily locked. Please try again later.",
        retryAfter,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
        },
      }
    );
  }

  try {
    const body = await request.json();
    const { password } = body;

    if (!password || typeof password !== "string") {
      return NextResponse.json(
        { error: "Password required" },
        { status: 400 }
      );
    }

    const adminPassword = process.env.ADMIN_PASSWORD;

    // Use generic error message to avoid revealing configuration state
    if (!adminPassword) {
      // Record failed attempt even for misconfiguration to avoid timing oracle
      await convex.mutation(api.rateLimit.recordFailedAdminLogin, { ipHash });
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const adminPasswordSecret = getAdminPasswordSecret();
    if (!adminPasswordSecret) {
      // Record failed attempt
      await convex.mutation(api.rateLimit.recordFailedAdminLogin, { ipHash });
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Use timing-safe comparison to prevent timing attacks
    const providedPasswordDigest = createHmac("sha256", adminPasswordSecret)
      .update(password)
      .digest();
    const storedPasswordDigest = createHmac("sha256", adminPasswordSecret)
      .update(adminPassword)
      .digest();

    // Ensure both digests are the same length before comparison
    if (providedPasswordDigest.length !== storedPasswordDigest.length) {
      // Record failed attempt
      const failResult = await convex.mutation(api.rateLimit.recordFailedAdminLogin, { ipHash });
      if (failResult.locked) {
        return NextResponse.json(
          {
            error: "Too many failed attempts",
            message: "Account temporarily locked. Please try again later.",
          },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    if (!timingSafeEqual(providedPasswordDigest, storedPasswordDigest)) {
      // SECURITY: Record failed attempt
      const failResult = await convex.mutation(api.rateLimit.recordFailedAdminLogin, { ipHash });
      if (failResult.locked) {
        return NextResponse.json(
          {
            error: "Too many failed attempts",
            message: "Account temporarily locked. Please try again later.",
          },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // SECURITY: Clear failed attempts on successful login
    await convex.mutation(api.rateLimit.clearAdminLoginAttempts, { ipHash });

    // Upgrade session to admin
    await convex.action(api.sessions.upgradeToAdmin, {
      sid,
      serverSecret: adminPasswordSecret,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin login error:", error);
    return NextResponse.json(
      { error: "Failed to authenticate" },
      { status: 500 }
    );
  }
}
