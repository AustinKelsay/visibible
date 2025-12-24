"use client";

import { useEffect, useState } from "react";

interface HeroImageProps {
  alt?: string;
  caption?: string;
  verseText?: string;
}

export function HeroImage({
  alt = "Scripture illustration",
  caption = "In the beginning",
  verseText,
}: HeroImageProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    async function generateImage() {
      try {
        setIsLoading(true);
        setError(null);
        const url = verseText
          ? `/api/generate-image?text=${encodeURIComponent(verseText)}`
          : "/api/generate-image";
        const response = await fetch(url, {
          signal: abortController.signal,
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
  }, [verseText]);

  return (
    <figure className="relative w-full">
      {/* Image Container */}
      <div className="relative w-full aspect-[16/9] md:aspect-[21/9] overflow-hidden bg-[var(--surface)]">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={alt}
            className="w-full h-full object-cover"
          />
        ) : (
          /* Placeholder gradient while loading */
          <div className="absolute inset-0 bg-gradient-to-br from-amber-100 via-orange-50 to-rose-100 dark:from-amber-950/30 dark:via-stone-900 dark:to-rose-950/20">
            {/* Decorative sun/light element */}
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 md:w-48 md:h-48 rounded-full bg-gradient-to-b from-amber-200/80 to-orange-300/60 dark:from-amber-400/20 dark:to-orange-500/10 blur-2xl" />

            {/* Horizon line */}
            <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-stone-200/50 to-transparent dark:from-stone-800/30" />

            {/* Loading/Error state */}
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="animate-pulse text-[var(--muted)] text-sm">Generating image...</div>
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-red-500 text-sm">{error}</div>
              </div>
            )}
          </div>
        )}

        {/* Gradient overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--background)] via-transparent to-transparent opacity-60" />
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
