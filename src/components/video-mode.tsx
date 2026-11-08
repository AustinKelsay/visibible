"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import {
  Film,
  Loader2,
  Play,
  Sparkles,
  ExternalLink,
  Globe2,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { useSession } from "@/context/session-context";
import { usePreferences } from "@/context/preferences-context";
import { useVideoGenerations } from "@/lib/use-video-generations";
import {
  VIDEO_MODEL_NAME,
  isActiveVideoStatus,
  type VideoDuration,
  type VideoResolution,
  type VideoJobResponse,
} from "@/lib/video-generation";

interface VideoModeProps {
  verseId: string;
  reference: string;
  verseText: string;
  prevUrl?: string;
  nextUrl?: string;
}

const statusLabels = {
  queued: "Your video is queued",
  submitting: "Starting your scene…",
  processing: "Bringing the verse to life…",
  storing: "Saving your video…",
  completed: "Ready to watch",
  failed: "This video could not be completed",
};

export function VideoMode(props: VideoModeProps) {
  const convexEnabled = useConvexEnabled();
  const { sid } = useSession();
  const { translation } = usePreferences();
  if (!convexEnabled)
    return (
      <p className="p-8 text-center text-[var(--muted)]">
        Video is temporarily unavailable.
      </p>
    );
  return (
    <VideoWorkspace
      key={`${sid}:${props.verseId}:${translation}`}
      {...props}
      sid={sid}
      translation={translation}
    />
  );
}

function VideoWorkspace({
  verseId,
  reference,
  verseText,
  prevUrl,
  nextUrl,
  sid,
  translation,
}: VideoModeProps & {
  sid: string | null;
  translation: string;
}) {
  const {
    credits,
    tier,
    buyCredits,
    isLoading,
    error: sessionError,
  } = useSession();
  const publicHistory = useQuery(api.verseVideos.getHistory, {
    verseId,
    limit: 50,
  });
  const myJobs = useQuery(api.verseVideos.getMyJobs, sid ? {} : "skip");
  const generation = useVideoGenerations({
    sid,
    verseId,
    reference,
    translation,
  });
  const [duration, setDuration] = useState<VideoDuration>(5);
  const [resolution, setResolution] = useState<VideoResolution>("768p");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(8);
  const [playbackErrorId, setPlaybackErrorId] = useState<string | null>(null);

  const combined = new Map<string, VideoJobResponse>();
  if (generation.accepted)
    combined.set(generation.accepted.id, generation.accepted);
  for (const job of myJobs ?? [])
    if (job.verseId === verseId) combined.set(job.id, job);
  for (const video of publicHistory ?? []) combined.set(video.id, video);
  const history = [...combined.values()].sort(
    (a, b) => b.createdAt - a.createdAt,
  );
  const active =
    myJobs?.find((job) => isActiveVideoStatus(job.status)) ??
    history.find((job) => isActiveVideoStatus(job.status));
  const selected = history.find((job) => job.id === selectedId) ?? history[0];
  const displayedDuration = generation.request?.duration ?? duration;
  const displayedResolution = generation.request?.resolution ?? resolution;
  const quote = generation.config?.quotes.find(
    (item) => item.duration === displayedDuration && item.resolution === displayedResolution,
  );
  const maximumCredits = generation.request?.maxCredits ?? quote?.credits;
  const pricingError = generation.configError || generation.config?.error;
  // A failed quote also reports enabled: false; only call generation off when pricing did not fail.
  const generationOff = Boolean(generation.config && !generation.config.enabled && !pricingError);
  // Keep the form (with "Check previous request" and errors) while a request is outstanding.
  const hideForm = generationOff && !generation.request && !generation.error;
  const busy = generation.submitting || Boolean(active);
  const canAfford =
    tier === "admin" || (maximumCredits !== undefined && credits >= maximumCredits);
  const configured = generation.config?.enabled && Boolean(quote);
  const checking =
    isLoading || !generation.ready || (Boolean(sid) && myJobs === undefined);
  // With generation off and no videos, the stage alone says so; skip the empty list below it.
  const emptyAndOff = generationOff && !selected && publicHistory !== undefined && !history.length;
  const inputClass =
    "w-full rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--background)] p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-60";

  return (
    <section
      className="max-w-6xl mx-auto w-full px-4 md:px-6 py-6 sm:py-8 space-y-6"
      aria-label="Verse videos"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 mb-2 text-xs tracking-widest text-[var(--muted)]">
            <Film size={14} aria-hidden="true" /> SCRIPTURE IN MOTION
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">{reference}</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
            {verseText}
          </p>
        </div>
        <nav
          className="hidden sm:flex gap-2"
          aria-label="Video verse navigation"
        >
          {prevUrl && (
            <Link
              href={`${prevUrl}?view=video`}
              aria-label="Previous verse"
              className="min-h-11 px-4 flex items-center gap-1.5 rounded-full border border-[var(--divider)] text-sm hover:bg-[var(--surface)]"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Previous verse
            </Link>
          )}
          {nextUrl && (
            <Link
              href={`${nextUrl}?view=video`}
              aria-label="Next verse"
              className="min-h-11 px-4 flex items-center gap-1.5 rounded-full border border-[var(--divider)] text-sm hover:bg-[var(--surface)]"
            >
              Next verse
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          )}
        </nav>
      </div>

      <div className={hideForm ? "grid gap-6" : "grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,1fr)]"}>
        <div className="space-y-3">
          <div className={`relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--divider)] bg-[var(--surface)] flex items-center justify-center ${
            generationOff && !(selected?.status === "completed" && selected.videoUrl) ? "min-h-56 py-10" : "aspect-video"
          }`}>
            {selected?.status === "completed" && selected.videoUrl ? (
              <video
                key={selected.id}
                className="h-full w-full"
                controls
                muted
                playsInline
                preload="metadata"
                src={selected.videoUrl}
                onError={() => setPlaybackErrorId(selected.id)}
                onLoadedData={() => setPlaybackErrorId(null)}
                aria-label={`Generated video for ${reference}`}
              />
            ) : (
              <div className="max-w-sm p-6 text-center" role="status">
                {(selected && isActiveVideoStatus(selected.status)) ||
                generation.submitting ? (
                  <Loader2
                    className="mx-auto mb-4 animate-spin text-[var(--accent)]"
                    size={30}
                    aria-hidden="true"
                  />
                ) : generationOff ? (
                  <Film
                    className="mx-auto mb-4 text-[var(--muted)]"
                    size={30}
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                ) : (
                  <Play
                    className="mx-auto mb-4 text-[var(--accent)]"
                    size={30}
                    aria-hidden="true"
                  />
                )}
                <p className="font-medium">
                  {generation.submitting
                    ? "Starting your video…"
                    : selected
                      ? statusLabels[selected.status]
                      : generationOff
                        ? "No video for this verse yet"
                        : "Bring this verse to life"}
                </p>
                <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">
                  {selected?.status === "failed"
                    ? selected.error ||
                      "Your reserved credits have been returned. You can try a new generation."
                    : selected && isActiveVideoStatus(selected.status)
                      ? "You can leave this page. Your video will keep generating and appear here when ready."
                      : generationOff
                        ? emptyAndOff
                          ? "Video generation is off right now. Videos others make for this verse will appear here."
                          : "Video generation is off right now. Videos others have made appear below."
                        : "A short cinematic scene, generated directly from this verse and its surrounding context."}
                </p>
              </div>
            )}
          </div>
          {selected?.status === "completed" && selected.videoUrl && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
              <span>
                {selected.duration}s · {selected.resolution} · 16:9 · Sound off
                by default
              </span>
              <a
                href={selected.videoUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 min-h-10 text-[var(--accent)]"
              >
                Open / save video <ExternalLink size={13} aria-hidden="true" />
              </a>
            </div>
          )}
          {selected && playbackErrorId === selected.id && (
            <p role="alert" className="text-sm text-[var(--muted)]">
              This video could not load. Try opening it using the link above, or
              reload the page.
            </p>
          )}
          {active && active.verseId !== verseId && (
            <p
              role="status"
              className="rounded-[var(--radius-md)] border border-[var(--divider)] p-3 text-sm text-[var(--muted)]"
            >
              Your video for {active.reference} is still generating. You can
              start another when it finishes.
            </p>
          )}
        </div>

        {!hideForm && (
        <form
          className="space-y-4 rounded-[var(--radius-lg)] border border-[var(--divider)] p-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!quote || busy || !configured || !canAfford || checking) return;
            setSelectedId(null);
            void generation.generate({
              duration,
              resolution,
              maxCredits: quote.credits,
            });
          }}
        >
          <div>
            <h3 className="font-medium">Create a video</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {VIDEO_MODEL_NAME} · Widescreen 16:9
            </p>
          </div>
          {generation.config && !generation.config.enabled && !pricingError && (
            <p className="rounded-[var(--radius-md)] border border-[var(--divider)] px-3 py-2 text-sm text-[var(--muted)]">
              Video generation is not currently enabled. You can still watch videos others have made.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="video-duration"
                className="block text-sm font-medium mb-2"
              >
                Length
              </label>
              <div className="relative">
              <select
                id="video-duration"
                className={`${inputClass} appearance-none pr-9`}
                value={displayedDuration}
                onChange={(event) =>
                  setDuration(event.target.value === "10" ? 10 : 5)
                }
                disabled={busy || Boolean(generation.request)}
              >
                <option value={5}>5 seconds</option>
                <option value={10}>10 seconds</option>
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" aria-hidden="true" />
              </div>
            </div>
            <div>
              <label
                htmlFor="video-resolution"
                className="block text-sm font-medium mb-2"
              >
                Quality
              </label>
              <div className="relative">
              <select
                id="video-resolution"
                className={`${inputClass} appearance-none pr-9`}
                value={displayedResolution}
                onChange={(event) =>
                  setResolution(event.target.value === "480p" ? "480p" : "768p")
                }
                disabled={busy || Boolean(generation.request)}
              >
                <option value="480p">Standard · 480p</option>
                <option value="768p">High · 768p</option>
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" aria-hidden="true" />
              </div>
            </div>
          </div>
          <div className="rounded-[var(--radius-md)] bg-[var(--surface)] p-3 text-sm">
            <div className="flex justify-between gap-3">
              <span>
                {tier === "admin" ? "Admin generation" : "Maximum cost"}
              </span>
              <strong>{maximumCredits !== undefined ? `${maximumCredits} credits` : "—"}</strong>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
              {tier === "admin"
                ? "Usage is recorded without charging your wallet."
                : "Reserved when you start. Failed generations are refunded; any unused credits are returned."}
            </p>
          </div>
          <p className="flex items-start gap-2 text-xs leading-relaxed text-[var(--muted)]">
            <Globe2 className="shrink-0 mt-0.5" size={14} aria-hidden="true" />
            Every completed video is saved and shared publicly on this verse.
          </p>
          {generation.request ? (
            <button
              type="button"
              onClick={() => void generation.retrySubmission()}
              // While generation is off the server rejects the retry, which would drop the saved request ID.
              disabled={generation.submitting || checking || generationOff}
              className="w-full min-h-12 rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--accent-text)] font-medium text-sm disabled:opacity-50"
            >
              {generation.submitting
                ? "Checking request…"
                : "Check previous request"}
            </button>
          ) : (
            <button
              type="submit"
              disabled={!configured || !sid || checking || busy || !canAfford}
              className="w-full min-h-12 rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--accent-text)] font-medium text-sm flex items-center justify-center gap-2 hover:bg-[var(--accent-hover)] disabled:bg-[var(--surface)] disabled:text-[var(--muted)] disabled:border disabled:border-[var(--divider)] disabled:cursor-not-allowed"
            >
              {busy || checking ? (
                <Loader2
                  size={16}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Sparkles size={16} aria-hidden="true" />
              )}
              {checking
                ? "Connecting…"
                : busy
                  ? "Generation in progress"
                  : "Generate video"}
            </button>
          )}
          {generation.request && (
            <p className="text-xs text-[var(--muted)]">
              {generationOff
                ? "Video generation is off. Your earlier request is kept and can be checked once it is back on."
                : "This checks the same request and will not create a duplicate video."}
              {generationOff ? (
                <button
                  type="button"
                  onClick={generation.refreshConfiguration}
                  className="ml-1 font-medium text-[var(--accent)] hover:underline"
                >
                  Check again
                </button>
              ) : null}
            </p>
          )}
          {sid && quote && !canAfford && !busy && (
            <button
              type="button"
              onClick={buyCredits}
              className="w-full min-h-10 text-sm font-medium text-[var(--accent)]"
            >
              Add credits · {credits} available
            </button>
          )}
          {!sid && !isLoading && (
            <p role="alert" className="text-sm text-[var(--muted)]">
              {sessionError || "Reload to reconnect before generating a video."}
            </p>
          )}
          {pricingError && (
            <div role="alert" className="text-sm text-[var(--muted)]">
              <p>{pricingError}</p>
              <button
                type="button"
                onClick={generation.refreshConfiguration}
                className="min-h-10 text-[var(--accent)]"
              >
                Reload pricing
              </button>
            </div>
          )}
          {generation.error && (
            <p role="alert" className="text-sm text-[var(--error)]">
              {generation.error}
            </p>
          )}
        </form>
        )}
      </div>

      {!emptyAndOff && (
      <div className="border-t border-[var(--divider)] pt-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-medium">Video generations</h3>
          <span className="text-xs text-[var(--muted)]">
            Public · {reference}
          </span>
        </div>
        {!history.length ? (
          <p className="py-8 text-sm text-center text-[var(--muted)]">
            {publicHistory === undefined
              ? "Loading videos…"
              : generationOff
                ? "No videos for this verse yet."
                : "Be the first to create a video for this verse."}
          </p>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {history.slice(0, visibleCount).map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={selected?.id === entry.id}
                  onClick={() => setSelectedId(entry.id)}
                  className={`overflow-hidden rounded-[var(--radius-md)] border text-left focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${selected?.id === entry.id ? "border-[var(--accent)] ring-1 ring-[var(--accent)]" : "border-[var(--divider)]"}`}
                >
                  <div className="aspect-video bg-[var(--surface)] flex items-center justify-center overflow-hidden">
                    {entry.status === "completed" && entry.videoUrl ? (
                      <video
                        src={entry.videoUrl}
                        preload="metadata"
                        muted
                        playsInline
                        className="w-full h-full object-cover pointer-events-none"
                        aria-hidden="true"
                        tabIndex={-1}
                      />
                    ) : isActiveVideoStatus(entry.status) ? (
                      <Loader2
                        size={24}
                        className="animate-spin text-[var(--muted)]"
                        aria-hidden="true"
                      />
                    ) : (
                      <Film
                        size={24}
                        className="text-[var(--muted)]"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <div className="p-3 space-y-1">
                    <p className="text-xs font-medium">
                      {entry.duration}s · {entry.resolution}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {statusLabels[entry.status]}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {new Date(entry.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </button>
              ))}
            </div>
            {visibleCount < history.length && (
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + 8)}
                className="mt-4 min-h-11 text-sm text-[var(--accent)]"
              >
                Show more videos
              </button>
            )}
          </>
        )}
      </div>
      )}
    </section>
  );
}
