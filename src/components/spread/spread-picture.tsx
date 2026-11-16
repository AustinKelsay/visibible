"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { useLayer } from "@/components/spread/layers";
import { useEffectiveArtStyle } from "@/context/work-scope-context";

interface SpreadPictureProps {
  verseId: string;
  reference: string;
  /** Called when the reader opens the whole-picture view from the picture. */
  onShowWhole?: (imageId: string) => void;
}

/**
 * The spread's picture: the newest saved picture of the verse in the stored art style, cropped from
 * its centre to cover its frame. A verse without one leaves the frame plain dark.
 *
 * The picture is the button for the whole-picture view: activating it puts the words aside and shows
 * the picture uncropped; activating it again (or Escape) brings the words back.
 */
export function SpreadPicture(props: SpreadPictureProps) {
  const isConvexEnabled = useConvexEnabled();
  return isConvexEnabled ? <SavedPicture {...props} /> : null;
}

function SavedPicture({ verseId, reference, onShowWhole }: SpreadPictureProps) {
  const { artStyle } = useEffectiveArtStyle();
  // The same query and arguments the picture menu will read, so both share one subscription.
  const pictures = useQuery(api.verseImages.getImageHistory, { verseId, artStyle });
  const recordImpression = useMutation(api.verseImages.recordImageImpression);
  const recordedRef = useRef(new Set<string>());
  const button = useRef<HTMLButtonElement>(null);
  const whole = useLayer("whole-picture");
  const picture = pictures?.[0];
  const hasPicture = Boolean(picture?.imageUrl);
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

  if (!picture?.imageUrl) return null;

  return (
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
      {/* Saved pictures come from Convex storage at their full size; there is no resizing service. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={picture.id}
        src={picture.imageUrl}
        alt={`Picture of ${reference}`}
        // Cropped from the centre on the spread; whole, on dark, in the whole-picture view. On a phone the
        // whole picture keeps its own shape above its caption.
        className={wholeIsOpen ? "block h-auto max-h-[58svh] w-full md:absolute md:inset-0 md:h-full md:max-h-none" : "absolute inset-0 h-full w-full"}
        style={{ objectFit: wholeIsOpen ? "contain" : "cover", objectPosition: "center" }}
        onLoad={() => {
          if (recordedRef.current.has(picture.id)) return;
          recordedRef.current.add(picture.id);
          void recordImpression({ imageId: picture.id }).catch(() => recordedRef.current.delete(picture.id));
        }}
      />
    </button>
  );
}
