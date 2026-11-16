"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { useLayer } from "@/components/spread/layers";
import { useEffectiveArtStyle } from "@/context/work-scope-context";
import { UnpaintedPicture } from "@/components/spread/unpainted-picture";
import { PictureMenu } from "@/components/spread/picture-menu";
import { useChosenPicture } from "@/components/spread/chosen-picture";
import { PlayMark } from "@/components/spread/play-mark";

interface SpreadPictureProps {
  verseId: string;
  reference: string;
  /** Called when the reader opens the whole-picture view from the picture. */
  onShowWhole?: (imageId: string) => void;
  /** Whether the whole-picture view is playing this verse's video instead of showing its picture (#447). */
  playing?: boolean;
  /** Called when the reader presses the play mark: the spread opens the whole-picture view and plays. */
  onPlay?: () => void;
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

function SavedPicture({ verseId, reference, onShowWhole, playing = false, onPlay }: SpreadPictureProps) {
  const { artStyle } = useEffectiveArtStyle();
  // The same query and arguments the picture menu will read, so both share one subscription.
  const pictures = useQuery(api.verseImages.getImageHistory, { verseId, artStyle });
  const { chosen } = useChosenPicture();
  // The verse's newest finished video (#447), if any: the play mark shows for it.
  const videos = useQuery(api.verseVideos.getHistory, { verseId, limit: 1 });
  const video = videos?.[0]?.videoUrl ? videos[0] : null;
  const playButton = useRef<HTMLButtonElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  const recordImpression = useMutation(api.verseImages.recordImageImpression);
  const recordedRef = useRef(new Set<string>());
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const whole = useLayer("whole-picture");
  const newest = pictures?.[0];
  const hasPicture = Boolean(newest?.imageUrl);
  const { isOpen: wholeIsOpen, close: closeWhole } = whole;
  const showVideo = playing && wholeIsOpen && video !== null;

  useEffect(() => {
    if (showVideo) player.current?.focus();
  }, [showVideo]);

  // A spread turned to from the whole-picture view opens in it; with no picture to show, the words return.
  useEffect(() => {
    if (wholeIsOpen && pictures !== undefined && !hasPicture) closeWhole();
  }, [wholeIsOpen, pictures, hasPicture, closeWhole]);

  // Leaving the view puts focus on the picture when nothing else holds it (the view was opened on an
  // earlier spread, so there is no opener on this one to return to).
  const wasOpen = useRef(wholeIsOpen);
  const wasPlaying = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !wholeIsOpen) {
      // The play mark was hidden while its video played, so focus could not return to it.
      const target = wasPlaying.current ? playButton.current : button.current;
      queueMicrotask(() => {
        const focused = document.activeElement;
        if (!focused || focused === document.body) target?.focus();
      });
    }
    wasOpen.current = wholeIsOpen;
  }, [wholeIsOpen]);
  useEffect(() => {
    if (wholeIsOpen) wasPlaying.current = showVideo;
  }, [wholeIsOpen, showVideo]);

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
      {showVideo ? (
        <>
          <video
            ref={player}
            key={video.id}
            src={video.videoUrl ?? undefined}
            aria-label={`Video of ${reference}`}
            autoPlay
            muted
            controls
            playsInline
            tabIndex={0}
            className="relative mt-auto block aspect-video w-full shrink-0 bg-black outline-none md:mt-0 md:aspect-auto md:min-h-0 md:flex-1 md:bg-transparent"
          />
          <button
            type="button"
            aria-label="Back to the words"
            onClick={closeWhole}
            className="liquid-glass spread-dock absolute top-6 right-3 z-20 flex h-9 w-9 items-center justify-center rounded-full text-white/90 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:top-8 md:right-8 md:h-11 md:w-11"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </>
      ) : (
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
      )}
      {/* Beside the picture's button, not in it, so its taps never open the whole-picture view. Kept mounted in that
          view (only its chip hides), so a painting started from it carries on. */}
      {video ? (
        <button
          ref={playButton}
          hidden={showVideo}
          type="button"
          aria-label={`Play the video of ${reference}`}
          data-fades
          onClick={() => {
            whole.open(playButton.current);
            onPlay?.();
          }}
          className={`liquid-glass spread-dock absolute right-3 bottom-3 z-20 flex min-h-9 items-center gap-2 rounded-full py-1 pr-3 pl-1 text-[13px] font-medium text-white/90 transition-colors duration-[var(--motion-fast)] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:bottom-8 md:min-h-11 md:pr-4 md:text-sm ${
            wholeIsOpen ? "max-md:hidden md:right-5" : "md:right-[calc(var(--words-page-width)+1.25rem)]"
          }`}
        >
          <PlayMark />
          Play
        </button>
      ) : null}
      <PictureMenu key={verseId} verseId={verseId} reference={reference} pictures={pictures} shown={picture} chipHidden={wholeIsOpen} />
    </>
  );
  /* eslint-enable @next/next/no-img-element */
}
