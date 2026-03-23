"use client";

import { FlagValues } from "flags/react";
import { useVerseView } from "@/context/verse-view-context";
import { VERSE_VIEW_FLAG_KEY } from "@/lib/verse-view";

export function VerseViewFlagValues() {
  const { assignedView, isExperimentEligible, isSettled } = useVerseView();

  if (!isSettled || !isExperimentEligible) {
    return null;
  }

  return (
    <FlagValues
      values={{
        [VERSE_VIEW_FLAG_KEY]: assignedView,
      }}
    />
  );
}
