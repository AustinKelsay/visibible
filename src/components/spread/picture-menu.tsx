"use client";

import { useEffect, useRef, useState, type RefObject, type SyntheticEvent } from "react";
import { useQuery } from "convex/react";
import { ChevronDown, Flag, Images, Loader2, RefreshCw } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { LayerPanel, useLayer, useLayers } from "@/components/spread/layers";
import { useChosenPicture, type ChosenPicture } from "@/components/spread/chosen-picture";
import { useSession } from "@/context/session-context";
import { useEffectiveArtStyle, useVisibleArtStyles } from "@/context/work-scope-context";
import { artStyleLabel } from "@/lib/art-styles";
import { trackPictureMenuOpened } from "@/lib/analytics";
import { imageModelDisplayName } from "@/lib/image-models";
import { pictureStyleOrder } from "@/lib/picture-rule";
import { previewSource } from "@/lib/picture-source";
import { useVerseGeneration } from "@/lib/use-verse-generation";

export interface PictureMenuProps {
  verseId: string;
  reference: string;
  /** The verse's pictures in the chosen art style, newest first (the spread's own picture list). */
  pictures: readonly ChosenPicture[];
  /** The picture on the spread: the chosen version, or the newest. */
  shown: ChosenPicture;
  /** Hide the chip (in the whole-picture view) without ending a painting started from the menu. */
  chipHidden?: boolean;
}

/** A tap on the chip or inside its menu is not a tap on the picture (which opens the whole-picture view). */
const keepOffPicture = (event: SyntheticEvent) => event.stopPropagation();

const ROW =
  "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] text-ink/90 transition-colors duration-[var(--motion-fast)] hover:bg-ink/10 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60";

const formatDate = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

/**
 * The picture menu (#441): a small chip on a painted verse's picture, and the layer it opens. The layer lists the
 * verse's pictures, the chosen art style first and then the other styles the reader may see, newest first, as
 * thumbnails; choosing one shows it on the spread until the page turns. Under the list sit the actions on the picture
 * shown: Paint another (the paint button's quote and credit rules), its Details, and Report this picture.
 *
 * Mount it with `key={verseId}`, so a page turn starts afresh.
 */
export function PictureMenu({ verseId, reference, pictures, shown, chipHidden = false }: PictureMenuProps) {
  const layer = useLayer("picture");
  const { tier, credits } = useSession();
  // Painting and its price are read only once the reader has opened the menu on this verse, then kept, so a painting
  // carries on after the menu is closed.
  const [engaged, setEngaged] = useState(false);
  const [painting, setPainting] = useState(false);
  const chip = useRef<HTMLButtonElement>(null);
  if (layer.isOpen && !engaged) setEngaged(true);

  const index = pictures.findIndex((picture) => picture.id === shown.id);
  const label = index >= 0 && pictures.length > 1
    ? `${artStyleLabel(shown.artStyle)} · ${index + 1} of ${pictures.length}`
    : artStyleLabel(shown.artStyle);

  return (
    <div className="contents" onClick={keepOffPicture}>
      <button
        ref={chip}
        type="button"
        aria-label={`Picture menu, ${label}${painting ? ", painting another" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={layer.isOpen}
        data-fades
        onClick={(event) => {
          if (!layer.isOpen) trackPictureMenuOpened({ pictureCount: pictures.length, tier, hasCredits: credits > 0 });
          layer.toggle(event.currentTarget);
        }}
        className={`liquid-glass spread-dock absolute bottom-3 left-3 z-20 ${chipHidden ? "hidden" : "flex"} min-h-9 items-center gap-2 rounded-full px-3 text-[13px] font-medium text-ink/90 transition-colors duration-[var(--motion-fast)] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink md:bottom-8 md:left-5 md:min-h-11 md:px-4 md:text-sm`}
      >
        {painting ? (
          <Loader2 aria-hidden="true" className="h-3.5 w-3.5 motion-safe:animate-spin" />
        ) : (
          <Images aria-hidden="true" className="h-3.5 w-3.5 text-ink/70" />
        )}
        <span>{label}</span>
      </button>
      {engaged ? (
        <PictureMenuLayer verseId={verseId} reference={reference} pictures={pictures} shown={shown} chip={chip} onPaintingChange={setPainting} />
      ) : null}
    </div>
  );
}

function PictureMenuLayer({ verseId, reference, pictures, shown, chip, onPaintingChange }: PictureMenuProps & {
  chip: RefObject<HTMLButtonElement | null>;
  onPaintingChange: (painting: boolean) => void;
}) {
  const layer = useLayer("picture");
  const { openLayerById } = useLayers();
  const { choose } = useChosenPicture();
  const { buyCredits } = useSession();
  const { artStyle } = useEffectiveArtStyle();
  // The styles the reader may see (public, plus owner-only for an admin), as Look offers them.
  const visibleStyles = useVisibleArtStyles();
  const otherStylePictures = useQuery(
    api.verseImages.getImageHistory,
    layer.isOpen ? { verseId, artStyle, otherStyles: true } : "skip",
  );
  const [detailsOpen, setDetailsOpen] = useState(false);

  const generation = useVerseGeneration({
    verseId,
    reference,
    styleImageCount: pictures.length,
    // Painting another is always the reader's own click.
    autoGenerateBlocked: true,
    // The new picture is the newest: show it.
    onImage: ({ savedImageId }) => {
      if (savedImageId) choose(null);
    },
  });
  useEffect(() => onPaintingChange(generation.isGenerating), [generation.isGenerating, onPaintingChange]);

  const groups = [
    { style: artStyle, pictures },
    ...pictureStyleOrder(artStyle, visibleStyles).slice(1).map((style) => ({
      style,
      pictures: (otherStylePictures ?? []).filter((picture) => picture.artStyle === style),
    })),
  ].filter((group) => group.pictures.length > 0);

  const showVersion = (picture: ChosenPicture) => {
    // The newest picture in the chosen style is what the spread shows without a choice.
    choose(picture.id === pictures[0]?.id ? null : picture);
  };

  return (
    <>
      {layer.isOpen ? <div aria-hidden="true" className="fixed inset-0 z-30" onClick={layer.close} /> : null}
      <LayerPanel
        id="picture"
        label="Picture menu"
        className="fixed inset-x-0 bottom-0 z-40 flex max-h-[80svh] flex-col overflow-y-auto rounded-t-2xl border border-ink/10 bg-reader-glass p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-ink shadow-2xl outline-none backdrop-blur-2xl backdrop-saturate-150 md:absolute md:inset-x-auto md:bottom-[5.5rem] md:left-5 md:max-h-[calc(100svh-9rem)] md:w-[22rem] md:rounded-2xl"
      >
        <h2 className="px-3 pt-2 pb-1 text-xs font-medium tracking-[0.12em] text-ink/(--quiet-55) uppercase">Pictures of {reference}</h2>
        {groups.map((group) => (
          <section key={group.style} aria-label={artStyleLabel(group.style)} className="px-3 py-1.5">
            <h3 className="pb-1.5 text-[13px] text-ink/70">
              {artStyleLabel(group.style)}
              {group.style !== artStyle ? <span className="text-ink/(--quiet-45)"> · other style</span> : null}
            </h3>
            <ul className="grid grid-cols-4 gap-1.5">
              {group.pictures.map((picture) => {
                const isShown = picture.id === shown.id;
                return (
                  <li key={picture.id}>
                    <button
                      type="button"
                      aria-label={`${artStyleLabel(picture.artStyle)} picture, ${formatDate(picture.createdAt)}`}
                      aria-pressed={isShown}
                      data-autofocus={isShown ? true : undefined}
                      onClick={() => showVersion(picture)}
                      className={`relative block aspect-square w-full overflow-hidden rounded-lg bg-ink/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${isShown ? "ring-2 ring-ink" : "opacity-80 hover:opacity-100"}`}
                    >
                      {/* Thumbnails come from Convex storage; there is no resizing service. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={previewSource(picture) ?? undefined} alt="" className="h-full w-full object-cover object-center" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {otherStylePictures === undefined ? <p className="px-3 py-1 text-xs text-ink/(--quiet-45)">Looking for other styles…</p> : null}

        <hr className="mx-3 my-1.5 border-ink/10" />
        <PaintAnother generation={generation} onGetCredits={() => { layer.close(); buyCredits(); }} />

        <button type="button" className={ROW} aria-expanded={detailsOpen} onClick={() => setDetailsOpen((open) => !open)}>
          <span className="flex-1">Details</span>
          <ChevronDown aria-hidden="true" className={`h-4 w-4 text-ink/(--quiet-60) transition-transform ${detailsOpen ? "rotate-180" : ""}`} />
        </button>
        {detailsOpen ? <Details picture={shown} /> : null}

        <button
          type="button"
          className={ROW}
          // The feedback form takes the place of this menu; focus returns to the chip when it closes.
          onClick={() => openLayerById("report-picture", chip.current)}
        >
          <Flag aria-hidden="true" className="h-4 w-4 text-ink/(--quiet-60)" />
          Report this picture
        </button>
      </LayerPanel>
    </>
  );
}

type Generation = ReturnType<typeof useVerseGeneration>;

/** Paint another version in the chosen style, priced and gated exactly like the unpainted verse's paint button. */
function PaintAnother({ generation, onGetCredits }: { generation: Generation; onGetCredits: () => void }) {
  if (generation.isGenerating) {
    const percent = Math.round(generation.progress * 100);
    return (
      <div className="space-y-2 px-3 py-2.5">
        <p className="text-sm text-ink/85">Painting another picture…</p>
        <div role="progressbar" aria-label="Painting another picture" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-1 overflow-hidden rounded-full bg-ink/15">
          <div className="h-full rounded-full bg-ink/80 motion-safe:transition-[width] motion-safe:duration-300" style={{ width: `${percent}%` }} />
        </div>
      </div>
    );
  }
  if (generation.error) {
    return (
      <div className="px-3 py-1.5">
        <p role="alert" className="pb-1 text-sm text-reader-alert">{generation.error}</p>
        <button type="button" className={`${ROW} -mx-3 w-[calc(100%+1.5rem)]`} onClick={() => generation.generate("picture_menu_retry")}>
          <RefreshCw aria-hidden="true" className="h-4 w-4 text-ink/(--quiet-60)" />
          Try again
        </button>
      </div>
    );
  }
  if (generation.priceNotice) {
    return (
      <div className="px-3 py-1.5">
        <p role="status" className="pb-1 text-sm text-ink/85">{generation.priceNotice}</p>
        <button type="button" className={`${ROW} -mx-3 w-[calc(100%+1.5rem)]`} onClick={() => generation.generate("picture_menu_paint")}>
          Paint at this price
        </button>
      </div>
    );
  }
  if (generation.pricingUnavailable) {
    return <p className="px-3 py-2.5 text-sm text-ink/(--quiet-55)">{generation.pricingUnavailable}</p>;
  }
  if (generation.canGenerate || generation.pricingPending) {
    const quote = generation.showCreditsCost ? generation.quote : null;
    return (
      <button type="button" className={ROW} disabled={generation.pricingPending} onClick={() => generation.generate("picture_menu_paint")}>
        <span>
          Paint another
          {quote ? <span className="text-ink/(--quiet-55)">{` · about ${quote.estimateCredits} ${quote.estimateCredits === 1 ? "credit" : "credits"}`}</span> : null}
        </span>
      </button>
    );
  }
  return (
    <button type="button" className={ROW} onClick={onGetCredits}>
      Get credits to paint another
    </button>
  );
}

/** The picture's style, date, size, model and cost. */
function Details({ picture }: { picture: ChosenPicture }) {
  const size = picture.imageWidth && picture.imageHeight ? `${picture.imageWidth} × ${picture.imageHeight}` : null;
  const rows: Array<[string, string]> = [
    ["Style", artStyleLabel(picture.artStyle)],
    ["Date", formatDate(picture.createdAt)],
    ["Size", [size, picture.aspectRatio].filter(Boolean).join(" · ") || "Not recorded"],
    ["Model", imageModelDisplayName(picture.model)],
    ["Cost", typeof picture.creditsCost === "number" ? `${picture.creditsCost} ${picture.creditsCost === 1 ? "credit" : "credits"}` : "Not recorded"],
  ];
  return (
    <dl aria-label="Picture details" className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-3 pt-0.5 pb-2.5 text-sm">
      {rows.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-ink/(--quiet-50)">{term}</dt>
          <dd className="text-ink/85">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
