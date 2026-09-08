import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";
import { getClientIp } from "./client-ip";
import { validateSecurityEnv } from "./validate-env";

export { getClientIp };

// Validate all security secrets on module load
validateSecurityEnv();

const COOKIE_NAME = "visibible_session";
const MINUTES_PER_DAY = 24 * 60;
const HOURS_PER_DAY = 24;
const DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES = 7 * MINUTES_PER_DAY;
const MIN_SESSION_IDLE_TIMEOUT_MINUTES = 5;
const MAX_SESSION_IDLE_TIMEOUT_MINUTES = 90 * MINUTES_PER_DAY;
const DEFAULT_SESSION_ABSOLUTE_TIMEOUT_HOURS = 30 * HOURS_PER_DAY;
const MIN_SESSION_ABSOLUTE_TIMEOUT_HOURS = 4;
const MAX_SESSION_ABSOLUTE_TIMEOUT_HOURS = 365 * HOURS_PER_DAY;
const SESSION_REFRESH_MIN_INTERVAL_SECONDS = 60;

function parseBoundedTimeout(
  rawValue: string | undefined,
  envName: string,
  defaultValue: number,
  min: number,
  max: number
): number {
  if (!rawValue || rawValue.trim() === "") {
    return defaultValue;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(
      `${envName} must be an integer between ${min} and ${max}. Received: "${rawValue}".`
    );
  }

  if (parsed < min || parsed > max) {
    throw new Error(
      `${envName} must be between ${min} and ${max}. Received: ${parsed}.`
    );
  }

  return parsed;
}

const SESSION_IDLE_TIMEOUT_MINUTES = parseBoundedTimeout(
  process.env.SESSION_IDLE_TIMEOUT_MINUTES,
  "SESSION_IDLE_TIMEOUT_MINUTES",
  DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES,
  MIN_SESSION_IDLE_TIMEOUT_MINUTES,
  MAX_SESSION_IDLE_TIMEOUT_MINUTES
);

const SESSION_ABSOLUTE_TIMEOUT_HOURS = parseBoundedTimeout(
  process.env.SESSION_ABSOLUTE_TIMEOUT_HOURS,
  "SESSION_ABSOLUTE_TIMEOUT_HOURS",
  DEFAULT_SESSION_ABSOLUTE_TIMEOUT_HOURS,
  MIN_SESSION_ABSOLUTE_TIMEOUT_HOURS,
  MAX_SESSION_ABSOLUTE_TIMEOUT_HOURS
);

if (SESSION_ABSOLUTE_TIMEOUT_HOURS * 60 <= SESSION_IDLE_TIMEOUT_MINUTES) {
  throw new Error(
    "SESSION_ABSOLUTE_TIMEOUT_HOURS must be greater than SESSION_IDLE_TIMEOUT_MINUTES " +
      `(received absolute=${SESSION_ABSOLUTE_TIMEOUT_HOURS}h, idle=${SESSION_IDLE_TIMEOUT_MINUTES}m).`
  );
}

export const SESSION_IDLE_TIMEOUT_SECONDS = SESSION_IDLE_TIMEOUT_MINUTES * 60;
export const SESSION_ABSOLUTE_TIMEOUT_SECONDS = SESSION_ABSOLUTE_TIMEOUT_HOURS * 60 * 60;

interface SessionPayload extends JWTPayload {
  sid: string;
  iph?: string;
  sat?: number; // Session start timestamp (epoch seconds)
  lat?: number; // Last activity timestamp (epoch seconds)
}

export type SessionInvalidReason = "missing" | "expired" | "invalid";

type SessionTokenVerificationResult =
  | { valid: true; data: SessionTokenData }
  | { valid: false; reason: Exclude<SessionInvalidReason, "missing"> };

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET environment variable is required");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Get the secret key for IP hashing.
 * Separating these secrets provides defense in depth - if SESSION_SECRET
 * leaks, IP hashes remain unpredictable.
 */
function getIpHashSecretKey(): Uint8Array {
  const ipHashSecret = process.env.IP_HASH_SECRET;
  if (!ipHashSecret) {
    throw new Error("IP_HASH_SECRET environment variable is required");
  }
  if (ipHashSecret.length < 32) {
    throw new Error(
      `IP_HASH_SECRET must be at least 32 characters (got ${ipHashSecret.length}).`
    );
  }
  return new TextEncoder().encode(ipHashSecret);
}

/**
 * Create a signed session token (JWT).
 * Embeds IP hash to bind session to client IP for additional security.
 */
export async function createSessionToken(
  sid: string,
  ipHash?: string,
  options?: { sessionStartedAt?: number; activityAt?: number }
): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const sessionStartedAt = options?.sessionStartedAt ?? nowSec;
  const activityAt = options?.activityAt ?? nowSec;
  const idleExpiresAt = activityAt + SESSION_IDLE_TIMEOUT_SECONDS;
  const absoluteExpiresAt = sessionStartedAt + SESSION_ABSOLUTE_TIMEOUT_SECONDS;
  const expiresAt = Math.min(idleExpiresAt, absoluteExpiresAt);

  const payload: SessionPayload = {
    sid,
    sat: sessionStartedAt,
    lat: activityAt,
  };
  if (ipHash) {
    payload.iph = ipHash;
  }

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(activityAt)
    .setExpirationTime(expiresAt)
    .sign(getSecretKey());

  return token;
}

/**
 * Result of session token verification.
 */
export interface SessionTokenData {
  sid: string;
  ipHash?: string;
  sessionStartedAt: number;
  lastActivityAt: number;
  expiresAt?: number;
}

async function verifySessionTokenDetailed(
  token: string
): Promise<SessionTokenVerificationResult> {
  try {
    const { payload } = await jwtVerify<SessionPayload>(token, getSecretKey());
    if (!payload.sid) {
      return { valid: false, reason: "invalid" };
    }

    const issuedAt = typeof payload.iat === "number" ? payload.iat : undefined;
    const sessionStartedAt = typeof payload.sat === "number" ? payload.sat : issuedAt;
    const lastActivityAt = typeof payload.lat === "number" ? payload.lat : issuedAt;

    if (!sessionStartedAt || !lastActivityAt) {
      return { valid: false, reason: "invalid" };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec - lastActivityAt > SESSION_IDLE_TIMEOUT_SECONDS) {
      return { valid: false, reason: "expired" };
    }
    if (nowSec - sessionStartedAt > SESSION_ABSOLUTE_TIMEOUT_SECONDS) {
      return { valid: false, reason: "expired" };
    }

    return {
      valid: true,
      data: {
        sid: payload.sid,
        ipHash: payload.iph,
        sessionStartedAt,
        lastActivityAt,
        expiresAt: typeof payload.exp === "number" ? payload.exp : undefined,
      },
    };
  } catch {
    return { valid: false, reason: "invalid" };
  }
}

/**
 * Verify and decode a session token.
 * Returns session data if valid, null otherwise.
 */
export async function verifySessionToken(
  token: string
): Promise<SessionTokenData | null> {
  const verification = await verifySessionTokenDetailed(token);
  return verification.valid ? verification.data : null;
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
    maxAge: SESSION_IDLE_TIMEOUT_SECONDS,
  };
}

export function getClearedSessionCookieOptions() {
  return {
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}

function getSessionCookieHeader(token: string): string {
  const cookieOptions = getSessionCookieOptions(token);
  const parts = [
    `${cookieOptions.name}=${cookieOptions.value}`,
    `Max-Age=${cookieOptions.maxAge}`,
    `Path=${cookieOptions.path}`,
    `SameSite=${cookieOptions.sameSite}`,
  ];

  if (cookieOptions.httpOnly) {
    parts.push("HttpOnly");
  }
  if (cookieOptions.secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function withSessionRefreshCookie(
  response: Response,
  refreshedToken?: string
): Response {
  if (!refreshedToken) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", getSessionCookieHeader(refreshedToken));

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function refreshSessionOnActivity(args: {
  sid: string;
  ipHash?: string;
  sessionStartedAt: number;
  lastActivityAt: number;
}): Promise<string | null> {
  const nowSec = Math.floor(Date.now() / 1000);
  const absoluteExpiresAt =
    args.sessionStartedAt + SESSION_ABSOLUTE_TIMEOUT_SECONDS;

  // Never renew beyond the absolute timeout cap.
  if (nowSec >= absoluteExpiresAt) {
    return null;
  }

  // Avoid issuing a brand-new token for every single request in rapid bursts.
  if (nowSec - args.lastActivityAt < SESSION_REFRESH_MIN_INTERVAL_SECONDS) {
    return null;
  }

  return createSessionToken(args.sid, args.ipHash, {
    sessionStartedAt: args.sessionStartedAt,
  });
}

/**
 * Result of session validation including whether token needs refresh.
 */
export interface SessionValidationResult {
  valid: boolean;
  sid?: string;
  currentIpHash?: string;
  refreshedToken?: string;
  invalidReason?: SessionInvalidReason;
  ipChanged?: boolean;
  expiresAt?: number;
}

/**
 * Validate session from cookies against current request IP.
 * Returns validation result including a refreshed token when applicable.
 *
 * IP changes are logged and trigger an immediate token refresh, but they do not
 * invalidate the session by themselves.
 */
export async function validateSessionWithIp(
  request: Request
): Promise<SessionValidationResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    return { valid: false, invalidReason: "missing" };
  }

  const verification = await verifySessionTokenDetailed(token);
  if (!verification.valid) {
    return { valid: false, invalidReason: verification.reason };
  }
  const sessionData = verification.data;

  const clientIp = getClientIp(request);
  const currentIpHash = await hashIp(clientIp);
  const ipChanged =
    typeof sessionData.ipHash === "string" && sessionData.ipHash !== currentIpHash;

  if (ipChanged) {
    console.warn(
      `[Session] IP changed for sid=${sessionData.sid.slice(0, 8)}..., allowing session and rotating cookie`
    );
  }

  const refreshedToken = ipChanged
    ? await createSessionToken(sessionData.sid, currentIpHash, {
        sessionStartedAt: sessionData.sessionStartedAt,
      })
    : await refreshSessionOnActivity({
        sid: sessionData.sid,
        ipHash: currentIpHash,
        sessionStartedAt: sessionData.sessionStartedAt,
        lastActivityAt: sessionData.lastActivityAt,
      });

  return {
    valid: true,
    sid: sessionData.sid,
    currentIpHash,
    refreshedToken: refreshedToken ?? undefined,
    ipChanged,
    expiresAt: sessionData.expiresAt,
  };
}

/**
 * Hash an IP address for privacy-preserving storage.
 */
export async function hashIp(ip: string): Promise<string> {
  const secretKey = getIpHashSecretKey();
  const ipBytes = new TextEncoder().encode(ip);
  // Combine IP bytes with secret key bytes for hashing
  const data = new Uint8Array(ipBytes.length + secretKey.length);
  data.set(ipBytes, 0);
  data.set(secretKey, ipBytes.length);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
