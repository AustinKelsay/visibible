"use client";

import { useId } from "react";
import { useQuery } from "convex/react";
import { Check } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { LayerPanel, useLayer } from "@/components/spread/layers";
import { TEXT_SIZES, usePreferences, type TextSize } from "@/context/preferences-context";
import { useSession } from "@/context/session-context";
import { useEffectiveArtStyle, useVisibleArtStyles } from "@/context/work-scope-context";
import { artStyleLabel } from "@/lib/art-styles";
import { TRANSLATION_GROUPS, TRANSLATIONS, type Translation } from "@/lib/bible-api";
import { trackLookOpened } from "@/lib/analytics";
import { previewSource } from "@/lib/picture-source";

const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

/** Open Look from a control; focus returns to it when Look closes. */
function useOpenLook(source: "dock" | "translation_name") {
  const { isOpen, toggle } = useLayer("look");
  const { tier, credits } = useSession();
  return {
    isOpen,
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
      if (!isOpen) trackLookOpened({ source, tier, hasCredits: credits > 0 });
      toggle(event.currentTarget);
    },
  };
}

/** "Aa" in the dock (with "Look" beside it on a computer): opens Look. */
export function LookButton({ variant }: { variant: "dock" | "phone" }) {
  const { isOpen, onClick } = useOpenLook("dock");
  const shared = { type: "button" as const, "aria-label": "Look", "aria-haspopup": "dialog" as const, "aria-expanded": isOpen, onClick };
  if (variant === "phone") {
    return (
      <button {...shared} className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-serif text-lg text-white/85 hover:bg-white/10 ${FOCUS_RING}`}>
        <span aria-hidden="true">Aa</span>
      </button>
    );
  }
  return (
    <button
      {...shared}
      className={`ml-1 inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors duration-[var(--motion-fast)] ${
        isOpen ? "bg-white text-black" : "bg-white/10 text-white/90 hover:bg-white/15 hover:text-white"
      } ${FOCUS_RING}`}
    >
      <span aria-hidden="true" className="font-serif text-base">Aa</span>
      <span aria-hidden="true">Look</span>
    </button>
  );
}

/** The translation name on the words page: shows the translation and opens Look. */
export function LookTranslationButton({ translationName, className = "" }: { translationName: string; className?: string }) {
  const { isOpen, onClick } = useOpenLook("translation_name");
  return (
    <button
      type="button"
      aria-label={`${translationName}, Look`}
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      onClick={onClick}
      className={`truncate rounded uppercase tracking-[0.18em] hover:text-white/80 ${FOCUS_RING} ${className}`}
    >
      {translationName}
    </button>
  );
}

/**
 * Look: the one place for how the book appears. Art style by example pictures (the styles the reader may see),
 * translation with its notice, and text size in three steps for the words page. The spread's "look" layer: above the
 * dock on a computer, a sheet from the bottom on a phone.
 */
export function LookLayer({ verseId }: { verseId: string }) {
  const { close } = useLayer("look");
  return (
    <LayerPanel
      id="look"
      label="Look"
      className="fixed inset-x-0 bottom-0 z-40 flex max-h-[85svh] flex-col overflow-y-auto rounded-t-[22px] border border-white/10 bg-[rgba(16,15,14,0.94)] px-5 pt-4 pb-[max(1.25rem,var(--safe-area-inset-bottom))] text-white shadow-[0_-20px_80px_rgba(0,0,0,0.55)] outline-none backdrop-blur-2xl backdrop-saturate-150 md:absolute md:inset-x-auto md:bottom-28 md:left-[calc((100%-var(--words-page-width))/2)] md:max-h-[calc(100svh-9rem)] md:w-[34rem] md:-translate-x-1/2 md:rounded-[22px] md:px-6 md:pt-5 md:pb-4 md:shadow-[0_30px_100px_rgba(0,0,0,0.6)]"
    >
      <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20 md:hidden" />
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-medium tracking-tight">Look</h2>
        <button type="button" onClick={close} className={`-mr-2 min-h-11 rounded-full px-3 text-sm font-semibold text-white/90 hover:bg-white/10 md:hidden ${FOCUS_RING}`}>
          Done
        </button>
      </div>
      <ArtStyleChoice verseId={verseId} />
      <TranslationChoice />
      <TextSizeChoice />
    </LayerPanel>
  );
}

const SECTION_LABEL = "text-[11px] font-medium uppercase tracking-[0.22em] text-white/55";

function ArtStyleChoice({ verseId }: { verseId: string }) {
  const visible = useVisibleArtStyles();
  const { artStyle } = useEffectiveArtStyle();
  const { setArtStyle } = usePreferences();
  const name = useId();
  const isConvexEnabled = useConvexEnabled();
  const examples = useQuery(api.verseImages.getStyleExamples, isConvexEnabled ? { verseId, styles: visible } : "skip");
  const exampleOf = (style: string) => examples?.find((entry) => entry.style === style)?.picture ?? null;

  return (
    <fieldset className="mt-4">
      <legend className={SECTION_LABEL}>Art style</legend>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {visible.map((style) => {
          const picture = exampleOf(style);
          const source = picture ? previewSource(picture) : null;
          const checked = style === artStyle;
          return (
            <label key={style} className="group relative block cursor-pointer">
              <input
                type="radio"
                name={name}
                value={style}
                aria-label={artStyleLabel(style)}
                checked={checked}
                onChange={() => setArtStyle(style, "look")}
                data-autofocus={checked ? "" : undefined}
                className="peer sr-only"
              />
              <span
                className={`relative block aspect-[16/10] overflow-hidden rounded-xl sm:aspect-[4/3] bg-white/[0.06] ring-offset-2 ring-offset-[#100f0e] transition-shadow peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-white ${
                  checked ? "ring-2 ring-white" : "ring-1 ring-white/10 group-hover:ring-white/40"
                }`}
              >
                {source ? (
                  // A small saved picture of this verse (or the example verse) in the style. Decorative: the label names it.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={source} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center font-serif text-3xl text-white/25">
                    {artStyleLabel(style).charAt(0)}
                  </span>
                )}
                {checked ? (
                  <span aria-hidden="true" className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-black">
                    <Check size={13} strokeWidth={2.5} />
                  </span>
                ) : null}
              </span>
              <span aria-hidden="true" className={`mt-1.5 block truncate text-[13px] ${checked ? "font-semibold text-white" : "text-white/70"}`}>{artStyleLabel(style)}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function TranslationChoice() {
  const { translation, setTranslation, translationInfo } = usePreferences();
  const id = useId();
  return (
    <div className="mt-5 border-t border-white/10 pt-4">
      <div className="flex items-center justify-between gap-4">
        <label htmlFor={id} className="text-[15px] text-white/90">Translation</label>
        <select
          id={id}
          value={translation}
          onChange={(event) => setTranslation(event.target.value as Translation, "look")}
          aria-describedby={`${id}-notice`}
          className={`min-h-11 min-w-0 max-w-[65%] cursor-pointer truncate rounded-lg border border-white/10 bg-white/[0.06] px-3 text-right text-[15px] text-white/80 hover:bg-white/10 ${FOCUS_RING}`}
        >
          {Object.entries(TRANSLATION_GROUPS).map(([group, keys]) => (
            <optgroup key={group} label={group}>
              {keys.map((key) => (
                <option key={key} value={key}>{TRANSLATIONS[key].name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <p id={`${id}-notice`} className="mt-2 text-xs leading-relaxed text-white/50">
        Scripture quotations are from the {translationInfo.name} ({translationInfo.code}){translationInfo.year ? `, ${translationInfo.year}` : ""}.
      </p>
    </div>
  );
}

const TEXT_SIZE_LABEL: Record<TextSize, string> = { small: "Small", medium: "Medium", large: "Large" };
const TEXT_SIZE_GLYPH: Record<TextSize, string> = { small: "text-sm", medium: "text-lg", large: "text-2xl" };

function TextSizeChoice() {
  const { textSize, setTextSize } = usePreferences();
  const name = useId();
  return (
    <fieldset className="mt-4 flex items-center justify-between gap-4 border-t border-white/10 pt-4">
      <legend className="float-left text-[15px] text-white/90">Text size</legend>
      <div className="flex rounded-full bg-white/[0.06] p-1">
        {TEXT_SIZES.map((size) => {
          const checked = size === textSize;
          return (
            <label key={size} className="relative cursor-pointer">
              <input
                type="radio"
                name={name}
                value={size}
                checked={checked}
                onChange={() => setTextSize(size, "look")}
                aria-label={TEXT_SIZE_LABEL[size]}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className={`flex h-10 w-12 items-center justify-center rounded-full font-serif leading-none transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-white ${TEXT_SIZE_GLYPH[size]} ${
                  checked ? "bg-white text-black" : "text-white/70 hover:text-white"
                }`}
              >
                A
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
