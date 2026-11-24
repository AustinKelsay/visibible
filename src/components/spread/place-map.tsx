"use client";

import { lazy, Suspense, useEffect, useRef, useSyncExternalStore } from "react";
import { useQuery } from "convex/react";
import { Image as ImageIcon, MapPin } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { useChosenPicture } from "@/components/spread/chosen-picture";
import { useLayers } from "@/components/spread/layers";
import { useSession } from "@/context/session-context";
import { usePictureStyles } from "@/context/work-scope-context";
import { trackMapLinkShown, trackMapOpened } from "@/lib/analytics";
import { previewSource } from "@/lib/picture-source";
import type { VerseSetting } from "@/lib/verse-setting";

// The map experiment (#532). The map and its outline load only when a reader first opens it.
const PlaceMapView = lazy(() => import("@/components/spread/place-map-view"));

/**
 * Whether the reader has the map on, for the rest of the visit in this tab: turning the page keeps it, so a journey
 * can be followed verse by verse, and a reload starts with the picture again. Not a layer, because layers are one at a
 * time and close when the page turns.
 */
let mapOn = false;
const listeners = new Set<() => void>();
function setMapOn(on: boolean) {
  if (mapOn === on) return;
  mapOn = on;
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const openMap = () => setMapOn(true);
const closeMap = () => setMapOn(false);

/** Whether the map is on, and functions to turn it on and off. */
export function useMapMode() {
  const on = useSyncExternalStore(subscribe, () => mapOn, () => false);
  return { on, open: openMap, close: closeMap };
}

/** Whether the map shows in the picture's place: it is on, the verse has a setting and the whole picture is not open. */
export function useMapShows(setting: VerseSetting | null | undefined, wholePicture: boolean): boolean {
  return useMapMode().on && Boolean(setting) && !wholePicture;
}

/** Turns the map off; for tests, which share this module's state. */
export function resetMapMode() {
  setMapOn(false);
}

/** What analytics records about a setting. */
function settingKind(setting: VerseSetting) {
  return { inherited: setting.fromVerse !== null, debated: setting.places.some((place) => place.debated) };
}

// The Ask suggestions' look (ask.tsx), so the link reads as one more thing to do with the verse.
const LINK =
  "mt-5 inline-flex items-center gap-2 rounded text-left font-serif text-lg italic text-ink/80 underline decoration-ink/30 underline-offset-4 transition-colors hover:text-ink hover:decoration-ink/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/70 md:mt-6";

/**
 * The words page's way to the map: "See where this happened" under a verse with a setting, "Back to the picture"
 * while the map shows. A verse with no setting has no link.
 */
export function MapLink({ setting, bookName, chapter, verseNumber }: {
  setting: VerseSetting;
  bookName: string;
  chapter: number;
  verseNumber: number;
}) {
  const { on, open, close } = useMapMode();
  const { tier, credits } = useSession();
  const props = { book: bookName, chapter, verse: verseNumber, ...settingKind(setting), tier, hasCredits: credits > 0 };
  // Shown once per spread, when the link offers the map (not while it reads "Back to the picture").
  const reported = useRef(false);
  useEffect(() => {
    if (on || reported.current) return;
    reported.current = true;
    trackMapLinkShown(props);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reported once, with the props of that moment
  }, [on]);

  // The map's close button and painting window leave with the map; focus comes back to this link rather than the page.
  const link = useRef<HTMLButtonElement>(null);
  const wasOn = useRef(on);
  useEffect(() => {
    if (wasOn.current && !on && (document.activeElement === null || document.activeElement === document.body)) {
      link.current?.focus();
    }
    wasOn.current = on;
  }, [on]);

  return (
    <button
      ref={link}
      type="button"
      onClick={() => {
        if (on) return close();
        trackMapOpened(props);
        open();
      }}
      className={LINK}
    >
      {on ? (
        <ImageIcon size={15} strokeWidth={1.75} aria-hidden="true" className="shrink-0 not-italic" />
      ) : (
        <MapPin size={15} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
      )}
      {on ? "Back to the picture" : "See where this happened"}
    </button>
  );
}

/**
 * The map in the picture's place, while the map is on and the verse has a setting (never in the whole-picture view).
 * Escape, its close button and its painting window turn it off.
 */
export function PlaceMapStage({ setting, verseId, reference, hidden }: {
  setting: VerseSetting | null | undefined;
  verseId: string;
  reference: string;
  /** The whole-picture view is open, which shows the picture. */
  hidden: boolean;
}) {
  const { close } = useMapMode();
  const { openLayer } = useLayers();
  const shows = useMapShows(setting, hidden);

  useEffect(() => {
    if (!shows || openLayer !== null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shows, openLayer, close]);

  if (!shows || !setting) return null;
  return (
    <div className="absolute inset-0 bg-[#0f1a22] md:right-[var(--words-page-width)]">
      <Suspense fallback={null}>
        <PlaceMapView setting={setting} reference={reference} onClose={close} picture={<PaintingWindow verseId={verseId} reference={reference} onBack={close} />} />
      </Suspense>
    </div>
  );
}

/** The verse's picture, small in the map's corner: the way back to it. Absent for an unpainted verse. */
function PaintingWindow(props: { verseId: string; reference: string; onBack: () => void }) {
  const isConvexEnabled = useConvexEnabled();
  return isConvexEnabled ? <SavedPaintingWindow {...props} /> : null;
}

function SavedPaintingWindow({ verseId, reference, onBack }: { verseId: string; reference: string; onBack: () => void }) {
  const { order } = usePictureStyles();
  // The same read as the spread's picture (spread-picture.tsx), so it is already loaded.
  const rulePicture = useQuery(api.verseImages.getSpreadPicture, { verseId, styles: order });
  const { chosen } = useChosenPicture();
  const picture = rulePicture?.imageUrl ? chosen ?? rulePicture : null;
  const src = picture ? previewSource(picture) : null;
  if (!src) return null;
  return (
    <button
      type="button"
      onClick={onBack}
      aria-label={`Back to the picture of ${reference}`}
      className="block h-12 w-20 overflow-hidden rounded-lg border-2 border-white/85 shadow-[0_10px_30px_rgba(0,0,0,0.6)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:h-[5.5rem] md:w-36"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a remote thumbnail, as on the Contents wall */}
      <img src={src} alt="" className="h-full w-full object-cover" />
    </button>
  );
}
