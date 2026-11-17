"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery } from "convex/react";
import { RefreshCw } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { useLayer, useLayers } from "@/components/spread/layers";
import { useMomentWord, usePictureStyles } from "@/context/work-scope-context";
import { artStyleLabel } from "@/lib/art-styles";
import { UnpaintedPicture } from "@/components/spread/unpainted-picture";
import { PictureMenu } from "@/components/spread/picture-menu";
import { useChosenPicture } from "@/components/spread/chosen-picture";
import { PaintButton, PaintProgress, PILL, usePaintVerse } from "@/components/spread/paint-verse";
import { PlayMark } from "@/components/spread/play-mark";

interface SpreadPictureProps {
  verseId: string;
  reference: string;
  /** Called when the reader opens the whole-picture view from the picture. */
  onShowWhole?: (imageId: string) => void;
  /** The next verse, for Play on: whether its picture has a video too. */
  nextVerseId?: string;
  /** Called when Play on turns the page at the end of this picture's video; absent where there is no next verse. */
  onPlayOn?: () => void;
  /** Play on turned to this spread: its picture's video starts at once and Play on stays on. */
  arrivesPlaying?: boolean;
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
 *
 * A picture with its own video shows Play, which makes the picture move where it is (#447, #480): the video, whose
 * first frame is the picture, fades in over it in the same crop once it has a frame, and nothing else on the spread
 * moves. Play becomes Pause, and Play again once the clip ends on its last frame. While it plays and the next verse's
 * picture has a video too, Play on offers to carry on into it when the clip ends.
 */
export function SpreadPicture(props: SpreadPictureProps) {
  const isConvexEnabled = useConvexEnabled();
  return isConvexEnabled ? <SavedPicture {...props} /> : null;
}

// On the spread a picture fills its frame. In the whole-picture view it fills the window on a computer;
// on a phone it keeps its own shape (in the page flow) above its caption.
const FILL = "absolute inset-0 h-full w-full";
const WHOLE_IN_FLOW = "block h-auto max-h-[58svh] w-full md:absolute md:inset-0 md:h-full md:max-h-none";

/** Where a pressed video is: waiting for its first frame, moving, paused, or held on its last frame. */
type Phase = "loading" | "playing" | "paused" | "ended";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia?.(REDUCED_MOTION);
  query?.addEventListener?.("change", onChange);
  return () => query?.removeEventListener?.("change", onChange);
}
/** Whether the reader asked for less motion; Play on, which turns pages by itself, is not offered then. */
function useReducedMotion() {
  return useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia?.(REDUCED_MOTION).matches ?? false, () => false);
}

function SavedPicture({ verseId, reference, onShowWhole, nextVerseId, onPlayOn, arrivesPlaying = false }: SpreadPictureProps) {
  const { chosen: chosenStyle, order } = usePictureStyles();
  // The picture rule. The next spread's prefetch reads the same query with the same arguments (prefetch-next.tsx).
  const rulePicture = useQuery(api.verseImages.getSpreadPicture, { verseId, styles: order });
  const otherStyle = rulePicture && rulePicture.artStyle !== chosenStyle ? rulePicture.artStyle : null;
  // The verse's pictures in the chosen style, newest first: the picture menu's own list (empty when the rule fell back).
  const pictures = useQuery(api.verseImages.getImageHistory, rulePicture ? { verseId, artStyle: chosenStyle } : "skip");
  // The full record of a picture shown from another style, for the picture menu's details.
  const otherStylePictures = useQuery(api.verseImages.getImageHistory, otherStyle ? { verseId, artStyle: otherStyle } : "skip");
  const { chosen } = useChosenPicture();
  // The picture on screen (a version chosen in the picture menu, else the rule's) and its own newest finished video
  // (#480): Play shows only for that. An unpainted verse has neither.
  const shownPicture = rulePicture?.imageUrl ? chosen ?? rulePicture : null;
  const pictureVideo = useQuery(api.verseVideos.getPictureVideo, shownPicture ? { imageId: shownPicture.id } : "skip");
  const video = shownPicture && pictureVideo?.videoUrl ? pictureVideo : null;
  const playButton = useRef<HTMLButtonElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  const recordImpression = useMutation(api.verseImages.recordImageImpression);
  const recordedRef = useRef(new Set<string>());
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const whole = useLayer("whole-picture");
  const { openLayer } = useLayers();
  const hasPicture = Boolean(rulePicture?.imageUrl);
  const { isOpen: wholeIsOpen, close: closeWhole } = whole;
  const reducedMotion = useReducedMotion();

  // The pressed video, tied to its id: choosing another version or style (another video, or none) ends it.
  const [playback, setPlayback] = useState<{ videoId: string; phase: Phase } | null>(null);
  const phase = video && playback?.videoId === video.id ? playback.phase : null;
  const setPhase = (next: Phase) => setPlayback(video ? { videoId: video.id, phase: next } : null);
  const [playOn, setPlayOn] = useState(arrivesPlaying);
  // Arriving by Play on starts the picture's video as soon as it is known; a verse without one ends the run.
  const [arrivalPending, setArrivalPending] = useState(arrivesPlaying);
  if (arrivalPending && rulePicture !== undefined && (!shownPicture || pictureVideo !== undefined)) {
    setArrivalPending(false);
    if (video) setPlayback({ videoId: video.id, phase: "loading" });
    else setPlayOn(false);
  }
  const stop = () => {
    setPlayback(null);
    setPlayOn(false);
  };

  // Play on: offered while a video is pressed and the next verse's picture (by the same rule) has a video too.
  const offersPlayOn = phase !== null && !reducedMotion && Boolean(nextVerseId && onPlayOn);
  const nextPicture = useQuery(api.verseImages.getSpreadPicture, offersPlayOn && nextVerseId ? { verseId: nextVerseId, styles: order } : "skip");
  const nextVideo = useQuery(api.verseVideos.getPictureVideo, offersPlayOn && nextPicture?.imageUrl ? { imageId: nextPicture.id } : "skip");
  const nextVideoUrl = offersPlayOn && nextPicture?.imageUrl ? nextVideo?.videoUrl ?? null : null;
  const continues = playOn && nextVideoUrl !== null;

  // A pressed video starts from its first frame; a refusal (a phone saving power) leaves the picture and Play.
  useEffect(() => {
    if (phase !== "loading") return;
    const element = player.current;
    if (!element || !element.paused) return;
    element.play()?.catch(() => setPlayback(null));
  }, [phase]);

  // Escape stops the video and brings the picture back, when no layer is open to take it first.
  useEffect(() => {
    if (phase === null || openLayer !== null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      setPlayback(null);
      setPlayOn(false);
      playButton.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [phase, openLayer]);

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

  // The clip is the picture's centre cropped a little narrower at the same height (Hailuo makes 1344x768 from a
  // 1376x768 picture). The video is drawn at the picture's own scale and centred like it, in whichever fit the frame
  // uses, so the painting starts to move without a jump; where the clip has no pixels the picture stays.
  const [videoSize, setVideoSize] = useState<{ width: number; height: number } | null>(null);
  const [pictureSize, setPictureSize] = useState<{ width: number; height: number } | null>(null);
  const [frame, setFrame] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const element = button.current;
    if (phase === null || !element) return;
    const measure = () => setFrame({ width: element.clientWidth, height: element.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [phase, wholeIsOpen]);

  const onPress = () => {
    if (!video) return;
    const element = player.current;
    if (phase === null) setPhase("loading");
    else if (phase === "loading") stop();
    else if (phase === "playing") element?.pause();
    else if (phase === "paused") element?.play()?.catch(() => undefined);
    else if (element) {
      element.currentTime = 0;
      element.play()?.catch(() => undefined);
    }
  };

  const action = phase === "playing" ? "Pause" : phase === "ended" ? "Play again" : "Play";
  const playLabel = phase === "playing"
    ? `Pause the video of ${reference}`
    : phase === "ended" ? `Play the video of ${reference} again` : `Play the video of ${reference}`;
  // Kept up when the computer's controls fade, so a reader passing by still sees the picture moves; in the
  // whole-picture view it sits at the window's corner on a computer and is not offered on a phone.
  const playControls = video ? (
    <div
      className={`absolute right-3 bottom-3 z-20 flex items-center gap-2 md:bottom-8 ${
        wholeIsOpen ? "max-md:hidden md:right-5" : "md:right-[calc(var(--words-page-width)+1.25rem)]"
      }`}
    >
      {offersPlayOn && nextVideoUrl ? (
        <button
          type="button"
          aria-pressed={playOn}
          aria-label="Play on into the next verse's video"
          onClick={() => {
            const on = !playOn;
            setPlayOn(on);
            // A clip already held on its last frame carries on at once.
            if (on && phase === "ended") onPlayOn?.();
          }}
          className={`liquid-glass spread-dock flex min-h-9 items-center rounded-full px-3 text-[13px] font-medium transition-colors duration-[var(--motion-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink md:min-h-11 md:px-4 md:text-sm ${
            playOn ? "text-ink" : "text-ink/70 hover:text-ink"
          }`}
        >
          <span aria-hidden="true" className={`mr-2 h-1.5 w-1.5 rounded-full ${playOn ? "bg-ink" : "bg-ink/35"}`} />
          Play on
        </button>
      ) : null}
      <button
        ref={playButton}
        type="button"
        aria-label={playLabel}
        onClick={onPress}
        className="liquid-glass spread-dock flex min-h-9 items-center gap-2 rounded-full py-1 pr-3 pl-1 text-[13px] font-medium text-ink/90 transition-colors duration-[var(--motion-fast)] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink md:min-h-11 md:pr-4 md:text-sm"
      >
        <PlayMark glyph={phase === "playing" ? "pause" : phase === "ended" ? "again" : "play"} loading={phase === "loading"} />
        {action}
      </button>
      {/* Play on carried the reader into this verse: say so, without taking focus. */}
      {arrivesPlaying ? <span role="status" className="sr-only">Playing on: {reference}</span> : null}
    </div>
  ) : null;

  if (rulePicture === undefined) return null;
  // An unpainted verse offers painting first: no Play and no video (#480).
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
  const placement = videoPlacement({ frame, pictureSize, videoSize, cover: !wholeIsOpen, wordsPageCovers: !wholeIsOpen });

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
          onLoad={(event) => {
            setLoadedId(picture.id);
            const { naturalWidth, naturalHeight } = event.currentTarget;
            if (naturalWidth && naturalHeight) setPictureSize({ width: naturalWidth, height: naturalHeight });
            if (recordedRef.current.has(picture.id)) return;
            recordedRef.current.add(picture.id);
            void recordImpression({ imageId: picture.id }).catch(() => recordedRef.current.delete(picture.id));
          }}
        />
        {video && phase !== null ? (
          // The picture moving in its own place: hidden until its first frame, then faded in over the picture, which
          // it starts from. On a computer's spread it stops at the words page, so the glass over it stays still.
          <video
            ref={player}
            key={video.id}
            src={video.videoUrl ?? undefined}
            data-picture-video
            muted
            playsInline
            preload="auto"
            disablePictureInPicture
            aria-hidden="true"
            tabIndex={-1}
            onLoadedMetadata={(event) => {
              const { videoWidth, videoHeight } = event.currentTarget;
              if (videoWidth && videoHeight) setVideoSize({ width: videoWidth, height: videoHeight });
            }}
            onPlaying={() => setPhase("playing")}
            onPause={(event) => {
              if (!event.currentTarget.ended) setPhase("paused");
            }}
            onEnded={() => {
              setPhase("ended");
              if (continues) onPlayOn?.();
            }}
            onError={() => setPlayback(null)}
            className={`pointer-events-none absolute transition-opacity duration-300 motion-reduce:transition-none ${
              phase === "loading" ? "opacity-0" : "opacity-100"
            } ${placement ? "" : FILL}`}
            style={placement ?? fit}
          />
        ) : null}
      </button>
      {playControls}
      {/* Play on fetches the next clip ahead, so the next verse starts to move without a wait. */}
      {continues && nextVideoUrl ? <video src={nextVideoUrl} preload="auto" muted aria-hidden="true" tabIndex={-1} className="hidden" /> : null}
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

interface Size {
  width: number;
  height: number;
}

/**
 * Where the picture's video goes in the picture's frame: at the scale the picture is drawn (covering the frame on the
 * spread, whole within it in the whole-picture view) and centred like it, so each of its pixels lands on the picture's.
 * On a computer's spread it stops at the words page, so the glass over the picture is not redrawn for every frame.
 * Null until the frame and both sizes are known; the video then simply fills the frame like the picture.
 */
function videoPlacement({ frame, pictureSize, videoSize, cover, wordsPageCovers }: {
  frame: Size | null;
  pictureSize: Size | null;
  videoSize: Size | null;
  cover: boolean;
  wordsPageCovers: boolean;
}): React.CSSProperties | null {
  if (!frame?.width || !frame.height || !pictureSize || !videoSize) return null;
  const fitScale = cover ? Math.max : Math.min;
  const scale = fitScale(frame.width / pictureSize.width, frame.height / pictureSize.height);
  const width = videoSize.width * scale;
  const height = videoSize.height * scale;
  const left = (frame.width - width) / 2;
  const top = (frame.height - height) / 2;
  const style: React.CSSProperties = { left, top, width, height, maxWidth: "none", objectFit: "fill" };
  if (wordsPageCovers && typeof window !== "undefined" && window.matchMedia?.("(min-width: 768px)").matches) {
    // The words page is min(40vw, 600px) wide at the frame's right edge.
    const wordsPage = Math.min(window.innerWidth * 0.4, 600);
    const hidden = left + width - (frame.width - wordsPage);
    if (hidden > 0) style.clipPath = `inset(0 ${hidden}px 0 0)`;
  }
  return style;
}

const NOTE_BUTTON = `${PILL} min-h-[40px] px-4 bg-ink text-paper hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60`;

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
        <p className="text-sm text-ink/90">Painting {reference} in {chosenLabel}…</p>
        <PaintProgress paint={paint} reference={reference} />
      </div>
    );
  } else if (generation.error) {
    body = (
      <>
        <p role="alert" className="text-sm text-reader-alert">{generation.error}</p>
        <button type="button" className={NOTE_BUTTON} onClick={() => generation.generate("spread_retry")}>
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          Try again
        </button>
      </>
    );
  } else if (generation.priceNotice) {
    body = (
      <>
        <p role="status" className="text-sm text-ink/85">{generation.priceNotice}</p>
        <button type="button" className={NOTE_BUTTON} onClick={() => generation.generate("spread_paint")}>
          Paint at this price
        </button>
      </>
    );
  } else {
    body = (
      <>
        <p className="text-[13px] leading-snug text-ink/80 md:text-sm">
          <span className="font-medium text-ink">Shown in {artStyleLabel(shownStyle)}.</span>{" "}
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
      className="absolute inset-x-3 bottom-14 z-10 flex max-w-sm flex-col items-start gap-2 rounded-2xl border border-ink/10 bg-reader-page-glass p-3 text-left shadow-[0_10px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl md:inset-x-auto md:bottom-auto md:left-5 md:top-20 md:gap-2.5 md:p-3.5"
    >
      {body}
    </section>
  );
}
