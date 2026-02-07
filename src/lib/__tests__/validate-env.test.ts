/**
 * Unit tests for environment validation functions.
 * Tests secret validation and dangerous proxy configuration detection.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Store original env and console
const originalEnv = process.env;
const originalConsoleWarn = console.warn;
const originalConsoleInfo = console.info;

// We need to re-import after setting env vars because validation state is cached
async function importValidateEnv() {
  vi.resetModules();
  return await import("../validate-env");
}

describe("validateSessionSecret", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Clear the build phase to enable validation
    delete process.env.NEXT_PHASE;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should throw for missing SESSION_SECRET", async () => {
    delete process.env.SESSION_SECRET;
    const { validateSessionSecret } = await importValidateEnv();

    expect(() => validateSessionSecret()).toThrow(
      "SESSION_SECRET environment variable is required"
    );
  });

  it("should throw for SESSION_SECRET with 31 characters", async () => {
    process.env.SESSION_SECRET = "a".repeat(31);
    const { validateSessionSecret } = await importValidateEnv();

    expect(() => validateSessionSecret()).toThrow(
      "SESSION_SECRET must be at least 32 characters (got 31)"
    );
  });

  it("should pass for SESSION_SECRET with 32 characters", async () => {
    process.env.SESSION_SECRET = "a".repeat(32);
    const { validateSessionSecret } = await importValidateEnv();

    expect(() => validateSessionSecret()).not.toThrow();
  });

  it("should pass for SESSION_SECRET with more than 32 characters", async () => {
    process.env.SESSION_SECRET = "a".repeat(64);
    const { validateSessionSecret } = await importValidateEnv();

    expect(() => validateSessionSecret()).not.toThrow();
  });

  it("should skip validation during build phase", async () => {
    process.env.NEXT_PHASE = "phase-production-build";
    delete process.env.SESSION_SECRET;
    const { validateSessionSecret } = await importValidateEnv();

    expect(() => validateSessionSecret()).not.toThrow();
  });
});

describe("validateIpHashSecret", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PHASE;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should throw for missing IP_HASH_SECRET", async () => {
    delete process.env.IP_HASH_SECRET;
    const { validateIpHashSecret } = await importValidateEnv();

    expect(() => validateIpHashSecret()).toThrow(
      "IP_HASH_SECRET environment variable is required"
    );
  });

  it("should throw for IP_HASH_SECRET with 31 characters", async () => {
    process.env.IP_HASH_SECRET = "b".repeat(31);
    const { validateIpHashSecret } = await importValidateEnv();

    expect(() => validateIpHashSecret()).toThrow(
      "IP_HASH_SECRET must be at least 32 characters (got 31)"
    );
  });

  it("should pass for IP_HASH_SECRET with 32 characters", async () => {
    process.env.IP_HASH_SECRET = "b".repeat(32);
    const { validateIpHashSecret } = await importValidateEnv();

    expect(() => validateIpHashSecret()).not.toThrow();
  });

  it("should skip validation during build phase", async () => {
    process.env.NEXT_PHASE = "phase-production-build";
    delete process.env.IP_HASH_SECRET;
    const { validateIpHashSecret } = await importValidateEnv();

    expect(() => validateIpHashSecret()).not.toThrow();
  });
});

describe("validateProxyConfig", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PHASE;
    console.warn = vi.fn();
    console.info = vi.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    console.warn = originalConsoleWarn;
    console.info = originalConsoleInfo;
  });

  it("should throw in production for 0.0.0.0/0 CIDR", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.TRUSTED_PROXY_IPS = "0.0.0.0/0";
    const { validateProxyConfig } = await importValidateEnv();

    expect(() => validateProxyConfig()).toThrow(
      "CRITICAL SECURITY MISCONFIGURATION"
    );
  });

  it("should throw in production for ::/0 CIDR", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.TRUSTED_PROXY_IPS = "::/0";
    const { validateProxyConfig } = await importValidateEnv();

    expect(() => validateProxyConfig()).toThrow(
      "CRITICAL SECURITY MISCONFIGURATION"
    );
  });

  it("should throw in production for /7 or broader CIDR", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.TRUSTED_PROXY_IPS = "0.0.0.0/7";
    const { validateProxyConfig } = await importValidateEnv();

    expect(() => validateProxyConfig()).toThrow(
      "CRITICAL SECURITY MISCONFIGURATION"
    );
  });

  it("should only warn in development for dangerous CIDRs", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.TRUSTED_PROXY_IPS = "0.0.0.0/0";
    const { validateProxyConfig } = await importValidateEnv();

    expect(() => validateProxyConfig()).not.toThrow();
    expect(console.warn).toHaveBeenCalled();
  });

  it("should pass for safe /24 CIDR", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.TRUSTED_PROXY_IPS = "10.0.0.0/24";
    const { validateProxyConfig } = await importValidateEnv();

    expect(() => validateProxyConfig()).not.toThrow();
  });

  it("should pass for safe /32 CIDR (single IP)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.TRUSTED_PROXY_IPS = "10.0.0.1/32";
    const { validateProxyConfig } = await importValidateEnv();

    expect(() => validateProxyConfig()).not.toThrow();
  });

  it("should pass for safe /128 CIDR (single IPv6)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.TRUSTED_PROXY_IPS = "2001:db8::1/128";
    const { validateProxyConfig } = await importValidateEnv();

    expect(() => validateProxyConfig()).not.toThrow();
  });

  it("should pass for specific IP without CIDR", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.TRUSTED_PROXY_IPS = "192.168.1.1";
    const { validateProxyConfig } = await importValidateEnv();

    expect(() => validateProxyConfig()).not.toThrow();
  });

  it("should skip validation during build phase", async () => {
    process.env.NEXT_PHASE = "phase-production-build";
    vi.stubEnv("NODE_ENV", "production");
    process.env.TRUSTED_PROXY_IPS = "0.0.0.0/0";
    const { validateProxyConfig } = await importValidateEnv();

    expect(() => validateProxyConfig()).not.toThrow();
  });

  it("should log info in production when no proxy trust configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.TRUST_PROXY_PLATFORM;
    delete process.env.TRUSTED_PROXY_IPS;
    const { validateProxyConfig } = await importValidateEnv();

    validateProxyConfig();
    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining("No proxy trust configured")
    );
  });

  it("should warn when TRUST_PROXY_PLATFORM=vercel but not on Vercel", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.TRUST_PROXY_PLATFORM = "vercel";
    delete process.env.VERCEL;
    const { validateProxyConfig } = await importValidateEnv();

    validateProxyConfig();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("TRUST_PROXY_PLATFORM=vercel is set but VERCEL=1 is not detected")
    );
  });
});

describe("validateConvexSecret", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PHASE;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should skip when Convex is not configured", async () => {
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
    delete process.env.CONVEX_SERVER_SECRET;
    const { validateConvexSecret } = await importValidateEnv();

    expect(() => validateConvexSecret()).not.toThrow();
  });

  it("should throw when Convex configured but secret missing", async () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://example.convex.cloud";
    delete process.env.CONVEX_SERVER_SECRET;
    const { validateConvexSecret } = await importValidateEnv();

    expect(() => validateConvexSecret()).toThrow(
      "CONVEX_SERVER_SECRET environment variable is required"
    );
  });

  it("should throw for short CONVEX_SERVER_SECRET", async () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://example.convex.cloud";
    process.env.CONVEX_SERVER_SECRET = "short";
    const { validateConvexSecret } = await importValidateEnv();

    expect(() => validateConvexSecret()).toThrow(
      "CONVEX_SERVER_SECRET must be at least 32 characters"
    );
  });
});

describe("validateAdminSecret", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PHASE;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should skip when admin login is not configured", async () => {
    delete process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_PASSWORD_SECRET;
    const { validateAdminSecret } = await importValidateEnv();

    expect(() => validateAdminSecret()).not.toThrow();
  });

  it("should throw when admin password set but secret missing", async () => {
    process.env.ADMIN_PASSWORD = "mypassword";
    delete process.env.ADMIN_PASSWORD_SECRET;
    const { validateAdminSecret } = await importValidateEnv();

    expect(() => validateAdminSecret()).toThrow(
      "ADMIN_PASSWORD_SECRET environment variable is required"
    );
  });

  it("should throw for short ADMIN_PASSWORD_SECRET", async () => {
    process.env.ADMIN_PASSWORD = "mypassword";
    process.env.ADMIN_PASSWORD_SECRET = "short";
    const { validateAdminSecret } = await importValidateEnv();

    expect(() => validateAdminSecret()).toThrow(
      "ADMIN_PASSWORD_SECRET must be at least 32 characters"
    );
  });
});
