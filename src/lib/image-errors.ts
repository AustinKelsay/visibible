/**
 * The image route's error when the provider can take no request (a refused or exhausted key, rate limiting, an
 * outage): nothing was charged, the request id is spent, and a new request may succeed (src/lib/engine/generation.ts).
 */
export const IMAGES_UNAVAILABLE = "Images are temporarily unavailable";

/** The image route's other refusals that its callers (the bulk coordinator, the seeder) tell apart. The route and its
 * callers use these names, so a reworded error cannot silently stop a job from pausing for the right reason (#552). */
export const DAILY_LIMIT_EXCEEDED = "Daily spending limit exceeded";
export const RATE_LIMIT_EXCEEDED = "Rate limit exceeded";
export const ENGINE_BINDING_CHANGED = "Engine binding changed";
export const ART_STYLE_UNAVAILABLE = "Art style unavailable";
