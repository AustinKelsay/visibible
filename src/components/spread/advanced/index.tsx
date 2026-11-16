"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { AppearanceItem } from "@/components/spread/advanced/appearance";
import { AnsweringModelItem } from "@/components/spread/advanced/answering-model";
import { FeedbackPromptsItem } from "@/components/spread/advanced/feedback-prompts";
import { ImageSettingsItem } from "@/components/spread/advanced/image-settings";
import { PassageDetailsItem } from "@/components/spread/advanced/passage-details";
import { WelcomeItem } from "@/components/spread/advanced/welcome";

/** The verse on screen, for the items that describe it. */
export interface AdvancedVerse {
  verseId: string;
  bookName: string;
  chapter: number;
  verseNumber: number;
  verseText: string;
  totalVerses: number;
}

/**
 * Advanced: the reader choices kept out of Look because few readers need them. It is the last row of the corner menu,
 * collapsed until opened.
 *
 * Every item is self-contained: to cut one, delete its import above, its line below and its file. To cut the whole module, delete the
 * `<Advanced …/>` line in corner-menu.tsx and this folder. The reader reads the settings from
 * `@/lib/advanced-settings`, which answers with the defaults for any setting no mounted item offers, so nothing else
 * changes ([guide](../../../../llm/context/ADVANCED.md)).
 */
export function Advanced(verse: AdvancedVerse) {
  const [isOpen, setIsOpen] = useState(false);
  const regionId = useId();

  return (
    <div>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={regionId}
        onClick={() => setIsOpen(!isOpen)}
        className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-[15px] text-ink/90 transition-colors duration-[var(--motion-fast)] hover:bg-ink/10 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
      >
        <span className="flex-1">Advanced</span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`text-ink/(--quiet-60) transition-transform duration-[var(--motion-fast)] motion-reduce:transition-none ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen ? (
        <div id={regionId} role="group" aria-label="Advanced" className="space-y-1 pb-1 pt-1">
          <AppearanceItem />
          <ImageSettingsItem />
          <AnsweringModelItem />
          <PassageDetailsItem {...verse} />
          <WelcomeItem />
          <FeedbackPromptsItem />
        </div>
      ) : null}
    </div>
  );
}
