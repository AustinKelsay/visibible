"use client";

import { createContext, useContext, type ReactNode } from "react";
import { usePreferences } from "@/context/preferences-context";
import { useSession } from "@/context/session-context";
import { resolveArtStyle } from "@/lib/art-styles";
import { BIBLE_STYLE_SET, pictureStyleOrder, visibleArtStyles } from "@/lib/picture-rule";

/** One moment of a prose work as Contents and the marks list it: where its pictures are kept and its address. */
export type WorkMoment = Readonly<{ id: string; href: string }>;

/** One of a prose work's top divisions (Alice's chapters, Holmes's stories) and its moments, in reading order. */
export type WorkDivision = Readonly<{ label: string; moments: readonly WorkMoment[] }>;

/**
 * Which prose moment a page shows: the spread's work-scope switch. Bible pages have no scope, so every consumer keeps
 * its Bible behaviour. A prose reader page provides one, and the spread reads it to request, paint and browse that
 * work: pictures in the work's styles, Contents of its divisions, Look without translation, and no Ask.
 */
export type WorkScope = Readonly<{
  workId: string;
  title: string;
  /** The moment's id (its first unit): images are requested and saved under it. */
  unitId: string;
  /** The brief's art styles, in its order. */
  styleIds: readonly string[];
  /** The name of the work's top level ("Chapter", "Story"). */
  level: string;
  divisions: readonly WorkDivision[];
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

/** What one page of the reader is called in copy: a verse of the Bible, a passage of a prose work. */
export function useMomentWord(): "verse" | "passage" {
  return useWorkScope() ? "passage" : "verse";
}

/** The catalog route, scoped to the work when there is one. */
export function imageModelsUrl(scope: WorkScope | null): string {
  return scope ? `/api/image-models?work=${encodeURIComponent(scope.workId)}` : "/api/image-models";
}
