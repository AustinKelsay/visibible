"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { RefreshCw } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { useLayer } from "@/components/spread/layers";
import { useMomentWord, usePictureStyles } from "@/context/work-scope-context";
import { artStyleLabel } from "@/lib/art-styles";
import { UnpaintedPicture } from "@/components/spread/unpainted-picture";
import { PictureMenu } from "@/components/spread/picture-menu";
import { useChosenPicture } from "@/components/spread/chosen-picture";
import { PaintButton, PaintProgress, PILL, usePaintVerse } from "@/components/spread/paint-verse";

interface SpreadPictureProps {
  verseId: string;
  reference: string;
  /** Called when the reader opens the whole-picture view from the picture. */
  onShowWhole?: (imageId: string) => void;
}

/**
 * The spread's picture, chosen by the picture rule (src/lib/picture-rule.ts): the newest saved picture in the chosen
 * art style, otherwise the newest in another style the reader may see (with a note naming it and an offer to paint the
 * verse in the chosen style), otherwise the unpainted verse. It is cropped from its centre to cover its frame; its
 * thumbnail shows first and the full picture replaces it once loaded. The picture menu's chip sits on it; a version
 * chosen there shows instead until the page turns. While the picture is read the frame stays plain dark.
 *
 * The picture is the button for the whole-picture view: activating it puts the words aside and shows
 * the picture uncropped; activating it again (or Escape) brings the words back.
 */
export function SpreadPicture(props: SpreadPictureProps) {
  const isConvexEnabled = useConvexEnabled();
  return isConvexEnabled ? <SavedPicture {...props} /> : null;
}

// On the spread a picture fills its frame. In the whole-picture view it fills the window on a computer;
// on a phone it keeps its own shape (in the page flow) above its caption.
const FILL = "absolute inset-0 h-full w-full";
const WHOLE_IN_FLOW = "block h-auto max-h-[58svh] w-full md:absolute md:inset-0 md:h-full md:max-h-none";

function SavedPicture({ verseId, reference, onShowWhole }: SpreadPictureProps) {
  const { chosen: chosenStyle, order } = usePictureStyles();
  // The picture rule. The next spread's prefetch reads the same query with the same arguments (prefetch-next.tsx).
  const rulePicture = useQuery(api.verseImages.getSpreadPicture, { verseId, styles: order });
  const otherStyle = rulePicture && rulePicture.artStyle !== chosenStyle ? rulePicture.artStyle : null;
  // The verse's pictures in the chosen style, newest first: the picture menu's own list (empty when the rule fell back).
  const pictures = useQuery(api.verseImages.getImageHistory, rulePicture ? { verseId, artStyle: chosenStyle } : "skip");
  // The full record of a picture shown from another style, for the picture menu's details.
  const otherStylePictures = useQuery(api.verseImages.getImageHistory, otherStyle ? { verseId, artStyle: otherStyle } : "skip");
  const { chosen } = useChosenPicture();
  const recordImpression = useMutation(api.verseImages.recordImageImpression);
  const recordedRef = useRef(new Set<string>());
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const whole = useLayer("whole-picture");
  const hasPicture = Boolean(rulePicture?.imageUrl);
  const { isOpen: wholeIsOpen, close: closeWhole } = whole;

  // A spread turned to from the whole-picture view opens in it; with no picture to show, the words return.
  useEffect(() => {
    if (wholeIsOpen && rulePicture !== undefined && !hasPicture) closeWhole();
  }, [wholeIsOpen, rulePicture, hasPicture, closeWhole]);

  // Leaving the view puts focus on the picture when nothing else holds it (the view was opened on an
  // earlier spread, so there is no opener on this one to return to).
  const wasOpen = useRef(wholeIsOpen);
  useEffect(() => {
    if (wasOpen.current && !wholeIsOpen) {
      queueMicrotask(() => {
        const focused = document.activeElement;
        if (!focused || focused === document.body) button.current?.focus();
      });
    }
    wasOpen.current = wholeIsOpen;
  }, [wholeIsOpen]);

  if (rulePicture === undefined) return null;
  if (!rulePicture?.imageUrl) return <UnpaintedPicture key={verseId} verseId={verseId} reference={reference} styles={order} />;
  const ruleRecord = (otherStyle ? otherStylePictures : pictures)?.find((picture) => picture.id === rulePicture.id);
  const picture = chosen ?? ruleRecord ?? rulePicture;
  const showThumbnail = Boolean(picture.thumbnailUrl) && loadedId !== picture.id;
  // Cropped from the centre on the spread; whole, on dark, in the whole-picture view.
  const fit = { objectFit: wholeIsOpen ? "contain" : "cover", objectPosition: "center" } as const;
  // While the thumbnail stands in, it holds the picture's place in the phone's whole-picture flow.
  const thumbnailClass = wholeIsOpen ? WHOLE_IN_FLOW : FILL;
  const pictureClass = wholeIsOpen && !showThumbnail ? WHOLE_IN_FLOW : FILL;
  // The menu's shown picture needs the full record; the chip waits for it.
  const shown = chosen ?? ruleRecord;

  // Saved pictures come from Convex storage at their full size; there is no resizing service.
  /* eslint-disable @next/next/no-img-element */
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={wholeIsOpen ? "Back to the words" : `Show the whole picture of ${reference}`}
        onClick={() => {
          if (wholeIsOpen) {
            closeWhole();
            return;
          }
          whole.open(button.current);
          onShowWhole?.(picture.id);
        }}
        className={`block cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white ${
          wholeIsOpen ? "relative mt-auto w-full shrink-0 md:absolute md:inset-0 md:mt-0" : "absolute inset-0"
        }`}
      >
        {showThumbnail ? (
          <img key={`${picture.id}-thumbnail`} src={picture.thumbnailUrl!} alt="" aria-hidden="true" className={thumbnailClass} style={fit} />
        ) : null}
        <img
          key={picture.id}
          src={picture.imageUrl}
          alt={`Picture of ${reference}`}
          className={`${pictureClass} transition-opacity duration-300 motion-reduce:transition-none`}
          style={showThumbnail ? { ...fit, opacity: 0 } : fit}
          onLoad={() => {
            setLoadedId(picture.id);
            if (recordedRef.current.has(picture.id)) return;
            recordedRef.current.add(picture.id);
            void recordImpression({ imageId: picture.id }).catch(() => recordedRef.current.delete(picture.id));
          }}
        />
      </button>
      {/* Beside the picture's button, not in it, so its taps never open the whole-picture view. Kept mounted in that
          view (only its chip hides), so a painting started from it carries on. */}
      {shown && pictures ? (
        <PictureMenu key={verseId} verseId={verseId} reference={reference} pictures={pictures} shown={shown} chipHidden={wholeIsOpen} />
      ) : null}
      {otherStyle && !wholeIsOpen ? (
        <OtherStyleNote key={`${verseId}:${chosenStyle}`} verseId={verseId} reference={reference} shownStyle={otherStyle} chosenStyle={chosenStyle} />
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
  const word = useMomentWord();

  let body;
  if (paint.painting) {
    body = (
      <div className="w-full space-y-2">
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
        <p className="text-[13px] leading-snug text-white/80 md:text-sm">
          <span className="font-medium text-white">Shown in {artStyleLabel(shownStyle)}.</span>{" "}
          No {chosenLabel} picture of this {word} yet.
        </p>
        <PaintButton paint={paint} label={`Paint in ${chosenLabel}`} className={NOTE_BUTTON} />
      </>
    );
  }

  // The offer fades with the other controls while the reader is idle; progress, a failure or a price to confirm stays.
  const idleOffer = !paint.painting && !generation.error && !generation.priceNotice;
  return (
    <section
      aria-label="Other art style"
      data-fades={idleOffer ? "" : undefined}
      // Above the picture menu's chip on a phone; under the corner name on a computer.
      className="absolute inset-x-3 bottom-14 z-10 flex max-w-sm flex-col items-start gap-2 rounded-2xl border border-white/10 bg-[rgba(12,12,14,0.82)] p-3 text-left shadow-[0_10px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl md:inset-x-auto md:bottom-auto md:left-5 md:top-20 md:gap-2.5 md:p-3.5"
    >
      {body}
    </section>
  );
}
