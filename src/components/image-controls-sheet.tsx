"use client";

import { X, ChevronLeft, ChevronRight, Sparkles, Loader2, Zap } from "lucide-react";
import Link from "next/link";
import { useNavigation } from "@/context/navigation-context";

interface ImageControlsSheetProps {
  // Verse Navigation
  prevUrl?: string | null;
  nextUrl?: string | null;
  // Image navigation
  currentImageIndex: number;
  totalImages: number;
  onOlderImage: () => void;
  onNewerImage: () => void;
  hasOlderImage: boolean;
  hasNewerImage: boolean;
  // Generation
  onGenerate: () => void;
  isGenerating: boolean;
  creditsCost?: number;
  canGenerate: boolean;
  isPricingLoading?: boolean;
  onBuyCredits?: () => void;
}

export function ImageControlsSheet({
  prevUrl,
  nextUrl,
  currentImageIndex,
  totalImages,
  onOlderImage,
  onNewerImage,
  hasOlderImage,
  hasNewerImage,
  onGenerate,
  isGenerating,
  creditsCost,
  canGenerate,
  isPricingLoading,
  onBuyCredits,
}: ImageControlsSheetProps) {
  const { isImageControlsOpen, closeImageControls } = useNavigation();

  return (
    <>
      {/* Backdrop - only on mobile */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 sm:hidden transition-opacity duration-200 ${
          isImageControlsOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={closeImageControls}
      />

      {/* Bottom Sheet - only on mobile */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 sm:hidden bg-[var(--background)] rounded-t-2xl border-t border-[var(--divider)] shadow-lg transform transition-transform duration-300 ease-out ${
          isImageControlsOpen ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Header with close button */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--divider)]">
          <span className="text-sm font-medium text-[var(--foreground)]">Image Controls</span>
          <button
            onClick={closeImageControls}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            aria-label="Close controls"
          >
            <X size={20} />
          </button>
        </div>

        {/* Controls */}
        <div className="px-4 pb-6 pt-4 space-y-4">
          {/* Verse Navigation Row */}
          <div className="flex gap-3">
            {prevUrl ? (
              <Link
                href={prevUrl}
                onClick={closeImageControls}
                className="flex-1 min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-[var(--surface)] text-sm font-medium hover:bg-[var(--divider)] transition-colors"
              >
                <ChevronLeft size={18} />
                Prev verse
              </Link>
            ) : (
              <div className="flex-1 min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-[var(--surface)] text-sm font-medium text-[var(--muted)]/50">
                <ChevronLeft size={18} />
                Prev verse
              </div>
            )}
            {nextUrl ? (
              <Link
                href={nextUrl}
                onClick={closeImageControls}
                className="flex-1 min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-[var(--surface)] text-sm font-medium hover:bg-[var(--divider)] transition-colors"
              >
                Next verse
                <ChevronRight size={18} />
              </Link>
            ) : (
              <div className="flex-1 min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-[var(--surface)] text-sm font-medium text-[var(--muted)]/50">
                Next verse
                <ChevronRight size={18} />
              </div>
            )}
          </div>

          {/* Image Navigation Row */}
          {totalImages > 0 && (
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={onNewerImage}
                disabled={!hasNewerImage}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-[var(--surface)] disabled:opacity-40 hover:bg-[var(--divider)] transition-colors"
                aria-label="Newer image"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="text-center min-w-[80px]">
                <div className="text-xs text-[var(--muted)] uppercase tracking-wider">Images</div>
                <div className="text-sm font-medium">{currentImageIndex} / {totalImages}</div>
              </div>
              <button
                onClick={onOlderImage}
                disabled={!hasOlderImage}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-[var(--surface)] disabled:opacity-40 hover:bg-[var(--divider)] transition-colors"
                aria-label="Older image"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}

          {/* Generate Button - Full Width */}
          {isPricingLoading ? (
            <button
              disabled
              className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-lg bg-[var(--surface)] text-[var(--muted)] font-medium opacity-70"
            >
              <Loader2 size={18} className="animate-spin" />
              Loading pricing...
            </button>
          ) : canGenerate ? (
            <button
              onClick={() => { onGenerate(); closeImageControls(); }}
              disabled={isGenerating}
              className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-lg bg-[var(--accent)] text-[var(--accent-text)] font-medium hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
            >
              {isGenerating ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  Generate {creditsCost ? `(${creditsCost} credits)` : ""}
                </>
              )}
            </button>
          ) : (
            <button
              onClick={() => { onBuyCredits?.(); closeImageControls(); }}
              className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-lg bg-[var(--accent)] text-[var(--accent-text)] font-medium hover:bg-[var(--accent-hover)] transition-colors"
            >
              <Zap size={18} />
              Get Credits to Generate
            </button>
          )}
        </div>
      </div>
    </>
  );
}
