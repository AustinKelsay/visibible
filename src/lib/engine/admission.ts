/**
 * Engine admission (#174, spec #165 §6 and §9): whether a new image request is admitted on the generic engine,
 * decided once at admission and persisted with the request so a replay never switches engines or reprices. Replay
 * is answered before admission, so accepted requests, including those of the removed legacy engine (#184), keep
 * their engine. The generic engine is disabled by default; an owner-only mode proves it in production, and one
 * explicit switch sends every new public request in a released style to it. Readiness of the work's analysis gates
 * admission; optional references and attention notes never do.
 */

/** The engine a request was accepted on. New requests are only ever generic; `legacy` remains on historical records. */
export type EngineId = "legacy" | "generic";
export type GenericEngineMode = "disabled" | "owner" | "public";
export const GENERIC_ENGINE_MODE_ENV = "GENERIC_ENGINE_MODE";

export function genericEngineMode(env: Record<string, string | undefined> = process.env): GenericEngineMode {
  const raw = (env[GENERIC_ENGINE_MODE_ENV] ?? "disabled").trim().toLowerCase();
  return raw === "owner" || raw === "public" ? raw : "disabled";
}

export type WorkReadiness = { ready: boolean; reasons: string[]; activeGeneration: number | null; briefVersion: string | null };

export type EngineDecision =
  | { engine: "generic"; reason: "owner-proof" | "public" }
  | { engine: null; unavailable: "style" | "preparing"; reason: string; retryable: boolean };

/**
 * Styles the public switch releases to every reader. The owner launched Classical and Watercolor first (28 October
 * 2026), chose Fresco as the third style after Icon failed two style rounds, and delegated the fourth to a measured
 * bake-off that Storybook won (1 November 2026); Icon stays owner-only (ADR 0006, amendments 3, 4 and 6).
 */
export const PUBLIC_GENERIC_STYLE_IDS: readonly string[] = Object.freeze(["classical", "watercolor", "fresco", "storybook"]);

/**
 * Decide whether a new request is admitted. The mode, the caller's owner status (verified server-side by the
 * caller), the requested style and the work's readiness decide.
 */
export function decideEngine(input: {
  mode: GenericEngineMode;
  isOwner: boolean;
  styleId: string | null;
  readiness: WorkReadiness | null;
}): EngineDecision {
  const styleId = input.styleId ?? "classical";
  const released = PUBLIC_GENERIC_STYLE_IDS.includes(styleId);
  // The owner may prove any style in owner or public mode; readers get only released styles.
  const genericAllowed = (input.mode === "public" && released) || (input.mode !== "disabled" && input.isOwner);
  if (!genericAllowed) {
    // Disabled, rolled back or not yet released: the style is unavailable; the saved preference is left alone.
    return { engine: null, unavailable: "style", reason: `The ${styleId} art style is temporarily unavailable`, retryable: true };
  }
  if (input.readiness?.ready) return { engine: "generic", reason: input.mode === "public" && released ? "public" : "owner-proof" };
  const why = input.readiness?.reasons.join("; ") || "the work's analysis is not registered";
  return { engine: null, unavailable: "preparing", reason: `The work is still being prepared: ${why}`, retryable: true };
}

/** What a generic generation is bound to for its whole life; persisted before any paid call. */
export type EngineCommitments = {
  workId: string;
  momentId: string;
  briefVersion: string;
  analysisGeneration: number;
  promptVersion: string;
  billingVersion: string;
};
