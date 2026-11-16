"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";

/** A saved picture as the verse's picture list returns it. */
export type ChosenPicture = FunctionReturnType<typeof api.verseImages.getImageHistory>[number];

interface ChosenPictureState {
  /** The version the reader chose from the picture menu, or null to show the newest. */
  chosen: ChosenPicture | null;
  choose: (picture: ChosenPicture | null) => void;
}

const ChosenPictureContext = createContext<ChosenPictureState>({ chosen: null, choose: () => {} });

/**
 * The picture version chosen in the picture menu (#441). It lasts until the page turns: a different verse starts with
 * no choice, so coming back to a verse shows its newest picture again. It is never part of the address.
 */
export function ChosenPictureProvider({ verseId, children }: { verseId: string; children: ReactNode }) {
  const [choice, setChoice] = useState<{ verseId: string; picture: ChosenPicture } | null>(null);
  // Turning the page forgets the choice, so it is not still there on the way back.
  if (choice && choice.verseId !== verseId) setChoice(null);
  const chosen = choice?.verseId === verseId ? choice.picture : null;
  const choose = useCallback((picture: ChosenPicture | null) => setChoice(picture ? { verseId, picture } : null), [verseId]);
  const value = useMemo(() => ({ chosen, choose }), [chosen, choose]);
  return <ChosenPictureContext.Provider value={value}>{children}</ChosenPictureContext.Provider>;
}

/** The chosen picture version and the function to choose one (null shows the newest). */
export function useChosenPicture(): ChosenPictureState {
  return useContext(ChosenPictureContext);
}
