"use client";

import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { useQuery } from "convex/react";
import { usePreferences } from "@/context/preferences-context";
import { useNavigation } from "@/context/navigation-context";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { api } from "../../convex/_generated/api";
import { TranslationSelector } from "./translation-selector";

interface ScriptureDetailsProps {
  book: string;
  chapter: number;
  verseRange: string;
  verseText: string;
  chapterVerseCount: number;
  testament: "old" | "new";
  reference: string;
  imageAttribution?: {
    title?: string;
    artist?: string;
    source?: string;
  };
}

interface VerseContext {
  number: number;
  text: string;
  reference?: string;
}

interface ScenePlan {
  primarySubject: string;
  action: string;
  setting: string;
  secondaryElements?: string;
  mood?: string;
  timeOfDay?: string;
  composition?: string;
}

interface PromptInputs {
  reference?: string;
  aspectRatio?: string;
  styleProfileId?: string;
  scenePlan?: ScenePlan;
  generationNumber?: number;
  prevVerse?: VerseContext;
  nextVerse?: VerseContext;
}

interface ConvexImageData {
  id: string;
  imageUrl: string | undefined;
  model: string;
  prompt?: string;
  reference?: string;
  verseText?: string;
  chapterTheme?: {
    setting: string;
    palette: string;
    elements: string;
    style: string;
  };
  generationNumber?: number;
  promptVersion?: string;
  promptInputs?: PromptInputs;
  translationId?: string;
  provider?: string;
  providerRequestId?: string;
  creditsCost?: number;
  costUsd?: number;
  durationMs?: number;
  aspectRatio?: string;
  sourceImageUrl?: string;
  imageMimeType?: string;
  imageSizeBytes?: number;
  imageWidth?: number;
  imageHeight?: number;
  createdAt: number;
}

interface ScriptureDetailsBaseProps extends ScriptureDetailsProps {
  isConvexEnabled: boolean;
  imageHistory: ConvexImageData[] | null | undefined;
  isQueryLoading: boolean;
}

export function ScriptureDetails(props: ScriptureDetailsProps) {
  const isConvexEnabled = useConvexEnabled();
  if (!isConvexEnabled) {
    return (
      <ScriptureDetailsBase
        {...props}
        isConvexEnabled={false}
        imageHistory={null}
        isQueryLoading={false}
      />
    );
  }

  return <ScriptureDetailsWithConvex {...props} />;
}

function ScriptureDetailsWithConvex(props: ScriptureDetailsProps) {
  const verseId = props.reference ? createVerseId(props.reference) : null;
  const imageHistory = useQuery(
    api.verseImages.getImageHistory,
    verseId ? { verseId } : "skip"
  );
  const isQueryLoading = imageHistory === undefined && verseId !== null;

  return (
    <ScriptureDetailsBase
      {...props}
      isConvexEnabled={true}
      imageHistory={imageHistory}
      isQueryLoading={isQueryLoading}
    />
  );
}

function ScriptureDetailsBase({
  book,
  chapter,
  verseRange,
  verseText,
  chapterVerseCount,
  testament,
  imageAttribution,
  isConvexEnabled,
  imageHistory,
  isQueryLoading,
}: ScriptureDetailsBaseProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { translationInfo, imageModel } = usePreferences();
  const { currentImageId } = useNavigation();

  const wordCount = countWords(verseText);
  const charCount = verseText.trim().length;
  const verseCount = getVerseCount(verseRange);
  const currentVerseNumber = parseInt(verseRange.split("-")[0], 10) || 1;
  const readingTimeSeconds = wordCount ? Math.round((wordCount / WORDS_PER_MINUTE) * 60) : 0;
  const readingTimeLabel = readingTimeSeconds
    ? formatDuration(readingTimeSeconds)
    : "-";
  const wordCountLabel = wordCount ? `${wordCount} word${wordCount === 1 ? "" : "s"}` : "-";
  const charCountLabel = charCount ? `${charCount} char${charCount === 1 ? "" : "s"}` : "-";
  const verseCountLabel = verseCount
    ? `${verseCount} verse${verseCount === 1 ? "" : "s"}`
    : "-";
  const testamentLabel = testament === "old" ? "Old Testament" : "New Testament";
  const chapterVerseLabel = chapterVerseCount
    ? `${chapterVerseCount} verse${chapterVerseCount === 1 ? "" : "s"}`
    : "-";
  const versePositionLabel = chapterVerseCount
    ? `${currentVerseNumber} of ${chapterVerseCount}`
    : "-";

  // Image data - use currently displayed image (synced from HeroImage via context)
  const displayedImage = currentImageId && imageHistory
    ? imageHistory.find((img) => img.id === currentImageId) || (imageHistory.length > 0 ? imageHistory[0] : null)
    : imageHistory && imageHistory.length > 0
      ? imageHistory[0]
      : null;
  const imageModelId = displayedImage?.model || imageModel;
  const imageModelLabel = imageModelId ? formatModelName(imageModelId) : "-";
  const imageProviderLabel = imageModelId ? formatProviderName(imageModelId) : "-";
  const imageCountLabel = isConvexEnabled
    ? isQueryLoading
      ? "Loading..."
      : imageHistory
        ? imageHistory.length === 0
          ? "None yet"
          : `${imageHistory.length} saved`
        : "None yet"
    : "Not saved";
  const displayedImageLabel = displayedImage
    ? formatTimestamp(displayedImage.createdAt)
    : isConvexEnabled
      ? isQueryLoading
        ? "Loading..."
        : "None yet"
      : "-";
  const persistenceLabel = isConvexEnabled ? "Convex (synced)" : "Browser cache only";

  // Current displayed image metadata
  const dimensionsLabel = displayedImage?.imageWidth && displayedImage?.imageHeight
    ? `${displayedImage.imageWidth} × ${displayedImage.imageHeight}`
    : "-";
  const aspectRatioLabel = displayedImage?.aspectRatio || "-";
  const fileSizeLabel = displayedImage?.imageSizeBytes
    ? formatFileSize(displayedImage.imageSizeBytes)
    : "-";
  const genTimeLabel = displayedImage?.durationMs
    ? formatGenTime(displayedImage.durationMs)
    : "-";
  const costLabel = displayedImage?.creditsCost
    ? `${displayedImage.creditsCost} credits`
    : "-";

  // Aggregate stats from image history
  const totalCreditsSpent = imageHistory?.reduce((sum, img) => sum + (img.creditsCost || 0), 0) || 0;
  const totalCostUsd = imageHistory?.reduce((sum, img) => sum + (img.costUsd || 0), 0) || 0;
  const imagesWithDuration = imageHistory?.filter(img => typeof img.durationMs === 'number') || [];
  const avgGenTimeMs = imagesWithDuration.length > 0
    ? imagesWithDuration.reduce((sum, img) => sum + img.durationMs!, 0) / imagesWithDuration.length
    : 0;
  const uniqueModels = imageHistory
    ? new Set(imageHistory.map(img => img.model)).size
    : 0;
  const totalCreditsLabel = isConvexEnabled
    ? isQueryLoading
      ? "Loading..."
      : totalCreditsSpent > 0
        ? `${totalCreditsSpent} credits`
        : "-"
    : "-";
  const totalCostLabel = isConvexEnabled
    ? isQueryLoading
      ? "Loading..."
      : totalCostUsd > 0
        ? `$${totalCostUsd.toFixed(4)}`
        : "-"
    : "-";
  const avgGenTimeLabel = isConvexEnabled
    ? isQueryLoading
      ? "Loading..."
      : avgGenTimeMs > 0
        ? formatGenTime(avgGenTimeMs)
        : "-"
    : "-";
  const uniqueModelsLabel = isConvexEnabled
    ? isQueryLoading
      ? "Loading..."
      : uniqueModels > 0
        ? `${uniqueModels} model${uniqueModels === 1 ? "" : "s"}`
        : "-"
    : "-";

  return (
    <section className="border-t border-[var(--divider)]">
      {/* Toggle Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--surface)]/50 transition-colors duration-[var(--motion-fast)]"
        aria-expanded={isExpanded}
        aria-controls="scripture-details-content"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-[var(--surface)] flex items-center justify-center">
            <Info size={16} strokeWidth={1.5} className="text-[var(--muted)]" />
          </div>
          <div>
            <p className="text-sm font-medium">Details</p>
            <p className="text-xs text-[var(--muted)]">
              {translationInfo.code} · {book} {chapter}:{verseRange}
            </p>
          </div>
        </div>
        <ChevronDown
          size={20}
          strokeWidth={1.5}
          className={`text-[var(--muted)] transition-transform duration-[var(--motion-fast)] ${
            isExpanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Expandable Content */}
      <div
        id="scripture-details-content"
        className={`overflow-hidden transition-all duration-[var(--motion-base)] ease-out ${
          isExpanded ? "max-h-[2000px]" : "max-h-0"
        }`}
      >
        <div className="px-4 pb-4 space-y-4">
          {/* Version Section */}
          <div className="bg-[var(--surface)] rounded-[var(--radius-md)] overflow-hidden">
            <div className="px-4 py-2 border-b border-[var(--divider)] flex items-center justify-between">
              <p className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
                Translation
              </p>
              <TranslationSelector variant="full" />
            </div>
            <div className="divide-y divide-[var(--divider)]">
              <DetailRow label="Version" value={translationInfo.code} />
              <DetailRow label="Full Name" value={translationInfo.name} />
              <DetailRow label="Language" value={translationInfo.language} />
              {translationInfo.year && (
                <DetailRow label="Edition" value={String(translationInfo.year)} />
              )}
            </div>
          </div>

          {/* Location Section */}
          <div className="bg-[var(--surface)] rounded-[var(--radius-md)] overflow-hidden">
            <div className="px-4 py-2 border-b border-[var(--divider)]">
              <p className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
                Location
              </p>
            </div>
            <div className="divide-y divide-[var(--divider)]">
              <DetailRow label="Reference" value={`${book} ${chapter}:${verseRange}`} />
              <DetailRow label="Book" value={book} />
              <DetailRow label="Chapter" value={`${chapter}`} />
              <DetailRow label="Verse" value={versePositionLabel} />
              <DetailRow label="Testament" value={testamentLabel} />
            </div>
          </div>

          {/* Passage Section */}
          <div className="bg-[var(--surface)] rounded-[var(--radius-md)] overflow-hidden">
            <div className="px-4 py-2 border-b border-[var(--divider)]">
              <p className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
                Passage
              </p>
            </div>
            <div className="divide-y divide-[var(--divider)]">
              <DetailRow label="Passage Size" value={verseCountLabel} />
              <DetailRow label="Chapter Size" value={chapterVerseLabel} />
              <DetailRow label="Word Count" value={wordCountLabel} />
              <DetailRow label="Characters" value={charCountLabel} />
              <DetailRow label="Reading Time" value={readingTimeLabel} />
            </div>
          </div>

          {/* Image Generation Stats */}
          <div className="bg-[var(--surface)] rounded-[var(--radius-md)] overflow-hidden">
            <div className="px-4 py-2 border-b border-[var(--divider)]">
              <p className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
                Image Stats
              </p>
            </div>
            <div className="divide-y divide-[var(--divider)]">
              <DetailRow label="Images Saved" value={imageCountLabel} />
              <DetailRow label="Models Used" value={uniqueModelsLabel} />
              <DetailRow label="Total Credits" value={totalCreditsLabel} />
              <DetailRow label="Total Cost" value={totalCostLabel} />
              <DetailRow label="Avg Gen Time" value={avgGenTimeLabel} />
              <DetailRow label="Persistence" value={persistenceLabel} />
            </div>
          </div>

          {/* Current Image Details */}
          {displayedImage && (
            <div className="bg-[var(--surface)] rounded-[var(--radius-md)] overflow-hidden">
              <div className="px-4 py-2 border-b border-[var(--divider)]">
                <p className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
                  Current Image
                </p>
              </div>
              <div className="divide-y divide-[var(--divider)]">
                <DetailRow label="Model" value={imageModelLabel} />
                <DetailRow label="Provider" value={imageProviderLabel} />
                <DetailRow label="Dimensions" value={dimensionsLabel} />
                <DetailRow label="Aspect Ratio" value={aspectRatioLabel} />
                <DetailRow label="File Size" value={fileSizeLabel} />
                <DetailRow label="Gen Time" value={genTimeLabel} />
                <DetailRow label="Cost" value={costLabel} />
                <DetailRow label="Created" value={displayedImageLabel} />
                {imageAttribution?.title && (
                  <DetailRow label="Title" value={imageAttribution.title} />
                )}
                {imageAttribution?.artist && (
                  <DetailRow label="Artist" value={imageAttribution.artist} />
                )}
                {imageAttribution?.source && (
                  <DetailRow label="Source" value={imageAttribution.source} />
                )}
              </div>
            </div>
          )}

          {/* Copyright Notice */}
          <p className="text-xs text-[var(--muted)] text-center leading-relaxed px-4 pb-4">
            Scripture quotations are from the {translationInfo.name} ({translationInfo.code}).
          </p>
        </div>
      </div>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 min-h-[44px] gap-2">
      <span className="text-xs sm:text-sm text-[var(--muted)]">{label}</span>
      <span className="text-xs sm:text-sm font-medium">{value}</span>
    </div>
  );
}

const WORDS_PER_MINUTE = 200;

function createVerseId(reference: string): string {
  return reference
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/:/g, "-");
}

function countWords(text: string): number {
  const cleaned = text.trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

function getVerseCount(range: string): number | null {
  const cleaned = range.replace(/\s+/g, "");
  if (!cleaned) return null;
  const parts = cleaned.split("-");
  if (parts.length === 1) {
    const single = parseInt(parts[0], 10);
    return Number.isFinite(single) ? 1 : null;
  }
  const start = parseInt(parts[0], 10);
  const end = parseInt(parts[1], 10);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }
  return end - start + 1;
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "-";
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} min`;
}

function formatModelName(modelId: string): string {
  const parts = modelId.split("/");
  const name = parts[parts.length - 1] || modelId;
  return name
    .replace(/-image$/i, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function formatProviderName(modelId: string): string {
  const provider = modelId.split("/")[0] || "";
  if (!provider) return "-";
  return provider
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function formatTimestamp(timestamp: number): string {
  if (!timestamp) return "-";
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return "-";
  }
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatGenTime(ms: number): string {
  if (!ms || ms <= 0) return "-";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
