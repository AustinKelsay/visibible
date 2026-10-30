/** Shared, browser-safe video contracts. Provider credentials never enter this module. */
export const VIDEO_MODEL_ID = "minimax/hailuo-3-max";
export const VIDEO_MODEL_NAME = "Hailuo 3 Max";
export const VIDEO_DURATIONS = [5, 10] as const;
export const VIDEO_RESOLUTIONS = ["480p", "768p"] as const;
export const VIDEO_ASPECT_RATIO = "16:9";
export const VIDEO_MARKUP = 1.25;
export type VideoDuration = (typeof VIDEO_DURATIONS)[number];
export type VideoResolution = (typeof VIDEO_RESOLUTIONS)[number];
export type VideoJobStatus =
  | "queued"
  | "submitting"
  | "processing"
  | "storing"
  | "completed"
  | "failed";
export interface VideoGenerationRequest {
  requestId: string;
  reference: string;
  translation: string;
  duration: VideoDuration;
  resolution: VideoResolution;
  maxCredits: number;
}
export interface VideoJobResponse {
  id: string;
  requestId: string;
  verseId: string;
  reference: string;
  status: VideoJobStatus;
  duration: VideoDuration;
  resolution: VideoResolution;
  createdAt: number;
  estimatedCredits: number;
  actualCredits?: number;
  videoUrl?: string | null;
  error?: string;
}

export interface VideoQuote {
  duration: VideoDuration;
  resolution: VideoResolution;
  providerCostUsd: number;
  credits: number;
}

export interface VideoConfiguration {
  enabled: boolean;
  model: string;
  modelName: string;
  quotes: VideoQuote[];
  error?: string;
}

export function videoCreditsForCost(providerCostUsd: number): number {
  return Math.max(1, Math.ceil(providerCostUsd * VIDEO_MARKUP * 100 - 1e-8));
}

export function isActiveVideoStatus(status: VideoJobStatus): boolean {
  return status !== "completed" && status !== "failed";
}
