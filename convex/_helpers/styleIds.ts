/**
 * Every art style id in the shared style library (styles/*.json via SHARED_STYLES), owner-only styles included.
 * Kept dependency-free so Convex functions can check a brief's styles; a test keeps it equal to the library.
 */
export const KNOWN_STYLE_IDS: readonly string[] = Object.freeze(["classical", "watercolor", "fresco", "icon"]);
