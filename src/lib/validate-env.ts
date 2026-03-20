/**
 * Environment validation utilities for security-critical settings.
 * Call these early in application startup to fail fast on misconfigurations.
 */

/**
 * Check if we're in a build context (Next.js build phase).
 * Validation should be skipped during build to allow static generation.
 */
function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

let sessionSecretValidated = false;
let ipHashSecretValidated = false;
let sessionTimeoutConfigValidated = false;

const MINUTES_PER_DAY = 24 * 60;
const HOURS_PER_DAY = 24;
const DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES = 7 * MINUTES_PER_DAY;
const MIN_SESSION_IDLE_TIMEOUT_MINUTES = 5;
const MAX_SESSION_IDLE_TIMEOUT_MINUTES = 90 * MINUTES_PER_DAY;
const DEFAULT_SESSION_ABSOLUTE_TIMEOUT_HOURS = 30 * HOURS_PER_DAY;
const MIN_SESSION_ABSOLUTE_TIMEOUT_HOURS = 4;
const MAX_SESSION_ABSOLUTE_TIMEOUT_HOURS = 365 * HOURS_PER_DAY;

/**
 * Validate that SESSION_SECRET meets minimum security requirements.
 * Must be at least 32 characters for adequate entropy.
 *
 * @throws Error if SESSION_SECRET is missing or too short
 */
export function validateSessionSecret(): void {
  if (sessionSecretValidated || isBuildPhase()) return;

  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error(
      "SESSION_SECRET environment variable is required. " +
        "Generate one with: openssl rand -base64 32"
    );
  }

  if (secret.length < 32) {
    throw new Error(
      `SESSION_SECRET must be at least 32 characters (got ${secret.length}). ` +
        "Generate a secure secret with: openssl rand -base64 32"
    );
  }

  sessionSecretValidated = true;
}

/**
 * Validate that IP_HASH_SECRET meets minimum security requirements.
 * Must be at least 32 characters for adequate entropy.
 *
 * @throws Error if IP_HASH_SECRET is missing or too short
 */
export function validateIpHashSecret(): void {
  if (ipHashSecretValidated || isBuildPhase()) return;

  const secret = process.env.IP_HASH_SECRET;

  if (!secret) {
    throw new Error(
      "IP_HASH_SECRET environment variable is required. " +
        "Generate one with: openssl rand -base64 32"
    );
  }

  if (secret.length < 32) {
    throw new Error(
      `IP_HASH_SECRET must be at least 32 characters (got ${secret.length}). ` +
        "Generate a secure secret with: openssl rand -base64 32"
    );
  }

  ipHashSecretValidated = true;
}

function parseBoundedInt(
  envName: string,
  rawValue: string | undefined,
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

/**
 * Validate session timeout configuration.
 * Defaults are secure but configurable within bounded ranges.
 *
 * @throws Error if timeout values are out of allowed bounds
 */
export function validateSessionTimeoutConfig(): void {
  if (sessionTimeoutConfigValidated || isBuildPhase()) return;

  const idleMinutes = parseBoundedInt(
    "SESSION_IDLE_TIMEOUT_MINUTES",
    process.env.SESSION_IDLE_TIMEOUT_MINUTES,
    DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES,
    MIN_SESSION_IDLE_TIMEOUT_MINUTES,
    MAX_SESSION_IDLE_TIMEOUT_MINUTES
  );

  const absoluteHours = parseBoundedInt(
    "SESSION_ABSOLUTE_TIMEOUT_HOURS",
    process.env.SESSION_ABSOLUTE_TIMEOUT_HOURS,
    DEFAULT_SESSION_ABSOLUTE_TIMEOUT_HOURS,
    MIN_SESSION_ABSOLUTE_TIMEOUT_HOURS,
    MAX_SESSION_ABSOLUTE_TIMEOUT_HOURS
  );

  if (absoluteHours * 60 <= idleMinutes) {
    throw new Error(
      "SESSION_ABSOLUTE_TIMEOUT_HOURS must be greater than SESSION_IDLE_TIMEOUT_MINUTES " +
        `(received absolute=${absoluteHours}h, idle=${idleMinutes}m).`
    );
  }

  sessionTimeoutConfigValidated = true;
}

let convexSecretValidated = false;
let adminSecretValidated = false;

/**
 * Validate CONVEX_SERVER_SECRET when Convex is enabled.
 * Must be at least 32 characters for adequate entropy.
 *
 * @throws Error if CONVEX_SERVER_SECRET is missing/short when Convex is configured
 */
export function validateConvexSecret(): void {
  if (convexSecretValidated || isBuildPhase()) return;

  // Only validate if Convex is configured
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    convexSecretValidated = true;
    return;
  }

  const secret = process.env.CONVEX_SERVER_SECRET;

  if (!secret) {
    throw new Error(
      "CONVEX_SERVER_SECRET environment variable is required when Convex is enabled. " +
        "Generate one with: openssl rand -base64 32"
    );
  }

  if (secret.length < 32) {
    throw new Error(
      `CONVEX_SERVER_SECRET must be at least 32 characters (got ${secret.length}). ` +
        "Generate a secure secret with: openssl rand -base64 32"
    );
  }

  convexSecretValidated = true;
}

/**
 * Validate ADMIN_PASSWORD_SECRET when admin login is configured.
 * Must be at least 32 characters for adequate entropy.
 *
 * @throws Error if ADMIN_PASSWORD_SECRET is missing/short when ADMIN_PASSWORD is set
 */
export function validateAdminSecret(): void {
  if (adminSecretValidated || isBuildPhase()) return;

  // Only validate if admin login is configured
  if (!process.env.ADMIN_PASSWORD) {
    adminSecretValidated = true;
    return;
  }

  const secret = process.env.ADMIN_PASSWORD_SECRET;

  if (!secret) {
    throw new Error(
      "ADMIN_PASSWORD_SECRET environment variable is required when ADMIN_PASSWORD is set. " +
        "Generate one with: openssl rand -base64 32"
    );
  }

  if (secret.length < 32) {
    throw new Error(
      `ADMIN_PASSWORD_SECRET must be at least 32 characters (got ${secret.length}). ` +
        "Generate a secure secret with: openssl rand -base64 32"
    );
  }

  adminSecretValidated = true;
}

let proxyConfigValidated = false;
const ALLOW_UNTRUSTED_PROXY_OVERRIDE_ENV =
  "ALLOW_UNTRUSTED_PROXY_IN_PRODUCTION";

/**
 * Validate proxy trust configuration and warn about potential misconfigurations.
 * Does not throw - only logs warnings for operational issues.
 */
export function validateProxyConfig(): void {
  if (proxyConfigValidated || isBuildPhase()) return;
  proxyConfigValidated = true;

  const trustPlatform = process.env.TRUST_PROXY_PLATFORM;
  const trustedIps = process.env.TRUSTED_PROXY_IPS || "";
  const isVercel = process.env.VERCEL === "1";
  const isProduction = process.env.NODE_ENV === "production";
  const allowUntrustedProxyOverride =
    process.env[ALLOW_UNTRUSTED_PROXY_OVERRIDE_ENV] === "true";

  // Validate supported platform values
  if (trustPlatform && trustPlatform !== "vercel") {
    const message =
      `[Security Warning] Unsupported TRUST_PROXY_PLATFORM="${trustPlatform}". ` +
      'Supported values: "vercel".';
    if (isProduction) {
      throw new Error(
        `${message} Remove TRUST_PROXY_PLATFORM or configure TRUSTED_PROXY_IPS explicitly.`
      );
    }
    console.warn(message);
  }

  // Warn if TRUST_PROXY_PLATFORM=vercel but not actually on Vercel
  if (trustPlatform === "vercel" && !isVercel) {
    const message =
      "[Security Warning] TRUST_PROXY_PLATFORM=vercel is set but VERCEL=1 is not detected. " +
      "Proxy headers will NOT be trusted. If deployed elsewhere, remove TRUST_PROXY_PLATFORM or set TRUSTED_PROXY_IPS.";
    if (isProduction) {
      throw new Error(`${message} This is a production startup blocker.`);
    }
    console.warn(message);
  }

  // SECURITY: Check for overly permissive CIDR ranges that allow IP spoofing
  const dangerousPatterns = [
    { pattern: /^0\.0\.0\.0\/0$/, desc: "0.0.0.0/0 (all IPv4)" },
    { pattern: /^::\/0$/, desc: "::/0 (all IPv6)" },
    { pattern: /^0\.0\.0\.0\/[0-7]$/, desc: "very broad IPv4 CIDR (>/7)" },
    { pattern: /^10\.0\.0\.0\/[0-7]$/, desc: "overly broad private range" },
    { pattern: /^192\.168\.0\.0\/[0-9]$/, desc: "overly broad private range" },
  ];

  if (trustedIps) {
    const entries = trustedIps.split(/[,\s]+/).filter(Boolean);
    for (const entry of entries) {
      for (const { pattern, desc } of dangerousPatterns) {
        if (pattern.test(entry)) {
          // SECURITY: In production, dangerous proxy configs are FATAL
          // This prevents IP spoofing attacks that bypass rate limits and session binding
          if (isProduction) {
            throw new Error(
              `CRITICAL SECURITY MISCONFIGURATION: TRUSTED_PROXY_IPS contains ${desc}: "${entry}". ` +
                "This allows IP spoofing attacks that bypass rate limiting and session IP binding. " +
                "Remove this entry and use specific proxy IPs or narrow CIDR ranges."
            );
          } else {
            console.warn(
              `[Security Warning] TRUSTED_PROXY_IPS contains ${desc}: "${entry}". ` +
                "This allows IP spoofing from a wide range of addresses. " +
                "Use specific proxy IPs or narrow CIDR ranges in production."
            );
          }
        }
      }
    }
  }

  // In production, fail fast if no proxy trust is configured unless explicit override is set.
  if (isProduction && !trustPlatform && !trustedIps) {
    if (allowUntrustedProxyOverride) {
      console.warn(
        `[Security Warning] No proxy trust configured in production, but ${ALLOW_UNTRUSTED_PROXY_OVERRIDE_ENV}=true is set. ` +
          "IP-based controls may degrade. See llm/workflow/PROXY_CONFIGURATION.md"
      );
    } else {
      throw new Error(
        "CRITICAL SECURITY MISCONFIGURATION: No proxy trust configured in production. " +
          "Set TRUST_PROXY_PLATFORM=vercel or configure TRUSTED_PROXY_IPS. " +
          `If you must temporarily bypass this check, set ${ALLOW_UNTRUSTED_PROXY_OVERRIDE_ENV}=true (not recommended).`
      );
    }
  }
}

/**
 * Validate all security-critical environment variables.
 * Call this at application startup.
 */
export function validateSecurityEnv(): void {
  validateSessionSecret();
  validateIpHashSecret();
  validateSessionTimeoutConfig();
  validateConvexSecret();
  validateAdminSecret();
  validateProxyConfig();
}
