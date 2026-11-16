"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { RefreshCw } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { usePictureStyles } from "@/context/work-scope-context";
import { artStyleLabel } from "@/lib/art-styles";
import { UnpaintedPicture } from "@/components/spread/unpainted-picture";
import { PaintButton, PaintProgress, PILL, usePaintVerse } from "@/components/spread/paint-verse";

interface SpreadPictureProps {
  verseId: string;
  reference: string;
}

/**
 * The spread's picture, chosen by the picture rule (src/lib/picture-rule.ts): the newest saved picture in the chosen
 * art style, otherwise the newest in another style the reader may see (with a note naming it and an offer to paint the
 * verse in the chosen style), otherwise the unpainted verse. It is cropped from its centre to cover its frame; its
 * thumbnail shows first and the full picture replaces it once loaded. While the picture is read the frame stays dark.
 */
export function SpreadPicture(props: SpreadPictureProps) {
  const isConvexEnabled = useConvexEnabled();
  return isConvexEnabled ? <SavedPicture {...props} /> : null;
}

function SavedPicture({ verseId, reference }: SpreadPictureProps) {
  const { chosen, order } = usePictureStyles();
  // The next spread's prefetch reads the same query with the same arguments (prefetch-next.tsx).
  const picture = useQuery(api.verseImages.getSpreadPicture, { verseId, styles: order });
  const recordImpression = useMutation(api.verseImages.recordImageImpression);
  const recordedRef = useRef(new Set<string>());
  const [loadedId, setLoadedId] = useState<string | null>(null);
  if (picture === undefined) return null;
  if (picture === null) return <UnpaintedPicture key={verseId} verseId={verseId} reference={reference} styles={order} />;
  const showThumbnail = Boolean(picture.thumbnailUrl) && loadedId !== picture.id;
  const cover = "absolute inset-0 h-full w-full object-cover object-center";

  // Saved pictures come from Convex storage at their full size; there is no resizing service.
  /* eslint-disable @next/next/no-img-element */
  return (
    <>
      {showThumbnail ? <img key={`${picture.id}-thumbnail`} src={picture.thumbnailUrl!} alt="" aria-hidden="true" className={cover} /> : null}
      <img
        key={picture.id}
        src={picture.imageUrl}
        alt={`Picture of ${reference}`}
        className={`${cover} transition-opacity duration-300 motion-reduce:transition-none`}
        style={showThumbnail ? { opacity: 0 } : undefined}
        onLoad={() => {
          setLoadedId(picture.id);
          if (recordedRef.current.has(picture.id)) return;
          recordedRef.current.add(picture.id);
          void recordImpression({ imageId: picture.id }).catch(() => recordedRef.current.delete(picture.id));
        }}
      />
      {picture.artStyle !== chosen ? (
        <OtherStyleNote key={`${verseId}:${chosen}`} verseId={verseId} reference={reference} shownStyle={picture.artStyle} chosenStyle={chosen} />
      ) : null}
    </>
  );
  /* eslint-enable @next/next/no-img-element */
}

const NOTE_BUTTON = `${PILL} min-h-[40px] px-4 bg-white text-black hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60`;

/**
 * A verse painted only in another style: a note naming the style shown, and an offer to paint the verse in the chosen
 * style, priced like the paint button. The new picture replaces this one once saved, and the note goes with it.
 */
function OtherStyleNote({ verseId, reference, shownStyle, chosenStyle }: { verseId: string; reference: string; shownStyle: string; chosenStyle: string }) {
  const paint = usePaintVerse({ verseId, reference });
  const { generation } = paint;
  const chosenLabel = artStyleLabel(chosenStyle);

  let body;
  if (paint.painting) {
    body = (
      <div className="space-y-2">
        <p className="text-sm text-white/90">Painting {reference} in {chosenLabel}…</p>
        <PaintProgress paint={paint} reference={reference} />
      </div>
    );
  } else if (generation.error) {
    body = (
      <>
        <p role="alert" className="text-sm text-red-200">{generation.error}</p>
        <button type="button" className={NOTE_BUTTON} onClick={() => generation.generate("spread_retry")}>
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          Try again
        </button>
      </>
    );
  } else if (generation.priceNotice) {
    body = (
      <>
        <p role="status" className="text-sm text-white/85">{generation.priceNotice}</p>
        <button type="button" className={NOTE_BUTTON} onClick={() => generation.generate("spread_paint")}>
          Paint at this price
        </button>
      </>
    );
  } else {
    body = (
      <>
        <p className="text-sm leading-snug text-white/85">
          <span className="font-medium text-white">Shown in {artStyleLabel(shownStyle)}.</span>{" "}
          No {chosenLabel} picture of this verse yet.
        </p>
        <PaintButton paint={paint} label={`Paint in ${chosenLabel}`} className={NOTE_BUTTON} />
      </>
    );
  }

  return (
    <section
      aria-label="Other art style"
      data-fades
      className="liquid-glass spread-dock absolute inset-x-3 bottom-3 z-10 flex max-w-sm flex-col items-start gap-2.5 rounded-2xl p-3.5 text-left md:inset-x-auto md:bottom-auto md:left-5 md:top-20"
    >
      {body}
    </section>
  );
}
