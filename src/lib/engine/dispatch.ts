/**
 * The generic engine's seam in the request path (#174, #175). Admission decides the engine; the
 * route hands an admitted generic request to the installed engine, which owns preparation, the
 * rendering packet, the quote, the request record, reservation, the paid call, settlement and
 * persistence, using the same Convex functions as the legacy path so one ledger and one request
 * identity serve both engines. Tests substitute a fake or install the real engine with fakes.
 */
import type { ImageAspectRatio, ImageResolution } from "../image-catalog";
import type { getConvexClient } from "../convex-client";
import type { RequestObservabilityContext } from "../observability";
import { createGenericEngine } from "./generation";

export type ConvexClient = NonNullable<ReturnType<typeof getConvexClient>>;

export type GenericGenerationInput = {
  requestId: string;
  sid: string;
  isOwner: boolean;
  verseId: string;
  reference: string;
  /** The reader's selected translation: request context only, never preparation input. */
  translationId: string;
  styleId: string;
  aspectRatio: ImageAspectRatio;
  resolution: ImageResolution;
  workId: string;
  /** What admission read: the generic engine binds the request to these. */
  readiness: { activeGeneration: number; workVersion: string; briefVersion: string };
  session: { credits: number; dailySpendUsd: number; dailySpendLimitUsd: number };
  inputFingerprint: string;
  generationNumber: number | null;
  runtime: { convex: ConvexClient; serverSecret: string; openRouterApiKey: string; requestContext: RequestObservabilityContext };
};

/** What `createGenerationRequest` returns for an already accepted request; the route replays it. */
export type ExistingAdmission = {
  requestId: string;
  status: "queued" | "planning" | "generating" | "succeeded" | "failed";
  alreadyExists: boolean;
  conflict?: boolean;
  generationId?: string;
  error?: string;
  savedImage?: { id: string; imageUrl: string | null; model: string; creditsCost?: number; durationMs?: number; reference?: string; translationId?: string; verseText?: string; promptInputs?: unknown };
};

export type GenericGenerationOutcome =
  | { kind: "declined"; status: number; error: string; message: string; retryable: boolean; details?: Record<string, unknown> }
  | { kind: "existing"; admission: ExistingAdmission }
  | { kind: "response"; status: number; body: Record<string, unknown> };

export interface GenericEngine {
  readonly id: string;
  execute(input: GenericGenerationInput): Promise<GenericGenerationOutcome>;
}

let current: GenericEngine | null = null;
/** The production engine unless a test installed another. */
export function getGenericEngine(): GenericEngine {
  if (!current) current = createGenericEngine();
  return current;
}
/** Tests install a fake or an engine with controlled adapters; null restores the production engine. */
export function setGenericEngine(engine: GenericEngine | null) { current = engine; }
