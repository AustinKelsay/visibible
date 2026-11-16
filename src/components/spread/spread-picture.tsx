"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { useLayer } from "@/components/spread/layers";
import { useEffectiveArtStyle } from "@/context/work-scope-context";
import { UnpaintedPicture } from "@/components/spread/unpainted-picture";
import { PictureMenu } from "@/components/spread/picture-menu";
import { useChosenPicture } from "@/components/spread/chosen-picture";

interface SpreadPictureProps {
  verseId: string;
  reference: string;
  /** Called when the reader opens the whole-picture view from the picture. */
  onShowWhole?: (imageId: string) => void;
}

/**
 * The spread's picture: the newest saved picture of the verse in the stored art style, cropped from
 * its centre to cover its frame. Its thumbnail shows first and the full picture replaces it once
 * loaded. The picture menu's chip sits on it; a version chosen there shows instead until the page turns. A verse
 * without one is unpainted: it glows with an earlier picture and offers to paint
 * it. While the verse's pictures load the frame stays plain dark.
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
  const { artStyle } = useEffectiveArtStyle();
  // The same query and arguments the picture menu will read, so both share one subscription.
  const pictures = useQuery(api.verseImages.getImageHistory, { verseId, artStyle });
  const { chosen } = useChosenPicture();
  const recordImpression = useMutation(api.verseImages.recordImageImpression);
  const recordedRef = useRef(new Set<string>());
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const whole = useLayer("whole-picture");
  const newest = pictures?.[0];
  const hasPicture = Boolean(newest?.imageUrl);
  const { isOpen: wholeIsOpen, close: closeWhole } = whole;

  // A spread turned to from the whole-picture view opens in it; with no picture to show, the words return.
  useEffect(() => {
    if (wholeIsOpen && pictures !== undefined && !hasPicture) closeWhole();
  }, [wholeIsOpen, pictures, hasPicture, closeWhole]);

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

  if (pictures === undefined) return null;
  if (!newest?.imageUrl) return <UnpaintedPicture key={verseId} verseId={verseId} reference={reference} artStyle={artStyle} />;
  const picture = chosen ?? newest;
  const showThumbnail = Boolean(picture.thumbnailUrl) && loadedId !== picture.id;
  // Cropped from the centre on the spread; whole, on dark, in the whole-picture view.
  const fit = { objectFit: wholeIsOpen ? "contain" : "cover", objectPosition: "center" } as const;
  // While the thumbnail stands in, it holds the picture's place in the phone's whole-picture flow.
  const thumbnailClass = wholeIsOpen ? WHOLE_IN_FLOW : FILL;
  const pictureClass = wholeIsOpen && !showThumbnail ? WHOLE_IN_FLOW : FILL;

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
      <PictureMenu key={verseId} verseId={verseId} reference={reference} pictures={pictures} shown={picture} chipHidden={wholeIsOpen} />
    </>
  );
  /* eslint-enable @next/next/no-img-element */
}
