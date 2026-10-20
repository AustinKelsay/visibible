/**
 * The generic engine's seam in the request path (#174). Admission decides the engine; this is
 * what the route calls for a request bound to the generic engine. Until the generation slice
 * (#175) lands, the generic adapter declines before any reservation, request record or paid
 * call, with a retryable error, so no shadow paid execution can happen. Tests substitute a fake.
 */
export type GenericGenerationInput = {
  requestId: string;
  sid: string;
  isOwner: boolean;
  verseId: string;
  reference: string;
  translationId: string;
  styleId: string;
  aspectRatio: string;
  resolution: string;
};

export type GenericGenerationOutcome =
  | { kind: "declined"; status: number; error: string; message: string; retryable: boolean }
  | { kind: "response"; status: number; body: Record<string, unknown> };

export interface GenericEngine {
  readonly id: string;
  execute(input: GenericGenerationInput): Promise<GenericGenerationOutcome>;
}

export const notIntegratedGenericEngine: GenericEngine = {
  id: "generic-not-integrated",
  async execute() {
    return { kind: "declined", status: 503, error: "Generic engine not available", message: "The generic image engine is admitted but not yet connected to generation. Please try again later.", retryable: true };
  },
};

let current: GenericEngine = notIntegratedGenericEngine;
export function getGenericEngine(): GenericEngine { return current; }
/** Tests and the generation slice install the real adapter here. */
export function setGenericEngine(engine: GenericEngine | null) { current = engine ?? notIntegratedGenericEngine; }
