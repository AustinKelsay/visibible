"use client";

import { useMemo, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { AskProvider } from "@/components/spread/ask";
import { ChosenPictureProvider } from "@/components/spread/chosen-picture";
import { ContentsButton, ContentsLayer } from "@/components/spread/contents";
import { CornerMenu } from "@/components/spread/corner-menu";
import { LayerProvider, useLayer, useLayers } from "@/components/spread/layers";
import { LookButton, LookLayer } from "@/components/spread/look";
import { markPlayOnTurn, PageTurnLink, useArrival, useArrivesInWholePicture, useArrivesPlaying, usePageTurn, useTurnedAway } from "@/components/spread/page-turn";
import { bibleChapterPlaces, VerseMarks } from "@/components/spread/verse-marks";
import { useIdle } from "@/components/spread/idle-fade";
import { useSwipeTurn } from "@/components/spread/swipe-turn";
import { ReaderAppearance } from "@/components/spread/reader-appearance";
import { PrefetchNextSpread } from "@/components/spread/prefetch-next";
import { SpreadPicture } from "@/components/spread/spread-picture";
import { WORDS_PAGE_WIDTH_CSS } from "@/components/spread/words-page-width";
import { WordsPage } from "@/components/spread/words-page";
import { WholePictureCaption } from "@/components/spread/whole-picture";
import { PlaceMapStage, useMapShows } from "@/components/spread/place-map";
import { FeedbackPrompt } from "@/components/feedback-prompt";
import { useSession } from "@/context/session-context";
import { useMomentWord, useWorkScope } from "@/context/work-scope-context";
import { useAdvancedSettings } from "@/lib/advanced-settings";
import { trackWholePictureOpened } from "@/lib/analytics";
import type { VerseSetting } from "@/lib/verse-setting";
import { readableReference } from "@/lib/readable-reference";

export interface SpreadProps {
  /** Where the verse's pictures are kept ("genesis-1-1"), or a prose moment's (its first unit's id). */
  verseId: string;
  /** This spread's address ("/genesis/1/1", "/read/<work>/<moment>"). */
  path: string;
  /** The Bible book's address segment ("genesis"). A prose moment has none: its work scope lists its places. */
  bookSlug?: string;
  /** The Bible book, or the prose work's title. */
  bookName: string;
  /** The chapter's number (a prose work's division, from 1). */
  chapter: number;
  /** A prose division's name ("The Pool of Tears"). */
  chapterLabel?: string;
  /** The verse's number, or the moment's place in its division, from 1. */
  verseNumber: number;
  /** "John 1:5", or "The Pool of Tears ¶3–6". */
  reference: string;
  /** The verse; for a prose moment, its first paragraph (the whole-picture caption). */
  verseText: string;
  /** A prose moment's paragraphs, which its words page shows in place of a verse. */
  paragraphs?: readonly string[];
  /** How many verses (or moments) the chapter has. */
  totalVerses: number;
  /** The Bible translation; a prose moment has none. */
  translationName?: string;
  prevUrl?: string;
  nextUrl?: string;
  /** Where the next verse's (or moment's) pictures are kept, so the next spread can be fetched ahead. */
  nextVerseId?: string;
  /** Where a Bible verse happens, for the map experiment (#532); null or absent when no place is known. */
  setting?: VerseSetting | null;
}

/**
 * The reader's one screen for one verse, or for one moment of a prose work: render it inside a `WorkScopeProvider`
 * for the work, and the same spread offers that work's styles, Contents of its divisions, Look without translation,
 * and no Ask. On a computer the picture covers the window and the words
 * page lies over its right side as dark glass, with a floating dock on the picture. On a phone the
 * picture sits above in a square frame and the words page fills the rest. It is dark whatever the
 * system setting is. "Aa" in the dock opens Look.
 */
export function Spread(props: SpreadProps) {
  // A page turned from the whole-picture view opens in it, so a reader can stay there for a chapter.
  const arrivesWhole = useArrivesInWholePicture(props.path);
  return (
    <LayerProvider initialLayer={arrivesWhole ? "whole-picture" : null}>
      <ChosenPictureProvider verseId={props.verseId}>
        <SpreadScreen {...props} />
      </ChosenPictureProvider>
    </LayerProvider>
  );
}

function SpreadScreen({
  verseId, path, bookSlug, bookName, chapter, chapterLabel, verseNumber, reference, verseText, paragraphs, totalVerses,
  translationName, prevUrl, nextUrl, nextVerseId, setting,
}: SpreadProps) {
  const scope = useWorkScope();
  const word = useMomentWord();
  // Ask is the Bible's: a prose work offers none.
  const offersAsk = scope === null;
  const places = useMemo(
    () => scope
      ? scope.divisions[chapter - 1]?.moments.map((moment) => ({ verseId: moment.id, href: moment.href })) ?? []
      : bibleChapterPlaces(bookSlug ?? "", chapter, totalVerses),
    [scope, bookSlug, chapter, totalVerses],
  );
  const onTurn = usePageTurn({ bookName, chapter, verseNumber, prevUrl, nextUrl });
  const swipe = useSwipeTurn({ prevUrl, nextUrl, onTurn });
  const idle = useIdle();
  const arrival = useArrival(path);
  const whole = useLayer("whole-picture").isOpen;
  // Continuous play turned to this spread at the end of the previous verse's video, so its own starts at once.
  const arrivesPlaying = useArrivesPlaying(path);
  const router = useRouter();
  const turnedAway = useTurnedAway();
  // Turns the page for Continuous play, unless the reader already turned it by hand (that turn stands); says whether it did.
  const onPlayOn = nextUrl
    ? () => {
        if (turnedAway()) return false;
        onTurn("next", "play_on");
        markPlayOnTurn();
        router.push(nextUrl);
        return true;
      }
    : undefined;
  const { tier, credits } = useSession();
  const words = {
    bookName, chapter, chapterLabel, reference, verseNumber, verseText, paragraphs, totalVerses, translationName,
    prevUrl, nextUrl, onTurn, setting,
  };
  // The map experiment (#532): while it shows, it takes the picture's place. The picture stays mounted (its painting
  // state carries on) but is hidden with its controls, and its video stops.
  const mapShows = useMapShows(setting, whole);
  const { openLayer, openLayerById } = useLayers();
  // The occasional feedback prompt, only when the reader turned it on in Advanced.
  const { feedbackPrompts } = useAdvancedSettings();
  const onShowWhole = (imageId: string) =>
    trackWholePictureOpened({ book: bookName, chapter, verse: verseNumber, imageId, tier, hasCredits: credits > 0 });

  return (
    <main
      className={`${whole ? "reader-dark" : "reader-appearance"} fixed inset-0 flex flex-col overflow-hidden bg-[#050505] text-ink md:block`}
      style={{ "--words-page-width": WORDS_PAGE_WIDTH_CSS } as CSSProperties}
      data-idle={idle}
      data-arrival={arrival ?? undefined}
      data-whole-picture={whole || undefined}
      {...swipe}
    >
      <ReaderAppearance />
      {/* In the whole-picture view the frame takes the whole window; on a phone the picture and its caption
          sit centred above the page-turn row. On a phone the picture gives the turned-over words page (Ask)
          more room. */}
      <figure
        data-turn-in="fade"
        className={`relative w-full overflow-hidden md:absolute md:inset-0 md:aspect-auto md:max-h-none ${
          whole
            ? "flex min-h-0 flex-1 flex-col pt-8 md:block md:pt-0"
            : "md:block aspect-square max-h-[52svh] shrink-0 transition-[max-height] duration-300 motion-reduce:transition-none max-md:[main:has([data-ask-page])_&]:max-h-[30svh]"
        }`}
      >
        <div className={mapShows ? "hidden" : "contents"}>
          <SpreadPicture
            key={verseId}
            verseId={verseId}
            reference={reference}
            onShowWhole={onShowWhole}
            nextVerseId={nextVerseId}
            onPlayOn={onPlayOn}
            arrivesPlaying={arrivesPlaying}
            covered={mapShows}
          />
        </div>
        <PlaceMapStage setting={setting} verseId={verseId} reference={readableReference(reference)} here={{ slug: bookSlug ?? "", chapter, verse: verseNumber }} hidden={whole} />
        {/* A soft shade along the top keeps the white corner name and verse marks legible on a bright sky. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/45 to-transparent" />
        <WholePictureCaption
          reference={reference}
          verseText={verseText}
          verseNumber={verseNumber}
          totalVerses={totalVerses}
          prevUrl={prevUrl}
          nextUrl={nextUrl}
          onTurn={onTurn}
        />
      </figure>
      <PrefetchNextSpread nextUrl={nextUrl} nextVerseId={nextVerseId} />

      <VerseMarks
        label={`${word === "verse" ? "Verses" : "Passages"} of ${chapterLabel ?? readableReference(`${bookName} ${chapter}`)}`}
        places={places}
        current={verseNumber}
        onTurn={onTurn}
      />

      <CornerMenu
        verseId={verseId}
        bookName={bookName}
        chapter={chapter}
        verseNumber={verseNumber}
        verseText={verseText}
        totalVerses={totalVerses}
      />

      {offersAsk ? (
        // Keyed by the verse: turning the page clears the conversation.
        <AskProvider key={verseId} verse={{ bookName, chapter, verseNumber, verseText }}>
          <WordsPage {...words} offersAsk />
        </AskProvider>
      ) : (
        // Keyed by the moment, so each one opens at the top of its text.
        <WordsPage key={verseId} {...words} offersAsk={false} />
      )}

      <div className={`pointer-events-none absolute inset-x-0 bottom-8 hidden justify-center md:flex ${whole ? "md:right-0" : "md:right-[var(--words-page-width)]"}`}>
        <nav
          aria-label="Turn the page"
          data-fades
          className="liquid-glass spread-dock pointer-events-auto flex items-center gap-1 rounded-full p-1.5"
        >
          <PageTurnLink direction="prev" href={prevUrl} onTurn={onTurn} />
          <ContentsButton reference={reference} variant="dock" />
          <PageTurnLink direction="next" href={nextUrl} onTurn={onTurn} />
          <LookButton variant="dock" />
        </nav>
      </div>

      <ContentsLayer bookSlug={bookSlug ?? ""} chapter={chapter} verse={verseNumber} />
      <LookLayer verseId={verseId} />

      {feedbackPrompts ? (
        <FeedbackPrompt
          visitKey={verseId}
          // It sits under the corner name, where the map's controls go.
          suppressed={openLayer !== null || mapShows}
          onOpen={() => openLayerById("feedback")}
          className="absolute left-3 top-[4.25rem] md:left-5 md:top-[4.75rem]"
        />
      ) : null}
    </main>
  );
}
