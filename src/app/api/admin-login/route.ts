import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/session";
import { getConvexClient } from "@/lib/convex-client";
import { api } from "../../../../convex/_generated/api";
import { createHmac, timingSafeEqual } from "crypto";

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
 */
export async function POST(request: Request): Promise<NextResponse> {
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

    if (!adminPassword) {
      return NextResponse.json(
        { error: "Admin access not configured" },
        { status: 403 }
      );
    }

    const adminPasswordSecret = getAdminPasswordSecret();
    if (!adminPasswordSecret) {
      return NextResponse.json(
        { error: "Admin access not configured" },
        { status: 403 }
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
      return NextResponse.json(
        { error: "Invalid password" },
        { status: 401 }
      );
    }

    if (!timingSafeEqual(providedPasswordDigest, storedPasswordDigest)) {
      return NextResponse.json(
        { error: "Invalid password" },
        { status: 401 }
      );
    }

    // Upgrade session to admin
    await convex.mutation(api.sessions.upgradeToAdmin, { sid });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin login error:", error);
    return NextResponse.json(
      { error: "Failed to authenticate" },
      { status: 500 }
    );
  }
}
