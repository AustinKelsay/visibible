import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { isIP } from "node:net";
import { cookies } from "next/headers";
import { validateSecurityEnv } from "./validate-env";

// Validate all security secrets on module load
validateSecurityEnv();

const COOKIE_NAME = "visibible_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

interface SessionPayload extends JWTPayload {
  sid: string;
  iph?: string; // IP hash - optional for backward compatibility with old tokens
}

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET environment variable is required");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Get the secret key for IP hashing.
 * Uses IP_HASH_SECRET if available, falls back to SESSION_SECRET.
 * Separating these secrets provides defense in depth - if SESSION_SECRET
 * leaks, IP hashes remain unpredictable.
 */
function getIpHashSecretKey(): Uint8Array {
  const ipHashSecret = process.env.IP_HASH_SECRET;
  if (ipHashSecret && ipHashSecret.length >= 32) {
    return new TextEncoder().encode(ipHashSecret);
  }
  // Fallback to SESSION_SECRET for backward compatibility
  return getSecretKey();
}

/**
 * Create a signed session token (JWT).
 * Embeds IP hash to bind session to client IP for additional security.
 */
export async function createSessionToken(
  sid: string,
  ipHash?: string
): Promise<string> {
  const payload: SessionPayload = { sid };
  if (ipHash) {
    payload.iph = ipHash;
  }

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1y")
    .sign(getSecretKey());

  return token;
}

/**
 * Result of session token verification.
 */
export interface SessionTokenData {
  sid: string;
  ipHash?: string; // Present in new tokens, absent in legacy tokens
}

/**
 * Verify and decode a session token.
 * Returns session data if valid, null otherwise.
 */
export async function verifySessionToken(
  token: string
): Promise<SessionTokenData | null> {
  try {
    const { payload } = await jwtVerify<SessionPayload>(token, getSecretKey());
    if (!payload.sid) return null;
    return {
      sid: payload.sid,
      ipHash: payload.iph,
    };
  } catch {
    return null;
  }
}

/**
 * Get session data from the request cookies.
 * Returns null if no valid session cookie exists.
 *
 * For backward compatibility, also exports getSessionFromCookies
 * which returns just the sid.
 */
export async function getSessionDataFromCookies(): Promise<SessionTokenData | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return verifySessionToken(token);
}

/**
 * Get the session ID from the request cookies.
 * Returns null if no valid session cookie exists.
 *
 * @deprecated Use getSessionDataFromCookies for IP validation support
 */
export async function getSessionFromCookies(): Promise<string | null> {
  const data = await getSessionDataFromCookies();
  return data?.sid ?? null;
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
 * Result of session validation including whether token needs refresh.
 */
export interface SessionValidationResult {
  valid: boolean;
  sid?: string;
  needsRefresh?: boolean; // True if token lacks IP hash (legacy) or IP changed
  currentIpHash?: string;
}

/**
 * Validate session from cookies against current request IP.
 * Returns validation result including whether token should be refreshed.
 *
 * For legacy tokens (no IP hash), returns needsRefresh=true to trigger
 * graceful upgrade to IP-bound tokens.
 *
 * For tokens with mismatched IP, returns valid=false.
 */
export async function validateSessionWithIp(
  request: Request
): Promise<SessionValidationResult> {
  const sessionData = await getSessionDataFromCookies();

  if (!sessionData) {
    return { valid: false };
  }

  const clientIp = getClientIp(request);
  const currentIpHash = await hashIp(clientIp);

  // Legacy token without IP hash - valid but needs refresh
  if (!sessionData.ipHash) {
    return {
      valid: true,
      sid: sessionData.sid,
      needsRefresh: true,
      currentIpHash,
    };
  }

  // IP hash mismatch - invalid session (possible token theft)
  if (sessionData.ipHash !== currentIpHash) {
    console.warn(
      `[Session] IP mismatch detected for sid=${sessionData.sid.slice(0, 8)}...`
    );
    return { valid: false };
  }

  // Valid token with matching IP
  return {
    valid: true,
    sid: sessionData.sid,
    needsRefresh: false,
    currentIpHash,
  };
}

/**
 * Hash an IP address for privacy-preserving storage.
 * Uses IP_HASH_SECRET if available (defense in depth), otherwise SESSION_SECRET.
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

/**
 * Extract client IP address from request headers.
 * Checks common proxy headers in order of priority.
 */
export function getClientIp(request: Request): string {
  const headers = request.headers;
  const peerIp = getPeerIp(request);

  if (!isTrustedProxy(request, peerIp)) {
    return peerIp ?? "unknown";
  }

  // X-Forwarded-For can contain multiple IPs; take the first valid IP (original client)
  const forwarded = headers.get("x-forwarded-for");
  const forwardedIp = forwarded ? getFirstValidIp(forwarded) : null;
  if (forwardedIp) return forwardedIp;

  const realIp = headers.get("x-real-ip");
  if (realIp && isValidIp(realIp)) return realIp;

  const cfConnectingIp = headers.get("cf-connecting-ip");
  if (cfConnectingIp && isValidIp(cfConnectingIp)) return cfConnectingIp;

  return peerIp ?? "unknown";
}

type ParsedIp = {
  version: 4 | 6;
  bytes: number[];
};

type TrustedProxyEntry =
  | { kind: "ip"; ip: ParsedIp }
  | { kind: "cidr"; ip: ParsedIp; prefix: number };

const TRUSTED_PROXY_IPS = process.env.TRUSTED_PROXY_IPS || "";
const TRUST_PROXY_PLATFORM = process.env.TRUST_PROXY_PLATFORM || "";
const TRUSTED_PROXY_ENTRIES = parseTrustedProxyEntries(TRUSTED_PROXY_IPS);

function getPeerIp(request: Request): string | null {
  const maybeIp = (request as { ip?: string }).ip;
  if (typeof maybeIp === "string" && maybeIp.length > 0) {
    return maybeIp;
  }
  return null;
}

function isTrustedProxy(request: Request, peerIp: string | null): boolean {
  if (isTrustedPlatformProxy()) {
    return true;
  }

  if (!peerIp || TRUSTED_PROXY_ENTRIES.length === 0) {
    return false;
  }

  const parsed = parseIp(peerIp);
  if (!parsed) {
    return false;
  }

  return TRUSTED_PROXY_ENTRIES.some((entry) => {
    if (entry.kind === "ip") {
      return ipEquals(parsed, entry.ip);
    }
    return ipMatchesCidr(parsed, entry.ip, entry.prefix);
  });
}

function isTrustedPlatformProxy(): boolean {
  if (TRUST_PROXY_PLATFORM === "vercel") {
    return process.env.VERCEL === "1";
  }
  return false;
}

function getFirstValidIp(forwarded: string): string | null {
  for (const raw of forwarded.split(",")) {
    const candidate = raw.trim();
    if (candidate && isValidIp(candidate)) {
      return candidate;
    }
  }
  return null;
}

function isValidIp(ip: string): boolean {
  return isIP(stripIpv6Zone(ip)) !== 0;
}

function parseTrustedProxyEntries(rawList: string): TrustedProxyEntry[] {
  if (!rawList.trim()) {
    return [];
  }

  return rawList
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry): TrustedProxyEntry | null => {
      const [ipPart, prefixPart] = entry.split("/");
      const parsedIp = parseIp(ipPart);
      if (!parsedIp) {
        return null;
      }
      if (!prefixPart) {
        return { kind: "ip", ip: parsedIp };
      }
      const prefix = Number(prefixPart);
      if (!Number.isInteger(prefix)) {
        return null;
      }
      const maxPrefix = parsedIp.version === 4 ? 32 : 128;
      if (prefix < 0 || prefix > maxPrefix) {
        return null;
      }
      return { kind: "cidr", ip: parsedIp, prefix };
    })
    .filter((entry): entry is TrustedProxyEntry => entry !== null);
}

function parseIp(input: string): ParsedIp | null {
  const ip = stripIpv6Zone(input);
  const version = isIP(ip);
  if (version === 4) {
    const bytes = parseIpv4(ip);
    return bytes ? { version: 4, bytes } : null;
  }
  if (version === 6) {
    const bytes = parseIpv6(ip);
    return bytes ? { version: 6, bytes } : null;
  }
  return null;
}

function parseIpv4(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return null;
  }
  const bytes = parts.map((part) => Number(part));
  if (bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
    return null;
  }
  return bytes;
}

function parseIpv6(ip: string): number[] | null {
  let address = ip.toLowerCase();
  if (address.includes(".")) {
    const lastColon = address.lastIndexOf(":");
    if (lastColon === -1) {
      return null;
    }
    const ipv4Part = address.slice(lastColon + 1);
    const ipv4Bytes = parseIpv4(ipv4Part);
    if (!ipv4Bytes) {
      return null;
    }
    const ipv4Hextets = [
      ((ipv4Bytes[0] << 8) | ipv4Bytes[1]).toString(16),
      ((ipv4Bytes[2] << 8) | ipv4Bytes[3]).toString(16),
    ];
    address = `${address.slice(0, lastColon)}:${ipv4Hextets.join(":")}`;
  }

  const parts = address.split("::");
  if (parts.length > 2) {
    return null;
  }
  const left = parts[0] ? parts[0].split(":").filter(Boolean) : [];
  const right = parts[1] ? parts[1].split(":").filter(Boolean) : [];
  const totalHextets = left.length + right.length;
  if (totalHextets > 8) {
    return null;
  }
  const missing = 8 - totalHextets;
  const hextets = [
    ...left,
    ...Array.from({ length: missing }, () => "0"),
    ...right,
  ];
  if (hextets.length !== 8) {
    return null;
  }

  const bytes: number[] = [];
  for (const hextet of hextets) {
    const value = Number.parseInt(hextet, 16);
    if (!Number.isFinite(value) || value < 0 || value > 0xffff) {
      return null;
    }
    bytes.push((value >> 8) & 0xff, value & 0xff);
  }
  return bytes;
}

function stripIpv6Zone(ip: string): string {
  const percentIndex = ip.indexOf("%");
  return percentIndex === -1 ? ip : ip.slice(0, percentIndex);
}

function ipEquals(a: ParsedIp, b: ParsedIp): boolean {
  if (a.version !== b.version || a.bytes.length !== b.bytes.length) {
    return false;
  }
  return a.bytes.every((byte, idx) => byte === b.bytes[idx]);
}

function ipMatchesCidr(ip: ParsedIp, cidrBase: ParsedIp, prefix: number): boolean {
  if (ip.version !== cidrBase.version) {
    return false;
  }
  const totalBits = ip.bytes.length * 8;
  const bitsToCheck = Math.min(prefix, totalBits);
  let bitsChecked = 0;
  for (let i = 0; i < ip.bytes.length; i += 1) {
    if (bitsChecked >= bitsToCheck) {
      return true;
    }
    const remaining = bitsToCheck - bitsChecked;
    const mask = remaining >= 8 ? 0xff : (0xff << (8 - remaining)) & 0xff;
    if ((ip.bytes[i] & mask) !== (cidrBase.bytes[i] & mask)) {
      return false;
    }
    bitsChecked += 8;
  }
  return true;
}
