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

  // Warn if TRUST_PROXY_PLATFORM=vercel but not actually on Vercel
  if (trustPlatform === "vercel" && !isVercel) {
    console.warn(
      "[Security Warning] TRUST_PROXY_PLATFORM=vercel is set but VERCEL=1 is not detected. " +
        "Proxy headers will NOT be trusted. If running locally, this is expected. " +
        "If deployed elsewhere, remove TRUST_PROXY_PLATFORM or set TRUSTED_PROXY_IPS."
    );
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

  // In production, warn if no proxy trust is configured (might be behind a load balancer)
  if (isProduction && !trustPlatform && !trustedIps) {
    console.info(
      "[Security Info] No proxy trust configured (TRUST_PROXY_PLATFORM and TRUSTED_PROXY_IPS are empty). " +
        "If behind a reverse proxy/load balancer, client IPs may be incorrect. " +
        "See documentation: llm/workflow/PROXY_CONFIGURATION.md"
    );
  }
}

/**
 * Validate all security-critical environment variables.
 * Call this at application startup.
 */
export function validateSecurityEnv(): void {
  validateSessionSecret();
  validateIpHashSecret();
  validateConvexSecret();
  validateAdminSecret();
  validateProxyConfig();
}
