import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "visibible_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

interface SessionPayload extends JWTPayload {
  sid: string;
}

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET environment variable is required");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Create a signed session token (JWT).
 */
export async function createSessionToken(sid: string): Promise<string> {
  const token = await new SignJWT({ sid })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1y")
    .sign(getSecretKey());

  return token;
}

/**
 * Verify and decode a session token.
 * Returns the session ID if valid, null otherwise.
 */
export async function verifySessionToken(
  token: string
): Promise<string | null> {
  try {
    const { payload } = await jwtVerify<SessionPayload>(token, getSecretKey());
    return payload.sid || null;
  } catch {
    return null;
  }
}

/**
 * Get the session ID from the request cookies.
 * Returns null if no valid session cookie exists.
 */
export async function getSessionFromCookies(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return verifySessionToken(token);
}

/**
 * Generate a unique session ID.
 */
export function generateSessionId(): string {
  return crypto.randomUUID();
}

/**
 * Cookie options for setting the session cookie.
 */
export function getSessionCookieOptions(token: string) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  };
}

/**
 * Hash an IP address for privacy-preserving storage.
 */
export async function hashIp(ip: string): Promise<string> {
  const secretKey = getSecretKey();
  const ipBytes = new TextEncoder().encode(ip);
  // Combine IP bytes with secret key bytes for hashing
  const data = new Uint8Array(ipBytes.length + secretKey.length);
  data.set(ipBytes, 0);
  data.set(secretKey, ipBytes.length);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
