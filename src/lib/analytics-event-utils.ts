export type CreditsModalOpenedStep = "welcome" | "selection" | "invoice";
export type CreditsModalState =
  | "welcome"
  | "selection"
  | "loading"
  | "invoice"
  | "success"
  | "error";
export type ChatErrorType =
  | "rate_limit"
  | "model_unavailable"
  | "service_busy"
  | "unknown";

interface ResolveCreditsModalOpenedStepArgs {
  hasActiveInvoice: boolean;
  hasSeenWelcome: boolean;
  hasShownWelcomeInSession: boolean;
}

/**
 * Determines the modal step users actually see when opening credits purchase flow.
 */
export function resolveCreditsModalOpenedStep({
  hasActiveInvoice,
  hasSeenWelcome,
  hasShownWelcomeInSession,
}: ResolveCreditsModalOpenedStepArgs): CreditsModalOpenedStep {
  if (hasActiveInvoice) {
    return "invoice";
  }

  return !hasSeenWelcome && !hasShownWelcomeInSession ? "welcome" : "selection";
}

interface ResolveHasCreditsAfterGenerationArgs {
  returnedCredits: unknown;
  currentCredits: number;
}

/**
 * Uses server-returned balance when available; otherwise falls back to current client balance.
 */
export function resolveHasCreditsAfterGeneration({
  returnedCredits,
  currentCredits,
}: ResolveHasCreditsAfterGenerationArgs): boolean {
  return typeof returnedCredits === "number" ? returnedCredits > 0 : currentCredits > 0;
}

interface ResolveCreditsModalClosedStepArgs {
  state: CreditsModalState;
  hasActiveInvoice: boolean;
  hasShownWelcomeInSession: boolean;
}

/**
 * Resolves step for modal-closed analytics to keep segmentation consistent.
 */
export function resolveCreditsModalClosedStep({
  state,
  hasActiveInvoice,
  hasShownWelcomeInSession,
}: ResolveCreditsModalClosedStepArgs): CreditsModalOpenedStep {
  if (state === "welcome" || state === "selection" || state === "invoice") {
    return state;
  }

  if (hasActiveInvoice) {
    return "invoice";
  }

  return hasShownWelcomeInSession ? "selection" : "welcome";
}

/**
 * Normalizes chat UI error messaging into stable analytics categories.
 */
export function resolveChatErrorType(error: Error | null): ChatErrorType | null {
  if (!error) return null;

  const msg = error.message?.toLowerCase() ?? "";

  if (msg.includes("rate limit") || msg.includes("429") || msg.includes("rate-limited")) {
    return "rate_limit";
  }

  if (msg.includes("no endpoints") || msg.includes("temporarily unavailable") || msg.includes("503")) {
    return "model_unavailable";
  }

  if (msg.includes("retry") || msg.includes("busy") || msg.includes("traffic")) {
    return "service_busy";
  }

  return "unknown";
}
