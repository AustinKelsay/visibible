import { createHash, timingSafeEqual } from "node:crypto";

/** Owner-mode admission for admins or one owner-controlled session; billing still uses its tier. */
export function hasOwnerEngineAccess(
  session: { sid: string; tier: string } | null,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (!session) return false;
  if (session.tier === "admin") return true;
  const expected = env.GENERIC_ENGINE_OWNER_CHECK_SESSION_SHA256?.trim();
  if (!expected || !/^[a-f0-9]{64}$/i.test(expected)) return false;
  const actual = createHash("sha256").update(session.sid).digest();
  return timingSafeEqual(actual, Buffer.from(expected, "hex"));
}
