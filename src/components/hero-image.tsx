"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface ChapterTheme {
  setting: string;
  palette: string;
  elements: string;
  style: string;
}

interface VerseContext {
  number: number;
  text: string;
  reference?: string;
}

interface HeroImageProps {
  alt?: string;
  caption?: string;
  verseText?: string;
  chapterTheme?: ChapterTheme;
  verseNumber?: number;
  totalVerses?: number;
  prevUrl?: string | null;
  nextUrl?: string | null;
  prevVerse?: VerseContext;
  nextVerse?: VerseContext;
  currentReference?: string;
}

export function HeroImage({
  alt = "Scripture illustration",
  caption = "In the beginning",
  verseText,
  chapterTheme,
  prevUrl,
  nextUrl,
  prevVerse,
  nextVerse,
  currentReference,
}: HeroImageProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only show skeleton after a delay to prevent flash for cached responses
  useEffect(() => {
    if (!isLoading) {
      setShowSkeleton(false);
      return;
    }

    const timer = setTimeout(() => {
      if (isLoading) {
        setShowSkeleton(true);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [isLoading]);

  useEffect(() => {
    const abortController = new AbortController();

    // Detect if we should bypass cache (only on page reload, not client-side navigation)
    // The navigation entry persists during client-side nav, so we use startTime as a unique ID
    // to ensure we only bypass cache ONCE per page reload, not on every verse change
    let shouldBypassCache = false;
    if (typeof window !== 'undefined') {
      const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const isReload = navEntry?.type === 'reload';
      const pageLoadId = String(navEntry?.startTime ?? '');
      const handledPageLoad = sessionStorage.getItem('image-cache-bypassed-for');

      // Only bypass cache once per page reload session
      shouldBypassCache = isReload && handledPageLoad !== pageLoadId;

      if (shouldBypassCache) {
        sessionStorage.setItem('image-cache-bypassed-for', pageLoadId);
      }
    }

    async function generateImage() {
      try {
        setIsLoading(true);
        setShowSkeleton(false);
        setError(null);
        const params = new URLSearchParams();
        if (verseText) params.set("text", verseText);
        if (chapterTheme) params.set("theme", JSON.stringify(chapterTheme));
        if (prevVerse) params.set("prevVerse", JSON.stringify(prevVerse));
        if (nextVerse) params.set("nextVerse", JSON.stringify(nextVerse));
        if (currentReference) params.set("reference", currentReference);
        const url = `/api/generate-image${params.toString() ? `?${params.toString()}` : ""}`;
        const response = await fetch(url, {
          signal: abortController.signal,
          // Bypass cache only on first fetch after page reload, use cache for navigation
          cache: shouldBypassCache ? 'reload' : 'default',
        });

        if (response.status === 403) {
          return;
        }

        let data: { imageUrl?: string; error?: string } | null = null;
        try {
          data = await response.json();
        } catch {
          data = null;
        }

        if (!response.ok) {
          throw new Error(data?.error || "Failed to generate image");
        }

        if (data?.imageUrl) {
          setImageUrl(data.imageUrl);
        } else {
          throw new Error("Missing image URL");
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to generate image");
        console.error("Image generation error:", err);
      } finally {
        setIsLoading(false);
      }
    }

    generateImage();

    return () => {
      abortController.abort();
    };
  }, [verseText, chapterTheme, prevVerse, nextVerse, currentReference]);

  return (
    <figure className="relative w-full">
      {/* Image Container */}
      <div className="relative w-full aspect-[16/9] overflow-hidden bg-[var(--surface)]">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={alt}
            className="w-full h-full object-contain"
          />
        ) : (
          /* Placeholder with skeleton loader */
          <div className="absolute inset-0 bg-gradient-to-br from-amber-100 via-orange-50 to-rose-100 dark:from-amber-950/30 dark:via-stone-900 dark:to-rose-950/20">
            {/* Decorative sun/light element */}
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 md:w-48 md:h-48 rounded-full bg-gradient-to-b from-amber-200/80 to-orange-300/60 dark:from-amber-400/20 dark:to-orange-500/10 blur-2xl" />

            {/* Horizon line */}
            <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-stone-200/50 to-transparent dark:from-stone-800/30" />

            {/* Skeleton shimmer overlay - only shows after delay */}
            {showSkeleton && (
              <div className="absolute inset-0 overflow-hidden">
                <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent dark:via-white/5" />
              </div>
            )}

            {/* Error state */}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-red-500 text-sm px-4 text-center">{error}</div>
              </div>
            )}
          </div>
        )}

        {/* Gradient overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--background)] via-transparent to-transparent opacity-60" />

        {/* Floating Navigation Arrows */}
        {prevUrl && (
          <Link
            href={prevUrl}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full bg-[var(--background)]/70 backdrop-blur-sm text-[var(--foreground)] hover:bg-[var(--background)]/90 transition-all duration-[var(--motion-fast)] shadow-lg"
            aria-label="Previous verse"
          >
            <ChevronLeft size={24} strokeWidth={2} />
          </Link>
        )}
        {nextUrl && (
          <Link
            href={nextUrl}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full bg-[var(--background)]/70 backdrop-blur-sm text-[var(--foreground)] hover:bg-[var(--background)]/90 transition-all duration-[var(--motion-fast)] shadow-lg"
            aria-label="Next verse"
          >
            <ChevronRight size={24} strokeWidth={2} />
          </Link>
        )}
      </div>

      {/* Caption */}
      {caption && (
        <figcaption className="absolute bottom-0 left-0 right-0 p-4 md:p-6">
          <p className="text-center text-2xl md:text-3xl lg:text-4xl font-light italic text-[var(--foreground)] opacity-80">
            &ldquo;{caption}&rdquo;
          </p>
        </figcaption>
      )}
    </figure>
  );
}
