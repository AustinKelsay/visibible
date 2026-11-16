"use client";

import { useEffect, useState } from "react";
import { Clapperboard, Loader2, RefreshCw } from "lucide-react";
import { useSession } from "@/context/session-context";
import { usePreferences } from "@/context/preferences-context";
import { useVideoGenerations } from "@/lib/use-video-generations";
import { isActiveVideoStatus, type VideoJobResponse } from "@/lib/video-generation";

/** The clip the menu makes: the shortest length at the higher quality, as the old Video tab started with. */
export const MENU_VIDEO = { duration: 5, resolution: "768p" } as const;

/** The reader's newest video job that is still being made, on any verse (one can run at a time). */
export function activeVideoJob(jobs: readonly VideoJobResponse[] | undefined) {
  return jobs?.find((job) => isActiveVideoStatus(job.status)) ?? null;
}

interface MakeVideoProps {
  verseId: string;
  /** The picture on the spread, which the video starts from (#479). */
  imageId: string;
  reference: string;
  /** The reader's own video jobs (`verseVideos.getMyJobs`), or undefined while they load. */
  myJobs: readonly VideoJobResponse[] | undefined;
  className: string;
  onGetCredits: () => void;
  /** Told whether a video of this verse is being made (submitting, or accepted and not yet finished). */
  onMakingChange?: (making: boolean) => void;
}

/**
 * "Make a video" in the picture menu (#447). It keeps the old Video tab's flow: the live quote from
 * `GET /api/generate-video`, the credit rules (admins see no price, a balance that cannot cover the quote is offered
 * credits), one job at a time, and the browser-held request ID that lets an unconfirmed request be checked again
 * without making a second video. It shows nothing while video generation is off.
 */
export function MakeVideo({ verseId, imageId, reference, myJobs, className, onGetCredits, onMakingChange }: MakeVideoProps) {
  const { sid, tier, credits } = useSession();
  const { translation } = usePreferences();
  const generation = useVideoGenerations({ sid, verseId, reference, translation });
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
  if (active?.verseId === verseId) {
    return <Progress text="Making a video… You can leave; the play mark appears on the picture when it is ready." />;
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

  const quote = config.quotes.find((item) => item.duration === MENU_VIDEO.duration && item.resolution === MENU_VIDEO.resolution);
  if (!quote) return null;
  const isAdmin = tier === "admin";
  const notice = failed ? failed.error || "This video could not be made. Your credits were returned." : generation.error;
  return (
    <>
      {notice ? <p role="alert" className="px-3 pt-1.5 text-sm text-reader-alert">{notice}</p> : null}
      {isAdmin || credits >= quote.credits ? (
        <button
          type="button"
          className={className}
          disabled={!generation.ready || myJobs === undefined}
          onClick={() => void generation.generate({ ...MENU_VIDEO, imageId, maxCredits: quote.credits })}
        >
          <Clapperboard aria-hidden="true" className="h-4 w-4 text-ink/(--quiet-60)" />
          <span>
            Make a video
            {isAdmin ? null : <span className="text-ink/(--quiet-55)">{` · about ${quote.credits} ${quote.credits === 1 ? "credit" : "credits"}`}</span>}
          </span>
        </button>
      ) : (
        <button type="button" className={className} onClick={onGetCredits}>
          <Clapperboard aria-hidden="true" className="h-4 w-4 text-ink/(--quiet-60)" />
          Get credits to make a video
        </button>
      )}
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
