"use client";

interface HeroImageProps {
  src?: string;
  alt?: string;
  caption?: string;
}

export function HeroImage({
  src,
  alt = "Scripture illustration",
  caption = "In the beginning",
}: HeroImageProps) {
  return (
    <figure className="relative w-full">
      {/* Image Container */}
      <div className="relative w-full aspect-[16/9] md:aspect-[21/9] overflow-hidden bg-[var(--surface)]">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt}
            className="w-full h-full object-cover"
          />
        ) : (
          /* Placeholder gradient for demo */
          <div className="absolute inset-0 bg-gradient-to-br from-amber-100 via-orange-50 to-rose-100 dark:from-amber-950/30 dark:via-stone-900 dark:to-rose-950/20">
            {/* Decorative sun/light element */}
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 md:w-48 md:h-48 rounded-full bg-gradient-to-b from-amber-200/80 to-orange-300/60 dark:from-amber-400/20 dark:to-orange-500/10 blur-2xl" />

            {/* Horizon line */}
            <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-stone-200/50 to-transparent dark:from-stone-800/30" />
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
