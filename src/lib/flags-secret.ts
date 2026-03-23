const DEVELOPMENT_FLAGS_SECRET = "visibible-local-flags-secret-keep-out-of-production";

export function getFlagsSecret(): string {
  if (process.env.FLAGS_SECRET) {
    return process.env.FLAGS_SECRET;
  }

  if (process.env.NODE_ENV === "test") {
    return DEVELOPMENT_FLAGS_SECRET;
  }

  throw new Error("FLAGS_SECRET environment variable is required outside test environments.");
}
