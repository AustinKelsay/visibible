/**
 * Unit tests for session IP security functions.
 * Tests IP parsing, CIDR matching, zone stripping, and hashing.
 */

import { describe, it, expect, vi, afterAll } from "vitest";

// Mock the validation module to prevent env validation on module load
vi.mock("../validate-env", () => ({
  validateSecurityEnv: vi.fn(),
  validateSessionSecret: vi.fn(),
  validateIpHashSecret: vi.fn(),
  validateConvexSecret: vi.fn(),
  validateAdminSecret: vi.fn(),
  validateProxyConfig: vi.fn(),
}));

// Set required env vars for hashIp tests
const originalEnv = process.env;
process.env = {
  ...originalEnv,
  SESSION_SECRET: "test-session-secret-at-least-32-chars",
  IP_HASH_SECRET: "test-ip-hash-secret-at-least-32-chars",
};

// Now import the module (validation is mocked)
import {
  _parseIpv4,
  _parseIpv6,
  _ipMatchesCidr,
  _stripIpv6Zone,
  _parseIp,
  hashIp,
} from "../session";

afterAll(() => {
  process.env = originalEnv;
});

describe("parseIpv4", () => {
  it("should parse valid IPv4 addresses", () => {
    expect(_parseIpv4("0.0.0.0")).toEqual([0, 0, 0, 0]);
    expect(_parseIpv4("255.255.255.255")).toEqual([255, 255, 255, 255]);
    expect(_parseIpv4("192.168.1.1")).toEqual([192, 168, 1, 1]);
    expect(_parseIpv4("10.0.0.1")).toEqual([10, 0, 0, 1]);
    expect(_parseIpv4("127.0.0.1")).toEqual([127, 0, 0, 1]);
  });

  it("should reject invalid IPv4 addresses", () => {
    expect(_parseIpv4("256.1.1.1")).toBeNull(); // Octet > 255
    expect(_parseIpv4("-1.0.0.0")).toBeNull(); // Negative octet
    expect(_parseIpv4("1.2.3")).toBeNull(); // Too few octets
    expect(_parseIpv4("1.2.3.4.5")).toBeNull(); // Too many octets
    expect(_parseIpv4("abc.def.ghi.jkl")).toBeNull(); // Non-numeric
    expect(_parseIpv4("1.2.3.256")).toBeNull(); // Last octet > 255
    // Note: parseIpv4 is called after isIP() validates the address format,
    // so edge cases like trailing dots are filtered upstream
  });
});

describe("parseIpv6", () => {
  it("should parse full IPv6 addresses", () => {
    const result = _parseIpv6("2001:0db8:0000:0000:0000:0000:0000:0001");
    expect(result).toHaveLength(16);
    expect(result?.[0]).toBe(0x20);
    expect(result?.[1]).toBe(0x01);
    expect(result?.[15]).toBe(0x01);
  });

  it("should parse compressed IPv6 addresses", () => {
    // ::1 (loopback)
    const loopback = _parseIpv6("::1");
    expect(loopback).toHaveLength(16);
    expect(loopback?.slice(0, 15).every((b) => b === 0)).toBe(true);
    expect(loopback?.[15]).toBe(1);

    // :: (all zeros)
    const allZeros = _parseIpv6("::");
    expect(allZeros).toHaveLength(16);
    expect(allZeros?.every((b) => b === 0)).toBe(true);
  });

  it("should parse dual-stack IPv6 addresses (::ffff:x.x.x.x)", () => {
    const result = _parseIpv6("::ffff:192.168.1.1");
    expect(result).toHaveLength(16);
    // Last 4 bytes should be 192, 168, 1, 1
    expect(result?.[12]).toBe(192);
    expect(result?.[13]).toBe(168);
    expect(result?.[14]).toBe(1);
    expect(result?.[15]).toBe(1);
  });

  it("should parse link-local addresses", () => {
    const result = _parseIpv6("fe80::1");
    expect(result).toHaveLength(16);
    expect(result?.[0]).toBe(0xfe);
    expect(result?.[1]).toBe(0x80);
    expect(result?.[15]).toBe(1);
  });

  it("should reject invalid IPv6 addresses", () => {
    expect(_parseIpv6("1:2:3:4:5:6:7:8:9")).toBeNull(); // Too many groups
    expect(_parseIpv6("1::2::3")).toBeNull(); // Multiple :: compressions
    expect(_parseIpv6("gggg::1")).toBeNull(); // Invalid hex
    // Note: parseIpv6 is called after isIP() validates the address format,
    // so some edge cases like ":::1" are filtered upstream by isIP()
  });
});

describe("stripIpv6Zone", () => {
  it("should remove zone ID from IPv6 addresses", () => {
    expect(_stripIpv6Zone("fe80::1%eth0")).toBe("fe80::1");
    expect(_stripIpv6Zone("fe80::1%en0")).toBe("fe80::1");
    expect(_stripIpv6Zone("fe80::1%25")).toBe("fe80::1");
  });

  it("should return unchanged addresses without zone ID", () => {
    expect(_stripIpv6Zone("fe80::1")).toBe("fe80::1");
    expect(_stripIpv6Zone("::1")).toBe("::1");
    expect(_stripIpv6Zone("192.168.1.1")).toBe("192.168.1.1");
    expect(_stripIpv6Zone("")).toBe("");
  });
});

describe("ipMatchesCidr", () => {
  it("should match /0 CIDR (match all)", () => {
    const ip = _parseIp("192.168.1.1")!;
    const cidr = _parseIp("0.0.0.0")!;
    expect(_ipMatchesCidr(ip, cidr, 0)).toBe(true);

    const ip2 = _parseIp("10.255.255.255")!;
    expect(_ipMatchesCidr(ip2, cidr, 0)).toBe(true);
  });

  it("should match /32 CIDR (exact match only)", () => {
    const ip = _parseIp("192.168.1.1")!;
    const cidr = _parseIp("192.168.1.1")!;
    expect(_ipMatchesCidr(ip, cidr, 32)).toBe(true);

    const different = _parseIp("192.168.1.2")!;
    expect(_ipMatchesCidr(different, cidr, 32)).toBe(false);
  });

  it("should match /24 CIDR (subnet)", () => {
    const cidr = _parseIp("192.168.1.0")!;

    const ip1 = _parseIp("192.168.1.0")!;
    expect(_ipMatchesCidr(ip1, cidr, 24)).toBe(true);

    const ip2 = _parseIp("192.168.1.255")!;
    expect(_ipMatchesCidr(ip2, cidr, 24)).toBe(true);

    const ip3 = _parseIp("192.168.2.1")!;
    expect(_ipMatchesCidr(ip3, cidr, 24)).toBe(false);
  });

  it("should match /16 CIDR", () => {
    const cidr = _parseIp("10.0.0.0")!;

    const ip1 = _parseIp("10.0.0.1")!;
    expect(_ipMatchesCidr(ip1, cidr, 16)).toBe(true);

    const ip2 = _parseIp("10.0.255.255")!;
    expect(_ipMatchesCidr(ip2, cidr, 16)).toBe(true);

    const ip3 = _parseIp("10.1.0.1")!;
    expect(_ipMatchesCidr(ip3, cidr, 16)).toBe(false);
  });

  it("should reject cross-version CIDR matching", () => {
    const ipv4 = _parseIp("192.168.1.1")!;
    const ipv6 = _parseIp("::1")!;
    expect(_ipMatchesCidr(ipv4, ipv6, 0)).toBe(false);
    expect(_ipMatchesCidr(ipv6, ipv4, 0)).toBe(false);
  });

  it("should handle IPv6 CIDR matching", () => {
    const cidr = _parseIp("2001:db8::")!;
    const ip1 = _parseIp("2001:db8::1")!;
    expect(_ipMatchesCidr(ip1, cidr, 32)).toBe(true);

    const ip2 = _parseIp("2001:db9::1")!;
    expect(_ipMatchesCidr(ip2, cidr, 32)).toBe(false);
  });
});

describe("parseIp", () => {
  it("should correctly identify IPv4 version", () => {
    const result = _parseIp("192.168.1.1");
    expect(result?.version).toBe(4);
    expect(result?.bytes).toEqual([192, 168, 1, 1]);
  });

  it("should correctly identify IPv6 version", () => {
    const result = _parseIp("::1");
    expect(result?.version).toBe(6);
    expect(result?.bytes).toHaveLength(16);
  });

  it("should strip zone ID before parsing", () => {
    const result = _parseIp("fe80::1%eth0");
    expect(result?.version).toBe(6);
  });

  it("should return null for invalid IPs", () => {
    expect(_parseIp("not-an-ip")).toBeNull();
    expect(_parseIp("")).toBeNull();
  });
});

describe("hashIp", () => {
  it("should produce consistent hashes for the same IP", async () => {
    process.env.IP_HASH_SECRET = "a".repeat(32);
    const hash1 = await hashIp("192.168.1.1");
    const hash2 = await hashIp("192.168.1.1");
    expect(hash1).toBe(hash2);
  });

  it("should produce different hashes for different IPs", async () => {
    process.env.IP_HASH_SECRET = "a".repeat(32);
    const hash1 = await hashIp("192.168.1.1");
    const hash2 = await hashIp("192.168.1.2");
    expect(hash1).not.toBe(hash2);
  });

  it("should produce hex string of expected length", async () => {
    process.env.IP_HASH_SECRET = "a".repeat(32);
    const hash = await hashIp("192.168.1.1");
    // SHA-256 produces 32 bytes = 64 hex characters
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });
});
