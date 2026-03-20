import { isIP } from "node:net";

type ParsedIp = {
  version: 4 | 6;
  bytes: number[];
};

type TrustedProxyEntry =
  | { kind: "ip"; ip: ParsedIp }
  | { kind: "cidr"; ip: ParsedIp; prefix: number };

/**
 * Extract client IP address from request headers.
 * Checks common proxy headers in order of priority.
 * Logs when proxy trust is used for audit purposes.
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
  if (forwardedIp) {
    logProxyTrust(peerIp, forwardedIp, "x-forwarded-for");
    return forwardedIp;
  }

  const realIp = headers.get("x-real-ip");
  if (realIp && isValidIp(realIp)) {
    logProxyTrust(peerIp, realIp, "x-real-ip");
    return realIp;
  }

  const cfConnectingIp = headers.get("cf-connecting-ip");
  if (cfConnectingIp && isValidIp(cfConnectingIp)) {
    logProxyTrust(peerIp, cfConnectingIp, "cf-connecting-ip");
    return cfConnectingIp;
  }

  return peerIp ?? "unknown";
}

/**
 * Log when proxy trust is used to determine client IP.
 * Only logs in development or when DEBUG_PROXY is set to avoid log noise in production.
 */
function logProxyTrust(
  proxyIp: string | null,
  clientIp: string,
  header: string
): void {
  if (
    process.env.NODE_ENV !== "development" &&
    process.env.DEBUG_PROXY !== "true"
  ) {
    return;
  }

  console.log(
    `[Proxy] Trusted proxy ${proxyIp ?? "unknown"} forwarded request for client ${clientIp} (via ${header})`
  );
}

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

  const trustedProxyEntries = getTrustedProxyEntries();

  if (!peerIp || trustedProxyEntries.length === 0) {
    return false;
  }

  const parsed = parseIp(peerIp);
  if (!parsed) {
    return false;
  }

  return trustedProxyEntries.some((entry) => {
    if (entry.kind === "ip") {
      return ipEquals(parsed, entry.ip);
    }
    return ipMatchesCidr(parsed, entry.ip, entry.prefix);
  });
}

function isTrustedPlatformProxy(): boolean {
  const trustProxyPlatform = process.env.TRUST_PROXY_PLATFORM || "";
  if (trustProxyPlatform === "vercel") {
    return process.env.VERCEL === "1";
  }
  return false;
}

function getTrustedProxyEntries(): TrustedProxyEntry[] {
  return parseTrustedProxyEntries(process.env.TRUSTED_PROXY_IPS || "");
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
