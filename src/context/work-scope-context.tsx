"use client";

import { createContext, useContext, type ReactNode } from "react";
import { usePreferences } from "@/context/preferences-context";
import { resolveArtStyle } from "@/lib/art-styles";

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
 * The art style images are made and browsed in. A saved preference the work does not offer falls back to the work's
 * first style without being overwritten, so returning to the Bible restores it.
 */
export function useEffectiveArtStyle(): { artStyle: string; offered: readonly string[] | undefined } {
  const { artStyle } = usePreferences();
  const scope = useWorkScope();
  if (!scope) return { artStyle, offered: undefined };
  return { artStyle: resolveArtStyle(artStyle, null, scope.styleIds).styleId, offered: scope.styleIds };
}

/** The catalog route, scoped to the work when there is one. */
export function imageModelsUrl(scope: WorkScope | null): string {
  return scope ? `/api/image-models?work=${encodeURIComponent(scope.workId)}` : "/api/image-models";
}
