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
  /** The saved picture the video starts from (#479). */
  imageId: string;
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
  /** The picture the video starts from and its art style (#479); absent on videos made from text alone. */
  sourceImageId?: string;
  artStyle?: string;
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

/** How far a picture's shape may be from 16:9 and still be a video's first frame (1376 × 768 is about 0.8% wide). */
const FRAME_TOLERANCE = 0.02;

/**
 * Whether a saved picture can be a video's first frame (#479): it is 16:9, the video's frame. Its recorded aspect
 * ratio decides; a picture without one counts by its size; a picture with neither cannot.
 */
export function isVideoFrame(picture: { aspectRatio?: string | null; imageWidth?: number | null; imageHeight?: number | null }): boolean {
  if (picture.aspectRatio) return picture.aspectRatio === VIDEO_ASPECT_RATIO;
  const { imageWidth: width, imageHeight: height } = picture;
  if (!width || !height || width <= 0 || height <= 0) return false;
  return Math.abs(width / height / (16 / 9) - 1) <= FRAME_TOLERANCE;
}
