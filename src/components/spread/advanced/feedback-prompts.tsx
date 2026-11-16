"use client";

import { AdvancedItem } from "@/components/spread/advanced/item";
import { useSession } from "@/context/session-context";
import { offerAdvancedSettings, setAdvancedSetting, useAdvancedSettings } from "@/lib/advanced-settings";
import { trackPreferenceChanged } from "@/lib/analytics";

// This item lets the reader turn it on; without it the prompt never shows.
offerAdvancedSettings("feedbackPrompts");

/** A switch, off by default, that restores the occasional "Have feedback?" prompt. */
export function FeedbackPromptsItem() {
  const { feedbackPrompts } = useAdvancedSettings();
  const { tier, credits } = useSession();

  return (
    <AdvancedItem title="Feedback prompts">
      <button
        type="button"
        role="switch"
        aria-checked={feedbackPrompts}
        onClick={() => {
          setAdvancedSetting("feedbackPrompts", !feedbackPrompts);
          trackPreferenceChanged({ preference: "feedbackPrompts", value: feedbackPrompts ? "off" : "on", source: "advanced", tier, hasCredits: credits > 0 });
        }}
        className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-ink/90 transition-colors duration-[var(--motion-fast)] hover:bg-ink/10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
      >
        <span className="flex-1">Ask me now and then for feedback</span>
        <span aria-hidden="true" className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${feedbackPrompts ? "bg-ink/85" : "bg-ink/20"}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full shadow motion-safe:transition-[left] ${feedbackPrompts ? "left-[18px] bg-paper" : "left-0.5 bg-ink"}`} />
        </span>
      </button>
    </AdvancedItem>
  );
}
