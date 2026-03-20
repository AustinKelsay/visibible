const MIN_PROGRESS = 0.08;
const MAX_PROGRESS = 0.94;
const MIN_ETA_SECONDS = 8;
const PROGRESS_CURVE = 3.2;

export function computeImageGenerationProgress(
  elapsedMs: number,
  etaSeconds: number
): number {
  const safeElapsedMs = Math.max(0, elapsedMs);
  const safeEtaMs = Math.max(etaSeconds, MIN_ETA_SECONDS) * 1000;
  const normalizedElapsed = safeElapsedMs / safeEtaMs;
  const easedProgress = 1 - Math.exp(-PROGRESS_CURVE * normalizedElapsed);
  const scaledProgress =
    MIN_PROGRESS + easedProgress * (MAX_PROGRESS - MIN_PROGRESS);

  return Math.min(MAX_PROGRESS, scaledProgress);
}
