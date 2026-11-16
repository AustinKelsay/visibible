"use client";

import { createContext, useContext, type ReactNode } from "react";
import { usePreferences } from "@/context/preferences-context";
import { useSession } from "@/context/session-context";
import { resolveArtStyle } from "@/lib/art-styles";
import { BIBLE_STYLE_SET, pictureStyleOrder, visibleArtStyles } from "@/lib/picture-rule";

/**
 * Which prose moment a page shows. Bible pages have no scope, so every consumer keeps its Bible behaviour; a prose
 * reader page provides one, and the image, art style and header controls read it to request and browse that work.
 */
export type WorkScope = Readonly<{
  workId: string;
  /** The moment's id (its first unit): images are requested and saved under it. */
  unitId: string;
  /** The brief's art styles, in its order. */
  styleIds: readonly string[];
  /** Where the moment is, e.g. "The Pool of Tears ¶3–6", and a shorter form for phones. */
  passage: Readonly<{ full: string; short: string }>;
  contentsHref: string;
}>;

const WorkScopeContext = createContext<WorkScope | null>(null);

export function WorkScopeProvider({ scope, children }: { scope: WorkScope; children: ReactNode }) {
  return <WorkScopeContext.Provider value={scope}>{children}</WorkScopeContext.Provider>;
}

export function useWorkScope(): WorkScope | null {
  return useContext(WorkScopeContext);
}

/**
 * The art styles the reader may see, in the work's style-set order: public styles, plus owner-only styles for an
 * admin. Look offers these; the picture menu can list other styles' pictures from them.
 */
export function useVisibleArtStyles(): string[] {
  const scope = useWorkScope();
  const { tier } = useSession();
  return visibleArtStyles(scope?.styleIds ?? BIBLE_STYLE_SET, tier === "admin");
}

/**
 * The art style pictures are painted and shown in: the stored choice when the reader may see it, else the first
 * visible style, without overwriting the stored choice (so returning to a work that offers it restores it).
 * `offered` is a prose work's style set (undefined on the Bible).
 */
export function useEffectiveArtStyle(): { artStyle: string; offered: readonly string[] | undefined } {
  const { artStyle } = usePreferences();
  const scope = useWorkScope();
  const visible = useVisibleArtStyles();
  return { artStyle: resolveArtStyle(artStyle, null, visible).styleId, offered: scope?.styleIds };
}

/**
 * The picture rule's style order (src/lib/picture-rule.ts): the chosen style, then the other visible styles. Every
 * read that chooses a verse's picture passes `order`, so the spread, its prefetch, the verse marks, Contents and the
 * unpainted glow agree.
 */
export function usePictureStyles(): { chosen: string; visible: string[]; order: string[] } {
  const { artStyle } = useEffectiveArtStyle();
  const visible = useVisibleArtStyles();
  return { chosen: artStyle, visible, order: pictureStyleOrder(artStyle, visible) };
}

/** The catalog route, scoped to the work when there is one. */
export function imageModelsUrl(scope: WorkScope | null): string {
  return scope ? `/api/image-models?work=${encodeURIComponent(scope.workId)}` : "/api/image-models";
}
