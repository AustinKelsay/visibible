"use client";

import { useEffect, useState } from "react";
import { Clapperboard, Loader2, RefreshCw } from "lucide-react";
import type { ChosenPicture } from "@/components/spread/chosen-picture";
import { useSession } from "@/context/session-context";
import { usePreferences } from "@/context/preferences-context";
import { artStyleLabel } from "@/lib/art-styles";
import { previewSource } from "@/lib/picture-source";
import { useVideoGenerations } from "@/lib/use-video-generations";
import { isActiveVideoStatus, isVideoFrame, type VideoJobResponse } from "@/lib/video-generation";

/** The clip the menu makes: the shortest length at the higher quality, as the old Video tab started with. */
export const MENU_VIDEO = { duration: 5, resolution: "768p" } as const;

/** The reader's newest video job that is still being made, on any verse (one can run at a time). */
export function activeVideoJob(jobs: readonly VideoJobResponse[] | undefined) {
  return jobs?.find((job) => isActiveVideoStatus(job.status)) ?? null;
}

interface MakeVideoProps {
  verseId: string;
  reference: string;
  /** The picture on the spread, which the video starts from (#479). */
  picture: ChosenPicture;
  /** Whether that picture already has a finished video, or undefined while that is read. */
  pictureHasVideo: boolean | undefined;
  /** The reader's own video jobs (`verseVideos.getMyJobs`), or undefined while they load. */
  myJobs: readonly VideoJobResponse[] | undefined;
  className: string;
  onGetCredits: () => void;
  /** Told whether a video of this verse is being made (submitting, or accepted and not yet finished). */
  onMakingChange?: (making: boolean) => void;
}

const CHOICE = "inline-flex min-h-11 items-center justify-center rounded-full px-4 py-1.5 text-center text-sm leading-tight font-medium transition-colors duration-[var(--motion-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60";

/**
 * "Make this picture move…" in the picture menu (#447, #480). The row opens a short review of the picture the video
 * starts from: its thumbnail, "<Style> · 5 seconds · starts from this picture", a note that the video joins the shared
 * library, "Not now", and "Make the video · N credits", which authorises exactly that price. It keeps the old Video
 * tab's flow: the live quote from `GET /api/generate-video`, the credit rules (admins see no price, a balance that
 * cannot cover the quote turns the confirm into "Get credits · needs N credits"), one job at a time, and the browser-held request ID that lets an
 * unconfirmed request be checked again without making a second video.
 *
 * It shows nothing while video generation is off, for a picture that is not 16:9, or for a picture that already has a
 * finished video; a video of the picture being made shows as progress instead.
 */
export function MakeVideo({ verseId, reference, picture, pictureHasVideo, myJobs, className, onGetCredits, onMakingChange }: MakeVideoProps) {
  const { sid, tier, credits } = useSession();
  const { translation } = usePreferences();
  const generation = useVideoGenerations({ sid, verseId, reference, translation });
  const [reviewing, setReviewing] = useState(false);
  const accepted = generation.accepted;
  // The server's view of the reader's jobs wins; a just-accepted job counts until it appears there.
  const active =
    activeVideoJob(myJobs) ??
    (accepted && isActiveVideoStatus(accepted.status) && !myJobs?.some((job) => job.id === accepted.id) ? accepted : null);
  // A job watched while it was being made on this verse reports its failure here.
  const [watchedId, setWatchedId] = useState<string | null>(null);
  if (active && active.verseId === verseId && active.id !== watchedId) setWatchedId(active.id);
  const failed = myJobs?.find((job) => job.id === watchedId && job.status === "failed") ?? null;
  const making = generation.submitting || active?.verseId === verseId;
  useEffect(() => onMakingChange?.(making), [making, onMakingChange]);
  // A review left open on one version closes when another is chosen.
  const [reviewedId, setReviewedId] = useState(picture.id);
  if (reviewedId !== picture.id) {
    setReviewedId(picture.id);
    setReviewing(false);
  }

  const { config } = generation;
  if (config?.error) {
    return (
      <div className="px-3 py-1.5">
        <p role="alert" className="pb-1 text-sm text-ink/(--quiet-55)">{config.error}</p>
        <button type="button" className={`${className} -mx-3 w-[calc(100%+1.5rem)]`} onClick={generation.refreshConfiguration}>
          <RefreshCw aria-hidden="true" className="h-4 w-4 text-ink/(--quiet-60)" />
          Reload video pricing
        </button>
      </div>
    );
  }
  if (!config?.enabled || !sid) return null;

  if (generation.submitting) return <Progress text="Starting your video…" />;
  if (active && (active.sourceImageId === picture.id || (active.sourceImageId === undefined && active.verseId === verseId))) {
    return <Progress text="Making this picture move… You can leave; Play appears on the picture when it is ready." />;
  }
  if (active) {
    return (
      <p role="status" className="px-3 py-2.5 text-sm text-ink/(--quiet-55)">
        Your video of {active.reference} is still being made. You can make another when it finishes.
      </p>
    );
  }
  if (generation.request) {
    return (
      <div className="px-3 py-1.5">
        <p className="pb-1 text-sm text-ink/(--quiet-55)">
          {generation.error ?? "Your last video request was not confirmed."} Checking it again will not make a second video.
        </p>
        <button type="button" className={`${className} -mx-3 w-[calc(100%+1.5rem)]`} disabled={!generation.ready} onClick={() => void generation.retrySubmission()}>
          <RefreshCw aria-hidden="true" className="h-4 w-4 text-ink/(--quiet-60)" />
          Check the video request again
        </button>
      </div>
    );
  }
  // Only a 16:9 picture without a video of its own can start one.
  if (pictureHasVideo !== false || !isVideoFrame(picture)) return null;

  const quote = config.quotes.find((item) => item.duration === MENU_VIDEO.duration && item.resolution === MENU_VIDEO.resolution);
  if (!quote) return null;
  const isAdmin = tier === "admin";
  const price = `${quote.credits} ${quote.credits === 1 ? "credit" : "credits"}`;
  const short = !isAdmin && credits < quote.credits;
  const style = artStyleLabel(picture.artStyle);
  const notice = failed ? failed.error || "This video could not be made. Your credits were returned." : generation.error;
  const thumbnail = previewSource(picture);
  return (
    <>
      {notice ? <p role="alert" className="px-3 pt-1.5 text-sm text-reader-alert">{notice}</p> : null}
      <button type="button" className={className} aria-expanded={reviewing} onClick={() => setReviewing((open) => !open)}>
        <Clapperboard aria-hidden="true" className="h-4 w-4 text-ink/(--quiet-60)" />
        Make this picture move…
      </button>
      {reviewing ? (
        <div role="group" aria-label="Make this picture move" className="mx-1 mb-1.5 rounded-xl border border-ink/10 bg-ink/5 p-3">
          <div className="flex items-start gap-3">
            {/* Thumbnails come from Convex storage; there is no resizing service. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {thumbnail ? <img src={thumbnail} alt="" className="aspect-video w-20 shrink-0 rounded-md object-cover" /> : null}
            <div className="min-w-0">
              <p className="text-[15px] font-medium text-ink">Make this picture move</p>
              <p className="mt-0.5 text-[13px] leading-snug text-ink/(--quiet-60)">{style} · {MENU_VIDEO.duration} seconds · starts from this picture</p>
            </div>
          </div>
          <p className="mt-2.5 text-[13px] leading-snug text-ink/(--quiet-60)">
            The video is added to the shared library: anyone reading {reference} in {style} can watch it.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button type="button" className={`${CHOICE} shrink-0 text-ink/85 hover:bg-ink/10`} onClick={() => setReviewing(false)}>
              Not now
            </button>
            <button
              type="button"
              className={`${CHOICE} min-w-0 flex-1 bg-ink text-paper hover:bg-ink/90`}
              disabled={!short && (!generation.ready || myJobs === undefined)}
              onClick={() => {
                if (short) {
                  onGetCredits();
                  return;
                }
                void generation.generate({ ...MENU_VIDEO, imageId: picture.id, maxCredits: quote.credits });
              }}
            >
              {/* The action, then its price on a line of its own (read as one name: "Make the video · 50 credits"). */}
              <span className="flex flex-col items-center">
                <span>{short ? "Get credits" : "Make the video"}</span>
                {isAdmin ? null : (
                  <span className="text-xs font-normal opacity-70">
                    <span className="sr-only"> · </span>
                    {short ? `needs ${price}` : price}
                  </span>
                )}
              </span>
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Progress({ text }: { text: string }) {
  return (
    <p role="status" className="flex items-start gap-3 px-3 py-2.5 text-sm text-ink/85">
      <Loader2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ink/(--quiet-60) motion-safe:animate-spin" />
      <span>{text}</span>
    </p>
  );
}
