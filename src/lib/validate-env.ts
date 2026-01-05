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

/**
 * Validate all security-critical environment variables.
 * Call this at application startup.
 */
export function validateSecurityEnv(): void {
  validateSessionSecret();
  validateConvexSecret();
  validateAdminSecret();
}
