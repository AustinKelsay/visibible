/**
 * Engine admission (#174, spec #165 §6 and §9): which engine a new image request is bound to,
 * decided once at admission and persisted with the request so a replay never switches engines
 * or reprices. The generic engine is disabled by default; an owner-only mode proves it in
 * production, and one explicit switch sends every new public request to it. Readiness of the
 * work's analysis gates generic admission; optional references and attention notes never do.
 */

export type EngineId = "legacy" | "generic";
export type GenericEngineMode = "disabled" | "owner" | "public";
export const GENERIC_ENGINE_MODE_ENV = "GENERIC_ENGINE_MODE";

export function genericEngineMode(env: Record<string, string | undefined> = process.env): GenericEngineMode {
  const raw = (env[GENERIC_ENGINE_MODE_ENV] ?? "disabled").trim().toLowerCase();
  return raw === "owner" || raw === "public" ? raw : "disabled";
}

export type WorkReadiness = { ready: boolean; reasons: string[]; activeGeneration: number | null; briefVersion: string | null };

export type EngineDecision =
  | { engine: EngineId; reason: "accepted" | "disabled" | "owner-proof" | "public" | "not-owner" }
  | { engine: null; unavailable: "style" | "preparing"; reason: string; retryable: boolean };

/** Styles the legacy engine can render; any other style needs the generic engine. */
export const LEGACY_STYLE_IDS = Object.freeze(["classical"]);

/**
 * Decide the engine for a request. An already accepted request keeps its engine whatever the
 * switches say now. Otherwise the mode, the caller's owner status (verified server-side by the
 * caller), the requested style and the work's readiness decide.
 */
export function decideEngine(input: {
  mode: GenericEngineMode;
  isOwner: boolean;
  styleId: string | null;
  readiness: WorkReadiness | null;
  existingEngine?: EngineId | null;
}): EngineDecision {
  if (input.existingEngine) return { engine: input.existingEngine, reason: "accepted" };
  const styleId = input.styleId ?? "classical";
  const legacyCanRender = LEGACY_STYLE_IDS.includes(styleId);
  const genericAllowed = input.mode === "public" || (input.mode === "owner" && input.isOwner);
  if (!genericAllowed) {
    if (legacyCanRender) return { engine: "legacy", reason: input.mode === "owner" ? "not-owner" : "disabled" };
    // Rollback or not yet released: non-Classical styles are unavailable; the saved preference is left alone.
    return { engine: null, unavailable: "style", reason: `The ${styleId} art style is temporarily unavailable`, retryable: true };
  }
  if (input.readiness?.ready) return { engine: "generic", reason: input.mode === "public" ? "public" : "owner-proof" };
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
