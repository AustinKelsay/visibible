const DEVELOPMENT_FLAGS_SECRET = "visibible-local-flags-secret-keep-out-of-production";
const MINIMUM_FLAGS_SECRET_LENGTH = 32;
const WEAK_FLAGS_SECRET_VALUES = new Set([
  "changeme",
  "default",
  "flags-secret",
  "password",
  "secret",
]);

function isValidFlagsSecret(secret: string) {
  const normalized = secret.trim().toLowerCase();

  if (secret.length < MINIMUM_FLAGS_SECRET_LENGTH) {
    return false;
  }

  if (
    WEAK_FLAGS_SECRET_VALUES.has(normalized) ||
    /^dev/i.test(secret) ||
    /^test/i.test(secret)
  ) {
    return false;
  }

  return true;
}

export function getFlagsSecret(): string {
  const envSecret = process.env.FLAGS_SECRET;
  if (envSecret && isValidFlagsSecret(envSecret)) {
    return envSecret;
  }

  if (process.env.NODE_ENV === "test") {
    return DEVELOPMENT_FLAGS_SECRET;
  }

  throw new Error("A valid FLAGS_SECRET environment variable is required outside test environments.");
}
