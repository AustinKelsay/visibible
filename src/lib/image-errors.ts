/**
 * The image route's error when the provider can take no request (a refused or exhausted key, rate limiting, an
 * outage): nothing was charged, the request id is spent, and a new request may succeed (src/lib/engine/generation.ts).
 */
export const IMAGES_UNAVAILABLE = "Images are temporarily unavailable";
