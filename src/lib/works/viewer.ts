import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { getConvexClient, getConvexServerSecret } from "@/lib/convex-client";
import { hasOwnerEngineAccess } from "@/lib/engine/owner-check";
import { api } from "../../../convex/_generated/api";

/**
 * Whether the page's viewer is the owner, the same proof image admission uses (an admin session or the configured
 * owner session). Read-only: the session cookie is verified but never refreshed here. Any failure means "not the owner".
 */
export async function isOwnerViewer(): Promise<boolean> {
  try {
    const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
    if (!token) return false;
    const data = await verifySessionToken(token);
    const convex = getConvexClient();
    if (!data || !convex) return false;
    const session = await convex.query(api.sessions.getSession, { sid: data.sid, serverSecret: getConvexServerSecret() });
    return hasOwnerEngineAccess(session);
  } catch {
    return false;
  }
}
